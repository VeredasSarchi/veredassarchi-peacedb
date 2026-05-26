ALTER TABLE public.contrato
  ADD COLUMN IF NOT EXISTS fecha_primera_cuota DATE;

CREATE TABLE IF NOT EXISTS public.contrato_plan_pago (
  id_plan_pago BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  version SMALLINT NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'VIGENTE',
  tipo_plan VARCHAR(30) NOT NULL DEFAULT 'ORIGINAL',
  id_plan_anterior BIGINT NULL REFERENCES public.contrato_plan_pago (id_plan_pago) ON DELETE RESTRICT,
  fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_efectiva DATE NOT NULL,
  fecha_primera_cuota DATE NOT NULL,
  dia_pago_mensual SMALLINT NOT NULL,
  plazo_meses INT NOT NULL,
  tasa_interes_anual NUMERIC(9,6) NOT NULL,
  tasa_interes_mensual NUMERIC(12,10) NOT NULL,
  monto_principal NUMERIC(14,2) NOT NULL,
  monto_prima NUMERIC(14,2) NOT NULL DEFAULT 0,
  cuota_base NUMERIC(14,2) NOT NULL,
  saldo_inicial NUMERIC(14,2) NOT NULL,
  observaciones TEXT,
  usuario_creacion TEXT
);

