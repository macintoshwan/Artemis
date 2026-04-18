-- ============================================================
-- Add system project flag for hidden todo container
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Prevent duplicate hidden todo containers per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_system_unique
  ON public.projects (user_id, is_system)
  WHERE is_system = true;

-- Optional: keep the hidden project clearly identifiable in the database
COMMENT ON COLUMN public.projects.is_system IS 'Marks hidden system projects such as the todo container.';
