import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/view")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/timetable" });
  },
  component: ViewPage,
});

function ViewPage() {
  return (
    <AppShell title="View / Edit Data">
      <div className="bg-surface-2 rounded-2xl p-6 shadow-[3px_3px_10px_rgba(188,188,188,0.4)]">
        <Tabs defaultValue="students">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="lecturers">Lecturers</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
          </TabsList>
          <TabsContent value="students" className="pt-4"><EntityTable table="students" columns={["student_no", "name", "email", "year", "default_password"]} /></TabsContent>
          <TabsContent value="lecturers" className="pt-4"><EntityTable table="lecturers" columns={["lecturer_no", "name", "email", "default_password"]} /></TabsContent>
          <TabsContent value="rooms" className="pt-4"><EntityTable table="rooms" columns={["name", "capacity"]} /></TabsContent>
          <TabsContent value="subjects" className="pt-4"><EntityTable table="subjects" columns={["code", "name", "duration_hours", "year", "joint_group"]} /></TabsContent>
          <TabsContent value="registrations" className="pt-4"><RegistrationsTable /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function EntityTable({ table, columns }: { table: string; columns: string[] }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: [table, "list"],
    queryFn: async () => (await (supabase.from(table as any).select("*").order("created_at", { ascending: false }))).data ?? [],
  });
  const filtered = (data ?? []).filter((r: any) =>
    columns.some(c => String(r[c] ?? "").toLowerCase().includes(q.toLowerCase()))
  );
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this record?")) return;
    const { error } = await supabase.from(table as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); qc.invalidateQueries({ queryKey: [table, "list"] });
  };
  return (
    <div>
      <div className="flex items-center mb-4 gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} record(s)</span>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-brand-deep">
              <tr>{columns.map(c => <th key={c} className="px-4 py-2 text-left capitalize">{c.replace(/_/g, " ")}</th>)}<th></th></tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/50">
                  {columns.map(c => (
                    <td key={c} className="px-4 py-2">
                      {c === "joint_group" && table === "subjects" ? (
                        <Input
                          defaultValue={r[c] ?? ""}
                          placeholder="—"
                          className="h-8 max-w-[160px]"
                          onBlur={async (e) => {
                            const v = e.target.value.trim() || null;
                            if (v === (r[c] ?? null)) return;
                            const { error } = await supabase.from("subjects").update({ joint_group: v }).eq("id", r.id);
                            if (error) return toast.error(error.message);
                            toast.success("Joint group updated");
                            qc.invalidateQueries({ queryKey: [table, "list"] });
                          }}
                        />
                      ) : String(r[c] ?? "")}
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={columns.length + 1} className="px-4 py-6 text-center text-muted-foreground">No records yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RegistrationsTable() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["registrations", "joined"],
    queryFn: async () => (await supabase.from("registrations").select("id,is_retake,students(student_no,name),subjects(code,name)").order("created_at", { ascending: false })).data ?? [],
  });
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this registration?")) return;
    const { error } = await supabase.from("registrations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["registrations", "joined"] });
  };
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-muted text-brand-deep">
          <tr><th className="px-4 py-2 text-left">Student</th><th className="px-4 py-2 text-left">Subject</th><th className="px-4 py-2 text-left">Retake</th><th></th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((r: any) => (
            <tr key={r.id} className="border-b hover:bg-muted/50">
              <td className="px-4 py-2">{r.students?.student_no} — {r.students?.name}</td>
              <td className="px-4 py-2">{r.subjects?.code} — {r.subjects?.name}</td>
              <td className="px-4 py-2">{r.is_retake ? "Yes" : "No"}</td>
              <td className="px-4 py-2"><Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
            </tr>
          ))}
          {(data ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No registrations yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
