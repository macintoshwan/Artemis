-- Add fixed schedule event fields to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_fixed_event boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_start_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS schedule_end_at timestamp with time zone;

-- Fast filter for daily schedule lookup
CREATE INDEX IF NOT EXISTS idx_tasks_fixed_schedule
  ON public.tasks (user_id, schedule_start_at)
  WHERE is_fixed_event = true;
