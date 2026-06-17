import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { createStudent, createLecturer } from "@/lib/people.functions";

export const Route = createFileRoute("/add")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: AddPage,
});

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface-2 rounded-2xl p-6 shadow-[3px_3px_10px_rgba(188,188,188,0.4)]">{children}</div>;
}

function AddPage() {
  return (
    <AppShell title="Add Data">
      <Card>
        <Tabs defaultValue="students">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="lecturers">Lecturers</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
            <TabsTrigger value="retakes">Retakes</TabsTrigger>
          </TabsList>
          <TabsContent value="students" className="pt-4"><StudentForm /></TabsContent>
          <TabsContent value="lecturers" className="pt-4"><LecturerForm /></TabsContent>
          <TabsContent value="rooms" className="pt-4"><RoomForm /></TabsContent>
          <TabsContent value="subjects" className="pt-4"><SubjectForm /></TabsContent>
          <TabsContent value="registrations" className="pt-4"><RegistrationForm /></TabsContent>
          <TabsContent value="retakes" className="pt-4"><RetakeForm /></TabsContent>
        </Tabs>
      </Card>
    </AppShell>
  );
}

function Submit({ loading, label = "Add" }: { loading: boolean; label?: string }) {
  return (
    <Button type="submit" disabled={loading} className="bg-brand-deep hover:bg-brand mt-2">
      {loading ? "Saving…" : label}
    </Button>
  );
}

function StudentForm() {
  const qc = useQueryClient();
  const addStudent = useServerFn(createStudent);
  const [f, setF] = useState({ student_no: "", name: "", email: "", year: "1" });
  const [loading, setLoading] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      try {
        const res = await addStudent({ data: { student_no: f.student_no, name: f.name, email: f.email || undefined, year: Number(f.year) } });
        toast.success(`Student added. Login: ${res.email} / ${res.password}`);
        setF({ student_no: "", name: "", email: "", year: "1" });
        qc.invalidateQueries();
      } catch (err: any) { toast.error(err.message); }
      finally { setLoading(false); }
    }} className="grid sm:grid-cols-2 gap-4">
      <div><Label>Student No</Label><Input required value={f.student_no} onChange={(e) => setF({ ...f, student_no: e.target.value })} /></div>
      <div><Label>Name</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><Label>Email (optional)</Label><Input type="email" placeholder="defaults to name@student.ucsm" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div><Label>Year</Label>
        <Select value={f.year} onValueChange={(v) => setF({ ...f, year: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{[1, 2, 3, 4, 5].map(y => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="sm:col-span-2 text-xs text-muted-foreground">Default password will be <code>name@student.ucsm</code> (lowercase, no spaces).</p>
      <div className="sm:col-span-2"><Submit loading={loading} /></div>
    </form>
  );
}

function LecturerForm() {
  const qc = useQueryClient();
  const addLecturer = useServerFn(createLecturer);
  const [f, setF] = useState({ lecturer_no: "", name: "", email: "" });
  const [loading, setLoading] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      try {
        const res = await addLecturer({ data: { lecturer_no: f.lecturer_no, name: f.name, email: f.email || undefined } });
        toast.success(`Lecturer added. Login: ${res.email} / ${res.password}`);
        setF({ lecturer_no: "", name: "", email: "" });
        qc.invalidateQueries();
      } catch (err: any) { toast.error(err.message); }
      finally { setLoading(false); }
    }} className="grid sm:grid-cols-2 gap-4">
      <div><Label>Lecturer No</Label><Input required value={f.lecturer_no} onChange={(e) => setF({ ...f, lecturer_no: e.target.value })} /></div>
      <div><Label>Name</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="sm:col-span-2"><Label>Email (optional)</Label><Input type="email" placeholder="defaults to name@lecturer.ucsm" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <p className="sm:col-span-2 text-xs text-muted-foreground">Default password will be <code>name@lecturer.ucsm</code> (lowercase, no spaces).</p>
      <div className="sm:col-span-2"><Submit loading={loading} /></div>
    </form>
  );
}

function RoomForm() {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", capacity: "30" });
  const [loading, setLoading] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      const { error } = await supabase.from("rooms").insert({ name: f.name, capacity: Number(f.capacity) });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Room added"); setF({ name: "", capacity: "30" });
      qc.invalidateQueries();
    }} className="grid sm:grid-cols-2 gap-4">
      <div><Label>Room Name</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><Label>Capacity</Label><Input required type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></div>
      <div className="sm:col-span-2"><Submit loading={loading} /></div>
    </form>
  );
}

