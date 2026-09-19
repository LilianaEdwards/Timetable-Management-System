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

const norm = (v: string) => v.trim().toUpperCase().replace(/[\s_]+/g, "-");
/** Tokens listed in a subject's joint field (codes of partner subjects or a shared group name). */
function jointTokens(s: SubjectRow): string[] {
  return (s.joint_group ?? "")
    .split(/[,;/|]+/)
    .map(norm)
    .filter(Boolean);
}
/**
 * Two subjects are joint (must never share a timeslot) when:
 *  - they list the same group name, or
 *  - one lists the other's subject code (e.g. CS-2011 joint_group = "CST-1011").
 */
function jointConflict(a: SubjectRow, b: SubjectRow): boolean {
  const ta = jointTokens(a), tb = jointTokens(b);
  if (!ta.length && !tb.length) return false;
  const ca = norm(a.code), cb = norm(b.code);
  if (ta.includes(cb) || tb.includes(ca)) return true;
  return ta.some(t => t !== ca && t !== cb && tb.includes(t));
}

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
        if (!c && jointConflict(a, b)) c = true;
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

    const byId = new Map(subjects.map(s => [s.id, s]));
    const placed: Block[] = [];
    const roomBusy = new Map<string, Set<string>>();
    const subjectDay = new Map<string, number[]>(); // day -> count placed
    const yearSlotLoad = new Map<string, number>(); // `${year}-${day}-${slot}` -> count (for diversity)
    const unschedulable: { code: string; name: string; reason: string }[] = [];

    const key = (d: number, s: number) => `${d}-${s}`;
    const ysKey = (y: number, d: number, s: number) => `${y}-${d}-${s}`;

    // Deterministic but well-mixed shuffle (Fisher–Yates with seeded PRNG)
    let seed = subjects.length * 9301 + semester * 49297 + 233280;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const shuffle = <T,>(arr: T[]): T[] => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

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

    /** Already-placed blocks that clash with s over [startSlot, endSlot] on `day`. */
    function blockers(s: SubjectRow, day: number, startSlot: number, endSlot: number): Block[] {
      const out: Block[] = [];
      for (const b of placed) {
        if (b.day !== day) continue;
        if (endSlot < b.start_slot || startSlot > b.end_slot) continue;
        if (b.subject_id === s.id || conflicts.get(s.id)?.has(b.subject_id)) out.push(b);
      }
      return out;
    }

    function commit(s: SubjectRow, day: number, startSlot: number, endSlot: number, roomId: string) {
      placed.push({ subject_id: s.id, room_id: roomId, day, start_slot: startSlot, end_slot: endSlot, semester });
      for (let sl = startSlot; sl <= endSlot; sl++) {
        if (!roomBusy.has(key(day, sl))) roomBusy.set(key(day, sl), new Set());
        roomBusy.get(key(day, sl))!.add(roomId);
        const yk = ysKey(s.year, day, sl);
        yearSlotLoad.set(yk, (yearSlotLoad.get(yk) ?? 0) + 1);
      }
      const counts = subjectDay.get(s.id)!;
      counts[day] = (counts[day] ?? 0) + (endSlot - startSlot + 1);
    }

    /** Reverse of commit — used by the repair pass when relocating a block. */
    function uncommit(b: Block) {
      const i = placed.indexOf(b);
      if (i < 0) return;
      placed.splice(i, 1);
      const subj = byId.get(b.subject_id);
      for (let sl = b.start_slot; sl <= b.end_slot; sl++) {
        roomBusy.get(key(b.day, sl))?.delete(b.room_id);
        if (subj) {
          const yk = ysKey(subj.year, b.day, sl);
          yearSlotLoad.set(yk, Math.max(0, (yearSlotLoad.get(yk) ?? 0) - 1));
        }
      }
      const counts = subjectDay.get(b.subject_id);
      if (counts) counts[b.day] = Math.max(0, (counts[b.day] ?? 0) - (b.end_slot - b.start_slot + 1));
    }

    // Score a candidate placement — lower is better.
    // Prefer: days where this subject has fewer hours; year-slots that are emptier;
    // avoid placing immediately adjacent to the same subject the same day.
    function score(s: SubjectRow, day: number, startSlot: number, endSlot: number): number {
      const counts = subjectDay.get(s.id)!;
      const sameDayLoad = counts[day] ?? 0;
      let slotLoad = 0;
      for (let sl = startSlot; sl <= endSlot; sl++) slotLoad += yearSlotLoad.get(ysKey(s.year, day, sl)) ?? 0;
      // Adjacent same-subject penalty
      let adj = 0;
      for (const b of placed) {
        if (b.subject_id !== s.id || b.day !== day) continue;
        if (b.end_slot + 1 === startSlot || endSlot + 1 === b.start_slot) adj += 5;
      }
      return sameDayLoad * 10 + slotLoad * 3 + adj + rand();
    }

    type Cand = { day: number; start: number; end: number; roomId: string; score: number };

    function bestSingle(s: SubjectRow, candidateRooms: RoomRow[], spread = true): Cand | null {
      const counts = subjectDay.get(s.id) ?? [];
      const days = shuffle([...Array(DAYS_COUNT).keys()]);
      const slots = shuffle([...Array(SLOTS_PER_DAY).keys()]);
      let best: Cand | null = null;
      for (const day of days) {
        if (spread && (counts[day] ?? 0) > 0) continue; // one session per subject per day
        for (const slot of slots) for (const room of candidateRooms) {
          if (!slotFreeFor(s, day, slot, room.id)) continue;
          const sc = score(s, day, slot, slot);
          if (!best || sc < best.score) best = { day, start: slot, end: slot, roomId: room.id, score: sc };
        }
      }
      return best;
    }

    function bestPair(s: SubjectRow, candidateRooms: RoomRow[], spread = true): Cand | null {
      const counts = subjectDay.get(s.id) ?? [];
      const days = shuffle([...Array(DAYS_COUNT).keys()]);
      const starts = shuffle([...TWO_HOUR_STARTS]);
      let best: Cand | null = null;
      for (const day of days) {
        if (spread && (counts[day] ?? 0) > 0) continue;
        for (const start of starts) for (const room of candidateRooms) {
          const end = start + 1;
          if (!slotFreeFor(s, day, start, room.id) || !slotFreeFor(s, day, end, room.id)) continue;
          const sc = score(s, day, start, end);
          if (!best || sc < best.score) best = { day, start, end, roomId: room.id, score: sc };
        }
      }
      return best;
    }

    const roomsFor = (s: SubjectRow) =>
      sortedRooms.filter(r => r.capacity >= (studentsBySubject.get(s.id)?.size ?? 0));

    for (const s of ordered) {
      const enrolled = studentsBySubject.get(s.id)!.size;
      const candidateRooms = roomsFor(s);
      if (!candidateRooms.length) {
        unschedulable.push({ code: s.code, name: s.name, reason: `no room with capacity ≥ ${enrolled}` });
        continue;
      }
      subjectDay.set(s.id, []);
      let remaining = s.credit;

      if (s.is_consecutive) {
        const pairs = Math.floor(remaining / 2);
        for (let i = 0; i < pairs; i++) {
          const c = bestPair(s, candidateRooms) ?? bestPair(s, candidateRooms, false);
          if (!c) break;
          commit(s, c.day, c.start, c.end, c.roomId);
          remaining -= 2;
        }
      }

      while (remaining > 0) {
        const c = bestSingle(s, candidateRooms) ?? bestSingle(s, candidateRooms, false);
        if (!c) break;
        commit(s, c.day, c.start, c.end, c.roomId);
        remaining--;
      }

      // Repair pass: free a blocked slot by relocating one single-hour block elsewhere.
      while (remaining > 0) {
        let progressed = false;
        for (const day of shuffle([...Array(DAYS_COUNT).keys()])) {
          for (const slot of shuffle([...Array(SLOTS_PER_DAY).keys()])) {
            const bl = blockers(s, day, slot, slot);
            if (bl.length !== 1) continue;
            const victim = bl[0];
            if (victim.start_slot !== victim.end_slot) continue;
            const vs = byId.get(victim.subject_id);
            if (!vs || vs.id === s.id) continue;
            const origin = { ...victim };
            uncommit(victim);
            const alt = bestSingle(vs, roomsFor(vs), false);
            if (!alt || (alt.day === day && alt.start === slot)) {
              commit(vs, origin.day, origin.start_slot, origin.end_slot, origin.room_id);
              continue;
            }
            commit(vs, alt.day, alt.start, alt.end, alt.roomId);
            const c = bestSingle(s, candidateRooms, false);
            if (c) {
              commit(s, c.day, c.start, c.end, c.roomId);
              remaining--;
              progressed = true;
              break;
            }
          }
          if (progressed) break;
        }
        if (!progressed) break;
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

/** Admin-only: remove every saved timetable entry for one semester. */
export const deleteTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { semester: number }) => ({ semester: d.semester === 2 ? 2 : 1 }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can delete timetables");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("timetable_entries")
      .delete()
      .eq("semester", data.semester);
    if (error) throw new Error("Failed to delete timetable: " + error.message);

    return { semester: data.semester };
  });

