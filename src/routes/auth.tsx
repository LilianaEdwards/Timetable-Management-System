import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Fixed admin credentials for this instance.
// The first sign-in auto-provisions the account; the DB trigger grants the
// 'admin' role to the first user automatically.
const ADMIN_EMAIL = "admin@timetable.local";
const ADMIN_PASSWORD = "Admin@12345";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Admin sign in — Timetable Management" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState(ADMIN_PASSWORD);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let { error } = await supabase.auth.signInWithPassword({ email, password });

    // Auto-provision the admin account on first run.
    if (
      error &&
      email === ADMIN_EMAIL &&
      password === ADMIN_PASSWORD &&
      /invalid|credential/i.test(error.message)
    ) {
      const { error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: "Administrator" },
        },
      });
      if (!signUpErr) {
        const retry = await supabase.auth.signInWithPassword({ email, password });
        error = retry.error;
      } else {
        error = signUpErr;
      }
    }

    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome, Admin!");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-surface-2 rounded-2xl shadow-[3px_3px_20px_rgba(75,73,172,0.25)] p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-brand-deep">UCSM Timetable</h1>
          <p className="text-sm text-muted-foreground mt-1">Admin sign in</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-brand-deep hover:bg-brand"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 p-4 rounded-lg bg-muted text-sm">
          <p className="font-semibold text-brand-deep mb-1">Default admin credentials</p>
          <p><span className="text-muted-foreground">Email:</span> <code>{ADMIN_EMAIL}</code></p>
          <p><span className="text-muted-foreground">Password:</span> <code>{ADMIN_PASSWORD}</code></p>
          <p className="text-xs text-muted-foreground mt-2">
            The account is created automatically on first sign-in.
          </p>
        </div>
      </div>
    </div>
  );
}
