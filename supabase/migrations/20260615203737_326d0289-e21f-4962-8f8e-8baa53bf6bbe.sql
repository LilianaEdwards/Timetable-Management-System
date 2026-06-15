
-- PROFILES: restrict SELECT to self or admin
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles self or admin read" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- LECTURERS: admin-only read
DROP POLICY IF EXISTS "lecturers read all" ON public.lecturers;
CREATE POLICY "lecturers admin read" ON public.lecturers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- STUDENTS: admin-only read
DROP POLICY IF EXISTS "students read all" ON public.students;
CREATE POLICY "students admin read" ON public.students
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- REGISTRATIONS: admin-only read
DROP POLICY IF EXISTS "registrations read all" ON public.registrations;
CREATE POLICY "registrations admin read" ON public.registrations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES: admin-only writes (explicit)
CREATE POLICY "user_roles admin insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Lock down has_role EXECUTE - only needed inside RLS (runs as definer)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
