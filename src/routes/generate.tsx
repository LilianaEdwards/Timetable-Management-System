import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateTimetable, deleteTimetable } from "@/lib/timetable.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/generate")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: GeneratePage,
});

function GeneratePage() {
  const run = useServerFn(generateTimetable);
  const remove = useServerFn(deleteTimetable);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [semester, setSemester] = useState<"1" | "2">("1");
  const [result, setResult] = useState<Awaited<ReturnType<typeof generateTimetable>> | null>(null);

  const handleGenerate = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await run({ data: { semester: Number(semester) } });
      setResult(res);
      qc.invalidateQueries();
      toast.success(`Semester ${res.semester}: scheduled ${res.scheduled} slots`);
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await remove({ data: { semester: Number(semester) } });
      setResult(null);
      qc.invalidateQueries();
      toast.success(`Semester ${semester} timetable deleted`);
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    } finally { setDeleting(false); }
  };

  return (
    <AppShell title="Generate Timetable">
      <div className="bg-surface-2 rounded-2xl p-8 shadow-[3px_3px_10px_rgba(188,188,188,0.4)]">
        <div className="flex flex-col md:flex-row md:items-end gap-6">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-brand-accent">Run the scheduling engine</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Credit-based scheduler: each subject is placed for <strong>credit</strong> one-hour slots per week, spread across
              different days when possible. Total credits per year must be ≤ 30 (the weekly grid is 5 days × 6 slots).
              Empty cells appear as <strong>Self-Study</strong>. Avoids lecturer, joint-group, same-year, and room clashes.
            </p>
          </div>
          <div className="min-w-44">
            <label className="text-xs uppercase text-muted-foreground">Semester</label>
            <Select value={semester} onValueChange={(v) => setSemester(v as "1" | "2")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Semester I</SelectItem>
                <SelectItem value="2">Semester II</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerate} disabled={busy || deleting} className="bg-brand-deep hover:bg-brand h-14 px-8 text-base">
            {busy ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Working…</> : <><Sparkles className="mr-2 h-5 w-5" /> Generate</>}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy || deleting} className="h-14 px-6 text-base border-destructive/40 text-destructive hover:bg-destructive/10">
                {deleting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Deleting…</> : <><Trash2 className="mr-2 h-5 w-5" /> Delete timetable</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete the Semester {semester} timetable?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes every scheduled class for Semester {semester}. Subjects, rooms, students and lecturers are not affected, and you can generate again at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {result && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-2 text-brand-deep">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-semibold">Semester {result.semester}: scheduled {result.scheduled} slot(s) out of {result.totalCredits} credit(s).</span>
            </div>
            {result.unschedulable.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
                  <AlertTriangle className="h-5 w-5" /> Could not fully schedule:
                </div>
                <ul className="text-sm space-y-1 text-foreground">
                  {result.unschedulable.map(u => <li key={u.code}>• <strong>{u.code}</strong> {u.name} — {u.reason}</li>)}
                </ul>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              View the result on the <a href="/timetable" className="text-brand underline">Timetable</a> page.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
