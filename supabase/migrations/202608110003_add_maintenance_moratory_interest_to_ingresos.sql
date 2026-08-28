-- Integra la mora de mantenimiento en Ingresos Campo Santo sin duplicar recibos.
-- Requiere 202608040002_add_moratory_interest_to_ingresos.sql y
-- 202608110002_add_maintenance_moratory_interest.sql.
--
-- mantenimiento = mantenimiento_principal + mora_mantenimiento.
-- La columna mora existente continua representando solo la mora del contrato.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.vw_ingresos_campo_santo_contrato_base_pre_mora') IS NULL
     OR to_regclass('public.vw_ingresos_campo_santo_movimiento_desglose') IS NULL
  THEN
    RAISE EXCEPTION
      'Falta aplicar 202608040002_add_moratory_interest_to_ingresos.sql';
  END IF;

  IF to_regclass('public.contrato_mantenimiento_cargo') IS NULL
     OR to_regclass(
       'public.contrato_mantenimiento_interes_moratorio_calculo'
     ) IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'contrato_mantenimiento_pago'
         AND column_name = 'tipo_pago'
     )
  THEN
    RAISE EXCEPTION
      'Falta aplicar 202608110002_add_maintenance_moratory_interest.sql';
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.vw_ingresos_campo_santo_movimiento_desglose AS
WITH aplicacion_resumen AS (
  SELECT
    aplicacion.id_pago,
    COALESCE(
      SUM(aplicacion.monto_capital) FILTER (
        WHERE cargo.tipo_cargo IS DISTINCT FROM 'INTERES_MORATORIO'
      ),
      0
    )::NUMERIC(14,2) AS capital,
    COALESCE(
      SUM(aplicacion.monto_interes) FILTER (
        WHERE cargo.tipo_cargo IS DISTINCT FROM 'INTERES_MORATORIO'
      ),
      0
    )::NUMERIC(14,2) AS interes_financiero,
    COALESCE(
      SUM(
        aplicacion.monto_interes
        + aplicacion.monto_capital
        + aplicacion.monto_otros
      ) FILTER (WHERE cargo.tipo_cargo = 'INTERES_MORATORIO'),
      0
    )::NUMERIC(14,2) AS mora,
    COALESCE(
      SUM(aplicacion.monto_otros) FILTER (
        WHERE cargo.tipo_cargo IS DISTINCT FROM 'INTERES_MORATORIO'
      ),
      0
    )::NUMERIC(14,2) AS otros
  FROM public.contrato_pago_aplicacion AS aplicacion
  LEFT JOIN public.contrato_cargo AS cargo
    ON cargo.id_cargo = aplicacion.id_cargo
  GROUP BY aplicacion.id_pago
)
SELECT
  pago.id_contrato,
  pago.id_pago,
  'CONTRATO'::TEXT AS origen,
  (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE AS fecha_pago,
  NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago,
  pago.monto_total::NUMERIC(14,2) AS total,
  COALESCE(aplicacion.capital, 0)::NUMERIC(14,2) AS capital,
  COALESCE(aplicacion.interes_financiero, 0)::NUMERIC(14,2) AS interes_financiero,
  COALESCE(aplicacion.mora, 0)::NUMERIC(14,2) AS mora,
  COALESCE(aplicacion.otros, 0)::NUMERIC(14,2) AS otros,
  0::NUMERIC(14,2) AS mantenimiento,
  1::BIGINT AS pagos,
  0::NUMERIC(14,2) AS mantenimiento_principal,
  0::NUMERIC(14,2) AS mora_mantenimiento
FROM public.contrato_pago AS pago
LEFT JOIN aplicacion_resumen AS aplicacion
  ON aplicacion.id_pago = pago.id_pago
WHERE pago.estado = 'APLICADO'

UNION ALL

SELECT
  pago.id_contrato,
  pago.id_pago_mantenimiento AS id_pago,
  'MANTENIMIENTO'::TEXT AS origen,
  (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE AS fecha_pago,
  NULLIF(TRIM(pago.metodo_pago), '') AS metodo_pago,
  pago.monto_total::NUMERIC(14,2) AS total,
  0::NUMERIC(14,2) AS capital,
  0::NUMERIC(14,2) AS interes_financiero,
  0::NUMERIC(14,2) AS mora,
  0::NUMERIC(14,2) AS otros,
  pago.monto_total::NUMERIC(14,2) AS mantenimiento,
  1::BIGINT AS pagos,
  CASE WHEN pago.tipo_pago = 'CUOTA' THEN pago.monto_total ELSE 0 END::NUMERIC(14,2)
    AS mantenimiento_principal,
  CASE WHEN pago.tipo_pago = 'MORA' THEN pago.monto_total ELSE 0 END::NUMERIC(14,2)
    AS mora_mantenimiento
FROM public.contrato_mantenimiento_pago AS pago
WHERE pago.estado = 'APLICADO';

COMMENT ON VIEW public.vw_ingresos_campo_santo_movimiento_desglose IS
  'Clasifica cada pago una sola vez. Mantenimiento conserva el total del recibo y se desglosa en principal o mora.';

REVOKE ALL ON TABLE public.vw_ingresos_campo_santo_movimiento_desglose
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.vw_ingresos_campo_santo_contrato_base AS
WITH cargo_resumen AS (
  SELECT
    cargo.id_contrato,
    COALESCE(
      SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
        WHERE cargo.tipo_cargo = 'INTERES_MORATORIO'
          AND cargo.estado IN ('PENDIENTE', 'PARCIAL')
      ),
      0
    )::NUMERIC(14,2) AS mora_pendiente,
    COALESCE(
      SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
        WHERE cargo.tipo_cargo IS DISTINCT FROM 'INTERES_MORATORIO'
          AND cargo.estado IN ('PENDIENTE', 'PARCIAL')
      ),
      0
    )::NUMERIC(14,2) AS otros_cargos_pendientes
  FROM public.contrato_cargo AS cargo
  GROUP BY cargo.id_contrato
),
pago_historico AS (
  SELECT
    movimiento.id_contrato,
    COALESCE(SUM(movimiento.mora), 0)::NUMERIC(14,2) AS mora_cobrada_historica,
    COALESCE(SUM(movimiento.otros), 0)::NUMERIC(14,2) AS otros_cobrados_historico
  FROM public.vw_ingresos_campo_santo_movimiento_desglose AS movimiento
  WHERE movimiento.origen = 'CONTRATO'
  GROUP BY movimiento.id_contrato
),
mora_generada AS (
  SELECT
    calculo.id_contrato,
    COALESCE(
      SUM(calculo.monto_generado) FILTER (WHERE calculo.estado = 'GENERADO'),
      0
    )::NUMERIC(14,2) AS mora_generada_historica,
    MAX(calculo.fecha_corte) FILTER (WHERE calculo.estado = 'GENERADO') AS ultimo_corte_mora
  FROM public.contrato_interes_moratorio_calculo AS calculo
  GROUP BY calculo.id_contrato
),
mantenimiento_cargo_resumen AS (
  SELECT
    cargo.id_contrato,
    COALESCE(
      SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
        WHERE cargo.tipo_cargo = 'INTERES_MORATORIO'
          AND cargo.estado IN ('PENDIENTE', 'PARCIAL')
      ),
      0
    )::NUMERIC(14,2) AS mora_mantenimiento_pendiente
  FROM public.contrato_mantenimiento_cargo AS cargo
  GROUP BY cargo.id_contrato
),
mantenimiento_principal_vencido AS (
  SELECT
    cuota.id_contrato,
    COALESCE(
      SUM(GREATEST(cuota.monto_programado - cuota.monto_pagado, 0)) FILTER (
        WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
          AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE >= (
            date_trunc('month', cuota.fecha_vencimiento)::DATE
            + INTERVAL '1 month'
          )::DATE
      ),
      0
    )::NUMERIC(14,2) AS principal_vencido
  FROM public.contrato_mantenimiento_cuota AS cuota
  GROUP BY cuota.id_contrato
),
mantenimiento_mora_generada AS (
  SELECT
    calculo.id_contrato,
    COALESCE(
      SUM(calculo.monto_generado) FILTER (WHERE calculo.estado = 'GENERADO'),
      0
    )::NUMERIC(14,2) AS mora_mantenimiento_generada_historica,
    MAX(calculo.fecha_corte) FILTER (WHERE calculo.estado = 'GENERADO')
      AS ultimo_corte_mora_mantenimiento
  FROM public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
  GROUP BY calculo.id_contrato
),
mantenimiento_mora_cobrada AS (
  SELECT
    pago.id_contrato,
    COALESCE(
      SUM(pago.monto_total) FILTER (WHERE pago.tipo_pago = 'MORA'),
      0
    )::NUMERIC(14,2) AS mora_mantenimiento_cobrada_historica
  FROM public.contrato_mantenimiento_pago AS pago
  WHERE pago.estado = 'APLICADO'
  GROUP BY pago.id_contrato
)
SELECT
  base.*,
  base.interes_pendiente::NUMERIC(14,2) AS interes_financiero_pendiente,
  COALESCE(cargo.otros_cargos_pendientes, 0)::NUMERIC(14,2) AS otros_cargos_pendientes,
  COALESCE(cargo.mora_pendiente, 0)::NUMERIC(14,2) AS mora_pendiente,
  COALESCE(mora.mora_generada_historica, 0)::NUMERIC(14,2) AS mora_generada_historica,
  COALESCE(pago.mora_cobrada_historica, 0)::NUMERIC(14,2) AS mora_cobrada_historica,
  COALESCE(pago.otros_cobrados_historico, 0)::NUMERIC(14,2) AS otros_cobrados_historico,
  mora.ultimo_corte_mora,
  (
    base.monto_vencido_total
    + COALESCE(cargo.mora_pendiente, 0)
  )::NUMERIC(14,2) AS total_vencido_con_mora,
  COALESCE(mantenimiento_cargo.mora_mantenimiento_pendiente, 0)::NUMERIC(14,2)
    AS mora_mantenimiento_pendiente,
  COALESCE(mantenimiento_generada.mora_mantenimiento_generada_historica, 0)::NUMERIC(14,2)
    AS mora_mantenimiento_generada_historica,
  COALESCE(mantenimiento_cobrada.mora_mantenimiento_cobrada_historica, 0)::NUMERIC(14,2)
    AS mora_mantenimiento_cobrada_historica,
  mantenimiento_generada.ultimo_corte_mora_mantenimiento,
  (
    base.mantenimiento_pendiente
    + COALESCE(mantenimiento_cargo.mora_mantenimiento_pendiente, 0)
  )::NUMERIC(14,2) AS total_mantenimiento_pendiente,
  (
    COALESCE(mantenimiento_vencido.principal_vencido, 0)
    + COALESCE(mantenimiento_cargo.mora_mantenimiento_pendiente, 0)
  )::NUMERIC(14,2) AS total_mantenimiento_vencido_con_mora
