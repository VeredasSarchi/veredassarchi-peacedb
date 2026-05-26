CREATE SEQUENCE IF NOT EXISTS public.precontrato_numero_formulario_seq;

DO $$
DECLARE
  v_max_pre bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(numero_formulario, '^PRE-([0-9]+)$'))[1]::bigint), 0)
  INTO v_max_pre
  FROM public.contrato
  WHERE numero_formulario ~ '^PRE-[0-9]+$';

  PERFORM setval(
    'public.precontrato_numero_formulario_seq',
    GREATEST(v_max_pre, 1),
    v_max_pre > 0
  );
END $$;

CREATE OR REPLACE FUNCTION public.generar_numero_precontrato()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'PRE-' || lpad(nextval('public.precontrato_numero_formulario_seq')::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generar_numero_precontrato() TO anon;
GRANT EXECUTE ON FUNCTION public.generar_numero_precontrato() TO authenticated;

NOTIFY pgrst, 'reload schema';