CREATE TABLE IF NOT EXISTS public.contrato_cuota (
  id_cuota BIGSERIAL PRIMARY KEY,
  id_plan_pago BIGINT NOT NULL REFERENCES public.contrato_plan_pago (id_plan_pago) ON DELETE CASCADE,
  numero_cuota INT NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  saldo_inicial NUMERIC(14,2) NOT NULL,
  monto_cuota_base NUMERIC(14,2) NOT NULL,
  monto_ajuste_programado NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_cuota_total_programada NUMERIC(14,2) NOT NULL,
  monto_interes_programado NUMERIC(14,2) NOT NULL,
  monto_capital_programado NUMERIC(14,2) NOT NULL,
  saldo_final_programado NUMERIC(14,2) NOT NULL,
  capital_amortizado_acumulado NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_pagado_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_pagado_interes NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_pagado_capital NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_ultimo_pago TIMESTAMPTZ,
  numero_factura TEXT,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS public.contrato_cargo (
  id_cargo BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  id_plan_pago BIGINT NULL REFERENCES public.contrato_plan_pago (id_plan_pago) ON DELETE SET NULL,
  tipo_cargo VARCHAR(30) NOT NULL,
  descripcion TEXT,
  fecha_vencimiento DATE,
  monto_original NUMERIC(14,2) NOT NULL,
  monto_pagado NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  notas TEXT
);

CREATE TABLE IF NOT EXISTS public.contrato_pago (
  id_pago BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  fecha_pago TIMESTAMPTZ NOT NULL,
  monto_total NUMERIC(14,2) NOT NULL,
  metodo_pago VARCHAR(40),
  referencia TEXT,
  numero_factura TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'APLICADO',
  observacion TEXT,
  registrado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anulado_at TIMESTAMPTZ,
  anulado_por TEXT,
  motivo_anulacion TEXT
);

CREATE TABLE IF NOT EXISTS public.contrato_pago_aplicacion (
  id_aplicacion BIGSERIAL PRIMARY KEY,
  id_pago BIGINT NOT NULL REFERENCES public.contrato_pago (id_pago) ON DELETE CASCADE,
  id_cuota BIGINT NULL REFERENCES public.contrato_cuota (id_cuota) ON DELETE RESTRICT,
  id_cargo BIGINT NULL REFERENCES public.contrato_cargo (id_cargo) ON DELETE RESTRICT,
  monto_interes NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_capital NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_otros NUMERIC(14,2) NOT NULL DEFAULT 0,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS public.contrato_evento_financiero (
  id_evento BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  id_plan_origen BIGINT NULL REFERENCES public.contrato_plan_pago (id_plan_pago) ON DELETE SET NULL,
  id_plan_resultante BIGINT NULL REFERENCES public.contrato_plan_pago (id_plan_pago) ON DELETE SET NULL,
  tipo_evento VARCHAR(30) NOT NULL,
  fecha_evento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  observacion TEXT,
  usuario TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_plan_pago_estado'
      AND conrelid = 'public.contrato_plan_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_plan_pago
      ADD CONSTRAINT chk_contrato_plan_pago_estado
      CHECK (estado IN ('VIGENTE', 'REEMPLAZADO', 'LIQUIDADO', 'ANULADO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_plan_pago_tipo'
      AND conrelid = 'public.contrato_plan_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_plan_pago
      ADD CONSTRAINT chk_contrato_plan_pago_tipo
      CHECK (tipo_plan IN ('ORIGINAL', 'ARREGLO_PAGO', 'REESTRUCTURACION', 'BACKFILL'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_plan_pago_dia_pago'
      AND conrelid = 'public.contrato_plan_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_plan_pago
      ADD CONSTRAINT chk_contrato_plan_pago_dia_pago
      CHECK (dia_pago_mensual BETWEEN 1 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_plan_pago_plazo'
      AND conrelid = 'public.contrato_plan_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_plan_pago
      ADD CONSTRAINT chk_contrato_plan_pago_plazo
      CHECK (plazo_meses >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_plan_pago_montos'
      AND conrelid = 'public.contrato_plan_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_plan_pago
      ADD CONSTRAINT chk_contrato_plan_pago_montos
      CHECK (
        tasa_interes_anual >= 0
        AND tasa_interes_mensual >= 0
        AND monto_principal >= 0
        AND monto_prima >= 0
        AND cuota_base >= 0
        AND saldo_inicial >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_contrato_plan_pago_version'
      AND conrelid = 'public.contrato_plan_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_plan_pago
      ADD CONSTRAINT uq_contrato_plan_pago_version
      UNIQUE (id_contrato, version);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_cuota_estado'
      AND conrelid = 'public.contrato_cuota'::regclass
  ) THEN
    ALTER TABLE public.contrato_cuota
      ADD CONSTRAINT chk_contrato_cuota_estado
      CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_cuota_numero'
      AND conrelid = 'public.contrato_cuota'::regclass
  ) THEN
    ALTER TABLE public.contrato_cuota
      ADD CONSTRAINT chk_contrato_cuota_numero
      CHECK (numero_cuota > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_cuota_montos'
      AND conrelid = 'public.contrato_cuota'::regclass
  ) THEN
    ALTER TABLE public.contrato_cuota
      ADD CONSTRAINT chk_contrato_cuota_montos
      CHECK (
        saldo_inicial >= 0
        AND monto_cuota_base >= 0
        AND monto_ajuste_programado >= 0
        AND monto_cuota_total_programada >= 0
        AND monto_interes_programado >= 0
        AND monto_capital_programado >= 0
        AND saldo_final_programado >= 0
        AND capital_amortizado_acumulado >= 0
        AND monto_pagado_total >= 0
        AND monto_pagado_interes >= 0
        AND monto_pagado_capital >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_contrato_cuota_numero'
      AND conrelid = 'public.contrato_cuota'::regclass
  ) THEN
    ALTER TABLE public.contrato_cuota
      ADD CONSTRAINT uq_contrato_cuota_numero
      UNIQUE (id_plan_pago, numero_cuota);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_cargo_estado'
      AND conrelid = 'public.contrato_cargo'::regclass
  ) THEN
    ALTER TABLE public.contrato_cargo
      ADD CONSTRAINT chk_contrato_cargo_estado
      CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADO', 'ANULADO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_cargo_montos'
      AND conrelid = 'public.contrato_cargo'::regclass
  ) THEN
    ALTER TABLE public.contrato_cargo
      ADD CONSTRAINT chk_contrato_cargo_montos
      CHECK (monto_original >= 0 AND monto_pagado >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_pago_estado'
      AND conrelid = 'public.contrato_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_pago
      ADD CONSTRAINT chk_contrato_pago_estado
      CHECK (estado IN ('APLICADO', 'ANULADO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_pago_monto'
      AND conrelid = 'public.contrato_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_pago
      ADD CONSTRAINT chk_contrato_pago_monto
      CHECK (monto_total > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_pago_aplicacion_destino'
      AND conrelid = 'public.contrato_pago_aplicacion'::regclass
  ) THEN
    ALTER TABLE public.contrato_pago_aplicacion
      ADD CONSTRAINT chk_contrato_pago_aplicacion_destino
      CHECK (
        ((id_cuota IS NOT NULL)::INT + (id_cargo IS NOT NULL)::INT) = 1
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_pago_aplicacion_montos'
      AND conrelid = 'public.contrato_pago_aplicacion'::regclass
  ) THEN
    ALTER TABLE public.contrato_pago_aplicacion
      ADD CONSTRAINT chk_contrato_pago_aplicacion_montos
      CHECK (
        monto_interes >= 0
        AND monto_capital >= 0
        AND monto_otros >= 0
        AND (monto_interes + monto_capital + monto_otros) > 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_evento_financiero_tipo'
      AND conrelid = 'public.contrato_evento_financiero'::regclass
  ) THEN
    ALTER TABLE public.contrato_evento_financiero
      ADD CONSTRAINT chk_contrato_evento_financiero_tipo
      CHECK (
        tipo_evento IN (
          'FORMALIZACION',
          'BACKFILL',
          'ARREGLO_PAGO',
          'REESTRUCTURACION',
          'CONGELAMIENTO',
          'REGISTRO_PAGO',
          'ANULACION_PAGO',
          'AJUSTE_MANUAL'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_plan_pago_vigente
  ON public.contrato_plan_pago (id_contrato)
  WHERE estado = 'VIGENTE';

CREATE INDEX IF NOT EXISTS idx_contrato_plan_pago_contrato_estado
  ON public.contrato_plan_pago (id_contrato, estado, version DESC);

CREATE INDEX IF NOT EXISTS idx_contrato_cuota_plan_numero
  ON public.contrato_cuota (id_plan_pago, numero_cuota);

CREATE INDEX IF NOT EXISTS idx_contrato_cuota_estado_vencimiento
  ON public.contrato_cuota (estado, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_contrato_pago_contrato_fecha
  ON public.contrato_pago (id_contrato, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS idx_contrato_pago_aplicacion_pago
  ON public.contrato_pago_aplicacion (id_pago);

CREATE INDEX IF NOT EXISTS idx_contrato_pago_aplicacion_cuota
  ON public.contrato_pago_aplicacion (id_cuota);

CREATE INDEX IF NOT EXISTS idx_contrato_cargo_contrato_estado
  ON public.contrato_cargo (id_contrato, estado, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_contrato_evento_financiero_contrato_fecha
  ON public.contrato_evento_financiero (id_contrato, fecha_evento DESC);

CREATE OR REPLACE FUNCTION public.calcular_fecha_primera_cuota(
  p_fecha_referencia DATE,
  p_dia_pago SMALLINT
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_inicio_mes DATE;
  v_ultimo_dia DATE;
  v_dia INT;
BEGIN
  IF p_fecha_referencia IS NULL THEN
    RAISE EXCEPTION 'La fecha de referencia es obligatoria para calcular la primera cuota';
  END IF;

  IF p_dia_pago IS NULL OR p_dia_pago < 1 OR p_dia_pago > 31 THEN
    RAISE EXCEPTION 'El día de pago mensual es inválido: %', p_dia_pago;
  END IF;

  v_inicio_mes := (date_trunc('month', p_fecha_referencia)::DATE + INTERVAL '1 month')::DATE;
  v_ultimo_dia := (date_trunc('month', v_inicio_mes)::DATE + INTERVAL '1 month - 1 day')::DATE;
  v_dia := LEAST(p_dia_pago::INT, EXTRACT(DAY FROM v_ultimo_dia)::INT);

  RETURN make_date(
    EXTRACT(YEAR FROM v_inicio_mes)::INT,
    EXTRACT(MONTH FROM v_inicio_mes)::INT,
    v_dia
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_fecha_vencimiento_cuota(
  p_fecha_primera_cuota DATE,
  p_numero_cuota INT
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
  IF p_fecha_primera_cuota IS NULL THEN
    RAISE EXCEPTION 'La fecha de primera cuota es obligatoria';
  END IF;

  IF p_numero_cuota IS NULL OR p_numero_cuota < 1 THEN
    RAISE EXCEPTION 'El número de cuota es inválido: %', p_numero_cuota;
  END IF;

  v_inicio_mes := (
    date_trunc('month', p_fecha_primera_cuota)::DATE
    + make_interval(months => p_numero_cuota - 1)
  )::DATE;
  v_ultimo_dia := (date_trunc('month', v_inicio_mes)::DATE + INTERVAL '1 month - 1 day')::DATE;
  v_dia_base := EXTRACT(DAY FROM p_fecha_primera_cuota)::INT;
  v_dia_final := LEAST(v_dia_base, EXTRACT(DAY FROM v_ultimo_dia)::INT);

  RETURN make_date(
    EXTRACT(YEAR FROM v_inicio_mes)::INT,
    EXTRACT(MONTH FROM v_inicio_mes)::INT,
    v_dia_final
  );
END;
$$;

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

  v_plazo_meses := COALESCE(
    v_contrato.total_meses,
    CASE
      WHEN v_contrato.plazo_anios IS NOT NULL THEN v_contrato.plazo_anios * 12
      ELSE NULL
    END
  );

  IF v_plazo_meses IS NULL OR v_plazo_meses < 0 THEN
    RAISE EXCEPTION 'El contrato % no tiene un plazo válido para generar el plan de pago', p_id_contrato;
  END IF;

  v_tasa_anual := COALESCE(v_contrato.tasa_interes_anual, 0);
  IF v_tasa_anual < 0 THEN
    RAISE EXCEPTION 'La tasa de interés anual del contrato % es inválida', p_id_contrato;
  END IF;

  v_tasa_mensual := ROUND((v_tasa_anual / 100.0 / 12.0)::NUMERIC, 10);
  v_monto_prima := ROUND(COALESCE(v_contrato.monto_entregado_inicial, 0)::NUMERIC, 2);
  v_monto_principal := ROUND(
    COALESCE(
      v_contrato.saldo_pendiente,
      GREATEST(COALESCE(v_contrato.monto_arrendamiento_total, 0) - v_monto_prima, 0)
    )::NUMERIC,
    2
  );
  v_cuota_base := ROUND(COALESCE(v_contrato.cuota_mensual, 0)::NUMERIC, 2);

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

  IF v_contrato.dia_pago_mensual IS NULL AND v_fecha_primera IS NOT NULL THEN
    UPDATE public.contrato
    SET dia_pago_mensual = EXTRACT(DAY FROM v_fecha_primera)::SMALLINT
    WHERE id_contrato = p_id_contrato;

    v_contrato.dia_pago_mensual := EXTRACT(DAY FROM v_fecha_primera)::SMALLINT;
  END IF;

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
    p_observaciones,
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
    'fecha_primera_cuota', v_fecha_primera
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.formalizar_contrato_y_generar_plan_pago(
  p_id_contrato INT,
  p_numero_formulario TEXT,
  p_fecha_primera_cuota DATE,
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
  v_numero_formulario TEXT := NULLIF(TRIM(p_numero_formulario), '');
  v_resultado_plan JSONB;
  v_id_plan_pago BIGINT;
BEGIN
  IF v_numero_formulario IS NULL THEN
    RAISE EXCEPTION 'El número de formulario oficial es obligatorio';
  END IF;

  IF p_fecha_primera_cuota IS NULL THEN
    RAISE EXCEPTION 'La fecha de primera cuota es obligatoria';
  END IF;

  SELECT *
    INTO v_contrato
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF v_contrato.estado_contrato::TEXT <> 'PRECONTRATO' THEN
    RAISE EXCEPTION 'Solo se pueden formalizar contratos en estado PRECONTRATO';
  END IF;

  PERFORM 1
  FROM public.contrato
  WHERE id_contrato <> p_id_contrato
    AND numero_formulario = v_numero_formulario;

  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe otro contrato con el número de formulario %', v_numero_formulario;
  END IF;

  UPDATE public.contrato
  SET
    estado_contrato = 'VIGENTE'::public.estado_contrato_enum,
    numero_formulario = v_numero_formulario,
    fecha_primera_cuota = p_fecha_primera_cuota
  WHERE id_contrato = p_id_contrato;

  v_resultado_plan := public.generar_plan_pago_contrato(
    p_id_contrato => p_id_contrato,
    p_tipo_plan => 'ORIGINAL',
    p_usuario => v_usuario,
    p_observaciones => 'Plan generado durante la formalización del contrato',
    p_reemplazar_plan_vigente => FALSE,
    p_id_plan_anterior => NULL,
    p_fecha_primera_cuota => p_fecha_primera_cuota
  );

  v_id_plan_pago := NULLIF(v_resultado_plan ->> 'id_plan_pago', '')::BIGINT;

  INSERT INTO public.contrato_evento_financiero (
    id_contrato,
    id_plan_resultante,
    tipo_evento,
    payload,
    observacion,
    usuario
  )
  VALUES (
    p_id_contrato,
    v_id_plan_pago,
    'FORMALIZACION',
    jsonb_build_object(
      'numero_formulario', v_numero_formulario,
      'fecha_primera_cuota', p_fecha_primera_cuota,
      'resultado_plan', v_resultado_plan
    ),
    'Contrato formalizado y plan de pago inicial generado',
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_contrato', p_id_contrato,
    'numero_formulario', v_numero_formulario,
    'fecha_primera_cuota', p_fecha_primera_cuota,
    'resultado_plan', v_resultado_plan
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_plan_pago_base_contrato(
  p_id_contrato INT,
  p_fecha_primera_cuota DATE DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_resultado_plan JSONB;
  v_id_plan_pago BIGINT;
BEGIN
  v_resultado_plan := public.generar_plan_pago_contrato(
    p_id_contrato => p_id_contrato,
    p_tipo_plan => 'BACKFILL',
    p_usuario => v_usuario,
    p_observaciones => 'Plan generado manualmente desde el contrato vigente',
    p_reemplazar_plan_vigente => FALSE,
    p_id_plan_anterior => NULL,
    p_fecha_primera_cuota => p_fecha_primera_cuota
  );

  v_id_plan_pago := NULLIF(v_resultado_plan ->> 'id_plan_pago', '')::BIGINT;

  INSERT INTO public.contrato_evento_financiero (
    id_contrato,
    id_plan_resultante,
    tipo_evento,
    payload,
    observacion,
    usuario
  )
  VALUES (
    p_id_contrato,
    v_id_plan_pago,
    'BACKFILL',
    jsonb_build_object(
      'fecha_primera_cuota', p_fecha_primera_cuota,
      'resultado_plan', v_resultado_plan
    ),
    'Plan de pago generado manualmente para un contrato existente',
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_contrato', p_id_contrato,
    'resultado_plan', v_resultado_plan
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generar_plan_pago_contrato(INT, TEXT, TEXT, TEXT, BOOLEAN, BIGINT, DATE)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.vw_control_cuotas_resumen AS
WITH plan_vigente AS (
  SELECT *
  FROM public.contrato_plan_pago
  WHERE estado = 'VIGENTE'
),
cuota_resumen AS (
  SELECT
    cuota.id_plan_pago,
    COUNT(*)::INT AS cuotas_totales,
    COUNT(*) FILTER (WHERE cuota.estado = 'PAGADA')::INT AS cuotas_pagadas,
    COUNT(*) FILTER (WHERE cuota.estado = 'PARCIAL')::INT AS cuotas_parciales,
    COUNT(*) FILTER (
      WHERE cuota.estado = 'VENCIDA'
        OR (cuota.estado IN ('PENDIENTE', 'PARCIAL') AND cuota.fecha_vencimiento < CURRENT_DATE)
    )::INT AS cuotas_vencidas,
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
    COALESCE(
      SUM(GREATEST(cuota.monto_capital_programado - cuota.monto_pagado_capital, 0)) FILTER (
        WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      ),
      0
    )::NUMERIC(14,2) AS saldo_capital_pendiente
  FROM public.contrato_cuota AS cuota
  GROUP BY cuota.id_plan_pago
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
  plan.id_plan_pago,
  plan.version AS plan_version,
  plan.tipo_plan,
  plan.fecha_generacion,
  plan.fecha_primera_cuota AS plan_fecha_primera_cuota,
  plan.dia_pago_mensual,
  plan.plazo_meses,
  plan.cuota_base,
  plan.saldo_inicial,
  COALESCE(resumen.cuotas_totales, 0) AS cuotas_totales,
  COALESCE(resumen.cuotas_pagadas, 0) AS cuotas_pagadas,
  COALESCE(resumen.cuotas_parciales, 0) AS cuotas_parciales,
  COALESCE(resumen.cuotas_vencidas, 0) AS cuotas_vencidas,
  COALESCE(resumen.monto_vencido, 0)::NUMERIC(14,2) AS monto_vencido,
  COALESCE(resumen.saldo_capital_pendiente, 0)::NUMERIC(14,2) AS saldo_capital_pendiente,
  resumen.proxima_fecha_vencimiento
FROM public.contrato AS contrato
LEFT JOIN public.cliente AS cliente
  ON cliente.id_cliente = contrato.id_cliente
LEFT JOIN plan_vigente AS plan
  ON plan.id_contrato = contrato.id_contrato
LEFT JOIN cuota_resumen AS resumen
  ON resumen.id_plan_pago = plan.id_plan_pago;

CREATE OR REPLACE VIEW public.vw_control_cuotas_plan_vigente AS
SELECT
  contrato.id_contrato,
  contrato.numero_contrato,
  contrato.numero_formulario,
  contrato.estado_contrato,
  cliente.nombre_completo AS cliente_nombre,
  plan.id_plan_pago,
  plan.version AS plan_version,
  plan.tipo_plan,
  plan.fecha_generacion,
  plan.fecha_primera_cuota,
  plan.dia_pago_mensual,
  plan.plazo_meses,
  plan.tasa_interes_anual,
  plan.tasa_interes_mensual,
  plan.cuota_base,
  cuota.id_cuota,
  cuota.numero_cuota,
  cuota.fecha_vencimiento,
  cuota.estado,
  cuota.saldo_inicial,
  cuota.monto_cuota_base,
  cuota.monto_ajuste_programado,
  cuota.monto_cuota_total_programada,
  cuota.monto_interes_programado,
  cuota.monto_capital_programado,
  cuota.saldo_final_programado,
  cuota.capital_amortizado_acumulado,
  cuota.monto_pagado_total,
  cuota.monto_pagado_interes,
  cuota.monto_pagado_capital,
  cuota.fecha_ultimo_pago,
  cuota.numero_factura,
  cuota.notas
FROM public.contrato AS contrato
JOIN public.cliente AS cliente
  ON cliente.id_cliente = contrato.id_cliente
JOIN public.contrato_plan_pago AS plan
  ON plan.id_contrato = contrato.id_contrato
  AND plan.estado = 'VIGENTE'
JOIN public.contrato_cuota AS cuota
  ON cuota.id_plan_pago = plan.id_plan_pago;

GRANT EXECUTE ON FUNCTION public.formalizar_contrato_y_generar_plan_pago(INT, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_plan_pago_base_contrato(INT, DATE, TEXT) TO authenticated;
GRANT SELECT ON public.vw_control_cuotas_resumen TO authenticated;
GRANT SELECT ON public.vw_control_cuotas_plan_vigente TO authenticated;

NOTIFY pgrst, 'reload schema';