FROM public.vw_ingresos_campo_santo_contrato_base_pre_mora AS base
LEFT JOIN cargo_resumen AS cargo
  ON cargo.id_contrato = base.id_contrato
LEFT JOIN pago_historico AS pago
  ON pago.id_contrato = base.id_contrato
LEFT JOIN mora_generada AS mora
  ON mora.id_contrato = base.id_contrato
LEFT JOIN mantenimiento_cargo_resumen AS mantenimiento_cargo
  ON mantenimiento_cargo.id_contrato = base.id_contrato
LEFT JOIN mantenimiento_principal_vencido AS mantenimiento_vencido
  ON mantenimiento_vencido.id_contrato = base.id_contrato
LEFT JOIN mantenimiento_mora_generada AS mantenimiento_generada
  ON mantenimiento_generada.id_contrato = base.id_contrato
LEFT JOIN mantenimiento_mora_cobrada AS mantenimiento_cobrada
  ON mantenimiento_cobrada.id_contrato = base.id_contrato;

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.interes_financiero_pendiente IS
  'Interes financiero incluido en cuotas; no incluye interes moratorio.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.mora_pendiente IS
  'Saldo pendiente de cargos INTERES_MORATORIO.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.mora_generada_historica IS
  'Total de mora generada por calculos vigentes; excluye calculos anulados y SIN_CARGO.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.otros_cobrados_historico IS
  'Otros cobros aplicados al contrato; excluye pagos de interes moratorio.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.total_vencido_con_mora IS
  'Cuotas vencidas del contrato mas mora pendiente; no incluye mantenimiento.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.mora_mantenimiento_pendiente IS
  'Interes moratorio de mantenimiento pendiente, separado de la mora del contrato.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.total_mantenimiento_pendiente IS
  'Principal de mantenimiento pendiente mas su mora pendiente.';

