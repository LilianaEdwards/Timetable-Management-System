import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "lecturer" | "student";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) { setRoles([]); return; }
      // Defer role fetch
      setTimeout(async () => {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
        setRoles((data ?? []).map((r: any) => r.role as AppRole));
      }, 0);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase.from("user_roles").select("role").eq("user_id", session.user.id).then(({ data }) => {
          setRoles((data ?? []).map((r: any) => r.role as AppRole));
          setLoading(false);
        });
      } else setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return {
    user, session, roles, loading,
    isAdmin: roles.includes("admin"),
    isLecturer: roles.includes("lecturer"),
    isStudent: roles.includes("student"),
  };
}
