CREATE OR REPLACE FUNCTION public.assert_ingresos_campo_santo_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  );

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'No autorizado para consultar ingresos de Campo Santo'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ingresos_campo_santo_admin()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_ingresos_campo_santo_admin()
  TO authenticated;

CREATE OR REPLACE VIEW public.vw_ingresos_campo_santo_contrato_base AS
WITH plan_vigente AS (
  SELECT DISTINCT ON (plan.id_contrato)
    plan.*
  FROM public.contrato_plan_pago AS plan
  WHERE plan.estado = 'VIGENTE'
  ORDER BY plan.id_contrato, plan.version DESC, plan.id_plan_pago DESC
),
producto_resumen AS (
  SELECT
    producto.id_contrato,
    STRING_AGG(DISTINCT producto.tipo_producto::TEXT, ', ' ORDER BY producto.tipo_producto::TEXT) AS tipos_producto,
    COUNT(*) FILTER (WHERE producto.tipo_producto = 'LOTE')::INT AS lotes,
    COUNT(*) FILTER (WHERE producto.tipo_producto = 'CENIZARIO')::INT AS cenizarios,
    COUNT(*) FILTER (WHERE producto.tipo_producto = 'CREMACION')::INT AS cremaciones,
    COUNT(*) FILTER (WHERE producto.tipo_producto = 'PAQUETE_FUNERARIO')::INT AS paquetes_funerarios
  FROM public.contrato_producto AS producto
  GROUP BY producto.id_contrato
),
cuota_resumen AS (
  SELECT
    cuota.id_plan_pago,
    COUNT(*)::INT AS cuotas_totales,
    COUNT(*) FILTER (WHERE cuota.estado = 'PAGADA')::INT AS cuotas_pagadas,
    COUNT(*) FILTER (WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA'))::INT AS cuotas_pendientes,
    COUNT(*) FILTER (
      WHERE cuota.estado = 'VENCIDA'
        OR (cuota.estado IN ('PENDIENTE', 'PARCIAL') AND cuota.fecha_vencimiento < CURRENT_DATE)
    )::INT AS cuotas_vencidas,
    COALESCE(
      SUM(GREATEST(cuota.monto_cuota_total_programada - cuota.monto_pagado_total, 0)) FILTER (
        WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      ),
      0
    )::NUMERIC(14,2) AS cuota_pendiente_total,
    COALESCE(
      SUM(GREATEST(cuota.monto_capital_programado - cuota.monto_pagado_capital, 0)) FILTER (
        WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      ),
      0
    )::NUMERIC(14,2) AS capital_pendiente,
    COALESCE(
      SUM(GREATEST(cuota.monto_interes_programado - cuota.monto_pagado_interes, 0)) FILTER (
        WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      ),
      0
    )::NUMERIC(14,2) AS interes_pendiente,
    COALESCE(
      SUM(GREATEST(cuota.monto_cuota_total_programada - cuota.monto_pagado_total, 0)) FILTER (
        WHERE cuota.estado = 'VENCIDA'
          OR (cuota.estado IN ('PENDIENTE', 'PARCIAL') AND cuota.fecha_vencimiento < CURRENT_DATE)
      ),
      0
    )::NUMERIC(14,2) AS monto_vencido,
    MIN(cuota.fecha_vencimiento) FILTER (
      WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    ) AS proxima_fecha_vencimiento,
    MAX(cuota.fecha_vencimiento) AS fecha_finalizacion_plan
  FROM public.contrato_cuota AS cuota
  GROUP BY cuota.id_plan_pago
),
cargo_resumen AS (
  SELECT
    cargo.id_contrato,
    COALESCE(
      SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
        WHERE cargo.estado IN ('PENDIENTE', 'PARCIAL')
      ),
      0
    )::NUMERIC(14,2) AS cargos_pendientes
  FROM public.contrato_cargo AS cargo
  GROUP BY cargo.id_contrato
),
pago_aplicacion_historico AS (
  SELECT
    pago.id_contrato,
    COALESCE(SUM(aplicacion.monto_interes), 0)::NUMERIC(14,2) AS interes_cobrado_historico,
    COALESCE(SUM(aplicacion.monto_capital), 0)::NUMERIC(14,2) AS capital_cobrado_historico,
    COALESCE(SUM(aplicacion.monto_otros), 0)::NUMERIC(14,2) AS otros_cobrados_historico
  FROM public.contrato_pago AS pago
  JOIN public.contrato_pago_aplicacion AS aplicacion
    ON aplicacion.id_pago = pago.id_pago
  WHERE pago.estado = 'APLICADO'
  GROUP BY pago.id_contrato
),
pago_historico AS (
  SELECT
    pago.id_contrato,
    COUNT(*)::BIGINT AS pagos_contrato_historicos,
    COALESCE(SUM(pago.monto_total), 0)::NUMERIC(14,2) AS total_pagado_contrato_historico,
    MAX((pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE) AS ultimo_pago_contrato
  FROM public.contrato_pago AS pago
  WHERE pago.estado = 'APLICADO'
  GROUP BY pago.id_contrato
),
mantenimiento_historico AS (
  SELECT
    pago.id_contrato,
    COUNT(*)::BIGINT AS pagos_mantenimiento_historicos,
    COALESCE(SUM(pago.monto_total), 0)::NUMERIC(14,2) AS total_pagado_mantenimiento_historico,
    MAX((pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE) AS ultimo_pago_mantenimiento
  FROM public.contrato_mantenimiento_pago AS pago
  WHERE pago.estado = 'APLICADO'
  GROUP BY pago.id_contrato
),
mantenimiento_resumen AS (
  SELECT
    cuota.id_contrato,
    COUNT(*) FILTER (WHERE cuota.estado = 'PAGADA')::INT AS mantenimiento_pagadas,
    COUNT(*) FILTER (WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA'))::INT AS mantenimiento_pendientes,
    COUNT(*) FILTER (
      WHERE cuota.estado = 'VENCIDA'
        OR (cuota.estado IN ('PENDIENTE', 'PARCIAL') AND cuota.fecha_vencimiento < CURRENT_DATE)
    )::INT AS mantenimiento_vencidas,
    COALESCE(
      SUM(GREATEST(cuota.monto_programado - cuota.monto_pagado, 0)) FILTER (
        WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      ),
      0
    )::NUMERIC(14,2) AS mantenimiento_pendiente,
    COALESCE(
      SUM(GREATEST(cuota.monto_programado - cuota.monto_pagado, 0)) FILTER (
        WHERE cuota.estado = 'VENCIDA'
          OR (cuota.estado IN ('PENDIENTE', 'PARCIAL') AND cuota.fecha_vencimiento < CURRENT_DATE)
      ),
      0
    )::NUMERIC(14,2) AS mantenimiento_vencido,
    MIN(cuota.fecha_vencimiento) FILTER (
      WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    ) AS proxima_fecha_mantenimiento
  FROM public.contrato_mantenimiento_cuota AS cuota
  GROUP BY cuota.id_contrato
),
metodos_pago AS (
  SELECT
    metodos.id_contrato,
    STRING_AGG(DISTINCT metodos.metodo_pago, ', ' ORDER BY metodos.metodo_pago) AS metodos_pago
  FROM (
    SELECT
      pago.id_contrato,
      NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago
    FROM public.contrato_pago AS pago
    WHERE pago.estado = 'APLICADO'
    UNION ALL
    SELECT
      pago.id_contrato,
      NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago
    FROM public.contrato_mantenimiento_pago AS pago
    WHERE pago.estado = 'APLICADO'
  ) AS metodos
  WHERE metodos.metodo_pago IS NOT NULL
  GROUP BY metodos.id_contrato
)
SELECT
  contrato.id_contrato,
  contrato.numero_contrato,
  contrato.numero_formulario,
  contrato.estado_contrato,
  contrato.fecha_firma,
  contrato.fecha_primera_cuota,
  contrato.id_cliente,
  cliente.nombre_completo AS cliente_nombre,
  contrato.id_vendedor,
  vendedor.nombre_completo AS vendedor_nombre,
  COALESCE(contrato.monto_arrendamiento_total, 0)::NUMERIC(14,2) AS monto_contratado,
  COALESCE(contrato.monto_entregado_inicial, 0)::NUMERIC(14,2) AS monto_entregado_inicial,
  COALESCE(contrato.monto_apertura, 0)::NUMERIC(14,2) AS monto_apertura,
  COALESCE(contrato.monto_mantenimiento_anual, 0)::NUMERIC(14,2) AS monto_mantenimiento_anual,
  plan.id_plan_pago,
  plan.tipo_plan,
  plan.fecha_generacion AS fecha_generacion_plan,
  plan.fecha_primera_cuota AS plan_fecha_primera_cuota,
  plan.plazo_meses,
  plan.cuota_base,
  plan.saldo_inicial,
  COALESCE(producto.tipos_producto, 'SIN PRODUCTO') AS tipos_producto,
  COALESCE(producto.lotes, 0) AS lotes,
  COALESCE(producto.cenizarios, 0) AS cenizarios,
  COALESCE(producto.cremaciones, 0) AS cremaciones,
  COALESCE(producto.paquetes_funerarios, 0) AS paquetes_funerarios,
  COALESCE(cuota.cuotas_totales, 0) AS cuotas_totales,
  COALESCE(cuota.cuotas_pagadas, 0) AS cuotas_pagadas,
  COALESCE(cuota.cuotas_pendientes, 0) AS cuotas_pendientes,
  COALESCE(cuota.cuotas_vencidas, 0) AS cuotas_vencidas,
  COALESCE(cuota.cuota_pendiente_total, CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END, 0)::NUMERIC(14,2) AS cuota_pendiente_total,
  COALESCE(cuota.capital_pendiente, CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END, 0)::NUMERIC(14,2) AS capital_pendiente,
  COALESCE(cuota.interes_pendiente, 0)::NUMERIC(14,2) AS interes_pendiente,
  GREATEST(
    COALESCE(cuota.cuota_pendiente_total, CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END, 0)
    - COALESCE(cuota.capital_pendiente, CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END, 0)
    - COALESCE(cuota.interes_pendiente, 0),
    0
  )::NUMERIC(14,2) AS otros_pendientes_cuotas,
  COALESCE(cargo.cargos_pendientes, 0)::NUMERIC(14,2) AS cargos_pendientes,
  COALESCE(mantenimiento.mantenimiento_pendiente, 0)::NUMERIC(14,2) AS mantenimiento_pendiente,
  (
    COALESCE(cuota.cuota_pendiente_total, CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END, 0)
    + COALESCE(cargo.cargos_pendientes, 0)
    + COALESCE(mantenimiento.mantenimiento_pendiente, 0)
  )::NUMERIC(14,2) AS saldo_pendiente_total,
  (COALESCE(cuota.monto_vencido, 0) + COALESCE(mantenimiento.mantenimiento_vencido, 0))::NUMERIC(14,2) AS monto_vencido_total,
  COALESCE(mantenimiento.mantenimiento_pagadas, 0) AS mantenimiento_pagadas,
  COALESCE(mantenimiento.mantenimiento_pendientes, 0) AS mantenimiento_pendientes,
  COALESCE(mantenimiento.mantenimiento_vencidas, 0) AS mantenimiento_vencidas,
  cuota.proxima_fecha_vencimiento,
  mantenimiento.proxima_fecha_mantenimiento,
  CASE
    WHEN cuota.proxima_fecha_vencimiento IS NULL THEN mantenimiento.proxima_fecha_mantenimiento
    WHEN mantenimiento.proxima_fecha_mantenimiento IS NULL THEN cuota.proxima_fecha_vencimiento
    ELSE LEAST(cuota.proxima_fecha_vencimiento, mantenimiento.proxima_fecha_mantenimiento)
  END AS proximo_pago,
  cuota.fecha_finalizacion_plan,
  COALESCE(pago_historico.pagos_contrato_historicos, 0) AS pagos_contrato_historicos,
  COALESCE(mantenimiento_historico.pagos_mantenimiento_historicos, 0) AS pagos_mantenimiento_historicos,
  (COALESCE(pago_historico.pagos_contrato_historicos, 0) + COALESCE(mantenimiento_historico.pagos_mantenimiento_historicos, 0)) AS pagos_totales_historicos,
  COALESCE(pago_historico.total_pagado_contrato_historico, 0)::NUMERIC(14,2) AS total_pagado_contrato_historico,
  COALESCE(mantenimiento_historico.total_pagado_mantenimiento_historico, 0)::NUMERIC(14,2) AS total_pagado_mantenimiento_historico,
  (COALESCE(pago_historico.total_pagado_contrato_historico, 0) + COALESCE(mantenimiento_historico.total_pagado_mantenimiento_historico, 0))::NUMERIC(14,2) AS total_pagado_historico,
  COALESCE(pago_aplicacion.capital_cobrado_historico, 0)::NUMERIC(14,2) AS capital_cobrado_historico,
  COALESCE(pago_aplicacion.interes_cobrado_historico, 0)::NUMERIC(14,2) AS interes_cobrado_historico,
  COALESCE(pago_aplicacion.otros_cobrados_historico, 0)::NUMERIC(14,2) AS otros_cobrados_historico,
  pago_historico.ultimo_pago_contrato,
  mantenimiento_historico.ultimo_pago_mantenimiento,
  CASE
    WHEN pago_historico.ultimo_pago_contrato IS NULL THEN mantenimiento_historico.ultimo_pago_mantenimiento
    WHEN mantenimiento_historico.ultimo_pago_mantenimiento IS NULL THEN pago_historico.ultimo_pago_contrato
    ELSE GREATEST(pago_historico.ultimo_pago_contrato, mantenimiento_historico.ultimo_pago_mantenimiento)
  END AS ultimo_pago,
  metodos.metodos_pago
FROM public.contrato AS contrato
JOIN public.cliente AS cliente
  ON cliente.id_cliente = contrato.id_cliente
JOIN public.vendedor AS vendedor
  ON vendedor.id_vendedor = contrato.id_vendedor
LEFT JOIN plan_vigente AS plan
  ON plan.id_contrato = contrato.id_contrato
LEFT JOIN producto_resumen AS producto
  ON producto.id_contrato = contrato.id_contrato
LEFT JOIN cuota_resumen AS cuota
  ON cuota.id_plan_pago = plan.id_plan_pago
LEFT JOIN cargo_resumen AS cargo
  ON cargo.id_contrato = contrato.id_contrato
LEFT JOIN pago_historico
  ON pago_historico.id_contrato = contrato.id_contrato
LEFT JOIN pago_aplicacion_historico AS pago_aplicacion
  ON pago_aplicacion.id_contrato = contrato.id_contrato
LEFT JOIN mantenimiento_historico
  ON mantenimiento_historico.id_contrato = contrato.id_contrato
LEFT JOIN mantenimiento_resumen AS mantenimiento
  ON mantenimiento.id_contrato = contrato.id_contrato
LEFT JOIN metodos_pago AS metodos
  ON metodos.id_contrato = contrato.id_contrato;

REVOKE ALL ON TABLE public.vw_ingresos_campo_santo_contrato_base
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.obtener_ingresos_campo_santo_detalle(
  p_fecha_desde DATE DEFAULT NULL,
  p_fecha_hasta DATE DEFAULT NULL,
  p_estado_contrato TEXT DEFAULT 'VIGENTE',
  p_cliente TEXT DEFAULT NULL,
  p_id_vendedor INT DEFAULT NULL,
  p_tipo_producto TEXT DEFAULT NULL,
  p_metodo_pago TEXT DEFAULT NULL,
  p_solo_con_vencidas BOOLEAN DEFAULT NULL,
  p_solo_con_saldo BOOLEAN DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_orden_columna TEXT DEFAULT 'fecha_firma',
  p_orden_direccion TEXT DEFAULT 'desc'
)
RETURNS TABLE (
  total_count BIGINT,
  id_contrato INT,
  numero_contrato TEXT,
  numero_formulario TEXT,
  cliente_nombre TEXT,
  id_vendedor INT,
  vendedor_nombre TEXT,
  estado_contrato TEXT,
  fecha_firma DATE,
  fecha_primera_cuota DATE,
  fecha_finalizacion_plan DATE,
  tipos_producto TEXT,
  monto_contratado NUMERIC(14,2),
  total_pagado_periodo NUMERIC(14,2),
  total_pagado_historico NUMERIC(14,2),
  total_pagado_contrato_periodo NUMERIC(14,2),
  mantenimiento_cobrado_periodo NUMERIC(14,2),
  capital_cobrado_periodo NUMERIC(14,2),
  interes_cobrado_periodo NUMERIC(14,2),
  otros_cobrados_periodo NUMERIC(14,2),
  saldo_pendiente_total NUMERIC(14,2),
  capital_pendiente NUMERIC(14,2),
  interes_pendiente NUMERIC(14,2),
  otros_pendientes NUMERIC(14,2),
  mantenimiento_pendiente NUMERIC(14,2),
  monto_vencido_total NUMERIC(14,2),
  cuotas_totales INT,
  cuotas_pagadas INT,
  cuotas_pendientes INT,
  cuotas_vencidas INT,
  mantenimiento_pendientes INT,
  mantenimiento_vencidas INT,
  proximo_pago DATE,
  ultimo_pago DATE,
  total_pagos_periodo BIGINT,
  metodos_pago TEXT,
  tipo_plan TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 1000);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_estado TEXT := NULLIF(UPPER(TRIM(COALESCE(p_estado_contrato, ''))), '');
  v_cliente TEXT := NULLIF(TRIM(COALESCE(p_cliente, '')), '');
  v_tipo_producto TEXT := NULLIF(UPPER(TRIM(COALESCE(p_tipo_producto, ''))), '');
  v_metodo_pago TEXT := NULLIF(TRIM(COALESCE(p_metodo_pago, '')), '');
  v_fecha_desde_ts TIMESTAMPTZ;
  v_fecha_hasta_exclusiva_ts TIMESTAMPTZ;
  v_orden_columna TEXT := LOWER(TRIM(COALESCE(p_orden_columna, 'fecha_firma')));
  v_orden_direccion TEXT := CASE WHEN LOWER(TRIM(COALESCE(p_orden_direccion, 'desc'))) = 'asc' THEN 'asc' ELSE 'desc' END;
BEGIN
  v_fecha_desde_ts := CASE
    WHEN p_fecha_desde IS NULL THEN NULL
    ELSE p_fecha_desde::TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  END;
  v_fecha_hasta_exclusiva_ts := CASE
    WHEN p_fecha_hasta IS NULL THEN NULL
    ELSE (p_fecha_hasta + 1)::TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  END;

  IF p_fecha_desde IS NOT NULL
    AND p_fecha_hasta IS NOT NULL
    AND p_fecha_hasta < p_fecha_desde
  THEN
    RAISE EXCEPTION 'La fecha hasta no puede ser menor que la fecha desde';
  END IF;

  PERFORM public.assert_ingresos_campo_santo_admin();

  RETURN QUERY
  WITH pago_aplicacion AS (
    SELECT
      aplicacion.id_pago,
      COALESCE(SUM(aplicacion.monto_capital), 0)::NUMERIC(14,2) AS capital,
      COALESCE(SUM(aplicacion.monto_interes), 0)::NUMERIC(14,2) AS interes,
      COALESCE(SUM(aplicacion.monto_otros), 0)::NUMERIC(14,2) AS otros
    FROM public.contrato_pago_aplicacion AS aplicacion
    GROUP BY aplicacion.id_pago
  ),
  movimientos AS (
    SELECT
      pago.id_contrato,
      (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE AS fecha_pago,
      NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago,
      pago.monto_total::NUMERIC(14,2) AS total,
      COALESCE(aplicacion.capital, 0)::NUMERIC(14,2) AS capital,
      COALESCE(aplicacion.interes, 0)::NUMERIC(14,2) AS interes,
      COALESCE(aplicacion.otros, 0)::NUMERIC(14,2) AS otros,
      0::NUMERIC(14,2) AS mantenimiento,
      1::BIGINT AS pagos
    FROM public.contrato_pago AS pago
    LEFT JOIN pago_aplicacion AS aplicacion
      ON aplicacion.id_pago = pago.id_pago
    WHERE pago.estado = 'APLICADO'
      AND (v_fecha_desde_ts IS NULL OR pago.fecha_pago >= v_fecha_desde_ts)
      AND (v_fecha_hasta_exclusiva_ts IS NULL OR pago.fecha_pago < v_fecha_hasta_exclusiva_ts)
    UNION ALL
    SELECT
      pago.id_contrato,
      (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE AS fecha_pago,
      NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago,
      pago.monto_total::NUMERIC(14,2) AS total,
      0::NUMERIC(14,2) AS capital,
      0::NUMERIC(14,2) AS interes,
      0::NUMERIC(14,2) AS otros,
      pago.monto_total::NUMERIC(14,2) AS mantenimiento,
      1::BIGINT AS pagos
    FROM public.contrato_mantenimiento_pago AS pago
    WHERE pago.estado = 'APLICADO'
      AND (v_fecha_desde_ts IS NULL OR pago.fecha_pago >= v_fecha_desde_ts)
      AND (v_fecha_hasta_exclusiva_ts IS NULL OR pago.fecha_pago < v_fecha_hasta_exclusiva_ts)
  ),
  movimientos_periodo AS (
    SELECT
      movimiento.id_contrato,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS total_periodo,
      COALESCE(SUM(movimiento.total - movimiento.mantenimiento), 0)::NUMERIC(14,2) AS total_contrato_periodo,
      COALESCE(SUM(movimiento.mantenimiento), 0)::NUMERIC(14,2) AS mantenimiento_periodo,
      COALESCE(SUM(movimiento.capital), 0)::NUMERIC(14,2) AS capital_periodo,
      COALESCE(SUM(movimiento.interes), 0)::NUMERIC(14,2) AS interes_periodo,
      COALESCE(SUM(movimiento.otros), 0)::NUMERIC(14,2) AS otros_periodo,
      COALESCE(SUM(movimiento.pagos), 0)::BIGINT AS pagos_periodo,
      STRING_AGG(DISTINCT movimiento.metodo_pago, ', ' ORDER BY movimiento.metodo_pago) FILTER (
        WHERE movimiento.metodo_pago IS NOT NULL
      ) AS metodos_periodo
    FROM movimientos AS movimiento
    WHERE (v_metodo_pago IS NULL OR movimiento.metodo_pago = v_metodo_pago)
    GROUP BY movimiento.id_contrato
  ),
  filtrado AS (
    SELECT
      base.*,
      COALESCE(periodo.total_periodo, 0)::NUMERIC(14,2) AS total_pagado_periodo,
      COALESCE(periodo.total_contrato_periodo, 0)::NUMERIC(14,2) AS total_pagado_contrato_periodo,
      COALESCE(periodo.mantenimiento_periodo, 0)::NUMERIC(14,2) AS mantenimiento_cobrado_periodo,
      COALESCE(periodo.capital_periodo, 0)::NUMERIC(14,2) AS capital_cobrado_periodo,
      COALESCE(periodo.interes_periodo, 0)::NUMERIC(14,2) AS interes_cobrado_periodo,
      COALESCE(periodo.otros_periodo, 0)::NUMERIC(14,2) AS otros_cobrados_periodo,
      COALESCE(periodo.pagos_periodo, 0)::BIGINT AS total_pagos_periodo,
      COALESCE(periodo.metodos_periodo, base.metodos_pago) AS metodos_pago_visibles
    FROM public.vw_ingresos_campo_santo_contrato_base AS base
    LEFT JOIN movimientos_periodo AS periodo
      ON periodo.id_contrato = base.id_contrato
    WHERE (v_estado IS NULL OR v_estado = 'TODOS' OR base.estado_contrato::TEXT = v_estado)
      AND (
        v_cliente IS NULL
        OR base.cliente_nombre ILIKE '%' || v_cliente || '%'
        OR base.numero_contrato ILIKE '%' || v_cliente || '%'
        OR base.numero_formulario ILIKE '%' || v_cliente || '%'
      )
      AND (p_id_vendedor IS NULL OR base.id_vendedor = p_id_vendedor)
      AND (
        v_tipo_producto IS NULL
        OR v_tipo_producto = 'TODOS'
        OR EXISTS (
          SELECT 1
          FROM public.contrato_producto AS producto
          WHERE producto.id_contrato = base.id_contrato
            AND producto.tipo_producto::TEXT = v_tipo_producto
        )
      )
      AND (
        p_solo_con_vencidas IS NULL
        OR (p_solo_con_vencidas AND (base.cuotas_vencidas + base.mantenimiento_vencidas) > 0)
        OR (NOT p_solo_con_vencidas AND (base.cuotas_vencidas + base.mantenimiento_vencidas) = 0)
      )
      AND (
        p_solo_con_saldo IS NULL
        OR (p_solo_con_saldo AND base.saldo_pendiente_total > 0)
        OR (NOT p_solo_con_saldo AND base.saldo_pendiente_total <= 0)
      )
      AND (v_metodo_pago IS NULL OR COALESCE(periodo.total_periodo, 0) > 0)
  )
  SELECT
    COUNT(*) OVER()::BIGINT AS total_count,
    filtrado.id_contrato,
    filtrado.numero_contrato::TEXT,
    filtrado.numero_formulario::TEXT,
    filtrado.cliente_nombre::TEXT,
    filtrado.id_vendedor,
    filtrado.vendedor_nombre::TEXT,
    filtrado.estado_contrato::TEXT,
    filtrado.fecha_firma,
    COALESCE(filtrado.plan_fecha_primera_cuota, filtrado.fecha_primera_cuota) AS fecha_primera_cuota,
    filtrado.fecha_finalizacion_plan,
    filtrado.tipos_producto::TEXT,
    filtrado.monto_contratado,
    filtrado.total_pagado_periodo,
    filtrado.total_pagado_historico,
    filtrado.total_pagado_contrato_periodo,
    filtrado.mantenimiento_cobrado_periodo,
    filtrado.capital_cobrado_periodo,
    filtrado.interes_cobrado_periodo,
    filtrado.otros_cobrados_periodo,
    filtrado.saldo_pendiente_total,
    filtrado.capital_pendiente,
    filtrado.interes_pendiente,
    (filtrado.otros_pendientes_cuotas + filtrado.cargos_pendientes)::NUMERIC(14,2) AS otros_pendientes,
    filtrado.mantenimiento_pendiente,
    filtrado.monto_vencido_total,
    filtrado.cuotas_totales,
    filtrado.cuotas_pagadas,
    filtrado.cuotas_pendientes,
    filtrado.cuotas_vencidas,
    filtrado.mantenimiento_pendientes,
    filtrado.mantenimiento_vencidas,
    filtrado.proximo_pago,
    filtrado.ultimo_pago,
    filtrado.total_pagos_periodo,
    filtrado.metodos_pago_visibles::TEXT,
    filtrado.tipo_plan::TEXT
  FROM filtrado
  ORDER BY
    CASE WHEN v_orden_columna = 'cliente' AND v_orden_direccion = 'asc' THEN filtrado.cliente_nombre END ASC NULLS LAST,
    CASE WHEN v_orden_columna = 'cliente' AND v_orden_direccion = 'desc' THEN filtrado.cliente_nombre END DESC NULLS LAST,
    CASE WHEN v_orden_columna = 'fecha_firma' AND v_orden_direccion = 'asc' THEN filtrado.fecha_firma END ASC NULLS LAST,
    CASE WHEN v_orden_columna = 'fecha_firma' AND v_orden_direccion = 'desc' THEN filtrado.fecha_firma END DESC NULLS LAST,
    CASE WHEN v_orden_columna = 'monto_contratado' AND v_orden_direccion = 'asc' THEN filtrado.monto_contratado END ASC NULLS LAST,
    CASE WHEN v_orden_columna = 'monto_contratado' AND v_orden_direccion = 'desc' THEN filtrado.monto_contratado END DESC NULLS LAST,
    CASE WHEN v_orden_columna = 'total_pagado_periodo' AND v_orden_direccion = 'asc' THEN filtrado.total_pagado_periodo END ASC NULLS LAST,
    CASE WHEN v_orden_columna = 'total_pagado_periodo' AND v_orden_direccion = 'desc' THEN filtrado.total_pagado_periodo END DESC NULLS LAST,
    CASE WHEN v_orden_columna = 'saldo_pendiente' AND v_orden_direccion = 'asc' THEN filtrado.saldo_pendiente_total END ASC NULLS LAST,
    CASE WHEN v_orden_columna = 'saldo_pendiente' AND v_orden_direccion = 'desc' THEN filtrado.saldo_pendiente_total END DESC NULLS LAST,
    CASE WHEN v_orden_columna = 'proximo_pago' AND v_orden_direccion = 'asc' THEN filtrado.proximo_pago END ASC NULLS LAST,
    CASE WHEN v_orden_columna = 'proximo_pago' AND v_orden_direccion = 'desc' THEN filtrado.proximo_pago END DESC NULLS LAST,
    filtrado.id_contrato DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_ingresos_campo_santo_resumen(
  p_fecha_desde DATE DEFAULT NULL,
  p_fecha_hasta DATE DEFAULT NULL,
  p_estado_contrato TEXT DEFAULT 'VIGENTE',
  p_cliente TEXT DEFAULT NULL,
  p_id_vendedor INT DEFAULT NULL,
  p_tipo_producto TEXT DEFAULT NULL,
  p_metodo_pago TEXT DEFAULT NULL,
  p_solo_con_vencidas BOOLEAN DEFAULT NULL,
  p_solo_con_saldo BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  contratos_filtrados BIGINT,
  contratos_con_plan BIGINT,
  contratos_con_vencidas BIGINT,
  contratos_con_saldo BIGINT,
  monto_total_contratado NUMERIC(14,2),
  total_recaudado_periodo NUMERIC(14,2),
  total_recaudado_historico NUMERIC(14,2),
  total_recaudado_contratos_periodo NUMERIC(14,2),
  mantenimiento_recaudado_periodo NUMERIC(14,2),
  capital_cobrado_periodo NUMERIC(14,2),
  interes_cobrado_periodo NUMERIC(14,2),
  otros_cobrados_periodo NUMERIC(14,2),
  saldo_pendiente_total NUMERIC(14,2),
  capital_pendiente NUMERIC(14,2),
  interes_pendiente NUMERIC(14,2),
  otros_pendientes NUMERIC(14,2),
  mantenimiento_pendiente NUMERIC(14,2),
  monto_vencido_total NUMERIC(14,2),
  total_pagos_periodo BIGINT,
  promedio_ingreso_por_contrato NUMERIC(14,2),
  ingreso_mes_actual NUMERIC(14,2),
  ingreso_anio_actual NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado TEXT := NULLIF(UPPER(TRIM(COALESCE(p_estado_contrato, ''))), '');
  v_cliente TEXT := NULLIF(TRIM(COALESCE(p_cliente, '')), '');
  v_tipo_producto TEXT := NULLIF(UPPER(TRIM(COALESCE(p_tipo_producto, ''))), '');
  v_metodo_pago TEXT := NULLIF(TRIM(COALESCE(p_metodo_pago, '')), '');
  v_fecha_desde_ts TIMESTAMPTZ;
  v_fecha_hasta_exclusiva_ts TIMESTAMPTZ;
BEGIN
  v_fecha_desde_ts := CASE
    WHEN p_fecha_desde IS NULL THEN NULL
    ELSE p_fecha_desde::TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  END;
  v_fecha_hasta_exclusiva_ts := CASE
    WHEN p_fecha_hasta IS NULL THEN NULL
    ELSE (p_fecha_hasta + 1)::TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  END;

  IF p_fecha_desde IS NOT NULL
    AND p_fecha_hasta IS NOT NULL
    AND p_fecha_hasta < p_fecha_desde
  THEN
    RAISE EXCEPTION 'La fecha hasta no puede ser menor que la fecha desde';
  END IF;

  PERFORM public.assert_ingresos_campo_santo_admin();

  RETURN QUERY
  WITH pago_aplicacion AS (
    SELECT
      aplicacion.id_pago,
      COALESCE(SUM(aplicacion.monto_capital), 0)::NUMERIC(14,2) AS capital,
      COALESCE(SUM(aplicacion.monto_interes), 0)::NUMERIC(14,2) AS interes,
      COALESCE(SUM(aplicacion.monto_otros), 0)::NUMERIC(14,2) AS otros
    FROM public.contrato_pago_aplicacion AS aplicacion
    GROUP BY aplicacion.id_pago
  ),
  movimientos AS (
    SELECT
      pago.id_contrato,
      (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE AS fecha_pago,
      NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago,
      pago.monto_total::NUMERIC(14,2) AS total,
      COALESCE(aplicacion.capital, 0)::NUMERIC(14,2) AS capital,
      COALESCE(aplicacion.interes, 0)::NUMERIC(14,2) AS interes,
      COALESCE(aplicacion.otros, 0)::NUMERIC(14,2) AS otros,
      0::NUMERIC(14,2) AS mantenimiento,
      1::BIGINT AS pagos
    FROM public.contrato_pago AS pago
    LEFT JOIN pago_aplicacion AS aplicacion
      ON aplicacion.id_pago = pago.id_pago
    WHERE pago.estado = 'APLICADO'
      AND (v_fecha_desde_ts IS NULL OR pago.fecha_pago >= v_fecha_desde_ts)
      AND (v_fecha_hasta_exclusiva_ts IS NULL OR pago.fecha_pago < v_fecha_hasta_exclusiva_ts)
    UNION ALL
    SELECT
      pago.id_contrato,
      (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE AS fecha_pago,
      NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago,
      pago.monto_total::NUMERIC(14,2) AS total,
      0::NUMERIC(14,2) AS capital,
      0::NUMERIC(14,2) AS interes,
      0::NUMERIC(14,2) AS otros,
      pago.monto_total::NUMERIC(14,2) AS mantenimiento,
      1::BIGINT AS pagos
    FROM public.contrato_mantenimiento_pago AS pago
    WHERE pago.estado = 'APLICADO'
      AND (v_fecha_desde_ts IS NULL OR pago.fecha_pago >= v_fecha_desde_ts)
      AND (v_fecha_hasta_exclusiva_ts IS NULL OR pago.fecha_pago < v_fecha_hasta_exclusiva_ts)
  ),
  movimientos_periodo AS (
    SELECT
      movimiento.id_contrato,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS total_periodo,
      COALESCE(SUM(movimiento.total - movimiento.mantenimiento), 0)::NUMERIC(14,2) AS total_contrato_periodo,
      COALESCE(SUM(movimiento.mantenimiento), 0)::NUMERIC(14,2) AS mantenimiento_periodo,
      COALESCE(SUM(movimiento.capital), 0)::NUMERIC(14,2) AS capital_periodo,
      COALESCE(SUM(movimiento.interes), 0)::NUMERIC(14,2) AS interes_periodo,
      COALESCE(SUM(movimiento.otros), 0)::NUMERIC(14,2) AS otros_periodo,
      COALESCE(SUM(movimiento.pagos), 0)::BIGINT AS pagos_periodo
    FROM movimientos AS movimiento
    WHERE (v_metodo_pago IS NULL OR movimiento.metodo_pago = v_metodo_pago)
    GROUP BY movimiento.id_contrato
  ),
  movimientos_mes_actual AS (
    SELECT
      movimiento.id_contrato,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS total_mes
    FROM movimientos AS movimiento
    WHERE movimiento.fecha_pago >= DATE_TRUNC('month', CURRENT_DATE)::DATE
      AND movimiento.fecha_pago < (DATE_TRUNC('month', CURRENT_DATE)::DATE + INTERVAL '1 month')::DATE
      AND (p_fecha_desde IS NULL OR movimiento.fecha_pago >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR movimiento.fecha_pago <= p_fecha_hasta)
      AND (v_metodo_pago IS NULL OR movimiento.metodo_pago = v_metodo_pago)
    GROUP BY movimiento.id_contrato
  ),
  movimientos_anio_actual AS (
    SELECT
      movimiento.id_contrato,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS total_anio
    FROM movimientos AS movimiento
    WHERE movimiento.fecha_pago >= DATE_TRUNC('year', CURRENT_DATE)::DATE
      AND movimiento.fecha_pago < (DATE_TRUNC('year', CURRENT_DATE)::DATE + INTERVAL '1 year')::DATE
      AND (p_fecha_desde IS NULL OR movimiento.fecha_pago >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR movimiento.fecha_pago <= p_fecha_hasta)
      AND (v_metodo_pago IS NULL OR movimiento.metodo_pago = v_metodo_pago)
    GROUP BY movimiento.id_contrato
  ),
  filtrado AS (
    SELECT
      base.*,
      COALESCE(periodo.total_periodo, 0)::NUMERIC(14,2) AS total_pagado_periodo,
      COALESCE(periodo.total_contrato_periodo, 0)::NUMERIC(14,2) AS total_pagado_contrato_periodo,
      COALESCE(periodo.mantenimiento_periodo, 0)::NUMERIC(14,2) AS mantenimiento_cobrado_periodo,
      COALESCE(periodo.capital_periodo, 0)::NUMERIC(14,2) AS capital_cobrado_periodo,
      COALESCE(periodo.interes_periodo, 0)::NUMERIC(14,2) AS interes_cobrado_periodo,
      COALESCE(periodo.otros_periodo, 0)::NUMERIC(14,2) AS otros_cobrados_periodo,
      COALESCE(periodo.pagos_periodo, 0)::BIGINT AS total_pagos_periodo,
      COALESCE(mes.total_mes, 0)::NUMERIC(14,2) AS ingreso_mes_actual,
      COALESCE(anio.total_anio, 0)::NUMERIC(14,2) AS ingreso_anio_actual
    FROM public.vw_ingresos_campo_santo_contrato_base AS base
    LEFT JOIN movimientos_periodo AS periodo
      ON periodo.id_contrato = base.id_contrato
    LEFT JOIN movimientos_mes_actual AS mes
      ON mes.id_contrato = base.id_contrato
    LEFT JOIN movimientos_anio_actual AS anio
      ON anio.id_contrato = base.id_contrato
    WHERE (v_estado IS NULL OR v_estado = 'TODOS' OR base.estado_contrato::TEXT = v_estado)
      AND (
        v_cliente IS NULL
        OR base.cliente_nombre ILIKE '%' || v_cliente || '%'
        OR base.numero_contrato ILIKE '%' || v_cliente || '%'
        OR base.numero_formulario ILIKE '%' || v_cliente || '%'
      )
      AND (p_id_vendedor IS NULL OR base.id_vendedor = p_id_vendedor)
      AND (
        v_tipo_producto IS NULL
        OR v_tipo_producto = 'TODOS'
        OR EXISTS (
          SELECT 1
          FROM public.contrato_producto AS producto
          WHERE producto.id_contrato = base.id_contrato
            AND producto.tipo_producto::TEXT = v_tipo_producto
        )
      )
      AND (
        p_solo_con_vencidas IS NULL
        OR (p_solo_con_vencidas AND (base.cuotas_vencidas + base.mantenimiento_vencidas) > 0)
        OR (NOT p_solo_con_vencidas AND (base.cuotas_vencidas + base.mantenimiento_vencidas) = 0)
      )
      AND (
        p_solo_con_saldo IS NULL
        OR (p_solo_con_saldo AND base.saldo_pendiente_total > 0)
        OR (NOT p_solo_con_saldo AND base.saldo_pendiente_total <= 0)
      )
      AND (v_metodo_pago IS NULL OR COALESCE(periodo.total_periodo, 0) > 0)
  ),
  agregado AS (
    SELECT
      COUNT(*)::BIGINT AS contratos_filtrados,
      COUNT(*) FILTER (WHERE filtrado.id_plan_pago IS NOT NULL)::BIGINT AS contratos_con_plan,
      COUNT(*) FILTER (WHERE (filtrado.cuotas_vencidas + filtrado.mantenimiento_vencidas) > 0)::BIGINT AS contratos_con_vencidas,
      COUNT(*) FILTER (WHERE filtrado.saldo_pendiente_total > 0)::BIGINT AS contratos_con_saldo,
      COALESCE(SUM(filtrado.monto_contratado), 0)::NUMERIC(14,2) AS monto_total_contratado,
      COALESCE(SUM(filtrado.total_pagado_periodo), 0)::NUMERIC(14,2) AS total_recaudado_periodo,
      COALESCE(SUM(filtrado.total_pagado_historico), 0)::NUMERIC(14,2) AS total_recaudado_historico,
      COALESCE(SUM(filtrado.total_pagado_contrato_periodo), 0)::NUMERIC(14,2) AS total_recaudado_contratos_periodo,
      COALESCE(SUM(filtrado.mantenimiento_cobrado_periodo), 0)::NUMERIC(14,2) AS mantenimiento_recaudado_periodo,
      COALESCE(SUM(filtrado.capital_cobrado_periodo), 0)::NUMERIC(14,2) AS capital_cobrado_periodo,
      COALESCE(SUM(filtrado.interes_cobrado_periodo), 0)::NUMERIC(14,2) AS interes_cobrado_periodo,
      COALESCE(SUM(filtrado.otros_cobrados_periodo), 0)::NUMERIC(14,2) AS otros_cobrados_periodo,
      COALESCE(SUM(filtrado.saldo_pendiente_total), 0)::NUMERIC(14,2) AS saldo_pendiente_total,
      COALESCE(SUM(filtrado.capital_pendiente), 0)::NUMERIC(14,2) AS capital_pendiente,
      COALESCE(SUM(filtrado.interes_pendiente), 0)::NUMERIC(14,2) AS interes_pendiente,
      COALESCE(SUM(filtrado.otros_pendientes_cuotas + filtrado.cargos_pendientes), 0)::NUMERIC(14,2) AS otros_pendientes,
      COALESCE(SUM(filtrado.mantenimiento_pendiente), 0)::NUMERIC(14,2) AS mantenimiento_pendiente,
      COALESCE(SUM(filtrado.monto_vencido_total), 0)::NUMERIC(14,2) AS monto_vencido_total,
      COALESCE(SUM(filtrado.total_pagos_periodo), 0)::BIGINT AS total_pagos_periodo,
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COALESCE(SUM(filtrado.total_pagado_periodo), 0) / COUNT(*))::NUMERIC, 2)
      END::NUMERIC(14,2) AS promedio_ingreso_por_contrato,
      COALESCE(SUM(filtrado.ingreso_mes_actual), 0)::NUMERIC(14,2) AS ingreso_mes_actual,
      COALESCE(SUM(filtrado.ingreso_anio_actual), 0)::NUMERIC(14,2) AS ingreso_anio_actual
    FROM filtrado
  )
  SELECT
    agregado.contratos_filtrados,
    agregado.contratos_con_plan,
    agregado.contratos_con_vencidas,
    agregado.contratos_con_saldo,
    agregado.monto_total_contratado,
    agregado.total_recaudado_periodo,
    agregado.total_recaudado_historico,
    agregado.total_recaudado_contratos_periodo,
    agregado.mantenimiento_recaudado_periodo,
    agregado.capital_cobrado_periodo,
    agregado.interes_cobrado_periodo,
    agregado.otros_cobrados_periodo,
    agregado.saldo_pendiente_total,
    agregado.capital_pendiente,
    agregado.interes_pendiente,
    agregado.otros_pendientes,
    agregado.mantenimiento_pendiente,
    agregado.monto_vencido_total,
    agregado.total_pagos_periodo,
    agregado.promedio_ingreso_por_contrato,
    agregado.ingreso_mes_actual,
    agregado.ingreso_anio_actual
  FROM agregado;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_ingresos_campo_santo_series_mensuales(
  p_fecha_desde DATE DEFAULT NULL,
  p_fecha_hasta DATE DEFAULT NULL,
  p_estado_contrato TEXT DEFAULT 'VIGENTE',
  p_cliente TEXT DEFAULT NULL,
  p_id_vendedor INT DEFAULT NULL,
  p_tipo_producto TEXT DEFAULT NULL,
  p_metodo_pago TEXT DEFAULT NULL,
  p_solo_con_vencidas BOOLEAN DEFAULT NULL,
  p_solo_con_saldo BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  periodo DATE,
  ingreso_contratos NUMERIC(14,2),
  ingreso_mantenimiento NUMERIC(14,2),
  ingreso_total NUMERIC(14,2),
  capital_cobrado NUMERIC(14,2),
  interes_cobrado NUMERIC(14,2),
  otros_cobrados NUMERIC(14,2),
  pagos_registrados BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado TEXT := NULLIF(UPPER(TRIM(COALESCE(p_estado_contrato, ''))), '');
  v_cliente TEXT := NULLIF(TRIM(COALESCE(p_cliente, '')), '');
  v_tipo_producto TEXT := NULLIF(UPPER(TRIM(COALESCE(p_tipo_producto, ''))), '');
  v_metodo_pago TEXT := NULLIF(TRIM(COALESCE(p_metodo_pago, '')), '');
  v_fecha_desde DATE := COALESCE(p_fecha_desde, DATE_TRUNC('year', CURRENT_DATE)::DATE);
  v_fecha_hasta DATE := COALESCE(p_fecha_hasta, CURRENT_DATE);
  v_fecha_desde_ts TIMESTAMPTZ;
  v_fecha_hasta_exclusiva_ts TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_ingresos_campo_santo_admin();

  IF v_fecha_hasta < v_fecha_desde THEN
    RAISE EXCEPTION 'La fecha hasta no puede ser menor que la fecha desde';
  END IF;

  v_fecha_desde_ts := v_fecha_desde::TIMESTAMP AT TIME ZONE 'America/Costa_Rica';
  v_fecha_hasta_exclusiva_ts := (v_fecha_hasta + 1)::TIMESTAMP AT TIME ZONE 'America/Costa_Rica';

  RETURN QUERY
  WITH pago_aplicacion AS (
    SELECT
      aplicacion.id_pago,
      COALESCE(SUM(aplicacion.monto_capital), 0)::NUMERIC(14,2) AS capital,
      COALESCE(SUM(aplicacion.monto_interes), 0)::NUMERIC(14,2) AS interes,
      COALESCE(SUM(aplicacion.monto_otros), 0)::NUMERIC(14,2) AS otros
    FROM public.contrato_pago_aplicacion AS aplicacion
    GROUP BY aplicacion.id_pago
  ),
  contratos_filtrados AS (
    SELECT base.id_contrato
    FROM public.vw_ingresos_campo_santo_contrato_base AS base
    WHERE (v_estado IS NULL OR v_estado = 'TODOS' OR base.estado_contrato::TEXT = v_estado)
      AND (
        v_cliente IS NULL
        OR base.cliente_nombre ILIKE '%' || v_cliente || '%'
        OR base.numero_contrato ILIKE '%' || v_cliente || '%'
        OR base.numero_formulario ILIKE '%' || v_cliente || '%'
      )
      AND (p_id_vendedor IS NULL OR base.id_vendedor = p_id_vendedor)
      AND (
        v_tipo_producto IS NULL
        OR v_tipo_producto = 'TODOS'
        OR EXISTS (
          SELECT 1
          FROM public.contrato_producto AS producto
          WHERE producto.id_contrato = base.id_contrato
            AND producto.tipo_producto::TEXT = v_tipo_producto
        )
      )
      AND (
        p_solo_con_vencidas IS NULL
        OR (p_solo_con_vencidas AND (base.cuotas_vencidas + base.mantenimiento_vencidas) > 0)
        OR (NOT p_solo_con_vencidas AND (base.cuotas_vencidas + base.mantenimiento_vencidas) = 0)
      )
      AND (
        p_solo_con_saldo IS NULL
        OR (p_solo_con_saldo AND base.saldo_pendiente_total > 0)
        OR (NOT p_solo_con_saldo AND base.saldo_pendiente_total <= 0)
      )
  ),
  movimientos AS (
    SELECT
      pago.id_contrato,
      DATE_TRUNC('month', pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE AS periodo,
      NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago,
      pago.monto_total::NUMERIC(14,2) AS total,
      COALESCE(aplicacion.capital, 0)::NUMERIC(14,2) AS capital,
      COALESCE(aplicacion.interes, 0)::NUMERIC(14,2) AS interes,
      COALESCE(aplicacion.otros, 0)::NUMERIC(14,2) AS otros,
      0::NUMERIC(14,2) AS mantenimiento,
      1::BIGINT AS pagos
    FROM public.contrato_pago AS pago
    JOIN contratos_filtrados AS contrato
      ON contrato.id_contrato = pago.id_contrato
    LEFT JOIN pago_aplicacion AS aplicacion
      ON aplicacion.id_pago = pago.id_pago
    WHERE pago.estado = 'APLICADO'
      AND pago.fecha_pago >= v_fecha_desde_ts
      AND pago.fecha_pago < v_fecha_hasta_exclusiva_ts
      AND (v_metodo_pago IS NULL OR NULLIF(TRIM(pago.metodo_pago), '') = v_metodo_pago)
    UNION ALL
    SELECT
      pago.id_contrato,
      DATE_TRUNC('month', pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE AS periodo,
      NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago,
      pago.monto_total::NUMERIC(14,2) AS total,
      0::NUMERIC(14,2) AS capital,
      0::NUMERIC(14,2) AS interes,
      0::NUMERIC(14,2) AS otros,
      pago.monto_total::NUMERIC(14,2) AS mantenimiento,
      1::BIGINT AS pagos
    FROM public.contrato_mantenimiento_pago AS pago
    JOIN contratos_filtrados AS contrato
      ON contrato.id_contrato = pago.id_contrato
    WHERE pago.estado = 'APLICADO'
      AND pago.fecha_pago >= v_fecha_desde_ts
      AND pago.fecha_pago < v_fecha_hasta_exclusiva_ts
      AND (v_metodo_pago IS NULL OR NULLIF(TRIM(pago.metodo_pago), '') = v_metodo_pago)
  ),
  agregado AS (
    SELECT
      movimiento.periodo,
      COALESCE(SUM(movimiento.total - movimiento.mantenimiento), 0)::NUMERIC(14,2) AS ingreso_contratos,
      COALESCE(SUM(movimiento.mantenimiento), 0)::NUMERIC(14,2) AS ingreso_mantenimiento,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS ingreso_total,
      COALESCE(SUM(movimiento.capital), 0)::NUMERIC(14,2) AS capital_cobrado,
      COALESCE(SUM(movimiento.interes), 0)::NUMERIC(14,2) AS interes_cobrado,
      COALESCE(SUM(movimiento.otros), 0)::NUMERIC(14,2) AS otros_cobrados,
      COALESCE(SUM(movimiento.pagos), 0)::BIGINT AS pagos_registrados
    FROM movimientos AS movimiento
    GROUP BY movimiento.periodo
  ),
  meses AS (
    SELECT GENERATE_SERIES(
      DATE_TRUNC('month', v_fecha_desde)::DATE,
      DATE_TRUNC('month', v_fecha_hasta)::DATE,
      INTERVAL '1 month'
    )::DATE AS periodo
  )
  SELECT
    meses.periodo,
    COALESCE(agregado.ingreso_contratos, 0)::NUMERIC(14,2),
    COALESCE(agregado.ingreso_mantenimiento, 0)::NUMERIC(14,2),
    COALESCE(agregado.ingreso_total, 0)::NUMERIC(14,2),
    COALESCE(agregado.capital_cobrado, 0)::NUMERIC(14,2),
    COALESCE(agregado.interes_cobrado, 0)::NUMERIC(14,2),
    COALESCE(agregado.otros_cobrados, 0)::NUMERIC(14,2),
    COALESCE(agregado.pagos_registrados, 0)::BIGINT
  FROM meses
  LEFT JOIN agregado
    ON agregado.periodo = meses.periodo
  ORDER BY meses.periodo;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_ingresos_campo_santo_filtros()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendedores JSONB;
  v_metodos_pago JSONB;
BEGIN
  PERFORM public.assert_ingresos_campo_santo_admin();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id_vendedor', vendedor.id_vendedor,
        'nombre_completo', vendedor.nombre_completo
      )
      ORDER BY vendedor.nombre_completo
    ),
    '[]'::JSONB
  )
    INTO v_vendedores
  FROM public.vendedor AS vendedor;

  SELECT COALESCE(jsonb_agg(metodo.metodo_pago ORDER BY metodo.metodo_pago), '[]'::JSONB)
    INTO v_metodos_pago
  FROM (
    SELECT DISTINCT metodo_pago
    FROM (
      SELECT NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago
      FROM public.contrato_pago AS pago
      WHERE pago.estado = 'APLICADO'

      UNION

      SELECT NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago
      FROM public.contrato_mantenimiento_pago AS pago
      WHERE pago.estado = 'APLICADO'
    ) AS metodos
    WHERE metodo_pago IS NOT NULL
  ) AS metodo;

  RETURN jsonb_build_object(
    'vendedores', v_vendedores,
    'metodos_pago', v_metodos_pago
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_contrato_producto_contrato_tipo
  ON public.contrato_producto (id_contrato, tipo_producto);

CREATE INDEX IF NOT EXISTS idx_contrato_pago_contrato_fecha_estado
  ON public.contrato_pago (id_contrato, fecha_pago, estado);

CREATE INDEX IF NOT EXISTS idx_contrato_pago_aplicado_fecha_contrato
  ON public.contrato_pago (fecha_pago, id_contrato)
  WHERE estado = 'APLICADO';

CREATE INDEX IF NOT EXISTS idx_contrato_mantenimiento_pago_contrato_fecha_estado
  ON public.contrato_mantenimiento_pago (id_contrato, fecha_pago, estado);

CREATE INDEX IF NOT EXISTS idx_contrato_mantenimiento_pago_aplicado_fecha_contrato
  ON public.contrato_mantenimiento_pago (fecha_pago, id_contrato)
  WHERE estado = 'APLICADO';

CREATE INDEX IF NOT EXISTS idx_contrato_plan_pago_contrato_estado
  ON public.contrato_plan_pago (id_contrato, estado);

CREATE INDEX IF NOT EXISTS idx_contrato_cuota_plan_estado_vencimiento
  ON public.contrato_cuota (id_plan_pago, estado, fecha_vencimiento);

REVOKE ALL ON FUNCTION public.obtener_ingresos_campo_santo_detalle(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, INT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.obtener_ingresos_campo_santo_resumen(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.obtener_ingresos_campo_santo_series_mensuales(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.obtener_ingresos_campo_santo_filtros()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_ingresos_campo_santo_detalle(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, INT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_ingresos_campo_santo_resumen(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_ingresos_campo_santo_series_mensuales(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_ingresos_campo_santo_filtros()
  TO authenticated;

NOTIFY pgrst, 'reload schema';
