
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS default_password text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.lecturers ADD COLUMN IF NOT EXISTS default_password text;
ALTER TABLE public.lecturers ADD COLUMN IF NOT EXISTS auth_user_id uuid;
