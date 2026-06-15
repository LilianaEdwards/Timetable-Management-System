import { Fragment } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DAYS, SLOT_LABELS } from "@/lib/timetable-constants";

export const Route = createFileRoute("/timetable")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth" });
  },
  component: TimetablePage,
});

function TimetablePage() {
  const [mode, setMode] = useState<"all" | "student" | "lecturer" | "room">("all");
  const [selected, setSelected] = useState<string>("");

  const { data: entries } = useQuery({
    queryKey: ["timetable-entries"],
    queryFn: async () => (await supabase
      .from("timetable_entries")
      .select("id,day,start_slot,end_slot,subject_id,room_id,subjects(code,name,duration_hours,lecturer_id,lecturers(name)),rooms(name,capacity)")
    ).data ?? [],
  });
  const { data: regs } = useQuery({
    queryKey: ["registrations-flat"],
    queryFn: async () => (await supabase.from("registrations").select("student_id,subject_id")).data ?? [],
  });
  const { data: students } = useQuery({ queryKey: ["students-list"], queryFn: async () => (await supabase.from("students").select("id,student_no,name").order("name")).data ?? [] });
  const { data: lecturers } = useQuery({ queryKey: ["lecturers-list"], queryFn: async () => (await supabase.from("lecturers").select("id,name").order("name")).data ?? [] });
  const { data: rooms } = useQuery({ queryKey: ["rooms-list"], queryFn: async () => (await supabase.from("rooms").select("id,name").order("name")).data ?? [] });

  const filtered = useMemo(() => {
    const all = entries ?? [];
    if (mode === "all" || !selected) return all;
    if (mode === "room") return all.filter((e: any) => e.room_id === selected);
    if (mode === "lecturer") return all.filter((e: any) => e.subjects?.lecturer_id === selected);
    if (mode === "student") {
      const subjectIds = new Set((regs ?? []).filter((r: any) => r.student_id === selected).map((r: any) => r.subject_id));
      return all.filter((e: any) => subjectIds.has(e.subject_id));
    }
    return all;
  }, [entries, regs, mode, selected]);

  // Build grid: rows = slot, cols = day
  const grid: any[][][] = SLOT_LABELS.map(() => DAYS.map(() => []));
  for (const e of filtered as any[]) {
    for (let s = e.start_slot; s <= e.end_slot; s++) grid[s][e.day].push(e);
  }

  const options =
    mode === "student" ? (students ?? []).map((s: any) => ({ value: s.id, label: `${s.student_no} — ${s.name}` }))
    : mode === "lecturer" ? (lecturers ?? []).map((l: any) => ({ value: l.id, label: l.name }))
    : mode === "room" ? (rooms ?? []).map((r: any) => ({ value: r.id, label: r.name }))
    : [];

  return (
    <AppShell title="Timetable">
      <div className="bg-surface-2 rounded-2xl p-6 shadow-[3px_3px_10px_rgba(188,188,188,0.4)]">
        <div className="flex flex-wrap items-end gap-4 mb-6 print:hidden">
          <div>
            <label className="text-xs uppercase text-muted-foreground">View</label>
            <Select value={mode} onValueChange={(v) => { setMode(v as any); setSelected(""); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scheduled</SelectItem>
                <SelectItem value="student">By student</SelectItem>
                <SelectItem value="lecturer">By lecturer</SelectItem>
                <SelectItem value="room">By room</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode !== "all" && (
            <div className="min-w-64">
              <label className="text-xs uppercase text-muted-foreground capitalize">{mode}</label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger><SelectValue placeholder={`Select ${mode}…`} /></SelectTrigger>
                <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" className="ml-auto" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print / PDF
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="bg-brand-deep text-white p-3 border border-white/20 w-40">Time</th>
                {DAYS.map(d => <th key={d} className="bg-brand-deep text-white p-3 border border-white/20">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {SLOT_LABELS.map((slot, sIdx) => (
                <Fragment key={slot}>
                  {sIdx === 3 && (
                    <tr><td colSpan={6} className="bg-accent text-center py-2 font-semibold text-brand-deep">Lunch Break (12:00 PM — 1:00 PM)</td></tr>
                  )}
                  <tr>
                    <td className="p-3 border bg-muted font-medium text-brand-deep">{slot}</td>
                    {DAYS.map((_, dIdx) => (
                      <td key={dIdx} className="p-2 border align-top min-w-40">
                        {grid[sIdx][dIdx].map((e: any) => (
                          <div key={e.id + "-" + sIdx} className="rounded-md bg-brand/10 border-l-4 border-brand p-2 mb-1 text-xs">
                            <div className="font-semibold text-brand-deep">{e.subjects?.code}</div>
                            <div className="text-foreground">{e.subjects?.name}</div>
                            <div className="text-muted-foreground">{e.rooms?.name} · {e.subjects?.lecturers?.name ?? "—"}</div>
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {(filtered as any[]).length === 0 && (
          <p className="text-center text-muted-foreground mt-6">No scheduled entries yet. Run the generator first.</p>
        )}
      </div>
    </AppShell>
  );
}
