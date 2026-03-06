ALTER TABLE public.contrato
  DROP COLUMN IF EXISTS numero_folio_real,
  DROP COLUMN IF EXISTS correo_reglamento,
  DROP COLUMN IF EXISTS codigo_reglamento;

ALTER TABLE public.cliente
  DROP COLUMN IF EXISTS correo_reglamento,
  DROP COLUMN IF EXISTS codigo_reglamento;
