import { Fragment, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DAYS, SLOT_LABELS } from "@/lib/timetable-constants";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";

export const Route = createFileRoute("/my-schedule")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
    if (isAdmin) throw redirect({ to: "/" });
  },
  component: MySchedulePage,
});

function MySchedulePage() {
  const { user, isLecturer, isStudent } = useAuth();
  const email = user?.email ?? "";
  const [semester, setSemester] = useState<"1" | "2">("1");

  const { data: lecturerMatch } = useQuery({
    queryKey: ["me-lecturer", email],
    enabled: !!email && isLecturer,
    queryFn: async () => (await supabase.from("lecturers").select("id,name").eq("email", email).maybeSingle()).data,
  });
  const { data: studentMatch } = useQuery({
    queryKey: ["me-student", email],
    enabled: !!email && isStudent,
    queryFn: async () => (await supabase.from("students").select("id,name,student_no,year").eq("email", email).maybeSingle()).data,
  });

  const { data: entries } = useQuery({
    queryKey: ["timetable-entries", semester],
    queryFn: async () => (await supabase
      .from("timetable_entries")
      .select("id,day,start_slot,end_slot,subject_id,room_id,semester,subjects(code,name,year,semester,lecturer_id,lecturers(name)),rooms(name)")
      .eq("semester", Number(semester))
    ).data ?? [],
  });

  const { data: myRegs } = useQuery({
    queryKey: ["my-regs", studentMatch?.id],
    enabled: !!studentMatch?.id,
    queryFn: async () => (await supabase.from("registrations").select("subject_id").eq("student_id", studentMatch!.id)).data ?? [],
  });

  const filtered = useMemo(() => {
    const all = (entries ?? []) as any[];
    if (isLecturer && lecturerMatch?.id) {
      return all.filter((e) => e.subjects?.lecturer_id === lecturerMatch.id);
    }
    if (isStudent && studentMatch?.id) {
      const subjectIds = new Set((myRegs ?? []).map((r: any) => r.subject_id));
      return all.filter((e) => subjectIds.has(e.subject_id));
    }
    return [];
  }, [entries, myRegs, isLecturer, isStudent, lecturerMatch, studentMatch]);

  const grid: any[][][] = DAYS.map(() => SLOT_LABELS.map(() => []));
  for (const e of filtered as any[]) {
    for (let s = e.start_slot; s <= e.end_slot; s++) grid[e.day][s].push(e);
  }

  const heading = isLecturer
    ? lecturerMatch ? `My Schedule — ${lecturerMatch.name}` : "My Schedule"
    : isStudent
    ? studentMatch ? `My Schedule — ${studentMatch.name} (Year ${studentMatch.year})` : "My Schedule"
    : "My Schedule";

  const noMatch =
    (isLecturer && !lecturerMatch) || (isStudent && !studentMatch);

  return (
    <AppShell title={heading}>
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
          <Button variant="outline" className="ml-auto" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print / PDF
          </Button>
        </div>

        {noMatch && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            We couldn't find a {isLecturer ? "lecturer" : "student"} record matching your email
            ({email}). Ask an admin to add a record with this exact email so your schedule appears here.
          </div>
        )}

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
                        {grid[dIdx][sIdx].length === 0 && !noMatch ? (
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
        {!noMatch && (filtered as any[]).length === 0 && (
          <p className="text-center text-muted-foreground mt-6">No scheduled entries yet.</p>
        )}
      </div>
      <ChangePasswordCard />
    </AppShell>
  );
}
