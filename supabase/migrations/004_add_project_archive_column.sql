-- Add archive flag for projects
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Optional index to speed up active project queries
CREATE INDEX IF NOT EXISTS idx_projects_is_archived ON public.projects(is_archived);
