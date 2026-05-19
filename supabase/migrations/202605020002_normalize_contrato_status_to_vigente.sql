-- Safety net for databases where the temporary CONTRATO status was already used.
UPDATE public.contrato
SET estado_contrato = 'VIGENTE'::public.estado_contrato_enum
WHERE estado_contrato::text = 'CONTRATO';

CREATE OR REPLACE FUNCTION public.anular_contrato(
  p_id_contrato INT,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado_actual TEXT;
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_espacios_liberados INT := 0;
BEGIN
  SELECT estado_contrato::TEXT
    INTO v_estado_actual
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF v_estado_actual = 'ANULADO' THEN
    RAISE EXCEPTION 'El contrato ya esta anulado';
  END IF;

  IF v_estado_actual <> 'VIGENTE' THEN
    RAISE EXCEPTION 'Solo se pueden anular contratos vigentes';
  END IF;

  UPDATE public.lote_espacio AS espacio
  SET
    estado = 'DISPONIBLE',
    nombre_ocupante = NULL,
    fecha_ocupacion = NULL,
    id_contrato_producto = NULL
  WHERE espacio.id_contrato_producto IN (
    SELECT producto.id_contrato_producto
    FROM public.contrato_producto AS producto
    WHERE producto.id_contrato = p_id_contrato
  );

  GET DIAGNOSTICS v_espacios_liberados = ROW_COUNT;

  UPDATE public.contrato
  SET
    estado_contrato = 'ANULADO'::public.estado_contrato_enum,
    fecha_anulacion = NOW(),
    usuario_anulacion = v_usuario,
    onedrive_anulacion_estado = 'PENDIENTE',
    onedrive_anulacion_error = NULL,
    onedrive_anulacion_actualizado_en = NOW()
  WHERE id_contrato = p_id_contrato;

  INSERT INTO public.contrato_anulacion_log (
    id_contrato,
    usuario,
    resultado,
    detalle,
    onedrive_estado
  )
  VALUES (
    p_id_contrato,
    v_usuario,
    'DB_COMPLETADO',
    FORMAT('Contrato anulado. Espacios liberados: %s', v_espacios_liberados),
    'PENDIENTE'
  );

  RETURN jsonb_build_object(
    'id_contrato', p_id_contrato,
    'estado_contrato', 'ANULADO',
    'espacios_liberados', v_espacios_liberados,
    'onedrive_estado', 'PENDIENTE'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_contrato(INT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
