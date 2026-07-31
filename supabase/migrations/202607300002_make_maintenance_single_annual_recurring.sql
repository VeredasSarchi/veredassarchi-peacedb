-- Maintenance is one annual recurring charge, not a finite multi-year plan.
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
  v_monto NUMERIC(14,2);
  v_tiene_producto BOOLEAN;
  v_cuota RECORD;
  v_cuota_id BIGINT;
  v_max_periodo INT := 0;
  v_periodo INT;
  v_periodo_calendario INT;
  v_ultima_fecha_vencimiento DATE;
  v_fecha_vencimiento DATE;
  v_fecha_inicio_periodo DATE;
  v_fecha_fin_periodo DATE;
  v_estado VARCHAR(20);
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

  -- Keep states current before deciding whether a new annual charge is needed.
  UPDATE public.contrato_mantenimiento_cuota
  SET estado = CASE
    WHEN estado = 'ANULADA' THEN 'ANULADA'
    WHEN monto_pagado >= monto_programado THEN 'PAGADA'
    WHEN monto_pagado > 0 THEN
      CASE WHEN fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA' ELSE 'PARCIAL' END
    WHEN fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
    ELSE 'PENDIENTE'
  END
  WHERE id_contrato = p_id_contrato;

  SELECT cuota.*
    INTO v_cuota
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.id_contrato = p_id_contrato
    AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND (cuota.monto_programado - cuota.monto_pagado) > 0.009
  ORDER BY cuota.fecha_vencimiento, cuota.numero_periodo
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- An unpaid annual charge follows the current contract amount. A partially
    -- paid charge keeps its original amount for accounting consistency.
    IF v_cuota.monto_pagado <= 0.009 THEN
      UPDATE public.contrato_mantenimiento_cuota
      SET
        monto_programado = v_monto,
        estado = CASE
          WHEN fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
          ELSE 'PENDIENTE'
        END
      WHERE id_cuota_mantenimiento = v_cuota.id_cuota_mantenimiento;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'id_contrato', p_id_contrato,
      'cuotas_sincronizadas', 1,
      'id_cuota_mantenimiento', v_cuota.id_cuota_mantenimiento,
      'numero_periodo', v_cuota.numero_periodo,
      'proxima_fecha_vencimiento', v_cuota.fecha_vencimiento,
      'monto_anual', CASE
        WHEN v_cuota.monto_pagado <= 0.009 THEN v_monto
        ELSE v_cuota.monto_programado
      END,
      'usuario', v_usuario
    );
  END IF;

  SELECT
    COALESCE(MAX(cuota.numero_periodo), 0)::INT,
    MAX(cuota.fecha_vencimiento) FILTER (WHERE cuota.estado <> 'ANULADA')
    INTO v_max_periodo, v_ultima_fecha_vencimiento
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.id_contrato = p_id_contrato;

  IF v_ultima_fecha_vencimiento IS NOT NULL THEN
    v_periodo := v_max_periodo + 1;
    v_fecha_vencimiento := public.sumar_meses_respetando_dia(
      v_ultima_fecha_vencimiento,
      12
    );
  ELSE
    -- For a contract without history, create the anniversary belonging to the
    -- current calendar year instead of backfilling every prior year.
    v_periodo_calendario := GREATEST(
      (
        EXTRACT(YEAR FROM CURRENT_DATE)::INT
        - EXTRACT(YEAR FROM v_fecha_inicio)::INT
        + 1
      ),
      1
    );
    v_periodo := GREATEST(v_max_periodo + 1, v_periodo_calendario);
    v_fecha_vencimiento := public.sumar_meses_respetando_dia(
      v_fecha_inicio,
      (v_periodo_calendario - 1) * 12
    );
  END IF;

  v_fecha_inicio_periodo := v_fecha_vencimiento;
  v_fecha_fin_periodo := (
    public.sumar_meses_respetando_dia(v_fecha_vencimiento, 12)
    - INTERVAL '1 day'
  )::DATE;
  v_estado := CASE
    WHEN v_fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
    ELSE 'PENDIENTE'
  END;

  INSERT INTO public.contrato_mantenimiento_cuota (
    id_contrato,
    numero_periodo,
    fecha_inicio_periodo,
    fecha_fin_periodo,
    fecha_vencimiento,
    monto_programado,
    monto_pagado,
    estado
  )
  VALUES (
    p_id_contrato,
    v_periodo,
    v_fecha_inicio_periodo,
    v_fecha_fin_periodo,
    v_fecha_vencimiento,
    v_monto,
    0,
    v_estado
  )
  RETURNING id_cuota_mantenimiento INTO v_cuota_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id_contrato', p_id_contrato,
    'cuotas_sincronizadas', 1,
    'id_cuota_mantenimiento', v_cuota_id,
    'numero_periodo', v_periodo,
    'proxima_fecha_vencimiento', v_fecha_vencimiento,
    'monto_anual', v_monto,
    'usuario', v_usuario
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_cuotas_mantenimiento_vigentes(
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_contrato RECORD;
  v_procesados INT := 0;
BEGIN
  FOR v_contrato IN
    SELECT DISTINCT c.id_contrato
    FROM public.contrato AS c
    JOIN public.contrato_producto AS cp
      ON cp.id_contrato = c.id_contrato
    WHERE c.estado_contrato = 'VIGENTE'::public.estado_contrato_enum
      AND cp.tipo_producto IN ('LOTE', 'CENIZARIO')
      AND COALESCE(c.monto_mantenimiento_anual, 0) > 0
      AND COALESCE(
        c.fecha_inicio_mantenimiento,
        CASE
          WHEN c.anio_inicio_mantenimiento IS NOT NULL
            THEN make_date(c.anio_inicio_mantenimiento::INT, 1, 1)
          ELSE NULL
        END
      ) IS NOT NULL
  LOOP
    PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
      p_id_contrato => v_contrato.id_contrato,
      p_hasta_fecha => NULL,
      p_usuario => v_usuario
    );
    v_procesados := v_procesados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'contratos_procesados', v_procesados,
    'cuotas_abiertas_por_contrato', 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pago_mantenimiento(
  p_id_contrato INT,
  p_monto_total NUMERIC,
  p_fecha_pago TIMESTAMPTZ DEFAULT NOW(),
  p_metodo_pago TEXT DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
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
  v_monto_pago NUMERIC(14,2) := ROUND(COALESCE(p_monto_total, 0)::NUMERIC, 2);
  v_saldo_cuota NUMERIC(14,2);
  v_cuota RECORD;
  v_proxima_fecha DATE;
BEGIN
  IF v_monto_pago <= 0 THEN
    RAISE EXCEPTION 'El monto del pago de mantenimiento debe ser mayor a cero';
  END IF;

  PERFORM 1
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  -- Guarantee that there is exactly one current annual charge before payment.
  PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
    p_id_contrato => p_id_contrato,
    p_hasta_fecha => NULL,
    p_usuario => v_usuario
  );

  SELECT cuota.*
    INTO v_cuota
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.id_contrato = p_id_contrato
    AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND (cuota.monto_programado - cuota.monto_pagado) > 0.009
  ORDER BY cuota.fecha_vencimiento, cuota.numero_periodo
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato % no tiene un cobro de mantenimiento pendiente', p_id_contrato;
  END IF;

  v_saldo_cuota := ROUND(
    (v_cuota.monto_programado - v_cuota.monto_pagado)::NUMERIC,
    2
  );

  IF v_monto_pago > v_saldo_cuota THEN
    RAISE EXCEPTION
      'El pago excede el saldo de la cuota anual de mantenimiento del contrato % por %',
      p_id_contrato,
      ROUND((v_monto_pago - v_saldo_cuota)::NUMERIC, 2);
  END IF;

  INSERT INTO public.contrato_mantenimiento_pago (
    id_contrato,
    fecha_pago,
    monto_total,
    metodo_pago,
    referencia,
    observacion,
    estado,
    registrado_por
  )
  VALUES (
    p_id_contrato,
    COALESCE(p_fecha_pago, NOW()),
    v_monto_pago,
    NULLIF(TRIM(COALESCE(p_metodo_pago, '')), ''),
    NULLIF(TRIM(COALESCE(p_referencia, '')), ''),
    p_observacion,
    'APLICADO',
    v_usuario
  )
  RETURNING id_pago_mantenimiento INTO v_pago_id;

  INSERT INTO public.contrato_mantenimiento_pago_aplicacion (
    id_pago_mantenimiento,
    id_cuota_mantenimiento,
    monto_aplicado,
    notas
  )
  VALUES (
    v_pago_id,
    v_cuota.id_cuota_mantenimiento,
    v_monto_pago,
    p_observacion
  );

  UPDATE public.contrato_mantenimiento_cuota
  SET
    monto_pagado = ROUND((monto_pagado + v_monto_pago)::NUMERIC, 2),
    fecha_ultimo_pago = COALESCE(p_fecha_pago, NOW()),
    estado = CASE
      WHEN ROUND((monto_pagado + v_monto_pago)::NUMERIC, 2)
        >= ROUND(monto_programado::NUMERIC, 2)
        THEN 'PAGADA'
      WHEN fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
      ELSE 'PARCIAL'
    END
  WHERE id_cuota_mantenimiento = v_cuota.id_cuota_mantenimiento;

  -- A full payment closes the current row; synchronization then creates the
  -- following annual charge. A partial payment keeps the same row open.
  PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
    p_id_contrato => p_id_contrato,
    p_hasta_fecha => NULL,
    p_usuario => v_usuario
  );

  SELECT cuota.fecha_vencimiento
    INTO v_proxima_fecha
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.id_contrato = p_id_contrato
    AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND (cuota.monto_programado - cuota.monto_pagado) > 0.009
  ORDER BY cuota.fecha_vencimiento, cuota.numero_periodo
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'id_pago_mantenimiento', v_pago_id,
    'id_cuota_mantenimiento', v_cuota.id_cuota_mantenimiento,
    'monto_aplicado', v_monto_pago,
    'proxima_fecha_vencimiento', v_proxima_fecha
  );
