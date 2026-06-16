import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { student_no: string; name: string; email?: string; year: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const s = slug(data.name);
    const password = `${s}@student.ucsm`;
    const email = (data.email && data.email.trim()) || `${s}@student.ucsm`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: data.name },
    });
    if (authErr) throw new Error(authErr.message);
    const authUserId = created.user!.id;

    // handle_new_user trigger assigns 'student' role by default; ensure it
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: authUserId, role: "student" }, { onConflict: "user_id,role" },
    );

    const { error } = await supabaseAdmin.from("students").insert({
      student_no: data.student_no, name: data.name, email, year: data.year,
      default_password: password, auth_user_id: authUserId,
    });
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw new Error(error.message);
    }
    return { ok: true, password, email };
  });

export const createLecturer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lecturer_no: string; name: string; email?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const s = slug(data.name);
    const password = `${s}@lecturer.ucsm`;
    const email = (data.email && data.email.trim()) || `${s}@lecturer.ucsm`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: data.name },
    });
    if (authErr) throw new Error(authErr.message);
    const authUserId = created.user!.id;

    await supabaseAdmin.from("user_roles").upsert(
      { user_id: authUserId, role: "lecturer" }, { onConflict: "user_id,role" },
    );
    // remove default 'student' role granted by handle_new_user trigger
    await supabaseAdmin.from("user_roles").delete()
      .eq("user_id", authUserId).eq("role", "student");

    const { error } = await supabaseAdmin.from("lecturers").insert({
      lecturer_no: data.lecturer_no, name: data.name, email,
      default_password: password, auth_user_id: authUserId,
    });
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw new Error(error.message);
    }
    return { ok: true, password, email };
  });
