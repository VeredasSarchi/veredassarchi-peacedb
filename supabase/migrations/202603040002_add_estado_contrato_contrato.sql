DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'estado_contrato_enum'
      AND e.enumlabel = 'CONTRATO'
  ) THEN
    ALTER TYPE public.estado_contrato_enum ADD VALUE 'CONTRATO';
  END IF;
END;
$$;