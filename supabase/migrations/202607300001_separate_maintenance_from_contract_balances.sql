-- Keep contract financing and annual maintenance as independent accounting concepts.
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
  COALESCE(
    cuota.cuota_pendiente_total,
    CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END,
    0
  )::NUMERIC(14,2) AS cuota_pendiente_total,
  COALESCE(
    cuota.capital_pendiente,
    CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END,
    0
  )::NUMERIC(14,2) AS capital_pendiente,
  COALESCE(cuota.interes_pendiente, 0)::NUMERIC(14,2) AS interes_pendiente,
  GREATEST(
    COALESCE(
      cuota.cuota_pendiente_total,
      CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END,
      0
    )
    - COALESCE(
      cuota.capital_pendiente,
      CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END,
      0
    )
    - COALESCE(cuota.interes_pendiente, 0),
    0
  )::NUMERIC(14,2) AS otros_pendientes_cuotas,
  COALESCE(cargo.cargos_pendientes, 0)::NUMERIC(14,2) AS cargos_pendientes,
  COALESCE(mantenimiento.mantenimiento_pendiente, 0)::NUMERIC(14,2) AS mantenimiento_pendiente,
  (
    COALESCE(
      cuota.cuota_pendiente_total,
      CASE WHEN plan.id_plan_pago IS NULL THEN contrato.saldo_pendiente ELSE 0 END,
      0
    )
    + COALESCE(cargo.cargos_pendientes, 0)
  )::NUMERIC(14,2) AS saldo_pendiente_total,
  COALESCE(cuota.monto_vencido, 0)::NUMERIC(14,2) AS monto_vencido_total,
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
  (
    COALESCE(pago_historico.pagos_contrato_historicos, 0)
    + COALESCE(mantenimiento_historico.pagos_mantenimiento_historicos, 0)
  ) AS pagos_totales_historicos,
  COALESCE(pago_historico.total_pagado_contrato_historico, 0)::NUMERIC(14,2) AS total_pagado_contrato_historico,
  COALESCE(mantenimiento_historico.total_pagado_mantenimiento_historico, 0)::NUMERIC(14,2) AS total_pagado_mantenimiento_historico,
  COALESCE(pago_historico.total_pagado_contrato_historico, 0)::NUMERIC(14,2) AS total_pagado_historico,
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

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.saldo_pendiente_total IS
  'Saldo del contrato y cargos pendientes; excluye el mantenimiento anual.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.monto_vencido_total IS
  'Monto vencido del plan del contrato; excluye cuotas de mantenimiento.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.total_pagado_historico IS
  'Total historico cobrado al contrato; excluye pagos de mantenimiento.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.mantenimiento_pendiente IS
  'Saldo de mantenimiento por cobrar, contabilizado por separado.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.total_pagado_mantenimiento_historico IS
  'Total historico de mantenimiento recaudado, contabilizado por separado.';

REVOKE ALL ON TABLE public.vw_ingresos_campo_santo_contrato_base
  FROM PUBLIC, anon, authenticated;
