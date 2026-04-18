-- ============================================================
-- Add freeze flag for projects
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.is_frozen IS 'Freeze unfinished projects without deleting or archiving them.';
