CREATE OR REPLACE FUNCTION public.generar_plan_pago_contrato(
  p_id_contrato INT,
  p_tipo_plan TEXT DEFAULT 'ORIGINAL',
  p_usuario TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL,
  p_reemplazar_plan_vigente BOOLEAN DEFAULT FALSE,
  p_id_plan_anterior BIGINT DEFAULT NULL,
  p_fecha_primera_cuota DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato public.contrato%ROWTYPE;
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_tipo_plan TEXT := UPPER(COALESCE(NULLIF(TRIM(p_tipo_plan), ''), 'ORIGINAL'));
  v_plazo_meses INT;
  v_plazo_inferido BOOLEAN := FALSE;
  v_tasa_anual NUMERIC(9,6);
  v_tasa_mensual NUMERIC(12,10);
  v_monto_principal NUMERIC(14,2);
  v_monto_prima NUMERIC(14,2);
  v_cuota_base NUMERIC(14,2);
  v_fecha_primera DATE;
  v_plan_vigente BIGINT;
  v_id_plan_pago BIGINT;
  v_version SMALLINT;
  v_saldo_actual NUMERIC(14,2);
  v_saldo_final NUMERIC(14,2);
  v_interes NUMERIC(14,2);
  v_capital NUMERIC(14,2);
  v_cuota_total NUMERIC(14,2);
  v_capital_acumulado NUMERIC(14,2) := 0;
  v_fecha_vencimiento DATE;
  v_numero_cuotas INT := 0;
  v_denominador DOUBLE PRECISION;
  v_plazo_estimado DOUBLE PRECISION;
BEGIN
  IF v_tipo_plan NOT IN ('ORIGINAL', 'ARREGLO_PAGO', 'REESTRUCTURACION', 'BACKFILL') THEN
    RAISE EXCEPTION 'Tipo de plan inválido: %', p_tipo_plan;
  END IF;

  SELECT *
    INTO v_contrato
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF p_id_plan_anterior IS NOT NULL THEN
    PERFORM 1
    FROM public.contrato_plan_pago
    WHERE id_plan_pago = p_id_plan_anterior
      AND id_contrato = p_id_contrato;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El plan anterior % no pertenece al contrato %', p_id_plan_anterior, p_id_contrato;
    END IF;
  END IF;

  v_tasa_anual := COALESCE(v_contrato.tasa_interes_anual, 0);
  IF v_tasa_anual < 0 THEN
    RAISE EXCEPTION 'La tasa de interés anual del contrato % es inválida', p_id_contrato;
  END IF;

  v_tasa_mensual := ROUND((v_tasa_anual / 100.0 / 12.0)::NUMERIC, 10);
  v_monto_prima := ROUND(COALESCE(v_contrato.monto_entregado_inicial, 0)::NUMERIC, 2);
  v_monto_principal := ROUND(
    GREATEST(
      COALESCE(
        v_contrato.saldo_pendiente,
        COALESCE(v_contrato.monto_arrendamiento_total, 0) - v_monto_prima
      ),
      0
    )::NUMERIC,
    2
  );
  v_cuota_base := ROUND(COALESCE(v_contrato.cuota_mensual, 0)::NUMERIC, 2);

  v_plazo_meses := COALESCE(
    v_contrato.total_meses,
    CASE
      WHEN v_contrato.plazo_anios IS NOT NULL THEN v_contrato.plazo_anios * 12
      ELSE NULL
    END
  );

  IF (v_plazo_meses IS NULL OR v_plazo_meses < 0) AND v_monto_principal > 0 THEN
    IF v_cuota_base <= 0 THEN
      RAISE EXCEPTION 'El contrato % no tiene un plazo válido y tampoco una cuota mensual suficiente para inferirlo', p_id_contrato;
    END IF;

    IF v_tasa_mensual > 0 THEN
      IF v_cuota_base <= ROUND((v_monto_principal * v_tasa_mensual)::NUMERIC, 2) THEN
        RAISE EXCEPTION 'El contrato % no tiene un plazo válido y la cuota mensual no cubre los intereses para inferirlo', p_id_contrato;
      END IF;

      v_denominador := LN(1 + v_tasa_mensual::DOUBLE PRECISION);
      v_plazo_estimado := -LN(
        1 - ((v_monto_principal::DOUBLE PRECISION * v_tasa_mensual::DOUBLE PRECISION) / v_cuota_base::DOUBLE PRECISION)
      ) / v_denominador;
      v_plazo_meses := GREATEST(CEIL(v_plazo_estimado)::INT, 1);
    ELSE
      v_plazo_meses := GREATEST(CEIL(v_monto_principal / v_cuota_base)::INT, 1);
    END IF;

    v_plazo_inferido := TRUE;
  END IF;

  IF v_plazo_meses IS NULL OR v_plazo_meses < 0 THEN
    RAISE EXCEPTION 'El contrato % no tiene un plazo válido para generar el plan de pago', p_id_contrato;
  END IF;

  v_fecha_primera := COALESCE(
    p_fecha_primera_cuota,
    v_contrato.fecha_primera_cuota,
    CASE
      WHEN v_contrato.fecha_firma IS NOT NULL AND v_contrato.dia_pago_mensual IS NOT NULL
        THEN public.calcular_fecha_primera_cuota(v_contrato.fecha_firma, v_contrato.dia_pago_mensual)
      ELSE NULL
    END
  );

  IF v_monto_principal > 0 AND v_plazo_meses = 0 THEN
    RAISE EXCEPTION 'El contrato % tiene saldo pendiente pero el plazo es 0', p_id_contrato;
  END IF;

  IF v_monto_principal > 0 AND v_cuota_base <= 0 THEN
    RAISE EXCEPTION 'El contrato % requiere una cuota mensual válida para generar el plan de pago', p_id_contrato;
  END IF;

  IF v_monto_principal > 0 AND v_fecha_primera IS NULL THEN
    RAISE EXCEPTION 'Debe definir la fecha de primera cuota para el contrato %', p_id_contrato;
  END IF;

  UPDATE public.contrato
  SET
    dia_pago_mensual = COALESCE(
      v_contrato.dia_pago_mensual,
      CASE WHEN v_fecha_primera IS NOT NULL THEN EXTRACT(DAY FROM v_fecha_primera)::SMALLINT ELSE NULL END
    ),
    total_meses = COALESCE(v_contrato.total_meses, v_plazo_meses),
    plazo_anios = COALESCE(
      v_contrato.plazo_anios,
      CASE WHEN v_plazo_meses > 0 AND v_plazo_meses % 12 = 0 THEN v_plazo_meses / 12 ELSE NULL END
    )
  WHERE id_contrato = p_id_contrato;

  v_contrato.dia_pago_mensual := COALESCE(
    v_contrato.dia_pago_mensual,
    CASE WHEN v_fecha_primera IS NOT NULL THEN EXTRACT(DAY FROM v_fecha_primera)::SMALLINT ELSE NULL END
  );

  SELECT id_plan_pago
    INTO v_plan_vigente
  FROM public.contrato_plan_pago
  WHERE id_contrato = p_id_contrato
    AND estado = 'VIGENTE'
  FOR UPDATE;

  IF v_plan_vigente IS NOT NULL THEN
    IF NOT p_reemplazar_plan_vigente THEN
      RAISE EXCEPTION 'El contrato % ya tiene un plan de pago vigente', p_id_contrato;
    END IF;

    UPDATE public.contrato_plan_pago
    SET estado = 'REEMPLAZADO'
    WHERE id_plan_pago = v_plan_vigente;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_version
  FROM public.contrato_plan_pago
  WHERE id_contrato = p_id_contrato;

  INSERT INTO public.contrato_plan_pago (
    id_contrato,
    version,
    estado,
    tipo_plan,
    id_plan_anterior,
    fecha_efectiva,
    fecha_primera_cuota,
    dia_pago_mensual,
    plazo_meses,
    tasa_interes_anual,
    tasa_interes_mensual,
    monto_principal,
    monto_prima,
    cuota_base,
    saldo_inicial,
    observaciones,
    usuario_creacion
  )
  VALUES (
    p_id_contrato,
    v_version,
    CASE WHEN v_monto_principal = 0 THEN 'LIQUIDADO' ELSE 'VIGENTE' END,
    v_tipo_plan,
    COALESCE(p_id_plan_anterior, v_plan_vigente),
    COALESCE(v_contrato.fecha_firma, CURRENT_DATE),
    COALESCE(v_fecha_primera, COALESCE(v_contrato.fecha_firma, CURRENT_DATE)),
    COALESCE(v_contrato.dia_pago_mensual, COALESCE(EXTRACT(DAY FROM v_fecha_primera)::SMALLINT, 1)),
    v_plazo_meses,
    v_tasa_anual,
    v_tasa_mensual,
    v_monto_principal,
    v_monto_prima,
    v_cuota_base,
    v_monto_principal,
    CASE
      WHEN v_plazo_inferido THEN COALESCE(p_observaciones || E'\n', '') || 'Plazo inferido automáticamente durante la generación del plan.'
      ELSE p_observaciones
    END,
    v_usuario
  )
  RETURNING id_plan_pago INTO v_id_plan_pago;

  v_saldo_actual := v_monto_principal;

  IF v_monto_principal > 0 THEN
    FOR v_numero_cuotas IN 1..v_plazo_meses LOOP
      v_fecha_vencimiento := public.calcular_fecha_vencimiento_cuota(v_fecha_primera, v_numero_cuotas);
      v_interes := ROUND((v_saldo_actual * v_tasa_mensual)::NUMERIC, 2);
      v_cuota_total := v_cuota_base;
      v_capital := ROUND((v_cuota_total - v_interes)::NUMERIC, 2);

      IF v_capital < 0 THEN
        RAISE EXCEPTION 'La cuota mensual del contrato % no cubre los intereses del período', p_id_contrato;
      END IF;

      IF v_numero_cuotas = v_plazo_meses OR v_capital >= v_saldo_actual THEN
        v_capital := v_saldo_actual;
        v_cuota_total := ROUND((v_interes + v_capital)::NUMERIC, 2);
      END IF;

      v_saldo_final := ROUND((v_saldo_actual - v_capital)::NUMERIC, 2);
      IF ABS(v_saldo_final) <= 0.01 THEN
        v_saldo_final := 0;
      END IF;

      v_capital_acumulado := ROUND((v_capital_acumulado + v_capital)::NUMERIC, 2);

      INSERT INTO public.contrato_cuota (
        id_plan_pago,
        numero_cuota,
        fecha_vencimiento,
        estado,
        saldo_inicial,
        monto_cuota_base,
        monto_ajuste_programado,
        monto_cuota_total_programada,
        monto_interes_programado,
        monto_capital_programado,
        saldo_final_programado,
        capital_amortizado_acumulado
      )
      VALUES (
        v_id_plan_pago,
        v_numero_cuotas,
        v_fecha_vencimiento,
        'PENDIENTE',
        v_saldo_actual,
        v_cuota_base,
        0,
        v_cuota_total,
        v_interes,
        v_capital,
        v_saldo_final,
        v_capital_acumulado
      );

      v_saldo_actual := v_saldo_final;
    END LOOP;
  ELSE
    v_numero_cuotas := 0;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id_plan_pago', v_id_plan_pago,
    'id_contrato', p_id_contrato,
    'version', v_version,
    'tipo_plan', v_tipo_plan,
    'cuotas_generadas', v_numero_cuotas,
    'fecha_primera_cuota', v_fecha_primera,
    'plazo_meses', v_plazo_meses,
    'plazo_inferido', v_plazo_inferido
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
