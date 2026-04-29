ALTER TABLE public.onedrive_integration_config
  ADD COLUMN IF NOT EXISTS account_email TEXT,
  ADD COLUMN IF NOT EXISTS account_display_name TEXT,
  ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ;
