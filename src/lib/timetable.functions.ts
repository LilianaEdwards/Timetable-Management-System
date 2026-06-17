import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DAYS, SLOT_LABELS } from "@/lib/timetable-constants";

type SubjectRow = {
  id: string; code: string; name: string;
  lecturer_id: string | null;
  duration_hours: number;
  credit: number;
  year: number;
  semester: number;
  joint_group?: string | null;
};
type RegRow = { student_id: string; subject_id: string };
type RoomRow = { id: string; name: string; capacity: number };

type Block = {
  subject_id: string; room_id: string;
  day: number; start_slot: number; end_slot: number;
  semester: number;
};

// 6 slots/day * 5 days = 30
const SLOTS_PER_DAY = SLOT_LABELS.length;
const DAYS_COUNT = DAYS.length;

/**
 * Generate timetable for a given semester (1 or 2), driven by per-subject credit.
 *  - Each subject gets `credit` one-hour slots placed across the week.
 *  - Avoids lecturer / joint_group / shared-student conflicts and room clashes.
 *  - Spreads a subject's slots across different days when possible.
 *  - Empty cells are rendered as "Self-Study" by the UI (not stored).
 */
export const generateTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { semester: number }) => ({ semester: d.semester === 2 ? 2 : 1 }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { semester } = data;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can generate timetables");

    const [{ data: subjectsAll }, { data: regs }, { data: rooms }] = await Promise.all([
      supabase.from("subjects").select("id,code,name,lecturer_id,duration_hours,credit,year,semester,joint_group"),
      supabase.from("registrations").select("student_id,subject_id"),
      supabase.from("rooms").select("id,name,capacity"),
    ]);
    const subjects = (subjectsAll ?? []).filter((s: any) => Number(s.semester) === semester) as SubjectRow[];
    if (!subjects.length) throw new Error(`No subjects defined for Semester ${semester}`);
    if (!rooms?.length) throw new Error("No rooms defined");

    // Validate credit sums per year do not exceed 30
    const creditByYear = new Map<number, number>();
    for (const s of subjects) creditByYear.set(s.year, (creditByYear.get(s.year) ?? 0) + s.credit);
    const overloaded: string[] = [];
    for (const [y, sum] of creditByYear) {
      if (sum > SLOTS_PER_DAY * DAYS_COUNT) overloaded.push(`Year ${y} Sem ${semester}: ${sum}/30`);
    }
    if (overloaded.length) throw new Error("Total credits exceed 30 slots/week — " + overloaded.join("; "));

    const studentsBySubject = new Map<string, Set<string>>();
    for (const s of subjects) studentsBySubject.set(s.id, new Set());
    const subjectIds = new Set(subjects.map(s => s.id));
    for (const r of (regs ?? []) as RegRow[]) {
      if (subjectIds.has(r.subject_id)) studentsBySubject.get(r.subject_id)!.add(r.student_id);
    }

    // Conflict graph: shared lecturer, joint_group, or shared students
    const conflicts = new Map<string, Set<string>>();
    for (const s of subjects) conflicts.set(s.id, new Set());
    for (let i = 0; i < subjects.length; i++) {
      for (let j = i + 1; j < subjects.length; j++) {
        const a = subjects[i], b = subjects[j];
        let c = false;
        if (a.lecturer_id && a.lecturer_id === b.lecturer_id) c = true;
        if (!c && a.joint_group && b.joint_group && a.joint_group === b.joint_group) c = true;
        if (!c && a.year === b.year) c = true; // same-year subjects in same semester can't overlap
        if (!c) {
          const sa = studentsBySubject.get(a.id)!, sb = studentsBySubject.get(b.id)!;
          for (const sid of sa) if (sb.has(sid)) { c = true; break; }
        }
        if (c) { conflicts.get(a.id)!.add(b.id); conflicts.get(b.id)!.add(a.id); }
      }
    }

    const sortedRooms = [...(rooms as RoomRow[])].sort((a, b) => a.capacity - b.capacity);
    // Schedule subjects with largest credit first (hardest to place)
    const ordered = [...subjects].sort((a, b) => b.credit - a.credit || (b.lecturer_id ? 1 : 0));

    // grid[day][slot] = Set of subject_ids placed there, plus room usage
    const placed: Block[] = [];
    const roomBusy = new Map<string, Set<string>>(); // key day-slot -> roomIds
    const subjectDay = new Map<string, Set<number>>(); // subject_id -> days used

    const unschedulable: { code: string; name: string; reason: string }[] = [];

    function key(day: number, slot: number) { return `${day}-${slot}`; }

    function canPlace(s: SubjectRow, day: number, slot: number, roomId: string): boolean {
      const k = key(day, slot);
      const rooms = roomBusy.get(k);
      if (rooms?.has(roomId)) return false;
      // check conflicts with anything already placed at this slot
      for (const b of placed) {
        if (b.day !== day) continue;
        if (slot < b.start_slot || slot > b.end_slot) continue;
        if (b.subject_id === s.id) return false; // same subject twice in same slot
        if (conflicts.get(s.id)?.has(b.subject_id)) return false;
      }
      return true;
    }

    for (const s of ordered) {
      const enrolled = studentsBySubject.get(s.id)!.size;
      const candidateRooms = sortedRooms.filter(r => r.capacity >= enrolled);
      if (!candidateRooms.length) {
        unschedulable.push({ code: s.code, name: s.name, reason: `no room with capacity ≥ ${enrolled}` });
        continue;
      }
      subjectDay.set(s.id, new Set());
      let placedCount = 0;
      // Try to spread: iterate slot-major, preferring days not yet used by this subject
      for (let pass = 0; pass < 2 && placedCount < s.credit; pass++) {
        for (let slot = 0; slot < SLOTS_PER_DAY && placedCount < s.credit; slot++) {
          for (let day = 0; day < DAYS_COUNT && placedCount < s.credit; day++) {
            if (pass === 0 && subjectDay.get(s.id)!.has(day)) continue;
            for (const room of candidateRooms) {
              if (canPlace(s, day, slot, room.id)) {
                const block: Block = {
                  subject_id: s.id, room_id: room.id, day,
                  start_slot: slot, end_slot: slot, semester,
                };
                placed.push(block);
                if (!roomBusy.has(key(day, slot))) roomBusy.set(key(day, slot), new Set());
                roomBusy.get(key(day, slot))!.add(room.id);
                subjectDay.get(s.id)!.add(day);
                placedCount++;
                break;
              }
            }
          }
        }
      }
      if (placedCount < s.credit) {
        unschedulable.push({
          code: s.code, name: s.name,
          reason: `only placed ${placedCount}/${s.credit} credit slots`,
        });
      }
    }

    // Persist — replace entries only for this semester
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("timetable_entries").delete().eq("semester", semester);
    if (placed.length) {
      const { error } = await supabaseAdmin.from("timetable_entries").insert(placed);
      if (error) throw new Error("Failed to save timetable: " + error.message);
    }

    return {
      semester,
      scheduled: placed.length,
      totalCredits: Array.from(creditByYear.values()).reduce((a, b) => a + b, 0),
      unschedulable,
      days: DAYS as unknown as string[],
      slots: SLOT_LABELS,
    };
  });
