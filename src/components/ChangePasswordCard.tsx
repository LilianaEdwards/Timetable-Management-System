import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordCard() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setPw(""); setConfirm("");
  };

  return (
    <form onSubmit={submit} className="bg-surface-2 rounded-2xl p-6 shadow-[3px_3px_10px_rgba(188,188,188,0.4)] mt-6 max-w-md print:hidden">
      <h3 className="flex items-center gap-2 text-brand-deep font-semibold mb-3">
        <KeyRound className="h-4 w-4" /> Change my password
      </h3>
      <div className="space-y-3">
        <div><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required /></div>
        <div><Label>Confirm password</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required /></div>
        <Button type="submit" disabled={busy} className="bg-brand-deep hover:bg-brand">
          {busy ? "Saving…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
