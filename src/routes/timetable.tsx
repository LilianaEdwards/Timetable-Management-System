import { Fragment, useEffect } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Printer, Pencil, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DAYS, SLOT_LABELS } from "@/lib/timetable-constants";
import { moveTimetableEntry, deleteTimetableEntry, deleteTimetable } from "@/lib/timetable.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/timetable")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth" });
  },
  component: TimetablePage,
});

type ViewMode = "all" | "year" | "room";

function TimetablePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const move = useServerFn(moveTimetableEntry);
  const removeEntry = useServerFn(deleteTimetableEntry);
  const removeAll = useServerFn(deleteTimetable);
  const [mode, setMode] = useState<ViewMode>("year");
  const [selected, setSelected] = useState<string>("1");
  const [semester, setSemester] = useState<"1" | "2">("1");

  // Manual-correction dialog state
  const [editing, setEditing] = useState<any | null>(null);
  const [editDay, setEditDay] = useState("0");
  const [editSlot, setEditSlot] = useState("0");
  const [editRoom, setEditRoom] = useState("");
  const [saving, setSaving] = useState(false);

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
  const { data: rooms } = useQuery({ queryKey: ["rooms-list"], queryFn: async () => (await supabase.from("rooms").select("id,name,capacity").order("name")).data ?? [] });

  const filtered = useMemo(() => {
    const all = entries ?? [];
    if (mode === "all") return all;
    if (!selected) return [];
    if (mode === "year") return all.filter((e: any) => String(e.subjects?.year) === selected);
    if (mode === "room") return all.filter((e: any) => e.room_id === selected);
    return all;
  }, [entries, mode, selected]);

  // Grid: rows = day, columns = slot
  const grid: any[][][] = DAYS.map(() => SLOT_LABELS.map(() => []));
  for (const e of filtered as any[]) {
    for (let s = e.start_slot; s <= e.end_slot; s++) grid[e.day][s].push(e);
  }

  const options: { value: string; label: string }[] =
    mode === "room" ? (rooms ?? []).map((r: any) => ({ value: r.id, label: r.name }))
    : mode === "year" ? [1, 2, 3, 4, 5].map(y => ({ value: String(y), label: `Year ${y}` }))
    : [];

  const openEdit = (e: any) => {
    setEditing(e);
    setEditDay(String(e.day));
    setEditSlot(String(e.start_slot));
    setEditRoom(e.room_id);
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["timetable-entries"] });

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await move({ data: { entryId: editing.id, day: Number(editDay), startSlot: Number(editSlot), roomId: editRoom } });
      await refresh();
      toast.success("Class moved");
      setEditing(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not move this class");
    } finally { setSaving(false); }
  };

  const deleteOne = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await removeEntry({ data: { entryId: editing.id } });
      await refresh();
      toast.success("Class removed");
      setEditing(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove this class");
    } finally { setSaving(false); }
  };

  const deleteSemester = async () => {
    try {
      await removeAll({ data: { semester: Number(semester) } });
      await refresh();
      toast.success(`Semester ${semester} timetable deleted`);
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
  };

  const span = editing ? editing.end_slot - editing.start_slot : 0;

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
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete timetable
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete the Semester {semester} timetable?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Every scheduled class for Semester {semester} is removed. Subjects, rooms and people are untouched, and you can generate again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteSemester} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Print / PDF
            </Button>
          </div>
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
                          <div key={e.id + "-" + sIdx} className="group relative rounded-md bg-brand/10 border-l-4 border-brand p-2 mb-1 text-xs">
                            <div className="font-semibold text-brand-deep">{e.subjects?.code}</div>
                            <div className="text-foreground">{e.subjects?.name}</div>
                            <div className="text-muted-foreground">{e.rooms?.name} · {e.subjects?.lecturers?.name ?? "—"}</div>
                            {isAdmin && (
                              <button
                                type="button"
                                aria-label={`Edit ${e.subjects?.code}`}
                                onClick={() => openEdit(e)}
                                className="print:hidden absolute top-1 right-1 rounded-md p-1 text-brand-deep/70 hover:bg-brand/20 hover:text-brand-deep"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.subjects?.code} — {editing?.subjects?.name}</DialogTitle>
            <DialogDescription>
              Move this class to another day, time or room. Clashes with lecturers, joint subjects, the same year, registered students or the room are blocked.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Day</label>
              <Select value={editDay} onValueChange={setEditDay}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Start time</label>
              <Select value={editSlot} onValueChange={setEditSlot}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOT_LABELS.map((s, i) => (
                    i + span <= SLOT_LABELS.length - 1
                      ? <SelectItem key={s} value={String(i)}>{s}</SelectItem>
                      : null
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Room</label>
              <Select value={editRoom} onValueChange={setEditRoom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(rooms ?? []).map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} ({r.capacity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {span > 0 && (
            <p className="text-xs text-muted-foreground">This is a {span + 1}-hour class, so it keeps its length from the chosen start time.</p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={deleteOne} disabled={saving} className="border-destructive/40 text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-2" /> Remove class
            </Button>
            <Button onClick={saveEdit} disabled={saving} className="bg-brand-deep hover:bg-brand">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
