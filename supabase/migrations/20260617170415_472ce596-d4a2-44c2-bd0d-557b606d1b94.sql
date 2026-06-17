
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS semester smallint NOT NULL DEFAULT 1 CHECK (semester IN (1,2)),
  ADD COLUMN IF NOT EXISTS credit smallint NOT NULL DEFAULT 1 CHECK (credit BETWEEN 1 AND 30);

UPDATE public.subjects SET credit = GREATEST(duration_hours, 1) WHERE credit = 1 AND duration_hours > 1;

ALTER TABLE public.timetable_entries
  ADD COLUMN IF NOT EXISTS semester smallint NOT NULL DEFAULT 1 CHECK (semester IN (1,2));