COMMENT ON COLUMN public.vw_ingresos_campo_santo_contrato_base.total_mantenimiento_vencido_con_mora IS
  'Principal vencido de mantenimiento mas su mora pendiente.';

REVOKE ALL ON TABLE public.vw_ingresos_campo_santo_contrato_base_pre_mora
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.vw_ingresos_campo_santo_contrato_base
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.filtrar_ingresos_campo_santo_contratos(
  p_estado_contrato TEXT DEFAULT 'VIGENTE',
  p_cliente TEXT DEFAULT NULL,
  p_id_vendedor INT DEFAULT NULL,
  p_tipo_producto TEXT DEFAULT NULL,
  p_solo_con_vencidas BOOLEAN DEFAULT NULL,
  p_solo_con_saldo BOOLEAN DEFAULT NULL
)
RETURNS SETOF public.vw_ingresos_campo_santo_contrato_base
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT base.*
  FROM public.vw_ingresos_campo_santo_contrato_base AS base
  WHERE (
      NULLIF(UPPER(TRIM(COALESCE(p_estado_contrato, ''))), '') IS NULL
      OR UPPER(TRIM(p_estado_contrato)) = 'TODOS'
      OR base.estado_contrato::TEXT = UPPER(TRIM(p_estado_contrato))
    )
    AND (
      NULLIF(TRIM(COALESCE(p_cliente, '')), '') IS NULL
      OR base.cliente_nombre ILIKE '%' || TRIM(p_cliente) || '%'
      OR base.numero_contrato ILIKE '%' || TRIM(p_cliente) || '%'
      OR base.numero_formulario ILIKE '%' || TRIM(p_cliente) || '%'
    )
    AND (p_id_vendedor IS NULL OR base.id_vendedor = p_id_vendedor)
    AND (
      NULLIF(UPPER(TRIM(COALESCE(p_tipo_producto, ''))), '') IS NULL
      OR UPPER(TRIM(p_tipo_producto)) = 'TODOS'
      OR EXISTS (
        SELECT 1
        FROM public.contrato_producto AS producto
        WHERE producto.id_contrato = base.id_contrato
          AND producto.tipo_producto::TEXT = UPPER(TRIM(p_tipo_producto))
      )
    )
    AND (
      p_solo_con_vencidas IS NULL
      OR (
        p_solo_con_vencidas
        AND (
          base.total_vencido_con_mora > 0
          OR base.total_mantenimiento_vencido_con_mora > 0
        )
      )
      OR (
        NOT p_solo_con_vencidas
        AND base.total_vencido_con_mora <= 0
        AND base.total_mantenimiento_vencido_con_mora <= 0
      )
    )
    AND (
      p_solo_con_saldo IS NULL
      OR (
        p_solo_con_saldo
        AND (base.saldo_pendiente_total + base.total_mantenimiento_pendiente) > 0
      )
      OR (
        NOT p_solo_con_saldo
        AND (base.saldo_pendiente_total + base.total_mantenimiento_pendiente) <= 0
      )
    );
