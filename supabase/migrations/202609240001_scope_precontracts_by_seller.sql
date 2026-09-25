BEGIN;

-- Expone solamente los identificadores que la sesion puede consultar. Los
-- detalles siguen leyendose con los permisos habituales de las tablas.
CREATE OR REPLACE FUNCTION public.obtener_ids_precontratos_visibles()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rol TEXT;
  v_id_vendedor INT;
BEGIN
  SELECT usuario.raw_app_meta_data ->> 'role'
    INTO v_rol
  FROM auth.users AS usuario
  WHERE usuario.id = auth.uid();

  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'vendedor') THEN
    RAISE EXCEPTION 'No tiene permisos para consultar precontratos'
      USING ERRCODE = '42501';
  END IF;

  IF v_rol = 'vendedor' THEN
    SELECT asociacion.id_vendedor
      INTO v_id_vendedor
    FROM public.vendedor_usuario_referidos AS asociacion
    WHERE asociacion.id_usuario = auth.uid();

    IF v_id_vendedor IS NULL THEN
      RAISE EXCEPTION 'La cuenta no esta asociada a un vendedor comercial. Solicite la asociacion a administracion'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(contrato.id_contrato ORDER BY contrato.id_contrato DESC)
    FROM public.contrato AS contrato
    WHERE contrato.estado_contrato::TEXT = 'PRECONTRATO'
      AND (v_rol = 'admin' OR contrato.id_vendedor = v_id_vendedor)
  ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_ids_precontratos_visibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_ids_precontratos_visibles() TO authenticated;

COMMIT;
