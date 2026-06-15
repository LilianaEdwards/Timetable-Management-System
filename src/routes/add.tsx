import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [f, setF] = useState({ student_no: "", name: "", email: "", year: "1" });
  const [loading, setLoading] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      const { error } = await supabase.from("students").insert({ student_no: f.student_no, name: f.name, email: f.email || null, year: Number(f.year) });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Student added"); setF({ student_no: "", name: "", email: "", year: "1" });
      qc.invalidateQueries();
    }} className="grid sm:grid-cols-2 gap-4">
      <div><Label>Student No</Label><Input required value={f.student_no} onChange={(e) => setF({ ...f, student_no: e.target.value })} /></div>
      <div><Label>Name</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div><Label>Year</Label>
        <Select value={f.year} onValueChange={(v) => setF({ ...f, year: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{[1, 2, 3, 4, 5].map(y => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2"><Submit loading={loading} /></div>
    </form>
  );
}

function LecturerForm() {
  const qc = useQueryClient();
  const [f, setF] = useState({ lecturer_no: "", name: "", email: "" });
  const [loading, setLoading] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      const { error } = await supabase.from("lecturers").insert({ lecturer_no: f.lecturer_no, name: f.name, email: f.email || null });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Lecturer added"); setF({ lecturer_no: "", name: "", email: "" });
      qc.invalidateQueries();
    }} className="grid sm:grid-cols-2 gap-4">
      <div><Label>Lecturer No</Label><Input required value={f.lecturer_no} onChange={(e) => setF({ ...f, lecturer_no: e.target.value })} /></div>
      <div><Label>Name</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="sm:col-span-2"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
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
  const [f, setF] = useState({ code: "", name: "", lecturer_id: "", duration_hours: "1", year: "1" });
  const [loading, setLoading] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      const { error } = await supabase.from("subjects").insert({
        code: f.code, name: f.name,
        lecturer_id: f.lecturer_id || null,
        duration_hours: Number(f.duration_hours),
        year: Number(f.year),
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Subject added"); setF({ code: "", name: "", lecturer_id: "", duration_hours: "1", year: "1" });
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
