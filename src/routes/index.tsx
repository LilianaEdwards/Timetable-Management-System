import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, GraduationCap, DoorOpen, BookOpen, ListChecks, CalendarRange } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth" });
  },
  component: Dashboard,
});

async function fetchCounts() {
  const [students, lecturers, rooms, subjects, regs, entries] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }),
    supabase.from("lecturers").select("*", { count: "exact", head: true }),
    supabase.from("rooms").select("*", { count: "exact", head: true }),
    supabase.from("subjects").select("*", { count: "exact", head: true }),
    supabase.from("registrations").select("*", { count: "exact", head: true }),
    supabase.from("timetable_entries").select("*", { count: "exact", head: true }),
  ]);
  return {
    students: students.count ?? 0,
    lecturers: lecturers.count ?? 0,
    rooms: rooms.count ?? 0,
    subjects: subjects.count ?? 0,
    registrations: regs.count ?? 0,
    entries: entries.count ?? 0,
  };
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-surface-2 rounded-2xl p-6 shadow-[3px_3px_10px_rgba(188,188,188,0.4)] flex items-center gap-4">
      <div className="h-14 w-14 rounded-xl flex items-center justify-center" style={{ background: color }}>
        <Icon className="h-7 w-7 text-white" />
      </div>
      <div>
        <div className="text-3xl font-bold text-brand-deep">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data } = useQuery({ queryKey: ["dashboard-counts"], queryFn: fetchCounts });
  return (
    <AppShell title="Dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <StatCard icon={Users} label="Students" value={data?.students ?? "—"} color="#4b49ac" />
        <StatCard icon={GraduationCap} label="Lecturers" value={data?.lecturers ?? "—"} color="#5500cb" />
        <StatCard icon={DoorOpen} label="Rooms" value={data?.rooms ?? "—"} color="#0c007d" />
        <StatCard icon={BookOpen} label="Subjects" value={data?.subjects ?? "—"} color="#7e57c2" />
        <StatCard icon={ListChecks} label="Registrations" value={data?.registrations ?? "—"} color="#3f0097" />
        <StatCard icon={CalendarRange} label="Scheduled Slots" value={data?.entries ?? "—"} color="#1565c0" />
      </div>

      <div className="mt-8 bg-surface-2 rounded-2xl p-6 shadow-[3px_3px_10px_rgba(188,188,188,0.4)]">
        <h2 className="text-xl font-semibold text-brand-accent mb-4">Quick start</h2>
        <ol className="space-y-2 text-sm text-foreground">
          <li>1. <Link to="/add" className="text-brand underline">Add data</Link> — rooms, lecturers, subjects, students, then registrations.</li>
          <li>2. <Link to="/generate" className="text-brand underline">Generate timetable</Link> — runs the CSP + graph-coloring engine.</li>
          <li>3. <Link to="/timetable" className="text-brand underline">View timetable</Link> — filter by student, lecturer or room.</li>
        </ol>
      </div>
    </AppShell>
  );
}