/** Admin-only: manually move one class to another day / time / room, with clash checks. */
export const moveTimetableEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entryId: string; day: number; startSlot: number; roomId: string }) => ({
    entryId: String(d.entryId),
    day: Math.max(0, Math.min(DAYS.length - 1, Number(d.day))),
    startSlot: Math.max(0, Math.min(SLOT_LABELS.length - 1, Number(d.startSlot))),
    roomId: String(d.roomId),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can edit the timetable");

    const { data: entry } = await supabase
      .from("timetable_entries")
      .select("id,subject_id,room_id,day,start_slot,end_slot,semester")
      .eq("id", data.entryId)
      .maybeSingle();
    if (!entry) throw new Error("This class no longer exists");

    const span = entry.end_slot - entry.start_slot;
    const endSlot = data.startSlot + span;
    if (endSlot > SLOT_LABELS.length - 1) throw new Error("This class does not fit in the selected time");

    const [{ data: subjectsAll }, { data: regs }, { data: room }] = await Promise.all([
      supabase.from("subjects").select("id,code,name,lecturer_id,duration_hours,credit,year,semester,joint_group,is_consecutive"),
      supabase.from("registrations").select("student_id,subject_id"),
      supabase.from("rooms").select("id,name,capacity").eq("id", data.roomId).maybeSingle(),
    ]);
    if (!room) throw new Error("Room not found");

    const subjects = (subjectsAll ?? []) as SubjectRow[];
    const byId = new Map(subjects.map(s => [s.id, s]));
    const me = byId.get(entry.subject_id);
    if (!me) throw new Error("Subject not found");

    const studentsOf = (subjectId: string) =>
      new Set(((regs ?? []) as RegRow[]).filter(r => r.subject_id === subjectId).map(r => r.student_id));
    const mine = studentsOf(me.id);
    if (room.capacity < mine.size) throw new Error(`${room.name} holds ${room.capacity}, but ${mine.size} students are registered`);

    const { data: others } = await supabase
      .from("timetable_entries")
      .select("id,subject_id,room_id,day,start_slot,end_slot")
      .eq("semester", entry.semester)
      .eq("day", data.day)
      .neq("id", entry.id);

    for (const o of others ?? []) {
      if (endSlot < o.start_slot || data.startSlot > o.end_slot) continue;
      const os = byId.get(o.subject_id);
      if (o.room_id === data.roomId) throw new Error(`${room.name} is already used at that time`);
      if (!os) continue;
      if (os.id === me.id) throw new Error(`${me.code} already has a class at that time`);
      if (me.lecturer_id && me.lecturer_id === os.lecturer_id) throw new Error(`The lecturer already teaches ${os.code} at that time`);
      if (jointConflict(me, os)) throw new Error(`${me.code} is joint with ${os.code}, which is at that time`);
      if (me.year === os.year) throw new Error(`Year ${os.year} already has ${os.code} at that time`);
      const so = studentsOf(os.id);
      for (const sid of mine) if (so.has(sid)) throw new Error(`Some students are already in ${os.code} at that time`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("timetable_entries")
      .update({ day: data.day, start_slot: data.startSlot, end_slot: endSlot, room_id: data.roomId })
      .eq("id", entry.id);
    if (error) throw new Error("Could not save the change: " + error.message);

    return { ok: true as const };
  });

/** Admin-only: remove a single class from the timetable. */
export const deleteTimetableEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entryId: string }) => ({ entryId: String(d.entryId) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can edit the timetable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("timetable_entries").delete().eq("id", data.entryId);
    if (error) throw new Error("Could not remove the class: " + error.message);
    return { ok: true as const };
  });
