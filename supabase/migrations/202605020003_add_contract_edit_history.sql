CREATE TABLE IF NOT EXISTS public.contrato_edicion_log (
  id_log BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  usuario TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumen TEXT NOT NULL,
  cambios JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contrato_edicion_log_contrato
  ON public.contrato_edicion_log (id_contrato, fecha DESC);

NOTIFY pgrst, 'reload schema';