END;
$$;

UPDATE public.contrato_mantenimiento_cuota
SET estado = CASE
  WHEN estado = 'ANULADA' THEN 'ANULADA'
  WHEN monto_pagado >= monto_programado THEN 'PAGADA'
  WHEN monto_pagado > 0 THEN
    CASE WHEN fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA' ELSE 'PARCIAL' END
  WHEN fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
  ELSE 'PENDIENTE'
END;

-- Remove only automatically generated open rows that have never received a
-- payment. Paid or partially paid annual charges and their audit trail remain.
DELETE FROM public.contrato_mantenimiento_cuota AS cuota
WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
  AND cuota.monto_pagado <= 0.009
  AND NOT EXISTS (
    SELECT 1
    FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
    WHERE aplicacion.id_cuota_mantenimiento = cuota.id_cuota_mantenimiento
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_mantenimiento_un_cobro_abierto_contrato
  ON public.contrato_mantenimiento_cuota (id_contrato)
  WHERE estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA');

SELECT public.sincronizar_cuotas_mantenimiento_vigentes(
  'migracion_cuota_anual_unica'
);

CREATE OR REPLACE VIEW public.vw_control_mantenimiento_resumen AS
WITH contratos_elegibles AS (
  SELECT DISTINCT
    c.id_contrato,
    c.numero_contrato,
    c.numero_formulario,
    c.estado_contrato,
    c.fecha_firma,
    c.id_cliente,
    c.monto_mantenimiento_anual,
    COALESCE(
      c.fecha_inicio_mantenimiento,
      CASE
        WHEN c.anio_inicio_mantenimiento IS NOT NULL
          THEN make_date(c.anio_inicio_mantenimiento::INT, 1, 1)
        ELSE NULL
      END
    ) AS fecha_inicio_mantenimiento
  FROM public.contrato AS c
  JOIN public.contrato_producto AS cp
    ON cp.id_contrato = c.id_contrato
  WHERE c.estado_contrato = 'VIGENTE'::public.estado_contrato_enum
    AND cp.tipo_producto IN ('LOTE', 'CENIZARIO')
),
cuota_actual AS (
  SELECT DISTINCT ON (cuota.id_contrato)
    cuota.id_contrato,
    cuota.id_cuota_mantenimiento,
    cuota.fecha_vencimiento,
    cuota.monto_programado,
    cuota.monto_pagado,
    cuota.estado
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND (cuota.monto_programado - cuota.monto_pagado) > 0.009
  ORDER BY cuota.id_contrato, cuota.fecha_vencimiento, cuota.numero_periodo
),
historial AS (
  SELECT
    cuota.id_contrato,
    COUNT(*) FILTER (WHERE cuota.estado = 'PAGADA')::INT AS cuotas_pagadas,
    MAX(cuota.fecha_fin_periodo) FILTER (
      WHERE cuota.estado = 'PAGADA'
    ) AS ultimo_periodo_cubierto_hasta
  FROM public.contrato_mantenimiento_cuota AS cuota
  GROUP BY cuota.id_contrato
)
SELECT
  contrato.id_contrato,
  contrato.numero_contrato,
  contrato.numero_formulario,
  contrato.estado_contrato,
  contrato.fecha_firma,
  contrato.id_cliente,
  cliente.nombre_completo AS cliente_nombre,
  contrato.monto_mantenimiento_anual,
  contrato.fecha_inicio_mantenimiento,
  COALESCE(contrato.monto_mantenimiento_anual, 0) > 0
    AND contrato.fecha_inicio_mantenimiento IS NOT NULL AS configuracion_completa,
  CASE WHEN actual.id_cuota_mantenimiento IS NULL THEN 0 ELSE 1 END::INT AS cuotas_totales,
  COALESCE(historial.cuotas_pagadas, 0)::INT AS cuotas_pagadas,
  CASE WHEN actual.estado = 'PARCIAL' THEN 1 ELSE 0 END::INT AS cuotas_parciales,
  CASE
    WHEN actual.id_cuota_mantenimiento IS NOT NULL
      AND (
        actual.estado = 'VENCIDA'
        OR actual.fecha_vencimiento < CURRENT_DATE
      )
      THEN 1
    ELSE 0
  END::INT AS cuotas_vencidas,
  CASE
    WHEN actual.id_cuota_mantenimiento IS NOT NULL
      AND (
        actual.estado = 'VENCIDA'
        OR actual.fecha_vencimiento < CURRENT_DATE
      )
      THEN GREATEST(actual.monto_programado - actual.monto_pagado, 0)
    ELSE 0
  END::NUMERIC(14,2) AS monto_vencido,
  COALESCE(
    GREATEST(actual.monto_programado - actual.monto_pagado, 0),
    0
  )::NUMERIC(14,2) AS total_pendiente,
  actual.fecha_vencimiento AS proxima_fecha_vencimiento,
  historial.ultimo_periodo_cubierto_hasta
FROM contratos_elegibles AS contrato
LEFT JOIN public.cliente AS cliente
  ON cliente.id_cliente = contrato.id_cliente
LEFT JOIN cuota_actual AS actual
  ON actual.id_contrato = contrato.id_contrato
LEFT JOIN historial
  ON historial.id_contrato = contrato.id_contrato;

CREATE OR REPLACE FUNCTION public.generar_cuota_mantenimiento_al_formalizar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_contrato::TEXT = 'VIGENTE'
    AND OLD.estado_contrato::TEXT <> 'VIGENTE'
    AND COALESCE(NEW.monto_mantenimiento_anual, 0) > 0
    AND COALESCE(
      NEW.fecha_inicio_mantenimiento,
      CASE
        WHEN NEW.anio_inicio_mantenimiento IS NOT NULL
          THEN make_date(NEW.anio_inicio_mantenimiento::INT, 1, 1)
        ELSE NULL
      END
    ) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.contrato_producto AS producto
      WHERE producto.id_contrato = NEW.id_contrato
        AND producto.tipo_producto IN ('LOTE', 'CENIZARIO')
    )
  THEN
    PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
      p_id_contrato => NEW.id_contrato,
      p_hasta_fecha => NULL,
      p_usuario => 'formalizacion'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generar_cuota_mantenimiento_al_formalizar
  ON public.contrato;

CREATE TRIGGER trg_generar_cuota_mantenimiento_al_formalizar
AFTER UPDATE OF estado_contrato ON public.contrato
FOR EACH ROW
EXECUTE FUNCTION public.generar_cuota_mantenimiento_al_formalizar();

COMMENT ON FUNCTION public.sincronizar_cuotas_mantenimiento_contrato(INT, DATE, TEXT) IS
  'Mantiene un unico cobro anual de mantenimiento abierto por contrato.';

COMMENT ON FUNCTION public.registrar_pago_mantenimiento(
  INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT
) IS
  'Aplica el pago al cobro anual actual y genera el siguiente al completarlo.';

REVOKE ALL ON FUNCTION public.generar_cuota_mantenimiento_al_formalizar()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sincronizar_cuotas_mantenimiento_contrato(
  INT, DATE, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sincronizar_cuotas_mantenimiento_vigentes(TEXT)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_pago_mantenimiento(
  INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

GRANT SELECT ON public.vw_control_mantenimiento_resumen TO authenticated;

NOTIFY pgrst, 'reload schema';
