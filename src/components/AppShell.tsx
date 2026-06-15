import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, PlusCircle, FileEdit, Sparkles, CalendarDays, LogOut, Menu, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { to: "/add", label: "Add Data", icon: PlusCircle, adminOnly: true },
  { to: "/view", label: "View / Edit", icon: FileEdit, adminOnly: false },
  { to: "/generate", label: "Generate", icon: Sparkles, adminOnly: true },
  { to: "/timetable", label: "Timetable", icon: CalendarDays, adminOnly: false },
] as const;

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 h-[70px] flex items-center justify-between px-6 bg-surface shadow-[1px_1px_15px_rgba(161,182,253,0.5)]">
        <div className="flex items-center gap-8">
          <button onClick={() => setOpen(!open)} className="p-1 rounded hover:bg-muted" aria-label="Toggle navigation">
            <Menu className="h-6 w-6 text-brand-deep" />
          </button>
          <Link to="/" className="text-2xl font-semibold text-brand-deep tracking-tight">UCSM Timetable</Link>
        </div>
        <div className="hidden md:flex items-center">
          <input
            type="text"
            placeholder="Search"
            className="h-10 w-64 rounded-l-full bg-muted px-5 text-sm outline-none border-0"
          />
          <button className="h-10 w-12 rounded-r-full bg-brand-deep flex items-center justify-center">
            <Search className="h-4 w-4 text-white" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-sm font-semibold text-brand-deep">{user?.email ?? "Guest"}</span>
            <span className="text-xs text-muted-foreground">{isAdmin ? "Admin" : "Viewer"}</span>
          </div>
          <div className="h-10 w-10 rounded-full bg-brand-deep text-white flex items-center justify-center font-bold uppercase">
            {(user?.email ?? "U")[0]}
          </div>
        </div>
      </header>

      <div className="flex pt-[70px]">
        <aside
          className={cn(
            "fixed left-0 top-[70px] bottom-0 z-40 bg-surface-2 shadow-[1px_1px_10px_rgba(198,189,248,0.6)] transition-all duration-300 overflow-hidden",
            open ? "w-[250px]" : "w-[80px]",
          )}
        >
          <nav className="flex flex-col gap-2 py-6">
            {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-4 h-14 pl-6 pr-4 transition-all border-l-4",
                    active
                      ? "border-brand-deep bg-brand text-primary-foreground"
                      : "border-transparent text-foreground hover:bg-muted hover:border-muted-foreground/30",
                  )}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  {open && <span className="font-medium">{item.label}</span>}
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-4 h-14 pl-6 pr-4 mt-4 border-l-4 border-transparent text-foreground hover:bg-muted hover:border-destructive/40 text-left"
            >
              <LogOut className="h-6 w-6 shrink-0" />
              {open && <span className="font-medium">Logout</span>}
            </button>
          </nav>
        </aside>

        <main className={cn("flex-1 transition-all duration-300 p-6 md:p-10", open ? "ml-[250px]" : "ml-[80px]")}>
          {title && <h1 className="text-3xl font-semibold text-brand-deep mb-6">{title}</h1>}
          {children}
        </main>
      </div>
    </div>
  );
}