$$;

REVOKE ALL ON FUNCTION public.filtrar_ingresos_campo_santo_contratos(
  TEXT, TEXT, INT, TEXT, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.obtener_ingresos_campo_santo_detalle(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, INT, TEXT, TEXT
);

CREATE FUNCTION public.obtener_ingresos_campo_santo_detalle(
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
  tipo_plan TEXT,
  mora_cobrada_periodo NUMERIC(14,2),
  mora_pendiente NUMERIC(14,2),
  mora_generada_historica NUMERIC(14,2),
  mora_cobrada_historica NUMERIC(14,2),
  total_vencido_con_mora NUMERIC(14,2),
  mantenimiento_principal_cobrado_periodo NUMERIC(14,2),
  mora_mantenimiento_cobrada_periodo NUMERIC(14,2),
  mora_mantenimiento_pendiente NUMERIC(14,2),
  total_mantenimiento_pendiente NUMERIC(14,2),
  total_mantenimiento_vencido_con_mora NUMERIC(14,2),
  mora_mantenimiento_generada_historica NUMERIC(14,2),
  mora_mantenimiento_cobrada_historica NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 1000);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_metodo_pago TEXT := NULLIF(TRIM(COALESCE(p_metodo_pago, '')), '');
  v_orden_columna TEXT := LOWER(TRIM(COALESCE(p_orden_columna, 'fecha_firma')));
  v_orden_direccion TEXT := CASE
    WHEN LOWER(TRIM(COALESCE(p_orden_direccion, 'desc'))) = 'asc' THEN 'asc'
    ELSE 'desc'
  END;
BEGIN
  IF p_fecha_desde IS NOT NULL
    AND p_fecha_hasta IS NOT NULL
    AND p_fecha_hasta < p_fecha_desde
  THEN
    RAISE EXCEPTION 'La fecha hasta no puede ser menor que la fecha desde';
  END IF;

  PERFORM public.assert_ingresos_campo_santo_admin();

  RETURN QUERY
  WITH movimientos_periodo AS (
    SELECT
      movimiento.id_contrato,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS total_periodo,
      COALESCE(SUM(movimiento.total - movimiento.mantenimiento), 0)::NUMERIC(14,2) AS total_contrato_periodo,
      COALESCE(SUM(movimiento.mantenimiento), 0)::NUMERIC(14,2) AS mantenimiento_periodo,
      COALESCE(SUM(movimiento.mantenimiento_principal), 0)::NUMERIC(14,2)
        AS mantenimiento_principal_periodo,
      COALESCE(SUM(movimiento.mora_mantenimiento), 0)::NUMERIC(14,2)
        AS mora_mantenimiento_periodo,
      COALESCE(SUM(movimiento.capital), 0)::NUMERIC(14,2) AS capital_periodo,
      COALESCE(SUM(movimiento.interes_financiero), 0)::NUMERIC(14,2) AS interes_periodo,
      COALESCE(SUM(movimiento.mora), 0)::NUMERIC(14,2) AS mora_periodo,
      COALESCE(SUM(movimiento.otros), 0)::NUMERIC(14,2) AS otros_periodo,
      COALESCE(SUM(movimiento.pagos), 0)::BIGINT AS pagos_periodo,
      STRING_AGG(DISTINCT movimiento.metodo_pago, ', ' ORDER BY movimiento.metodo_pago) FILTER (
        WHERE movimiento.metodo_pago IS NOT NULL
      ) AS metodos_periodo
    FROM public.vw_ingresos_campo_santo_movimiento_desglose AS movimiento
    WHERE (p_fecha_desde IS NULL OR movimiento.fecha_pago >= p_fecha_desde)
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
      COALESCE(periodo.mantenimiento_principal_periodo, 0)::NUMERIC(14,2)
        AS mantenimiento_principal_cobrado_periodo,
      COALESCE(periodo.mora_mantenimiento_periodo, 0)::NUMERIC(14,2)
        AS mora_mantenimiento_cobrada_periodo,
      COALESCE(periodo.capital_periodo, 0)::NUMERIC(14,2) AS capital_cobrado_periodo,
      COALESCE(periodo.interes_periodo, 0)::NUMERIC(14,2) AS interes_cobrado_periodo,
      COALESCE(periodo.mora_periodo, 0)::NUMERIC(14,2) AS mora_cobrada_periodo,
      COALESCE(periodo.otros_periodo, 0)::NUMERIC(14,2) AS otros_cobrados_periodo,
      COALESCE(periodo.pagos_periodo, 0)::BIGINT AS total_pagos_periodo,
      COALESCE(periodo.metodos_periodo, base.metodos_pago) AS metodos_pago_visibles
    FROM public.filtrar_ingresos_campo_santo_contratos(
      p_estado_contrato,
      p_cliente,
      p_id_vendedor,
      p_tipo_producto,
      p_solo_con_vencidas,
      p_solo_con_saldo
    ) AS base
    LEFT JOIN movimientos_periodo AS periodo
      ON periodo.id_contrato = base.id_contrato
    WHERE v_metodo_pago IS NULL OR periodo.id_contrato IS NOT NULL
  )
  SELECT
    COUNT(*) OVER()::BIGINT,
    filtrado.id_contrato,
    filtrado.numero_contrato::TEXT,
    filtrado.numero_formulario::TEXT,
    filtrado.cliente_nombre::TEXT,
    filtrado.id_vendedor,
    filtrado.vendedor_nombre::TEXT,
    filtrado.estado_contrato::TEXT,
    filtrado.fecha_firma,
    COALESCE(filtrado.plan_fecha_primera_cuota, filtrado.fecha_primera_cuota),
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
    filtrado.interes_financiero_pendiente,
    (filtrado.otros_pendientes_cuotas + filtrado.otros_cargos_pendientes)::NUMERIC(14,2),
    filtrado.mantenimiento_pendiente,
    filtrado.monto_vencido_total,
    filtrado.cuotas_totales,
    filtrado.cuotas_pagadas,
    filtrado.cuotas_pendientes,
    filtrado.cuotas_vencidas,
    CASE
      WHEN filtrado.total_mantenimiento_pendiente > 0 THEN 1
      ELSE 0
    END::INT,
    CASE
      WHEN filtrado.total_mantenimiento_vencido_con_mora > 0 THEN 1
      ELSE 0
    END::INT,
    filtrado.proximo_pago,
    filtrado.ultimo_pago,
    filtrado.total_pagos_periodo,
    filtrado.metodos_pago_visibles::TEXT,
    filtrado.tipo_plan::TEXT,
    filtrado.mora_cobrada_periodo,
    filtrado.mora_pendiente,
    filtrado.mora_generada_historica,
    filtrado.mora_cobrada_historica,
    filtrado.total_vencido_con_mora,
    filtrado.mantenimiento_principal_cobrado_periodo,
    filtrado.mora_mantenimiento_cobrada_periodo,
    filtrado.mora_mantenimiento_pendiente,
    filtrado.total_mantenimiento_pendiente,
    filtrado.total_mantenimiento_vencido_con_mora,
    filtrado.mora_mantenimiento_generada_historica,
    filtrado.mora_mantenimiento_cobrada_historica
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

DROP FUNCTION IF EXISTS public.obtener_ingresos_campo_santo_resumen(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
);

CREATE FUNCTION public.obtener_ingresos_campo_santo_resumen(
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
  ingreso_anio_actual NUMERIC(14,2),
  mora_cobrada_periodo NUMERIC(14,2),
  mora_pendiente NUMERIC(14,2),
  mora_generada_historica NUMERIC(14,2),
  mora_cobrada_historica NUMERIC(14,2),
  total_vencido_con_mora NUMERIC(14,2),
  mantenimiento_principal_cobrado_periodo NUMERIC(14,2),
  mora_mantenimiento_cobrada_periodo NUMERIC(14,2),
  mora_mantenimiento_pendiente NUMERIC(14,2),
  total_mantenimiento_pendiente NUMERIC(14,2),
  total_mantenimiento_vencido_con_mora NUMERIC(14,2),
  mora_mantenimiento_generada_historica NUMERIC(14,2),
  mora_mantenimiento_cobrada_historica NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metodo_pago TEXT := NULLIF(TRIM(COALESCE(p_metodo_pago, '')), '');
BEGIN
  IF p_fecha_desde IS NOT NULL
    AND p_fecha_hasta IS NOT NULL
    AND p_fecha_hasta < p_fecha_desde
  THEN
    RAISE EXCEPTION 'La fecha hasta no puede ser menor que la fecha desde';
  END IF;

  PERFORM public.assert_ingresos_campo_santo_admin();

  RETURN QUERY
  WITH movimientos_periodo AS (
    SELECT
      movimiento.id_contrato,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS total_periodo,
      COALESCE(SUM(movimiento.total - movimiento.mantenimiento), 0)::NUMERIC(14,2) AS total_contrato_periodo,
      COALESCE(SUM(movimiento.mantenimiento), 0)::NUMERIC(14,2) AS mantenimiento_periodo,
      COALESCE(SUM(movimiento.mantenimiento_principal), 0)::NUMERIC(14,2)
        AS mantenimiento_principal_periodo,
      COALESCE(SUM(movimiento.mora_mantenimiento), 0)::NUMERIC(14,2)
        AS mora_mantenimiento_periodo,
      COALESCE(SUM(movimiento.capital), 0)::NUMERIC(14,2) AS capital_periodo,
      COALESCE(SUM(movimiento.interes_financiero), 0)::NUMERIC(14,2) AS interes_periodo,
      COALESCE(SUM(movimiento.mora), 0)::NUMERIC(14,2) AS mora_periodo,
      COALESCE(SUM(movimiento.otros), 0)::NUMERIC(14,2) AS otros_periodo,
      COALESCE(SUM(movimiento.pagos), 0)::BIGINT AS pagos_periodo
    FROM public.vw_ingresos_campo_santo_movimiento_desglose AS movimiento
    WHERE (p_fecha_desde IS NULL OR movimiento.fecha_pago >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR movimiento.fecha_pago <= p_fecha_hasta)
      AND (v_metodo_pago IS NULL OR movimiento.metodo_pago = v_metodo_pago)
    GROUP BY movimiento.id_contrato
  ),
  movimientos_mes_actual AS (
    SELECT
      movimiento.id_contrato,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS total_mes
    FROM public.vw_ingresos_campo_santo_movimiento_desglose AS movimiento
    WHERE movimiento.fecha_pago >= DATE_TRUNC(
        'month',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE
      )::DATE
      AND movimiento.fecha_pago < (
        DATE_TRUNC(
          'month',
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE
        )::DATE + INTERVAL '1 month'
      )::DATE
      AND (p_fecha_desde IS NULL OR movimiento.fecha_pago >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR movimiento.fecha_pago <= p_fecha_hasta)
      AND (v_metodo_pago IS NULL OR movimiento.metodo_pago = v_metodo_pago)
    GROUP BY movimiento.id_contrato
  ),
  movimientos_anio_actual AS (
    SELECT
      movimiento.id_contrato,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS total_anio
    FROM public.vw_ingresos_campo_santo_movimiento_desglose AS movimiento
    WHERE movimiento.fecha_pago >= DATE_TRUNC(
        'year',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE
      )::DATE
      AND movimiento.fecha_pago < (
        DATE_TRUNC(
          'year',
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE
        )::DATE + INTERVAL '1 year'
      )::DATE
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
      COALESCE(periodo.mantenimiento_principal_periodo, 0)::NUMERIC(14,2)
        AS mantenimiento_principal_cobrado_periodo,
      COALESCE(periodo.mora_mantenimiento_periodo, 0)::NUMERIC(14,2)
        AS mora_mantenimiento_cobrada_periodo,
      COALESCE(periodo.capital_periodo, 0)::NUMERIC(14,2) AS capital_cobrado_periodo,
      COALESCE(periodo.interes_periodo, 0)::NUMERIC(14,2) AS interes_cobrado_periodo,
      COALESCE(periodo.mora_periodo, 0)::NUMERIC(14,2) AS mora_cobrada_periodo,
      COALESCE(periodo.otros_periodo, 0)::NUMERIC(14,2) AS otros_cobrados_periodo,
      COALESCE(periodo.pagos_periodo, 0)::BIGINT AS total_pagos_periodo,
      COALESCE(mes.total_mes, 0)::NUMERIC(14,2) AS ingreso_mes_actual,
      COALESCE(anio.total_anio, 0)::NUMERIC(14,2) AS ingreso_anio_actual
    FROM public.filtrar_ingresos_campo_santo_contratos(
      p_estado_contrato,
      p_cliente,
      p_id_vendedor,
      p_tipo_producto,
      p_solo_con_vencidas,
      p_solo_con_saldo
    ) AS base
    LEFT JOIN movimientos_periodo AS periodo
      ON periodo.id_contrato = base.id_contrato
    LEFT JOIN movimientos_mes_actual AS mes
      ON mes.id_contrato = base.id_contrato
    LEFT JOIN movimientos_anio_actual AS anio
      ON anio.id_contrato = base.id_contrato
    WHERE v_metodo_pago IS NULL OR periodo.id_contrato IS NOT NULL
  ),
  agregado AS (
    SELECT
      COUNT(*)::BIGINT AS contratos_filtrados,
      COUNT(*) FILTER (WHERE filtrado.id_plan_pago IS NOT NULL)::BIGINT AS contratos_con_plan,
      COUNT(*) FILTER (
        WHERE filtrado.total_vencido_con_mora > 0
          OR filtrado.total_mantenimiento_vencido_con_mora > 0
      )::BIGINT AS contratos_con_vencidas,
      COUNT(*) FILTER (
        WHERE (filtrado.saldo_pendiente_total + filtrado.total_mantenimiento_pendiente) > 0
      )::BIGINT AS contratos_con_saldo,
      COALESCE(SUM(filtrado.monto_contratado), 0)::NUMERIC(14,2) AS monto_total_contratado,
      COALESCE(SUM(filtrado.total_pagado_periodo), 0)::NUMERIC(14,2) AS total_recaudado_periodo,
      COALESCE(SUM(filtrado.total_pagado_historico), 0)::NUMERIC(14,2) AS total_recaudado_historico,
      COALESCE(SUM(filtrado.total_pagado_contrato_periodo), 0)::NUMERIC(14,2) AS total_recaudado_contratos_periodo,
      COALESCE(SUM(filtrado.mantenimiento_cobrado_periodo), 0)::NUMERIC(14,2) AS mantenimiento_recaudado_periodo,
      COALESCE(SUM(filtrado.capital_cobrado_periodo), 0)::NUMERIC(14,2) AS capital_cobrado_periodo,
      COALESCE(SUM(filtrado.interes_cobrado_periodo), 0)::NUMERIC(14,2) AS interes_cobrado_periodo,
      COALESCE(SUM(filtrado.mora_cobrada_periodo), 0)::NUMERIC(14,2) AS mora_cobrada_periodo,
      COALESCE(SUM(filtrado.otros_cobrados_periodo), 0)::NUMERIC(14,2) AS otros_cobrados_periodo,
      COALESCE(SUM(filtrado.saldo_pendiente_total), 0)::NUMERIC(14,2) AS saldo_pendiente_total,
      COALESCE(SUM(filtrado.capital_pendiente), 0)::NUMERIC(14,2) AS capital_pendiente,
      COALESCE(SUM(filtrado.interes_financiero_pendiente), 0)::NUMERIC(14,2) AS interes_pendiente,
      COALESCE(SUM(filtrado.otros_pendientes_cuotas + filtrado.otros_cargos_pendientes), 0)::NUMERIC(14,2) AS otros_pendientes,
      COALESCE(SUM(filtrado.mantenimiento_pendiente), 0)::NUMERIC(14,2) AS mantenimiento_pendiente,
      COALESCE(SUM(filtrado.monto_vencido_total), 0)::NUMERIC(14,2) AS monto_vencido_total,
      COALESCE(SUM(filtrado.total_vencido_con_mora), 0)::NUMERIC(14,2) AS total_vencido_con_mora,
      COALESCE(SUM(filtrado.mora_pendiente), 0)::NUMERIC(14,2) AS mora_pendiente,
      COALESCE(SUM(filtrado.mora_generada_historica), 0)::NUMERIC(14,2) AS mora_generada_historica,
      COALESCE(SUM(filtrado.mora_cobrada_historica), 0)::NUMERIC(14,2) AS mora_cobrada_historica,
      COALESCE(SUM(filtrado.mantenimiento_principal_cobrado_periodo), 0)::NUMERIC(14,2)
        AS mantenimiento_principal_cobrado_periodo,
      COALESCE(SUM(filtrado.mora_mantenimiento_cobrada_periodo), 0)::NUMERIC(14,2)
        AS mora_mantenimiento_cobrada_periodo,
      COALESCE(SUM(filtrado.mora_mantenimiento_pendiente), 0)::NUMERIC(14,2)
        AS mora_mantenimiento_pendiente,
      COALESCE(SUM(filtrado.total_mantenimiento_pendiente), 0)::NUMERIC(14,2)
        AS total_mantenimiento_pendiente,
      COALESCE(SUM(filtrado.total_mantenimiento_vencido_con_mora), 0)::NUMERIC(14,2)
        AS total_mantenimiento_vencido_con_mora,
      COALESCE(SUM(filtrado.mora_mantenimiento_generada_historica), 0)::NUMERIC(14,2)
        AS mora_mantenimiento_generada_historica,
      COALESCE(SUM(filtrado.mora_mantenimiento_cobrada_historica), 0)::NUMERIC(14,2)
        AS mora_mantenimiento_cobrada_historica,
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
    agregado.ingreso_anio_actual,
    agregado.mora_cobrada_periodo,
    agregado.mora_pendiente,
    agregado.mora_generada_historica,
    agregado.mora_cobrada_historica,
    agregado.total_vencido_con_mora,
    agregado.mantenimiento_principal_cobrado_periodo,
    agregado.mora_mantenimiento_cobrada_periodo,
    agregado.mora_mantenimiento_pendiente,
    agregado.total_mantenimiento_pendiente,
    agregado.total_mantenimiento_vencido_con_mora,
    agregado.mora_mantenimiento_generada_historica,
    agregado.mora_mantenimiento_cobrada_historica
  FROM agregado;
END;
$$;

DROP FUNCTION IF EXISTS public.obtener_ingresos_campo_santo_series_mensuales(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
);

CREATE FUNCTION public.obtener_ingresos_campo_santo_series_mensuales(
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
  mora_cobrada NUMERIC(14,2),
  otros_cobrados NUMERIC(14,2),
  pagos_registrados BIGINT,
  mantenimiento_principal_cobrado NUMERIC(14,2),
  mora_mantenimiento_cobrada NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metodo_pago TEXT := NULLIF(TRIM(COALESCE(p_metodo_pago, '')), '');
  v_hoy_cr DATE := (
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  )::DATE;
  v_fecha_desde DATE := COALESCE(
    p_fecha_desde,
    DATE_TRUNC('year', v_hoy_cr)::DATE
  );
  v_fecha_hasta DATE := COALESCE(p_fecha_hasta, v_hoy_cr);
BEGIN
  PERFORM public.assert_ingresos_campo_santo_admin();

  IF v_fecha_hasta < v_fecha_desde THEN
    RAISE EXCEPTION 'La fecha hasta no puede ser menor que la fecha desde';
  END IF;

  RETURN QUERY
  WITH contratos_filtrados AS (
    SELECT base.id_contrato
    FROM public.filtrar_ingresos_campo_santo_contratos(
      p_estado_contrato,
      p_cliente,
      p_id_vendedor,
      p_tipo_producto,
      p_solo_con_vencidas,
      p_solo_con_saldo
    ) AS base
  ),
  agregado AS (
    SELECT
      DATE_TRUNC('month', movimiento.fecha_pago)::DATE AS periodo,
      COALESCE(SUM(movimiento.total - movimiento.mantenimiento), 0)::NUMERIC(14,2) AS ingreso_contratos,
      COALESCE(SUM(movimiento.mantenimiento), 0)::NUMERIC(14,2) AS ingreso_mantenimiento,
      COALESCE(SUM(movimiento.total), 0)::NUMERIC(14,2) AS ingreso_total,
      COALESCE(SUM(movimiento.capital), 0)::NUMERIC(14,2) AS capital_cobrado,
      COALESCE(SUM(movimiento.interes_financiero), 0)::NUMERIC(14,2) AS interes_cobrado,
      COALESCE(SUM(movimiento.mora), 0)::NUMERIC(14,2) AS mora_cobrada,
      COALESCE(SUM(movimiento.otros), 0)::NUMERIC(14,2) AS otros_cobrados,
      COALESCE(SUM(movimiento.pagos), 0)::BIGINT AS pagos_registrados,
      COALESCE(SUM(movimiento.mantenimiento_principal), 0)::NUMERIC(14,2)
        AS mantenimiento_principal_cobrado,
      COALESCE(SUM(movimiento.mora_mantenimiento), 0)::NUMERIC(14,2)
        AS mora_mantenimiento_cobrada
    FROM public.vw_ingresos_campo_santo_movimiento_desglose AS movimiento
    JOIN contratos_filtrados AS contrato
      ON contrato.id_contrato = movimiento.id_contrato
    WHERE movimiento.fecha_pago >= v_fecha_desde
      AND movimiento.fecha_pago <= v_fecha_hasta
      AND (v_metodo_pago IS NULL OR movimiento.metodo_pago = v_metodo_pago)
    GROUP BY DATE_TRUNC('month', movimiento.fecha_pago)::DATE
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
    COALESCE(agregado.mora_cobrada, 0)::NUMERIC(14,2),
    COALESCE(agregado.otros_cobrados, 0)::NUMERIC(14,2),
    COALESCE(agregado.pagos_registrados, 0)::BIGINT,
    COALESCE(agregado.mantenimiento_principal_cobrado, 0)::NUMERIC(14,2),
    COALESCE(agregado.mora_mantenimiento_cobrada, 0)::NUMERIC(14,2)
  FROM meses
  LEFT JOIN agregado
    ON agregado.periodo = meses.periodo
  ORDER BY meses.periodo;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_ingresos_campo_santo_detalle(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, INT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.obtener_ingresos_campo_santo_resumen(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.obtener_ingresos_campo_santo_series_mensuales(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_ingresos_campo_santo_detalle(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, INT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_ingresos_campo_santo_resumen(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_ingresos_campo_santo_series_mensuales(
  DATE, DATE, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BOOLEAN
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
