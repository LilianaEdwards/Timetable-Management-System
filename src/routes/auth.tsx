import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brokeredPreviewStorage } from "@/integrations/supabase/previewAuthStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — UCSM Timetable" },
      { name: "description", content: "Sign in to the UCSM Timetable Management System." },
      { property: "og:title", content: "Sign in — UCSM Timetable" },
      { property: "og:description", content: "Sign in to the UCSM Timetable Management System." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

async function clearSavedLogin() {
  const backendUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!backendUrl || typeof window === "undefined") return;

  const projectRef = new URL(backendUrl).hostname.split(".")[0];
  if (!projectRef) return;

  const storage = brokeredPreviewStorage();
  await storage?.removeItem(`sb-${projectRef}-auth-token`);
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");

    try {
      await clearSavedLogin();

      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        let isAdmin = false;
        if (data.user) {
          const { data: adminCheck } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
          isAdmin = Boolean(adminCheck);
        }
        await navigate({ to: isAdmin ? "/" : "/my-schedule", replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName || email },
          },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      }
    } catch (error) {
      const message = error instanceof Error && error.message !== "Failed to fetch"
        ? error.message
        : "The login service could not be reached. Please try again.";
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-surface-2 rounded-2xl shadow-[3px_3px_20px_rgba(75,73,172,0.25)] p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-brand-deep">UCSM Timetable</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Sign in to your account" : "Create an account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          )}
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-brand-deep hover:bg-brand"
            disabled={loading}
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </form>

        <div className="mt-6 text-center text-sm">
          {mode === "signin" ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-brand-deep"
              onClick={() => setMode("signup")}
            >
              Don&apos;t have an account? Sign up
            </Button>
          ) : (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-brand-deep"
              onClick={() => setMode("signin")}
            >
              Already have an account? Sign in
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