function SubjectForm() {
  const qc = useQueryClient();
  const { data: lecturers } = useQuery({
    queryKey: ["lecturers-options"],
    queryFn: async () => (await supabase.from("lecturers").select("id,name").order("name")).data ?? [],
  });
  const [f, setF] = useState({ code: "", name: "", lecturer_id: "", duration_hours: "1", year: "1", joint_group: "" });
  const [loading, setLoading] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      const { error } = await supabase.from("subjects").insert({
        code: f.code, name: f.name,
        lecturer_id: f.lecturer_id || null,
        duration_hours: Number(f.duration_hours),
        year: Number(f.year),
        joint_group: f.joint_group.trim() || null,
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Subject added"); setF({ code: "", name: "", lecturer_id: "", duration_hours: "1", year: "1", joint_group: "" });
      qc.invalidateQueries();
    }} className="grid sm:grid-cols-2 gap-4">
      <div><Label>Code</Label><Input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
      <div><Label>Name</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><Label>Lecturer</Label>
        <Select value={f.lecturer_id} onValueChange={(v) => setF({ ...f, lecturer_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{(lecturers ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Year</Label>
        <Select value={f.year} onValueChange={(v) => setF({ ...f, year: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{[1, 2, 3, 4, 5].map(y => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2"><Label>Duration</Label>
        <Select value={f.duration_hours} onValueChange={(v) => setF({ ...f, duration_hours: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 hour</SelectItem>
            <SelectItem value="2">2 consecutive hours</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2"><Label>Joint Group <span className="text-xs text-muted-foreground">(optional — subjects sharing this label can't overlap in time, e.g. cross-year joint lectures)</span></Label>
        <Input value={f.joint_group} onChange={(e) => setF({ ...f, joint_group: e.target.value })} placeholder="e.g. JOINT-A" />
      </div>
      <div className="sm:col-span-2"><Submit loading={loading} /></div>
    </form>
  );
}

function RegistrationForm() {
  const qc = useQueryClient();
  const { data: students } = useQuery({ queryKey: ["students-options"], queryFn: async () => (await supabase.from("students").select("id,student_no,name").order("name")).data ?? [] });
  const { data: subjects } = useQuery({ queryKey: ["subjects-options"], queryFn: async () => (await supabase.from("subjects").select("id,code,name").order("code")).data ?? [] });
  const [f, setF] = useState({ student_id: "", subject_id: "", is_retake: false });
  const [loading, setLoading] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      const { error } = await supabase.from("registrations").insert(f);
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Registration added"); setF({ student_id: "", subject_id: "", is_retake: false });
      qc.invalidateQueries();
    }} className="grid sm:grid-cols-2 gap-4">
      <div><Label>Student</Label>
        <Select value={f.student_id} onValueChange={(v) => setF({ ...f, student_id: v })} required>
          <SelectTrigger><SelectValue placeholder="Select student…" /></SelectTrigger>
          <SelectContent>{(students ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.student_no} — {s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Subject</Label>
        <Select value={f.subject_id} onValueChange={(v) => setF({ ...f, subject_id: v })} required>
          <SelectTrigger><SelectValue placeholder="Select subject…" /></SelectTrigger>
          <SelectContent>{(subjects ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <label className="sm:col-span-2 flex items-center gap-2 text-sm">
        <Checkbox checked={f.is_retake} onCheckedChange={(v) => setF({ ...f, is_retake: !!v })} />
        Retake / re-attendance
      </label>
      <div className="sm:col-span-2"><Submit loading={loading} label="Register" /></div>
    </form>
  );
}

function RetakeForm() {
  const qc = useQueryClient();
  const { data: students } = useQuery({ queryKey: ["students-options"], queryFn: async () => (await supabase.from("students").select("id,student_no,name,year").order("name")).data ?? [] });
  const { data: subjects } = useQuery({ queryKey: ["subjects-options"], queryFn: async () => (await supabase.from("subjects").select("id,code,name,year").order("code")).data ?? [] });
  const { data: retakes } = useQuery({
    queryKey: ["retakes-list"],
    queryFn: async () => (await supabase
      .from("registrations")
      .select("id,students(student_no,name,year),subjects(code,name,year)")
      .eq("is_retake", true)
    ).data ?? [],
  });
  const [f, setF] = useState({ student_id: "", subject_id: "" });
  const [loading, setLoading] = useState(false);

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this retake?")) return;
    const { error } = await supabase.from("registrations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Retake removed");
    qc.invalidateQueries({ queryKey: ["retakes-list"] });
    qc.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Default subjects apply to every student in their year automatically. Use this panel to register a student for a
        <strong> retake</strong> subject from another year — the generator factors retakes in when scheduling.
      </p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setLoading(true);
        const { error } = await supabase.from("registrations").insert({ ...f, is_retake: true });
        setLoading(false);
        if (error) return toast.error(error.message);
        toast.success("Retake added"); setF({ student_id: "", subject_id: "" });
        qc.invalidateQueries({ queryKey: ["retakes-list"] });
        qc.invalidateQueries();
      }} className="grid sm:grid-cols-2 gap-4">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={(v) => setF({ ...f, student_id: v })} required>
            <SelectTrigger><SelectValue placeholder="Select student…" /></SelectTrigger>
            <SelectContent>{(students ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.student_no} — {s.name} (Y{s.year})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Retake Subject</Label>
          <Select value={f.subject_id} onValueChange={(v) => setF({ ...f, subject_id: v })} required>
            <SelectTrigger><SelectValue placeholder="Select subject…" /></SelectTrigger>
            <SelectContent>{(subjects ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name} (Y{s.year})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Submit loading={loading} label="Add retake" /></div>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-brand-deep mb-2">Current retakes</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-brand-deep">
              <tr><th className="px-4 py-2 text-left">Student</th><th className="px-4 py-2 text-left">Subject</th><th></th></tr>
            </thead>
            <tbody>
              {(retakes ?? []).map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-2">{r.students?.student_no} — {r.students?.name} (Y{r.students?.year})</td>
                  <td className="px-4 py-2">{r.subjects?.code} — {r.subjects?.name} (Y{r.subjects?.year})</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleRemove(r.id)}>Remove</Button>
                  </td>
                </tr>
              ))}
              {(retakes ?? []).length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No retakes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
