import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { generateTimetable } from "@/lib/timetable.functions";

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
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof generateTimetable>> | null>(null);

  const handleGenerate = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await run();
      setResult(res);
      qc.invalidateQueries();
      toast.success(`Scheduled ${res.scheduled} of ${res.total} subjects`);
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally { setBusy(false); }
  };

  return (
    <AppShell title="Generate Timetable">
      <div className="bg-surface-2 rounded-2xl p-8 shadow-[3px_3px_10px_rgba(188,188,188,0.4)]">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-brand-accent">Run the scheduling engine</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Uses <strong>Greedy ordering</strong> (largest enrolment first) + <strong>CSP backtracking</strong> with forward-checking,
              and a <strong>Graph-coloring</strong> fallback on conflicts. Enforces: no student / lecturer / room clashes, 2-hour subjects
              in consecutive slots only (never crossing lunch), room capacity ≥ enrolled students, and respects retakes & cross-year registrations.
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={busy} className="bg-brand-deep hover:bg-brand h-14 px-8 text-base">
            {busy ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Working…</> : <><Sparkles className="mr-2 h-5 w-5" /> Generate</>}
          </Button>
        </div>

        {result && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-2 text-brand-deep">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-semibold">Scheduled {result.scheduled} of {result.total} subjects.</span>
            </div>
            {result.unschedulable.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
                  <AlertTriangle className="h-5 w-5" /> Could not schedule:
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
