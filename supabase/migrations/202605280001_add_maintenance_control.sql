ALTER TABLE public.contrato
  ADD COLUMN IF NOT EXISTS fecha_inicio_mantenimiento DATE;

UPDATE public.contrato
SET fecha_inicio_mantenimiento = make_date(anio_inicio_mantenimiento::INT, 1, 1)
WHERE fecha_inicio_mantenimiento IS NULL
  AND anio_inicio_mantenimiento IS NOT NULL
  AND anio_inicio_mantenimiento BETWEEN 1900 AND 9999;

CREATE TABLE IF NOT EXISTS public.contrato_mantenimiento_cuota (
  id_cuota_mantenimiento BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  numero_periodo INT NOT NULL,
  fecha_inicio_periodo DATE NOT NULL,
  fecha_fin_periodo DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  monto_programado NUMERIC(14,2) NOT NULL,
  monto_pagado NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  fecha_ultimo_pago TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contrato_mantenimiento_pago (
  id_pago_mantenimiento BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  fecha_pago TIMESTAMPTZ NOT NULL,
  monto_total NUMERIC(14,2) NOT NULL,
  metodo_pago VARCHAR(40),
  referencia TEXT,
  observacion TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'APLICADO',
  registrado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contrato_mantenimiento_pago_aplicacion (
  id_aplicacion_mantenimiento BIGSERIAL PRIMARY KEY,
  id_pago_mantenimiento BIGINT NOT NULL REFERENCES public.contrato_mantenimiento_pago (id_pago_mantenimiento) ON DELETE CASCADE,
  id_cuota_mantenimiento BIGINT NOT NULL REFERENCES public.contrato_mantenimiento_cuota (id_cuota_mantenimiento) ON DELETE RESTRICT,
  monto_aplicado NUMERIC(14,2) NOT NULL,
  notas TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_contrato_mantenimiento_cuota_periodo'
      AND conrelid = 'public.contrato_mantenimiento_cuota'::regclass
  ) THEN
    ALTER TABLE public.contrato_mantenimiento_cuota
      ADD CONSTRAINT uq_contrato_mantenimiento_cuota_periodo
      UNIQUE (id_contrato, numero_periodo);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_mantenimiento_cuota_periodo'
      AND conrelid = 'public.contrato_mantenimiento_cuota'::regclass
  ) THEN
    ALTER TABLE public.contrato_mantenimiento_cuota
      ADD CONSTRAINT chk_contrato_mantenimiento_cuota_periodo
      CHECK (
        numero_periodo > 0
        AND fecha_fin_periodo >= fecha_inicio_periodo
        AND monto_programado >= 0
        AND monto_pagado >= 0
        AND estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_mantenimiento_pago_estado'
      AND conrelid = 'public.contrato_mantenimiento_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_mantenimiento_pago
      ADD CONSTRAINT chk_contrato_mantenimiento_pago_estado
      CHECK (estado IN ('APLICADO', 'ANULADO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_mantenimiento_pago_monto'
      AND conrelid = 'public.contrato_mantenimiento_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_mantenimiento_pago
      ADD CONSTRAINT chk_contrato_mantenimiento_pago_monto
      CHECK (monto_total > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_mantenimiento_pago_aplicacion_monto'
      AND conrelid = 'public.contrato_mantenimiento_pago_aplicacion'::regclass
  ) THEN
    ALTER TABLE public.contrato_mantenimiento_pago_aplicacion
      ADD CONSTRAINT chk_contrato_mantenimiento_pago_aplicacion_monto
      CHECK (monto_aplicado > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contrato_mantenimiento_cuota_contrato_vencimiento
  ON public.contrato_mantenimiento_cuota (id_contrato, fecha_vencimiento, numero_periodo);

CREATE INDEX IF NOT EXISTS idx_contrato_mantenimiento_cuota_estado_vencimiento
  ON public.contrato_mantenimiento_cuota (estado, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_contrato_mantenimiento_pago_contrato_fecha
  ON public.contrato_mantenimiento_pago (id_contrato, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS idx_contrato_mantenimiento_pago_aplicacion_pago
  ON public.contrato_mantenimiento_pago_aplicacion (id_pago_mantenimiento);

CREATE OR REPLACE FUNCTION public.sumar_meses_respetando_dia(
  p_fecha_base DATE,
  p_meses INT
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_inicio_mes DATE;
  v_ultimo_dia DATE;
  v_dia_base INT;
  v_dia_final INT;
BEGIN
  IF p_fecha_base IS NULL THEN
    RAISE EXCEPTION 'La fecha base es obligatoria';
  END IF;

  IF p_meses IS NULL THEN
    RAISE EXCEPTION 'La cantidad de meses es obligatoria';
  END IF;

  v_inicio_mes := (
    date_trunc('month', p_fecha_base)::DATE
    + make_interval(months => p_meses)
  )::DATE;
  v_ultimo_dia := (date_trunc('month', v_inicio_mes)::DATE + INTERVAL '1 month - 1 day')::DATE;
  v_dia_base := EXTRACT(DAY FROM p_fecha_base)::INT;
  v_dia_final := LEAST(v_dia_base, EXTRACT(DAY FROM v_ultimo_dia)::INT);

  RETURN make_date(
    EXTRACT(YEAR FROM v_inicio_mes)::INT,
    EXTRACT(MONTH FROM v_inicio_mes)::INT,
    v_dia_final
  );
END;
$$;

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
    v_fecha_vencimiento := v_fecha_inicio_periodo;
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
      p_hasta_fecha => public.sumar_meses_respetando_dia(CURRENT_DATE, 36),
      p_usuario => v_usuario
    );
    v_procesados := v_procesados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'contratos_procesados', v_procesados
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
  v_monto_restante NUMERIC(14,2) := ROUND(COALESCE(p_monto_total, 0)::NUMERIC, 2);
  v_aplicado_total NUMERIC(14,2) := 0;
  v_pago_cuota NUMERIC(14,2);
  rec_cuota RECORD;
BEGIN
  IF v_monto_restante <= 0 THEN
    RAISE EXCEPTION 'El monto del pago de mantenimiento debe ser mayor a cero';
  END IF;

  PERFORM 1
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
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
    v_monto_restante,
    NULLIF(TRIM(COALESCE(p_metodo_pago, '')), ''),
    NULLIF(TRIM(COALESCE(p_referencia, '')), ''),
    p_observacion,
    'APLICADO',
    v_usuario
  )
  RETURNING id_pago_mantenimiento INTO v_pago_id;

  FOR rec_cuota IN
    SELECT *
    FROM public.contrato_mantenimiento_cuota
    WHERE id_contrato = p_id_contrato
      AND estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      AND (monto_programado - monto_pagado) > 0.009
    ORDER BY fecha_vencimiento, numero_periodo
  LOOP
    EXIT WHEN v_monto_restante <= 0.009;

    v_pago_cuota := LEAST(
      v_monto_restante,
      ROUND((rec_cuota.monto_programado - rec_cuota.monto_pagado)::NUMERIC, 2)
    );
    v_monto_restante := ROUND((v_monto_restante - v_pago_cuota)::NUMERIC, 2);

    INSERT INTO public.contrato_mantenimiento_pago_aplicacion (
      id_pago_mantenimiento,
      id_cuota_mantenimiento,
      monto_aplicado,
      notas
    )
    VALUES (
      v_pago_id,
      rec_cuota.id_cuota_mantenimiento,
      v_pago_cuota,
      p_observacion
    );

    UPDATE public.contrato_mantenimiento_cuota
    SET
      monto_pagado = ROUND((monto_pagado + v_pago_cuota)::NUMERIC, 2),
      fecha_ultimo_pago = COALESCE(p_fecha_pago, NOW()),
      estado = CASE
        WHEN ROUND((monto_pagado + v_pago_cuota)::NUMERIC, 2) >= ROUND(monto_programado::NUMERIC, 2)
          THEN 'PAGADA'
        WHEN fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
        ELSE 'PARCIAL'
      END
    WHERE id_cuota_mantenimiento = rec_cuota.id_cuota_mantenimiento;

    v_aplicado_total := ROUND((v_aplicado_total + v_pago_cuota)::NUMERIC, 2);
  END LOOP;

  IF v_monto_restante > 0.009 THEN
    RAISE EXCEPTION 'El pago excede el saldo aplicable de mantenimiento del contrato % por %', p_id_contrato, v_monto_restante;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id_pago_mantenimiento', v_pago_id,
    'monto_aplicado', v_aplicado_total
  );
END;
$$;

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
cuota_resumen AS (
  SELECT
    cuota.id_contrato,
    COUNT(*)::INT AS cuotas_totales,
    COUNT(*) FILTER (WHERE cuota.estado = 'PAGADA')::INT AS cuotas_pagadas,
    COUNT(*) FILTER (WHERE cuota.estado = 'PARCIAL')::INT AS cuotas_parciales,
    COUNT(*) FILTER (
      WHERE cuota.estado = 'VENCIDA'
        OR (cuota.estado IN ('PENDIENTE', 'PARCIAL') AND cuota.fecha_vencimiento < CURRENT_DATE)
    )::INT AS cuotas_vencidas,
    COALESCE(
      SUM(GREATEST(cuota.monto_programado - cuota.monto_pagado, 0)) FILTER (
        WHERE cuota.estado = 'VENCIDA'
          OR (cuota.estado IN ('PENDIENTE', 'PARCIAL') AND cuota.fecha_vencimiento < CURRENT_DATE)
      ),
      0
    )::NUMERIC(14,2) AS monto_vencido,
    COALESCE(
      SUM(GREATEST(cuota.monto_programado - cuota.monto_pagado, 0)) FILTER (
        WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      ),
      0
    )::NUMERIC(14,2) AS total_pendiente,
    MIN(cuota.fecha_vencimiento) FILTER (
      WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    ) AS proxima_fecha_vencimiento,
    MAX(cuota.fecha_fin_periodo) FILTER (WHERE cuota.estado = 'PAGADA') AS ultimo_periodo_cubierto_hasta
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
  COALESCE(resumen.cuotas_totales, 0) AS cuotas_totales,
  COALESCE(resumen.cuotas_pagadas, 0) AS cuotas_pagadas,
  COALESCE(resumen.cuotas_parciales, 0) AS cuotas_parciales,
  COALESCE(resumen.cuotas_vencidas, 0) AS cuotas_vencidas,
  COALESCE(resumen.monto_vencido, 0)::NUMERIC(14,2) AS monto_vencido,
  COALESCE(resumen.total_pendiente, 0)::NUMERIC(14,2) AS total_pendiente,
  resumen.proxima_fecha_vencimiento,
  resumen.ultimo_periodo_cubierto_hasta
FROM contratos_elegibles AS contrato
LEFT JOIN public.cliente AS cliente
  ON cliente.id_cliente = contrato.id_cliente
LEFT JOIN cuota_resumen AS resumen
  ON resumen.id_contrato = contrato.id_contrato;

CREATE OR REPLACE VIEW public.vw_control_mantenimiento_cuotas AS
SELECT
  contrato.id_contrato,
  contrato.numero_contrato,
  contrato.numero_formulario,
  contrato.estado_contrato,
  cliente.nombre_completo AS cliente_nombre,
  contrato.fecha_inicio_mantenimiento,
  contrato.monto_mantenimiento_anual,
  cuota.id_cuota_mantenimiento,
  cuota.numero_periodo,
  cuota.fecha_inicio_periodo,
  cuota.fecha_fin_periodo,
  cuota.fecha_vencimiento,
  cuota.monto_programado,
  cuota.monto_pagado,
  cuota.estado,
  cuota.fecha_ultimo_pago,
  cuota.notas
FROM public.vw_control_mantenimiento_resumen AS contrato
JOIN public.cliente AS cliente
  ON cliente.id_cliente = contrato.id_cliente
JOIN public.contrato_mantenimiento_cuota AS cuota
  ON cuota.id_contrato = contrato.id_contrato;

GRANT EXECUTE ON FUNCTION public.sumar_meses_respetando_dia(DATE, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_cuotas_mantenimiento_contrato(INT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_cuotas_mantenimiento_vigentes(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_mantenimiento(INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT SELECT ON public.contrato_mantenimiento_pago TO authenticated;
GRANT SELECT ON public.contrato_mantenimiento_pago_aplicacion TO authenticated;
GRANT SELECT ON public.vw_control_mantenimiento_resumen TO authenticated;
GRANT SELECT ON public.vw_control_mantenimiento_cuotas TO authenticated;

SELECT public.sincronizar_cuotas_mantenimiento_vigentes('migracion');

NOTIFY pgrst, 'reload schema';
