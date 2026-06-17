import { Fragment, useEffect } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

type ViewMode = "all" | "year" | "student" | "lecturer" | "room";

function TimetablePage() {
  const { isAdmin } = useAuth();
  const [mode, setMode] = useState<ViewMode>("year");
  const [selected, setSelected] = useState<string>("1");
  const [semester, setSemester] = useState<"1" | "2">("1");

  // Non-admins are restricted to the year filter
  useEffect(() => {
    if (!isAdmin && mode !== "year") {
      setMode("year");
      setSelected("1");
    }
  }, [isAdmin, mode]);

  const { data: entries } = useQuery({
    queryKey: ["timetable-entries", semester],
    queryFn: async () => (await supabase
      .from("timetable_entries")
      .select("id,day,start_slot,end_slot,subject_id,room_id,semester,subjects(code,name,year,semester,credit,lecturer_id,lecturers(name)),rooms(name,capacity)")
      .eq("semester", Number(semester))
    ).data ?? [],
  });
  const { data: regs } = useQuery({
    queryKey: ["registrations-flat"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("registrations").select("student_id,subject_id")).data ?? [],
  });
  const { data: students } = useQuery({ queryKey: ["students-list"], enabled: isAdmin, queryFn: async () => (await supabase.from("students").select("id,student_no,name").order("name")).data ?? [] });
  const { data: lecturers } = useQuery({ queryKey: ["lecturers-list"], enabled: isAdmin, queryFn: async () => (await supabase.from("lecturers").select("id,name").order("name")).data ?? [] });
  const { data: rooms } = useQuery({ queryKey: ["rooms-list"], queryFn: async () => (await supabase.from("rooms").select("id,name").order("name")).data ?? [] });

  const filtered = useMemo(() => {
    const all = entries ?? [];
    if (mode === "all") return all;
    if (!selected) return [];
    if (mode === "year") return all.filter((e: any) => String(e.subjects?.year) === selected);
    if (mode === "room") return all.filter((e: any) => e.room_id === selected);
    if (mode === "lecturer") return all.filter((e: any) => e.subjects?.lecturer_id === selected);
    if (mode === "student") {
      const subjectIds = new Set((regs ?? []).filter((r: any) => r.student_id === selected).map((r: any) => r.subject_id));
      return all.filter((e: any) => subjectIds.has(e.subject_id));
    }
    return all;
  }, [entries, regs, mode, selected]);

  // Grid: rows = day, columns = slot
  const grid: any[][][] = DAYS.map(() => SLOT_LABELS.map(() => []));
  for (const e of filtered as any[]) {
    for (let s = e.start_slot; s <= e.end_slot; s++) grid[e.day][s].push(e);
  }

  const options =
    mode === "student" ? (students ?? []).map((s: any) => ({ value: s.id, label: `${s.student_no} — ${s.name}` }))
    : mode === "lecturer" ? (lecturers ?? []).map((l: any) => ({ value: l.id, label: l.name }))
    : mode === "room" ? (rooms ?? []).map((r: any) => ({ value: r.id, label: r.name }))
    : mode === "year" ? [1, 2, 3, 4, 5].map(y => ({ value: String(y), label: `Year ${y}` }))
    : [];

  return (
    <AppShell title="Timetable">
      <div className="bg-surface-2 rounded-2xl p-6 shadow-[3px_3px_10px_rgba(188,188,188,0.4)]">
        <div className="flex flex-wrap items-end gap-4 mb-6 print:hidden">
          <div>
            <label className="text-xs uppercase text-muted-foreground">Semester</label>
            <Select value={semester} onValueChange={(v) => setSemester(v as "1" | "2")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Semester I</SelectItem>
                <SelectItem value="2">Semester II</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div>
              <label className="text-xs uppercase text-muted-foreground">View</label>
              <Select value={mode} onValueChange={(v) => { setMode(v as ViewMode); setSelected(v === "year" ? "1" : ""); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scheduled</SelectItem>
                  <SelectItem value="year">By year</SelectItem>
                  <SelectItem value="student">By student</SelectItem>
                  <SelectItem value="lecturer">By lecturer</SelectItem>
                  <SelectItem value="room">By room</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
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
                <th className="bg-brand-deep text-white p-3 border border-white/20 w-28">Day</th>
                {SLOT_LABELS.map((s, i) => (
                  <Fragment key={s}>
                    {i === 3 && <th className="bg-accent text-brand-deep p-3 border border-white/20 text-xs">Lunch<br/>12–1 PM</th>}
                    <th className="bg-brand-deep text-white p-3 border border-white/20 text-xs whitespace-nowrap">{s}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, dIdx) => (
                <tr key={day}>
                  <td className="p-3 border bg-muted font-medium text-brand-deep">{day}</td>
                  {SLOT_LABELS.map((_, sIdx) => (
                    <Fragment key={sIdx}>
                      {sIdx === 3 && <td className="border bg-accent/40" />}
                      <td className="p-2 border align-top min-w-40">
                        {grid[dIdx][sIdx].length === 0 && mode !== "all" && mode !== "room" && selected ? (
                          <div className="rounded-md bg-muted/50 border border-dashed border-muted-foreground/30 p-2 text-xs text-muted-foreground italic text-center">
                            Self-Study
                          </div>
                        ) : grid[dIdx][sIdx].map((e: any) => (
                          <div key={e.id + "-" + sIdx} className="rounded-md bg-brand/10 border-l-4 border-brand p-2 mb-1 text-xs">
                            <div className="font-semibold text-brand-deep">{e.subjects?.code}</div>
                            <div className="text-foreground">{e.subjects?.name}</div>
                            <div className="text-muted-foreground">{e.rooms?.name} · {e.subjects?.lecturers?.name ?? "—"}</div>
                          </div>
                        ))}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(filtered as any[]).length === 0 && (
          <p className="text-center text-muted-foreground mt-6">No scheduled entries for this view.</p>
        )}
      </div>
    </AppShell>
  );
}
