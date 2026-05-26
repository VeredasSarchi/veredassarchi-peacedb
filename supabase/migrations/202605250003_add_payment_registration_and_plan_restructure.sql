CREATE OR REPLACE FUNCTION public.registrar_pago_contrato(
  p_id_contrato INT,
  p_monto_total NUMERIC,
  p_fecha_pago TIMESTAMPTZ DEFAULT NOW(),
  p_metodo_pago TEXT DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
  p_numero_factura TEXT DEFAULT NULL,
  p_observacion TEXT DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_pago_id BIGINT;
  v_plan_id BIGINT;
  v_monto_restante NUMERIC(14,2) := ROUND(COALESCE(p_monto_total, 0)::NUMERIC, 2);
  v_aplicado_total NUMERIC(14,2) := 0;
  v_pago_interes NUMERIC(14,2);
  v_pago_capital NUMERIC(14,2);
  v_pago_otros NUMERIC(14,2);
  v_pagado_otros_actual NUMERIC(14,2);
  v_restante_interes NUMERIC(14,2);
  v_restante_capital NUMERIC(14,2);
  v_restante_otros NUMERIC(14,2);
  v_saldo_capital NUMERIC(14,2);
  v_tiene_pendientes BOOLEAN;
  v_tiene_cargos_pendientes BOOLEAN;
  rec_cuota RECORD;
  rec_cargo RECORD;
BEGIN
  IF v_monto_restante <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  PERFORM 1
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  SELECT id_plan_pago
    INTO v_plan_id
  FROM public.contrato_plan_pago
  WHERE id_contrato = p_id_contrato
    AND estado = 'VIGENTE'
  FOR UPDATE;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'El contrato % no tiene un plan de pago vigente', p_id_contrato;
  END IF;

  INSERT INTO public.contrato_pago (
    id_contrato,
    fecha_pago,
    monto_total,
    metodo_pago,
    referencia,
    numero_factura,
    estado,
    observacion,
    registrado_por
  )
  VALUES (
    p_id_contrato,
    COALESCE(p_fecha_pago, NOW()),
    v_monto_restante,
    NULLIF(TRIM(COALESCE(p_metodo_pago, '')), ''),
    NULLIF(TRIM(COALESCE(p_referencia, '')), ''),
    NULLIF(TRIM(COALESCE(p_numero_factura, '')), ''),
    'APLICADO',
    p_observacion,
    v_usuario
  )
  RETURNING id_pago INTO v_pago_id;

  FOR rec_cuota IN
    SELECT *
    FROM public.contrato_cuota
    WHERE id_plan_pago = v_plan_id
      AND estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      AND (
        monto_cuota_total_programada - monto_pagado_total
      ) > 0.009
    ORDER BY fecha_vencimiento, numero_cuota
  LOOP
    EXIT WHEN v_monto_restante <= 0.009;

    v_pagado_otros_actual := GREATEST(
      COALESCE(rec_cuota.monto_pagado_total, 0)
      - COALESCE(rec_cuota.monto_pagado_interes, 0)
      - COALESCE(rec_cuota.monto_pagado_capital, 0),
      0
    );
    v_restante_interes := ROUND(GREATEST(COALESCE(rec_cuota.monto_interes_programado, 0) - COALESCE(rec_cuota.monto_pagado_interes, 0), 0)::NUMERIC, 2);
    v_restante_capital := ROUND(GREATEST(COALESCE(rec_cuota.monto_capital_programado, 0) - COALESCE(rec_cuota.monto_pagado_capital, 0), 0)::NUMERIC, 2);
    v_restante_otros := ROUND(
      GREATEST(
        COALESCE(rec_cuota.monto_cuota_total_programada, 0)
        - COALESCE(rec_cuota.monto_interes_programado, 0)
        - COALESCE(rec_cuota.monto_capital_programado, 0)
        - v_pagado_otros_actual,
        0
      )::NUMERIC,
      2
    );

    v_pago_interes := LEAST(v_monto_restante, v_restante_interes);
    v_monto_restante := ROUND((v_monto_restante - v_pago_interes)::NUMERIC, 2);

    v_pago_otros := LEAST(v_monto_restante, v_restante_otros);
    v_monto_restante := ROUND((v_monto_restante - v_pago_otros)::NUMERIC, 2);

    v_pago_capital := LEAST(v_monto_restante, v_restante_capital);
    v_monto_restante := ROUND((v_monto_restante - v_pago_capital)::NUMERIC, 2);

    IF (v_pago_interes + v_pago_capital + v_pago_otros) > 0 THEN
      INSERT INTO public.contrato_pago_aplicacion (
        id_pago,
        id_cuota,
        monto_interes,
        monto_capital,
        monto_otros,
        notas
      )
      VALUES (
        v_pago_id,
        rec_cuota.id_cuota,
        v_pago_interes,
        v_pago_capital,
        v_pago_otros,
        p_observacion
      );

      UPDATE public.contrato_cuota
      SET
        monto_pagado_total = ROUND((monto_pagado_total + v_pago_interes + v_pago_capital + v_pago_otros)::NUMERIC, 2),
        monto_pagado_interes = ROUND((monto_pagado_interes + v_pago_interes)::NUMERIC, 2),
        monto_pagado_capital = ROUND((monto_pagado_capital + v_pago_capital)::NUMERIC, 2),
        fecha_ultimo_pago = COALESCE(p_fecha_pago, NOW()),
        numero_factura = COALESCE(NULLIF(TRIM(COALESCE(p_numero_factura, '')), ''), numero_factura),
        estado = CASE
          WHEN ROUND((monto_pagado_total + v_pago_interes + v_pago_capital + v_pago_otros)::NUMERIC, 2)
            >= ROUND(monto_cuota_total_programada::NUMERIC, 2)
            THEN 'PAGADA'
          WHEN fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
          ELSE 'PARCIAL'
        END
      WHERE id_cuota = rec_cuota.id_cuota;

      v_aplicado_total := ROUND((v_aplicado_total + v_pago_interes + v_pago_capital + v_pago_otros)::NUMERIC, 2);
    END IF;
  END LOOP;

  FOR rec_cargo IN
    SELECT *
    FROM public.contrato_cargo
    WHERE id_contrato = p_id_contrato
      AND estado IN ('PENDIENTE', 'PARCIAL')
      AND (monto_original - monto_pagado) > 0.009
    ORDER BY fecha_vencimiento NULLS LAST, id_cargo
  LOOP
    EXIT WHEN v_monto_restante <= 0.009;

    v_pago_otros := LEAST(v_monto_restante, ROUND((rec_cargo.monto_original - rec_cargo.monto_pagado)::NUMERIC, 2));
    v_monto_restante := ROUND((v_monto_restante - v_pago_otros)::NUMERIC, 2);

    IF v_pago_otros > 0 THEN
      INSERT INTO public.contrato_pago_aplicacion (
        id_pago,
        id_cargo,
        monto_interes,
        monto_capital,
        monto_otros,
        notas
      )
      VALUES (
        v_pago_id,
        rec_cargo.id_cargo,
        0,
        0,
        v_pago_otros,
        p_observacion
      );

      UPDATE public.contrato_cargo
      SET
        monto_pagado = ROUND((monto_pagado + v_pago_otros)::NUMERIC, 2),
        estado = CASE
          WHEN ROUND((monto_pagado + v_pago_otros)::NUMERIC, 2) >= ROUND(monto_original::NUMERIC, 2)
            THEN 'PAGADO'
          ELSE 'PARCIAL'
        END
      WHERE id_cargo = rec_cargo.id_cargo;

      v_aplicado_total := ROUND((v_aplicado_total + v_pago_otros)::NUMERIC, 2);
    END IF;
  END LOOP;

  IF v_monto_restante > 0.009 THEN
    RAISE EXCEPTION 'El pago excede el saldo aplicable del contrato % por %', p_id_contrato, v_monto_restante;
  END IF;

  SELECT COALESCE(
    SUM(GREATEST(monto_capital_programado - monto_pagado_capital, 0)),
    0
  )::NUMERIC(14,2)
    INTO v_saldo_capital
  FROM public.contrato_cuota
  WHERE id_plan_pago = v_plan_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.contrato_cuota
    WHERE id_plan_pago = v_plan_id
      AND estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      AND (monto_cuota_total_programada - monto_pagado_total) > 0.009
  )
    INTO v_tiene_pendientes;

  SELECT EXISTS (
    SELECT 1
    FROM public.contrato_cargo
    WHERE id_contrato = p_id_contrato
      AND estado IN ('PENDIENTE', 'PARCIAL')
      AND (monto_original - monto_pagado) > 0.009
  )
    INTO v_tiene_cargos_pendientes;

  UPDATE public.contrato_plan_pago
  SET estado = CASE
    WHEN NOT v_tiene_pendientes AND NOT v_tiene_cargos_pendientes THEN 'LIQUIDADO'
    ELSE 'VIGENTE'
  END
  WHERE id_plan_pago = v_plan_id;

  UPDATE public.contrato
  SET saldo_pendiente = v_saldo_capital
  WHERE id_contrato = p_id_contrato;

  INSERT INTO public.contrato_evento_financiero (
    id_contrato,
    id_plan_origen,
    id_plan_resultante,
    tipo_evento,
    payload,
    observacion,
    usuario
  )
  VALUES (
    p_id_contrato,
    v_plan_id,
    v_plan_id,
    'REGISTRO_PAGO',
    jsonb_build_object(
      'id_pago', v_pago_id,
      'monto_total', p_monto_total,
      'monto_aplicado', v_aplicado_total
    ),
    p_observacion,
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_pago', v_pago_id,
    'id_plan_pago', v_plan_id,
    'monto_aplicado', v_aplicado_total,
    'saldo_capital_pendiente', v_saldo_capital
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_arreglo_pago_contrato(
  p_id_contrato INT,
  p_fecha_primera_cuota DATE,
  p_plazo_meses INT,
  p_cuota_base NUMERIC,
  p_tasa_interes_anual NUMERIC DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_plan_vigente BIGINT;
  v_saldo_capital NUMERIC(14,2);
  v_tasa_interes NUMERIC(9,6);
  v_resultado_plan JSONB;
BEGIN
  IF p_fecha_primera_cuota IS NULL THEN
    RAISE EXCEPTION 'La fecha de primera cuota es obligatoria';
  END IF;

  IF p_plazo_meses IS NULL OR p_plazo_meses <= 0 THEN
    RAISE EXCEPTION 'El plazo del arreglo de pago debe ser mayor a cero';
  END IF;

  IF p_cuota_base IS NULL OR p_cuota_base <= 0 THEN
    RAISE EXCEPTION 'La cuota base del arreglo de pago debe ser mayor a cero';
  END IF;

  PERFORM 1
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  SELECT id_plan_pago
    INTO v_plan_vigente
  FROM public.contrato_plan_pago
  WHERE id_contrato = p_id_contrato
    AND estado = 'VIGENTE'
  FOR UPDATE;

  IF v_plan_vigente IS NULL THEN
    RAISE EXCEPTION 'El contrato % no tiene un plan de pago vigente para reestructurar', p_id_contrato;
  END IF;

  SELECT COALESCE(
    SUM(GREATEST(monto_capital_programado - monto_pagado_capital, 0)),
    0
  )::NUMERIC(14,2)
    INTO v_saldo_capital
  FROM public.contrato_cuota
  WHERE id_plan_pago = v_plan_vigente
    AND estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA');

  IF v_saldo_capital <= 0 THEN
    RAISE EXCEPTION 'El contrato % no tiene saldo de capital pendiente para generar un arreglo de pago', p_id_contrato;
  END IF;

  v_tasa_interes := COALESCE(
    p_tasa_interes_anual,
    (
      SELECT tasa_interes_anual
      FROM public.contrato_plan_pago
      WHERE id_plan_pago = v_plan_vigente
    ),
    0
  );

  UPDATE public.contrato
  SET
    saldo_pendiente = v_saldo_capital,
    cuota_mensual = ROUND(p_cuota_base::NUMERIC, 2),
    total_meses = p_plazo_meses,
    plazo_anios = CASE WHEN p_plazo_meses % 12 = 0 THEN p_plazo_meses / 12 ELSE NULL END,
    tasa_interes_anual = v_tasa_interes,
    fecha_primera_cuota = p_fecha_primera_cuota,
    dia_pago_mensual = EXTRACT(DAY FROM p_fecha_primera_cuota)::SMALLINT
  WHERE id_contrato = p_id_contrato;

  v_resultado_plan := public.generar_plan_pago_contrato(
    p_id_contrato => p_id_contrato,
    p_tipo_plan => 'ARREGLO_PAGO',
    p_usuario => v_usuario,
    p_observaciones => COALESCE(p_observaciones, 'Arreglo de pago generado manualmente'),
    p_reemplazar_plan_vigente => TRUE,
    p_id_plan_anterior => v_plan_vigente,
    p_fecha_primera_cuota => p_fecha_primera_cuota
  );

  INSERT INTO public.contrato_evento_financiero (
    id_contrato,
    id_plan_origen,
    id_plan_resultante,
    tipo_evento,
    payload,
    observacion,
    usuario
  )
  VALUES (
    p_id_contrato,
    v_plan_vigente,
    NULLIF(v_resultado_plan ->> 'id_plan_pago', '')::BIGINT,
    'ARREGLO_PAGO',
    jsonb_build_object(
      'saldo_capital_reestructurado', v_saldo_capital,
      'plazo_meses', p_plazo_meses,
      'cuota_base', p_cuota_base,
      'tasa_interes_anual', v_tasa_interes,
      'fecha_primera_cuota', p_fecha_primera_cuota
    ),
    COALESCE(p_observaciones, 'Arreglo de pago generado manualmente'),
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_contrato', p_id_contrato,
    'id_plan_anterior', v_plan_vigente,
    'resultado_plan', v_resultado_plan
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_pago_contrato(INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_arreglo_pago_contrato(INT, DATE, INT, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
