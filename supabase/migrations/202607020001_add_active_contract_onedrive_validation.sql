ALTER TABLE public.contrato
  ADD COLUMN IF NOT EXISTS onedrive_validacion_estado VARCHAR(20),
  ADD COLUMN IF NOT EXISTS onedrive_validacion_error TEXT,
  ADD COLUMN IF NOT EXISTS onedrive_validacion_actualizado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onedrive_carpeta_id TEXT,
  ADD COLUMN IF NOT EXISTS onedrive_carpeta_nombre TEXT,
  ADD COLUMN IF NOT EXISTS onedrive_carpeta_url TEXT,
  ADD COLUMN IF NOT EXISTS onedrive_categoria_ruta TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_onedrive_validacion_estado'
  ) THEN
    ALTER TABLE public.contrato
      ADD CONSTRAINT chk_contrato_onedrive_validacion_estado
      CHECK (
        onedrive_validacion_estado IS NULL
        OR onedrive_validacion_estado IN ('PENDIENTE', 'COMPLETADO', 'ERROR')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contrato_onedrive_validacion_estado
  ON public.contrato (onedrive_validacion_estado);

COMMENT ON COLUMN public.contrato.onedrive_validacion_estado
  IS 'Ultimo estado persistido de validacion del expediente activo en OneDrive.';
COMMENT ON COLUMN public.contrato.onedrive_validacion_actualizado_en
  IS 'Fecha y hora de la ultima validacion del expediente activo en OneDrive.';

NOTIFY pgrst, 'reload schema';
