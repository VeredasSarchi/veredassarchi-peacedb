CREATE TABLE IF NOT EXISTS public.onedrive_integration_config (
  id TEXT PRIMARY KEY DEFAULT 'primary',
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.onedrive_integration_config
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS onedrive_integration_config_singleton_idx
  ON public.onedrive_integration_config ((id));
