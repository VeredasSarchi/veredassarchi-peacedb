CREATE OR REPLACE FUNCTION public.sincronizar_cuotas_mantenimiento_contrato(
  p_id_contrato INT,
  p_hasta_fecha DATE DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato public.contrato%ROWTYPE;
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_fecha_inicio DATE;
  v_hasta_fecha DATE;
  v_monto NUMERIC(14,2);
  v_tiene_producto BOOLEAN;
  v_periodo INT;
  v_fecha_inicio_periodo DATE;
  v_fecha_fin_periodo DATE;
  v_fecha_vencimiento DATE;
  v_estado VARCHAR(20);
  v_cuotas_afectadas INT := 0;
BEGIN
  SELECT *
    INTO v_contrato
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF v_contrato.estado_contrato::TEXT <> 'VIGENTE' THEN
    RAISE EXCEPTION 'Solo se pueden sincronizar cuotas de mantenimiento para contratos vigentes';
  END IF;

  v_fecha_inicio := COALESCE(
    v_contrato.fecha_inicio_mantenimiento,
    CASE
      WHEN v_contrato.anio_inicio_mantenimiento IS NOT NULL
        THEN make_date(v_contrato.anio_inicio_mantenimiento::INT, 1, 1)
      ELSE NULL
    END
  );

  IF v_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'El contrato % no tiene fecha de inicio de mantenimiento definida', p_id_contrato;
  END IF;

  IF v_contrato.fecha_inicio_mantenimiento IS NULL THEN
    UPDATE public.contrato
    SET fecha_inicio_mantenimiento = v_fecha_inicio
    WHERE id_contrato = p_id_contrato;
  END IF;

  v_monto := ROUND(COALESCE(v_contrato.monto_mantenimiento_anual, 0)::NUMERIC, 2);
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El contrato % no tiene un monto anual de mantenimiento valido', p_id_contrato;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.contrato_producto
    WHERE id_contrato = p_id_contrato
      AND tipo_producto IN ('LOTE', 'CENIZARIO')
  )
    INTO v_tiene_producto;

  IF NOT v_tiene_producto THEN
    RAISE EXCEPTION 'El contrato % no tiene productos elegibles para mantenimiento', p_id_contrato;
  END IF;

  v_hasta_fecha := COALESCE(
    p_hasta_fecha,
    public.sumar_meses_respetando_dia(CURRENT_DATE, 36)
  );

  IF v_hasta_fecha < v_fecha_inicio THEN
    v_hasta_fecha := v_fecha_inicio;
  END IF;

  v_periodo := 1;
  LOOP
    v_fecha_inicio_periodo := public.sumar_meses_respetando_dia(v_fecha_inicio, (v_periodo - 1) * 12);
    EXIT WHEN v_fecha_inicio_periodo > v_hasta_fecha;

    v_fecha_fin_periodo := (public.sumar_meses_respetando_dia(v_fecha_inicio, v_periodo * 12) - INTERVAL '1 day')::DATE;
    v_fecha_vencimiento := public.sumar_meses_respetando_dia(v_fecha_inicio, v_periodo * 12);
    v_estado := CASE WHEN v_fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA' ELSE 'PENDIENTE' END;

    INSERT INTO public.contrato_mantenimiento_cuota (
      id_contrato,
      numero_periodo,
      fecha_inicio_periodo,
      fecha_fin_periodo,
      fecha_vencimiento,
      monto_programado,
      estado
    )
    VALUES (
      p_id_contrato,
      v_periodo,
      v_fecha_inicio_periodo,
      v_fecha_fin_periodo,
      v_fecha_vencimiento,
      v_monto,
      v_estado
    )
    ON CONFLICT (id_contrato, numero_periodo) DO UPDATE
    SET
      fecha_inicio_periodo = EXCLUDED.fecha_inicio_periodo,
      fecha_fin_periodo = EXCLUDED.fecha_fin_periodo,
      fecha_vencimiento = EXCLUDED.fecha_vencimiento,
      monto_programado = EXCLUDED.monto_programado,
      estado = CASE
        WHEN public.contrato_mantenimiento_cuota.estado = 'ANULADA'
          THEN 'ANULADA'
        WHEN public.contrato_mantenimiento_cuota.monto_pagado >= public.contrato_mantenimiento_cuota.monto_programado
          THEN 'PAGADA'
        WHEN public.contrato_mantenimiento_cuota.monto_pagado > 0
          THEN CASE
            WHEN EXCLUDED.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
            ELSE 'PARCIAL'
          END
        WHEN EXCLUDED.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
        ELSE 'PENDIENTE'
      END;

    v_cuotas_afectadas := v_cuotas_afectadas + 1;
    v_periodo := v_periodo + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'id_contrato', p_id_contrato,
    'cuotas_sincronizadas', v_cuotas_afectadas,
    'fecha_inicio_mantenimiento', v_fecha_inicio,
    'hasta_fecha', v_hasta_fecha,
    'usuario', v_usuario
  );
END;
$$;

UPDATE public.contrato_mantenimiento_cuota
SET
  fecha_fin_periodo = (public.sumar_meses_respetando_dia(fecha_inicio_periodo, 12) - INTERVAL '1 day')::DATE,
  fecha_vencimiento = public.sumar_meses_respetando_dia(fecha_inicio_periodo, 12),
  estado = CASE
    WHEN estado = 'ANULADA' THEN 'ANULADA'
    WHEN monto_pagado >= monto_programado THEN 'PAGADA'
    WHEN monto_pagado > 0 THEN
      CASE
        WHEN public.sumar_meses_respetando_dia(fecha_inicio_periodo, 12) < CURRENT_DATE THEN 'VENCIDA'
        ELSE 'PARCIAL'
      END
    WHEN public.sumar_meses_respetando_dia(fecha_inicio_periodo, 12) < CURRENT_DATE THEN 'VENCIDA'
    ELSE 'PENDIENTE'
  END
WHERE fecha_inicio_periodo IS NOT NULL;

NOTIFY pgrst, 'reload schema';
