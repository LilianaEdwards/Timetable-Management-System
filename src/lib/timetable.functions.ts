import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DAYS, SLOT_LABELS, TWO_HOUR_STARTS } from "@/lib/timetable-constants";

type SubjectRow = {
  id: string; code: string; name: string;
  lecturer_id: string | null;
  duration_hours: number;
  credit: number;
  year: number;
  semester: number;
  joint_group?: string | null;
  is_consecutive?: boolean | null;
};
type RegRow = { student_id: string; subject_id: string };
type RoomRow = { id: string; name: string; capacity: number };

type Block = {
  subject_id: string; room_id: string;
  day: number; start_slot: number; end_slot: number;
  semester: number;
};

const SLOTS_PER_DAY = SLOT_LABELS.length; // 6
const DAYS_COUNT = DAYS.length;            // 5

/**
 * Credit-based scheduler with optional 2-hour consecutive blocks.
 *  - Each subject gets `credit` hours/week.
 *  - If is_consecutive, hours are packed into 2-hour blocks placed only at
 *    9–11 AM (slot 0) or 2–4 PM (slot 4). Odd remainder placed as a single.
 *  - Otherwise hours are placed as 1-hour slots spread across different days.
 *  - Avoids lecturer / joint_group / same-year / shared-student / room clashes.
 *  - Empty cells render as "Self-Study" in the UI.
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
      supabase.from("subjects").select("id,code,name,lecturer_id,duration_hours,credit,year,semester,joint_group,is_consecutive"),
      supabase.from("registrations").select("student_id,subject_id"),
      supabase.from("rooms").select("id,name,capacity"),
    ]);
    const subjects = (subjectsAll ?? []).filter((s: any) => Number(s.semester) === semester) as SubjectRow[];
    if (!subjects.length) throw new Error(`No subjects defined for Semester ${semester}`);
    if (!rooms?.length) throw new Error("No rooms defined");

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

    // Conflict graph
    const conflicts = new Map<string, Set<string>>();
    for (const s of subjects) conflicts.set(s.id, new Set());
    for (let i = 0; i < subjects.length; i++) {
      for (let j = i + 1; j < subjects.length; j++) {
        const a = subjects[i], b = subjects[j];
        let c = false;
        if (a.lecturer_id && a.lecturer_id === b.lecturer_id) c = true;
        if (!c && a.joint_group && b.joint_group && a.joint_group === b.joint_group) c = true;
        if (!c && a.year === b.year) c = true;
        if (!c) {
          const sa = studentsBySubject.get(a.id)!, sb = studentsBySubject.get(b.id)!;
          for (const sid of sa) if (sb.has(sid)) { c = true; break; }
        }
        if (c) { conflicts.get(a.id)!.add(b.id); conflicts.get(b.id)!.add(a.id); }
      }
    }

    const sortedRooms = [...(rooms as RoomRow[])].sort((a, b) => a.capacity - b.capacity);
    // Schedule joint-group / consecutive / largest-credit first (hardest constraints first)
    const ordered = [...subjects].sort((a, b) => {
      const ja = a.joint_group ? 1 : 0, jb = b.joint_group ? 1 : 0;
      if (ja !== jb) return jb - ja;
      const ca = a.is_consecutive ? 1 : 0, cb = b.is_consecutive ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return b.credit - a.credit;
    });

    const placed: Block[] = [];
    const roomBusy = new Map<string, Set<string>>();
    const subjectDay = new Map<string, Set<number>>();
    const unschedulable: { code: string; name: string; reason: string }[] = [];

    const key = (d: number, s: number) => `${d}-${s}`;

    function slotFreeFor(s: SubjectRow, day: number, slot: number, roomId: string): boolean {
      const k = key(day, slot);
      if (roomBusy.get(k)?.has(roomId)) return false;
      for (const b of placed) {
        if (b.day !== day) continue;
        if (slot < b.start_slot || slot > b.end_slot) continue;
        if (b.subject_id === s.id) return false;
        if (conflicts.get(s.id)?.has(b.subject_id)) return false;
      }
      return true;
    }

    function commit(s: SubjectRow, day: number, startSlot: number, endSlot: number, roomId: string) {
      placed.push({ subject_id: s.id, room_id: roomId, day, start_slot: startSlot, end_slot: endSlot, semester });
      for (let sl = startSlot; sl <= endSlot; sl++) {
        if (!roomBusy.has(key(day, sl))) roomBusy.set(key(day, sl), new Set());
        roomBusy.get(key(day, sl))!.add(roomId);
      }
      subjectDay.get(s.id)!.add(day);
    }

    for (const s of ordered) {
      const enrolled = studentsBySubject.get(s.id)!.size;
      const candidateRooms = sortedRooms.filter(r => r.capacity >= enrolled);
      if (!candidateRooms.length) {
        unschedulable.push({ code: s.code, name: s.name, reason: `no room with capacity ≥ ${enrolled}` });
        continue;
      }
      subjectDay.set(s.id, new Set());
      let remaining = s.credit;

      // 1) Place 2-hour consecutive blocks first if requested
      if (s.is_consecutive) {
        const pairs = Math.floor(remaining / 2);
        for (let i = 0; i < pairs; i++) {
          let done = false;
          for (let pass = 0; pass < 2 && !done; pass++) {
            for (let day = 0; day < DAYS_COUNT && !done; day++) {
              if (pass === 0 && subjectDay.get(s.id)!.has(day)) continue;
              for (const start of TWO_HOUR_STARTS) {
                const end = start + 1;
                for (const room of candidateRooms) {
                  if (slotFreeFor(s, day, start, room.id) && slotFreeFor(s, day, end, room.id)) {
                    commit(s, day, start, end, room.id);
                    remaining -= 2;
                    done = true;
                    break;
                  }
                }
                if (done) break;
              }
            }
          }
          if (!done) break;
        }
      }

      // 2) Place remaining hours as single slots, spread across days
      for (let pass = 0; pass < 2 && remaining > 0; pass++) {
        for (let slot = 0; slot < SLOTS_PER_DAY && remaining > 0; slot++) {
          for (let day = 0; day < DAYS_COUNT && remaining > 0; day++) {
            if (pass === 0 && subjectDay.get(s.id)!.has(day)) continue;
            for (const room of candidateRooms) {
              if (slotFreeFor(s, day, slot, room.id)) {
                commit(s, day, slot, slot, room.id);
                remaining--;
                break;
              }
            }
          }
        }
      }

      if (remaining > 0) {
        unschedulable.push({
          code: s.code, name: s.name,
          reason: `could not place ${remaining}/${s.credit} credit hour(s)`,
        });
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("timetable_entries").delete().eq("semester", semester);
    if (placed.length) {
      const { error } = await supabaseAdmin.from("timetable_entries").insert(placed);
      if (error) throw new Error("Failed to save timetable: " + error.message);
    }

    return {
      semester,
      scheduled: placed.reduce((acc, b) => acc + (b.end_slot - b.start_slot + 1), 0),
      totalCredits: Array.from(creditByYear.values()).reduce((a, b) => a + b, 0),
      unschedulable,
      days: DAYS as unknown as string[],
      slots: SLOT_LABELS,
    };
  });
