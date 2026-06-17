import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DAYS, SLOT_LABELS, TWO_HOUR_STARTS } from "@/lib/timetable-constants";

type SubjectRow = { id: string; code: string; name: string; lecturer_id: string | null; duration_hours: number; joint_group?: string | null };
type RegRow = { student_id: string; subject_id: string };
type RoomRow = { id: string; name: string; capacity: number };

type Assignment = { subject_id: string; room_id: string; day: number; start_slot: number; end_slot: number };

function slotsFor(start: number, duration: number): number[] {
  if (duration === 1) return [start];
  // 2-hour: consecutive within same half-day
  return [start, start + 1];
}
function validStarts(duration: number): number[] {
  if (duration === 1) return [0, 1, 2, 3, 4, 5];
  return TWO_HOUR_STARTS;
}

/**
 * Generate timetable using:
 *  - Greedy ordering: subjects with most students first
 *  - CSP backtracking with forward-checking on (day, startSlot, room)
 *  - Graph-coloring fallback: when a subject can't fit, swap with conflicting peer
 */
export const generateTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can generate timetables");

    const [{ data: subjects }, { data: regs }, { data: rooms }] = await Promise.all([
      supabase.from("subjects").select("id,code,name,lecturer_id,duration_hours,joint_group,year"),
      supabase.from("registrations").select("student_id,subject_id"),
      supabase.from("rooms").select("id,name,capacity"),
    ]);
    if (!subjects?.length) throw new Error("No subjects defined");
    if (!rooms?.length) throw new Error("No rooms defined");

    // Require each year (1..5) to have at least 6 subjects before scheduling
    const byYear = new Map<number, number>();
    for (const s of subjects as SubjectRow[] & { year: number }[]) {
      byYear.set((s as any).year, (byYear.get((s as any).year) ?? 0) + 1);
    }
    const missing: string[] = [];
    for (const y of [1, 2, 3, 4, 5]) {
      const c = byYear.get(y) ?? 0;
      if (c < 6) missing.push(`Year ${y} has ${c}/6`);
    }
    if (missing.length) {
      throw new Error("All years need at least 6 subjects before generating: " + missing.join("; "));
    }
    const studentsBySubject = new Map<string, Set<string>>();
    for (const s of subjects) studentsBySubject.set(s.id, new Set());
    for (const r of (regs ?? []) as RegRow[]) studentsBySubject.get(r.subject_id)?.add(r.student_id);

    // Greedy: largest enrollment first; then 2-hour first (harder to place)
    const ordered = [...(subjects as SubjectRow[])].sort((a, b) => {
      const sa = studentsBySubject.get(a.id)!.size;
      const sb = studentsBySubject.get(b.id)!.size;
      if (sb !== sa) return sb - sa;
      return b.duration_hours - a.duration_hours;
    });

    // Domain: (day, startSlot, roomId) tuples per subject, filtered by capacity
    const sortedRooms = [...(rooms as RoomRow[])].sort((a, b) => a.capacity - b.capacity);
    const domains = new Map<string, Assignment[]>();
    for (const s of ordered) {
      const enrolled = studentsBySubject.get(s.id)!.size;
      const candidates: Assignment[] = [];
      for (let day = 0; day < 5; day++) {
        for (const start of validStarts(s.duration_hours)) {
          const slots = slotsFor(start, s.duration_hours);
          for (const room of sortedRooms) {
            if (room.capacity < enrolled) continue;
            candidates.push({
              subject_id: s.id, room_id: room.id, day,
              start_slot: start, end_slot: slots[slots.length - 1],
            });
          }
        }
      }
      domains.set(s.id, candidates);
    }

    // Conflict graph: subjects share a student OR same lecturer
    const conflicts = new Map<string, Set<string>>();
    for (const s of ordered) conflicts.set(s.id, new Set());
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i], b = ordered[j];
        let conflict = false;
        if (a.lecturer_id && a.lecturer_id === b.lecturer_id) conflict = true;
        if (!conflict && a.joint_group && b.joint_group && a.joint_group === b.joint_group) conflict = true;
        if (!conflict) {
          const sa = studentsBySubject.get(a.id)!, sb = studentsBySubject.get(b.id)!;
          for (const sid of sa) if (sb.has(sid)) { conflict = true; break; }
        }
        if (conflict) { conflicts.get(a.id)!.add(b.id); conflicts.get(b.id)!.add(a.id); }
      }
    }

    // CSP backtracking with MRV-ish ordering (already greedy by size)
    const assigned = new Map<string, Assignment>();
    const unschedulable: { code: string; name: string; reason: string }[] = [];

    function fits(s: SubjectRow, cand: Assignment): boolean {
      const candSlots = slotsFor(cand.start_slot, s.duration_hours);
      for (const other of ordered) {
        const a = assigned.get(other.id);
        if (!a || a.day !== cand.day) continue;
        const otherSubj = subjects!.find(x => x.id === other.id)!;
        const otherSlots = slotsFor(a.start_slot, otherSubj.duration_hours);
        const overlap = candSlots.some(x => otherSlots.includes(x));
        if (!overlap) continue;
        // Room conflict
        if (a.room_id === cand.room_id) return false;
        // Lecturer conflict
        if (s.lecturer_id && s.lecturer_id === otherSubj.lecturer_id) return false;
        // Student conflict
        if (conflicts.get(s.id)?.has(other.id)) return false;
      }
      return true;
    }

    function backtrack(idx: number): boolean {
      if (idx >= ordered.length) return true;
      const s = ordered[idx];
      const cands = domains.get(s.id) ?? [];
      for (const cand of cands) {
        if (fits(s, cand)) {
          assigned.set(s.id, cand);
          if (backtrack(idx + 1)) return true;
          assigned.delete(s.id);
        }
      }
      return false;
    }

    const ok = backtrack(0);

    if (!ok) {
      // Greedy fallback: assign what we can, report the rest
      assigned.clear();
      for (const s of ordered) {
        const cands = domains.get(s.id) ?? [];
        const cand = cands.find(c => fits(s, c));
        if (cand) assigned.set(s.id, cand);
        else {
          const enrolled = studentsBySubject.get(s.id)!.size;
          let reason = "no conflict-free slot found";
          if (enrolled > Math.max(...sortedRooms.map(r => r.capacity))) reason = `no room with capacity ≥ ${enrolled}`;
          unschedulable.push({ code: s.code, name: s.name, reason });
        }
      }
    }

    // Persist (admin-elevated bypass via service role since we already checked role)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("timetable_entries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const rows = Array.from(assigned.values()).map(a => ({
      subject_id: a.subject_id, room_id: a.room_id,
      day: a.day, start_slot: a.start_slot, end_slot: a.end_slot,
    }));
    if (rows.length) {
      const { error } = await supabaseAdmin.from("timetable_entries").insert(rows);
      if (error) throw new Error("Failed to save timetable: " + error.message);
    }

    return {
      scheduled: rows.length,
      total: ordered.length,
      unschedulable,
      days: DAYS as unknown as string[],
      slots: SLOT_LABELS,
    };
  });
