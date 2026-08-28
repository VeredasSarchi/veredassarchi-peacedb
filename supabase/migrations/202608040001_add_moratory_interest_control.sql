-- Interes moratorio contractual:
--   * 2% mensual por defecto.
--   * Primer corte a partir del sexto dia calendario de atraso.
--   * Base = cuotas vencidas pendientes + mora anterior pendiente.
--   * La vigencia se inicia prospectivamente en la fecha local del despliegue.
--
-- La migracion no ejecuta la sincronizacion. Los cargos nacen solamente cuando
-- se invoca una de las funciones de sincronizacion al final de este archivo.

CREATE TABLE IF NOT EXISTS public.contrato_interes_moratorio_configuracion (
  id_configuracion SMALLINT PRIMARY KEY DEFAULT 1,
  fecha_efectiva DATE NOT NULL,
  tasa_mensual NUMERIC(9,6) NOT NULL DEFAULT 0.020000,
  dias_gracia SMALLINT NOT NULL DEFAULT 6,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  usuario_actualizacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_contrato_mora_config_unica CHECK (id_configuracion = 1),
  CONSTRAINT chk_contrato_mora_config_tasa CHECK (tasa_mensual >= 0 AND tasa_mensual <= 1),
  CONSTRAINT chk_contrato_mora_config_gracia CHECK (dias_gracia >= 0 AND dias_gracia <= 31)
);

INSERT INTO public.contrato_interes_moratorio_configuracion (
  id_configuracion,
  fecha_efectiva,
  tasa_mensual,
  dias_gracia,
  activo,
  usuario_actualizacion
)
VALUES (
  1,
  (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE,
  0.020000,
  6,
  TRUE,
  'migracion_202608040001'
)
ON CONFLICT (id_configuracion) DO NOTHING;

ALTER TABLE public.contrato_pago
  ADD COLUMN IF NOT EXISTS tipo_pago VARCHAR(10),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Todos los pagos historicos pertenecen al flujo contractual anterior. Antes
-- de esta migracion no existian cargos INTERES_MORATORIO, por lo que CUOTA es
-- el backfill conservador y no reinterpreta cargos historicos como mora.
UPDATE public.contrato_pago
SET tipo_pago = 'CUOTA'
WHERE tipo_pago IS NULL;

ALTER TABLE public.contrato_pago
  ALTER COLUMN tipo_pago SET DEFAULT 'CUOTA',
  ALTER COLUMN tipo_pago SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_pago_tipo_pago'
      AND conrelid = 'public.contrato_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_pago
      ADD CONSTRAINT chk_contrato_pago_tipo_pago
      CHECK (tipo_pago IN ('CUOTA', 'MORA'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_pago_idempotency_key'
      AND conrelid = 'public.contrato_pago'::regclass
  ) THEN
    ALTER TABLE public.contrato_pago
      ADD CONSTRAINT chk_contrato_pago_idempotency_key
      CHECK (
        idempotency_key IS NULL
        OR (
          LENGTH(TRIM(idempotency_key)) BETWEEN 1 AND 200
          AND idempotency_key = TRIM(idempotency_key)
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_pago_idempotency
  ON public.contrato_pago (id_contrato, tipo_pago, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contrato_pago_tipo_fecha
  ON public.contrato_pago (id_contrato, tipo_pago, fecha_pago DESC);

CREATE TABLE IF NOT EXISTS public.contrato_interes_moratorio_calculo (
  id_calculo_mora BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  id_plan_pago BIGINT NOT NULL REFERENCES public.contrato_plan_pago (id_plan_pago) ON DELETE RESTRICT,
  id_cargo BIGINT NULL UNIQUE REFERENCES public.contrato_cargo (id_cargo) ON DELETE RESTRICT,
  periodo_mora DATE NOT NULL,
  fecha_corte DATE NOT NULL,
  tasa_mensual NUMERIC(9,6) NOT NULL,
  dias_gracia SMALLINT NOT NULL,
  base_cuotas_vencidas NUMERIC(14,2) NOT NULL DEFAULT 0,
  base_mora_anterior NUMERIC(14,2) NOT NULL DEFAULT 0,
  base_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_generado NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'GENERADO',
  detalle_cuotas JSONB NOT NULL DEFAULT '[]'::JSONB,
  usuario_creacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anulado_at TIMESTAMPTZ,
  anulado_por TEXT,
  motivo_anulacion TEXT,
  CONSTRAINT chk_contrato_mora_calculo_estado
    CHECK (estado IN ('GENERADO', 'SIN_CARGO', 'ANULADO')),
  CONSTRAINT chk_contrato_mora_calculo_periodo
    CHECK (periodo_mora = date_trunc('month', fecha_corte)::DATE),
  CONSTRAINT chk_contrato_mora_calculo_tasa
    CHECK (tasa_mensual >= 0 AND tasa_mensual <= 1),
  CONSTRAINT chk_contrato_mora_calculo_gracia
    CHECK (dias_gracia >= 0 AND dias_gracia <= 31),
  CONSTRAINT chk_contrato_mora_calculo_montos
    CHECK (
      base_cuotas_vencidas >= 0
      AND base_mora_anterior >= 0
      AND base_total = ROUND((base_cuotas_vencidas + base_mora_anterior)::NUMERIC, 2)
      AND monto_generado = ROUND((base_total * tasa_mensual)::NUMERIC, 2)
    ),
  CONSTRAINT chk_contrato_mora_calculo_cargo
    CHECK (
      (estado = 'GENERADO' AND monto_generado > 0 AND id_cargo IS NOT NULL)
      OR (estado = 'SIN_CARGO' AND monto_generado = 0 AND id_cargo IS NULL)
      OR estado = 'ANULADO'
    ),
  CONSTRAINT chk_contrato_mora_calculo_detalle
    CHECK (jsonb_typeof(detalle_cuotas) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_mora_calculo_corte
  ON public.contrato_interes_moratorio_calculo (id_contrato, fecha_corte);

CREATE INDEX IF NOT EXISTS idx_contrato_mora_calculo_contrato_fecha
  ON public.contrato_interes_moratorio_calculo (id_contrato, fecha_corte DESC);

CREATE INDEX IF NOT EXISTS idx_contrato_cargo_mora_fifo
  ON public.contrato_cargo (id_contrato, fecha_vencimiento, id_cargo)
  WHERE tipo_cargo = 'INTERES_MORATORIO'
    AND estado IN ('PENDIENTE', 'PARCIAL');

CREATE OR REPLACE FUNCTION public.assert_control_cuotas_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_role TEXT;
  v_api_role TEXT;
BEGIN
  v_app_role := COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  );
  v_api_role := auth.role();

  -- session_user permite ejecutar y probar la migracion desde una sesion SQL
  -- administrativa. En PostgREST, las escrituras requieren JWT admin o la
  -- credencial service_role; no se confia en el p_usuario enviado por cliente.
  IF session_user IN ('postgres', 'supabase_admin')
     OR v_api_role = 'service_role'
     OR v_app_role = 'admin' THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'No autorizado para modificar el control de cuotas'
    USING ERRCODE = '42501';
END;
$$;

-- El check de eventos era cerrado. Se conserva el catalogo anterior y se
-- agregan los eventos de mora requeridos para auditoria y futuras anulaciones.
ALTER TABLE public.contrato_evento_financiero
  DROP CONSTRAINT IF EXISTS chk_contrato_evento_financiero_tipo;

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
      'AJUSTE_MANUAL',
      'CALCULO_MORA',
      'PAGO_MORA',
      'AJUSTE_MORA',
      'ANULACION_MORA'
    )
  );

CREATE OR REPLACE FUNCTION public.validar_aplicacion_tipo_pago_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_pago VARCHAR(10);
  v_id_contrato_pago INT;
  v_id_contrato_destino INT;
  v_tipo_cargo VARCHAR(30);
BEGIN
  SELECT pago.tipo_pago, pago.id_contrato
    INTO v_tipo_pago, v_id_contrato_pago
  FROM public.contrato_pago AS pago
  WHERE pago.id_pago = NEW.id_pago;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago % no existe', NEW.id_pago
      USING ERRCODE = '23503';
  END IF;

  IF v_tipo_pago = 'CUOTA' THEN
    IF NEW.id_cuota IS NULL OR NEW.id_cargo IS NOT NULL THEN
      RAISE EXCEPTION 'Un pago CUOTA solo puede aplicarse a cuotas'
        USING ERRCODE = '23514';
    END IF;

    SELECT plan.id_contrato
      INTO v_id_contrato_destino
    FROM public.contrato_cuota AS cuota
    JOIN public.contrato_plan_pago AS plan
      ON plan.id_plan_pago = cuota.id_plan_pago
    WHERE cuota.id_cuota = NEW.id_cuota;
  ELSIF v_tipo_pago = 'MORA' THEN
    IF NEW.id_cargo IS NULL OR NEW.id_cuota IS NOT NULL THEN
      RAISE EXCEPTION 'Un pago MORA solo puede aplicarse a cargos moratorios'
        USING ERRCODE = '23514';
    END IF;

    SELECT cargo.id_contrato, cargo.tipo_cargo
      INTO v_id_contrato_destino, v_tipo_cargo
    FROM public.contrato_cargo AS cargo
    WHERE cargo.id_cargo = NEW.id_cargo;

    IF v_tipo_cargo IS DISTINCT FROM 'INTERES_MORATORIO' THEN
      RAISE EXCEPTION 'Un pago MORA solo puede aplicarse a cargos INTERES_MORATORIO'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.monto_interes <> 0 OR NEW.monto_capital <> 0 OR NEW.monto_otros <= 0 THEN
      RAISE EXCEPTION 'La aplicacion de MORA debe registrarse exclusivamente en monto_otros'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de pago no soportado: %', v_tipo_pago
      USING ERRCODE = '23514';
  END IF;

  IF v_id_contrato_destino IS NULL THEN
    RAISE EXCEPTION 'El destino de la aplicacion no existe'
      USING ERRCODE = '23503';
  END IF;

  IF v_id_contrato_destino <> v_id_contrato_pago THEN
    RAISE EXCEPTION 'El destino de la aplicacion no pertenece al contrato del pago'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_aplicacion_tipo_pago_contrato
  ON public.contrato_pago_aplicacion;

CREATE TRIGGER trg_validar_aplicacion_tipo_pago_contrato
BEFORE INSERT OR UPDATE OF id_pago, id_cuota, id_cargo, monto_interes, monto_capital, monto_otros
ON public.contrato_pago_aplicacion
FOR EACH ROW
EXECUTE FUNCTION public.validar_aplicacion_tipo_pago_contrato();

CREATE OR REPLACE FUNCTION public.validar_cambio_tipo_pago_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo_pago IS NOT DISTINCT FROM OLD.tipo_pago
     AND NEW.id_contrato IS NOT DISTINCT FROM OLD.id_contrato THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contrato_pago_aplicacion AS aplicacion
    LEFT JOIN public.contrato_cargo AS cargo
      ON cargo.id_cargo = aplicacion.id_cargo
    LEFT JOIN public.contrato_cuota AS cuota
      ON cuota.id_cuota = aplicacion.id_cuota
    LEFT JOIN public.contrato_plan_pago AS plan
      ON plan.id_plan_pago = cuota.id_plan_pago
    WHERE aplicacion.id_pago = OLD.id_pago
      AND (
        (NEW.tipo_pago = 'CUOTA' AND aplicacion.id_cuota IS NULL)
        OR (
          NEW.tipo_pago = 'MORA'
          AND (
            aplicacion.id_cargo IS NULL
            OR cargo.tipo_cargo IS DISTINCT FROM 'INTERES_MORATORIO'
          )
        )
        OR COALESCE(cargo.id_contrato, plan.id_contrato) IS DISTINCT FROM NEW.id_contrato
      )
  ) THEN
    RAISE EXCEPTION 'El tipo o contrato del pago no es compatible con sus aplicaciones'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cambio_tipo_pago_contrato
  ON public.contrato_pago;

CREATE TRIGGER trg_validar_cambio_tipo_pago_contrato
BEFORE UPDATE OF tipo_pago, id_contrato
ON public.contrato_pago
FOR EACH ROW
EXECUTE FUNCTION public.validar_cambio_tipo_pago_contrato();

-- Suma meses desde un ancla original y conserva el dia del ancla. Esto evita
-- la deriva Jan-31 -> Feb-28 -> Mar-28 que produciria sumar un mes al ultimo
-- corte repetidamente.
CREATE OR REPLACE FUNCTION public.calcular_fecha_corte_mora_mensual(
  p_fecha_ancla DATE,
  p_meses_desde_ancla INT
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
  IF p_fecha_ancla IS NULL THEN
    RAISE EXCEPTION 'La fecha ancla de mora es obligatoria';
  END IF;

  IF p_meses_desde_ancla IS NULL OR p_meses_desde_ancla < 0 THEN
    RAISE EXCEPTION 'El desplazamiento mensual de mora es invalido';
  END IF;

  v_inicio_mes := (
    date_trunc('month', p_fecha_ancla)::DATE
    + make_interval(months => p_meses_desde_ancla)
  )::DATE;
  v_ultimo_dia := (v_inicio_mes + INTERVAL '1 month - 1 day')::DATE;
  v_dia := LEAST(
    EXTRACT(DAY FROM p_fecha_ancla)::INT,
    EXTRACT(DAY FROM v_ultimo_dia)::INT
  );

  RETURN make_date(
    EXTRACT(YEAR FROM v_inicio_mes)::INT,
    EXTRACT(MONTH FROM v_inicio_mes)::INT,
    v_dia
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_interes_moratorio_contrato(
  p_id_contrato INT,
  p_fecha_hasta DATE DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.contrato_interes_moratorio_configuracion%ROWTYPE;
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_hoy_cr DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_fecha_hasta DATE := COALESCE(p_fecha_hasta, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE);
  v_id_plan_pago BIGINT;
  v_tiene_ultimo BOOLEAN := FALSE;
  v_ultima_fecha_corte DATE;
  v_ultimo_estado VARCHAR(20);
  v_ultimo_cierre_ciclo DATE;
  v_fecha_ancla DATE;
  v_periodos_ciclo INT := 0;
  v_fecha_corte DATE;
  v_base_cuotas NUMERIC(14,2) := 0;
  v_base_mora NUMERIC(14,2) := 0;
  v_base_total NUMERIC(14,2) := 0;
  v_monto_generado NUMERIC(14,2) := 0;
  v_detalle_cuotas JSONB := '[]'::JSONB;
  v_id_cargo BIGINT;
  v_id_calculo BIGINT;
  v_calculos_procesados INT := 0;
  v_cargos_generados INT := 0;
  v_resultados JSONB := '[]'::JSONB;
BEGIN
  PERFORM public.assert_control_cuotas_admin();

  IF p_id_contrato IS NULL THEN
    RAISE EXCEPTION 'El contrato es obligatorio';
  END IF;

  IF v_fecha_hasta > v_hoy_cr THEN
    RAISE EXCEPTION 'La fecha de sincronizacion % no puede ser posterior a la fecha actual de Costa Rica %',
      v_fecha_hasta,
      v_hoy_cr;
  END IF;

  SELECT configuracion.*
    INTO v_config
  FROM public.contrato_interes_moratorio_configuracion AS configuracion
  WHERE configuracion.id_configuracion = 1
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la configuracion de interes moratorio';
  END IF;

  PERFORM 1
  FROM public.contrato AS contrato
  WHERE contrato.id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF NOT v_config.activo OR v_fecha_hasta < v_config.fecha_efectiva THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'id_contrato', p_id_contrato,
      'fecha_hasta', v_fecha_hasta,
      'fecha_efectiva', v_config.fecha_efectiva,
      'activo', v_config.activo,
      'calculos_procesados', 0,
      'cargos_generados', 0,
      'calculos', '[]'::JSONB
    );
  END IF;

  SELECT plan.id_plan_pago
    INTO v_id_plan_pago
  FROM public.contrato_plan_pago AS plan
  WHERE plan.id_contrato = p_id_contrato
    AND plan.estado = 'VIGENTE'
  ORDER BY plan.version DESC, plan.id_plan_pago DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id_plan_pago IS NULL THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'id_contrato', p_id_contrato,
      'fecha_hasta', v_fecha_hasta,
      'fecha_efectiva', v_config.fecha_efectiva,
      'calculos_procesados', 0,
      'cargos_generados', 0,
      'sin_plan_vigente', TRUE,
      'calculos', '[]'::JSONB
    );
  END IF;

  -- Serializa cuotas, cargos y calculos del contrato junto con el lock de la
  -- cabecera. El lock de contrato hace idempotentes las llamadas concurrentes.
  PERFORM 1
  FROM public.contrato_cuota AS cuota
  WHERE cuota.id_plan_pago = v_id_plan_pago
  FOR UPDATE;

  PERFORM 1
  FROM public.contrato_cargo AS cargo
  WHERE cargo.id_contrato = p_id_contrato
    AND cargo.tipo_cargo = 'INTERES_MORATORIO'
  FOR UPDATE;

  SELECT calculo.fecha_corte, calculo.estado
    INTO v_ultima_fecha_corte, v_ultimo_estado
  FROM public.contrato_interes_moratorio_calculo AS calculo
  WHERE calculo.id_contrato = p_id_contrato
    AND calculo.estado <> 'ANULADO'
  ORDER BY calculo.fecha_corte DESC, calculo.id_calculo_mora DESC
  LIMIT 1
  FOR UPDATE;

  v_tiene_ultimo := FOUND;

  IF NOT v_tiene_ultimo OR v_ultimo_estado = 'SIN_CARGO' THEN
    -- Inicia (o reinicia despues de cerrar un ciclo en cero) en la primera
    -- cuota que realmente tenia saldo al comenzar su dia de corte. Para deuda
    -- anterior al despliegue, el primer corte se limita a fecha_efectiva.
    WITH candidatos AS (
      SELECT
        cuota.id_cuota,
        cuota.monto_cuota_total_programada,
        GREATEST(
          cuota.fecha_vencimiento + v_config.dias_gracia::INT,
          v_config.fecha_efectiva,
          COALESCE(v_ultima_fecha_corte + 1, v_config.fecha_efectiva)
        )::DATE AS fecha_candidata
      FROM public.contrato_cuota AS cuota
      WHERE cuota.id_plan_pago = v_id_plan_pago
        AND cuota.estado <> 'ANULADA'
    ),
    candidatos_con_saldo AS (
      SELECT
        candidato.fecha_candidata,
        ROUND(
          GREATEST(
            candidato.monto_cuota_total_programada
            - COALESCE(
              (
                SELECT SUM(
                  aplicacion.monto_interes
                  + aplicacion.monto_capital
                  + aplicacion.monto_otros
                )
                FROM public.contrato_pago_aplicacion AS aplicacion
                JOIN public.contrato_pago AS pago
                  ON pago.id_pago = aplicacion.id_pago
                WHERE aplicacion.id_cuota = candidato.id_cuota
                  AND pago.estado = 'APLICADO'
                  AND (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE
                    < candidato.fecha_candidata
              ),
              0
            ),
            0
          )::NUMERIC,
          2
        ) AS saldo_al_corte
      FROM candidatos AS candidato
    )
    SELECT MIN(candidato.fecha_candidata)
      INTO v_fecha_corte
    FROM candidatos_con_saldo AS candidato
    WHERE candidato.fecha_candidata <= v_fecha_hasta
      AND candidato.saldo_al_corte > 0.009;

    IF v_fecha_corte IS NULL THEN
      RETURN jsonb_build_object(
        'ok', TRUE,
        'id_contrato', p_id_contrato,
        'id_plan_pago', v_id_plan_pago,
        'fecha_hasta', v_fecha_hasta,
        'fecha_efectiva', v_config.fecha_efectiva,
        'calculos_procesados', 0,
        'cargos_generados', 0,
        'calculos', '[]'::JSONB
      );
    END IF;

    v_fecha_ancla := v_fecha_corte;
    v_periodos_ciclo := 0;
  ELSE
    -- El SIN_CARGO mas reciente separa ciclos. Dentro del ciclo actual se usa
    -- siempre el primer corte como ancla para no derivar el dia mensual.
    SELECT MAX(calculo.fecha_corte)
      INTO v_ultimo_cierre_ciclo
    FROM public.contrato_interes_moratorio_calculo AS calculo
    WHERE calculo.id_contrato = p_id_contrato
      AND calculo.estado = 'SIN_CARGO'
      AND calculo.fecha_corte < v_ultima_fecha_corte;

    SELECT
      MIN(calculo.fecha_corte),
      COUNT(*)::INT
      INTO v_fecha_ancla, v_periodos_ciclo
    FROM public.contrato_interes_moratorio_calculo AS calculo
    WHERE calculo.id_contrato = p_id_contrato
      AND calculo.estado <> 'ANULADO'
      AND (
        v_ultimo_cierre_ciclo IS NULL
        OR calculo.fecha_corte > v_ultimo_cierre_ciclo
      );

    v_fecha_corte := public.calcular_fecha_corte_mora_mensual(
      v_fecha_ancla,
      v_periodos_ciclo
    );
  END IF;

  WHILE v_fecha_corte <= v_fecha_hasta LOOP
    WITH saldos_cuota AS (
      SELECT
        cuota.id_cuota,
        cuota.numero_cuota,
        cuota.fecha_vencimiento,
        cuota.monto_cuota_total_programada,
        ROUND(
          GREATEST(
            cuota.monto_cuota_total_programada
            - COALESCE(
              (
                SELECT SUM(
                  aplicacion.monto_interes
                  + aplicacion.monto_capital
                  + aplicacion.monto_otros
                )
                FROM public.contrato_pago_aplicacion AS aplicacion
                JOIN public.contrato_pago AS pago
                  ON pago.id_pago = aplicacion.id_pago
                WHERE aplicacion.id_cuota = cuota.id_cuota
                  AND pago.estado = 'APLICADO'
                  -- El corte ocurre al iniciar el dia local. Un pago registrado
                  -- ese mismo dia es posterior al corte.
                  AND (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE
                    < v_fecha_corte
              ),
              0
            ),
            0
          )::NUMERIC,
          2
        ) AS saldo_al_corte
      FROM public.contrato_cuota AS cuota
      WHERE cuota.id_plan_pago = v_id_plan_pago
        AND cuota.estado <> 'ANULADA'
        AND cuota.fecha_vencimiento + v_config.dias_gracia::INT <= v_fecha_corte
    )
    SELECT
      COALESCE(SUM(saldo.saldo_al_corte), 0)::NUMERIC(14,2),
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id_cuota', saldo.id_cuota,
            'numero_cuota', saldo.numero_cuota,
            'fecha_vencimiento', saldo.fecha_vencimiento,
            'monto_programado', saldo.monto_cuota_total_programada,
            'saldo_al_corte', saldo.saldo_al_corte
          )
          ORDER BY saldo.fecha_vencimiento, saldo.numero_cuota
        ),
        '[]'::JSONB
      )
      INTO v_base_cuotas, v_detalle_cuotas
    FROM saldos_cuota AS saldo
    WHERE saldo.saldo_al_corte > 0.009;

    WITH saldos_mora AS (
      SELECT
        cargo.id_cargo,
        ROUND(
          GREATEST(
            cargo.monto_original
            - COALESCE(
              (
                SELECT SUM(
                  aplicacion.monto_interes
                  + aplicacion.monto_capital
                  + aplicacion.monto_otros
                )
                FROM public.contrato_pago_aplicacion AS aplicacion
                JOIN public.contrato_pago AS pago
                  ON pago.id_pago = aplicacion.id_pago
                WHERE aplicacion.id_cargo = cargo.id_cargo
                  AND pago.estado = 'APLICADO'
                  AND (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE
                    < v_fecha_corte
              ),
              0
            ),
            0
          )::NUMERIC,
          2
        ) AS saldo_al_corte
      FROM public.contrato_cargo AS cargo
      JOIN public.contrato_interes_moratorio_calculo AS calculo_anterior
        ON calculo_anterior.id_cargo = cargo.id_cargo
      WHERE cargo.id_contrato = p_id_contrato
        AND cargo.tipo_cargo = 'INTERES_MORATORIO'
        AND cargo.estado <> 'ANULADO'
        AND calculo_anterior.estado = 'GENERADO'
        AND calculo_anterior.fecha_corte < v_fecha_corte
    )
    SELECT COALESCE(SUM(saldo.saldo_al_corte), 0)::NUMERIC(14,2)
      INTO v_base_mora
    FROM saldos_mora AS saldo
    WHERE saldo.saldo_al_corte > 0.009;

    v_base_cuotas := ROUND(COALESCE(v_base_cuotas, 0)::NUMERIC, 2);
    v_base_mora := ROUND(COALESCE(v_base_mora, 0)::NUMERIC, 2);
    v_base_total := ROUND((v_base_cuotas + v_base_mora)::NUMERIC, 2);
    v_monto_generado := ROUND((v_base_total * v_config.tasa_mensual)::NUMERIC, 2);
    v_id_cargo := NULL;

    IF v_monto_generado > 0 THEN
      INSERT INTO public.contrato_cargo (
        id_contrato,
        id_plan_pago,
        tipo_cargo,
        descripcion,
        fecha_vencimiento,
        monto_original,
        monto_pagado,
        estado,
        notas
      )
      VALUES (
        p_id_contrato,
        v_id_plan_pago,
        'INTERES_MORATORIO',
        FORMAT(
          'Interes moratorio del %s%% - corte %s',
          TRIM(
            TRAILING '.' FROM TRIM(
              TRAILING '0' FROM (v_config.tasa_mensual * 100)::TEXT
            )
          ),
          TO_CHAR(v_fecha_corte, 'YYYY-MM-DD')
        ),
        v_fecha_corte,
        v_monto_generado,
        0,
        'PENDIENTE',
        'Generado automaticamente por sincronizacion de interes moratorio'
      )
      RETURNING id_cargo INTO v_id_cargo;
    END IF;

    INSERT INTO public.contrato_interes_moratorio_calculo (
      id_contrato,
      id_plan_pago,
      id_cargo,
      periodo_mora,
      fecha_corte,
      tasa_mensual,
      dias_gracia,
      base_cuotas_vencidas,
      base_mora_anterior,
      base_total,
      monto_generado,
      estado,
      detalle_cuotas,
      usuario_creacion
    )
    VALUES (
      p_id_contrato,
      v_id_plan_pago,
      v_id_cargo,
      date_trunc('month', v_fecha_corte)::DATE,
      v_fecha_corte,
      v_config.tasa_mensual,
      v_config.dias_gracia,
      v_base_cuotas,
      v_base_mora,
      v_base_total,
      v_monto_generado,
      CASE WHEN v_monto_generado > 0 THEN 'GENERADO' ELSE 'SIN_CARGO' END,
      v_detalle_cuotas,
      v_usuario
    )
    RETURNING id_calculo_mora INTO v_id_calculo;

    INSERT INTO public.contrato_evento_financiero (
      id_contrato,
      id_plan_origen,
      id_plan_resultante,
      tipo_evento,
      fecha_evento,
      payload,
      observacion,
      usuario
    )
    VALUES (
      p_id_contrato,
      v_id_plan_pago,
      v_id_plan_pago,
      'CALCULO_MORA',
      NOW(),
      jsonb_build_object(
        'id_calculo_mora', v_id_calculo,
        'id_cargo', v_id_cargo,
        'periodo_mora', date_trunc('month', v_fecha_corte)::DATE,
        'fecha_corte', v_fecha_corte,
        'tasa_mensual', v_config.tasa_mensual,
        'dias_gracia', v_config.dias_gracia,
        'base_cuotas_vencidas', v_base_cuotas,
        'base_mora_anterior', v_base_mora,
        'base_total', v_base_total,
        'monto_generado', v_monto_generado,
        'estado', CASE WHEN v_monto_generado > 0 THEN 'GENERADO' ELSE 'SIN_CARGO' END
      ),
      FORMAT('Calculo de interes moratorio al corte %s', TO_CHAR(v_fecha_corte, 'YYYY-MM-DD')),
      v_usuario
    );

    v_calculos_procesados := v_calculos_procesados + 1;
    IF v_monto_generado > 0 THEN
      v_cargos_generados := v_cargos_generados + 1;
    END IF;

    v_resultados := v_resultados || jsonb_build_array(
      jsonb_build_object(
        'id_calculo_mora', v_id_calculo,
        'id_cargo', v_id_cargo,
        'fecha_corte', v_fecha_corte,
        'base_cuotas_vencidas', v_base_cuotas,
        'base_mora_anterior', v_base_mora,
        'base_total', v_base_total,
        'monto_generado', v_monto_generado,
        'estado', CASE WHEN v_monto_generado > 0 THEN 'GENERADO' ELSE 'SIN_CARGO' END
      )
    );

    -- Un corte en cero cierra el ciclo. Un atraso futuro iniciara un ciclo nuevo
    -- desde la fecha de gracia que corresponda a esa nueva cuota.
    EXIT WHEN v_monto_generado = 0;

    v_periodos_ciclo := v_periodos_ciclo + 1;
    v_fecha_corte := public.calcular_fecha_corte_mora_mensual(
      v_fecha_ancla,
      v_periodos_ciclo
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id_contrato', p_id_contrato,
    'id_plan_pago', v_id_plan_pago,
    'fecha_hasta', v_fecha_hasta,
    'fecha_efectiva', v_config.fecha_efectiva,
    'tasa_mensual', v_config.tasa_mensual,
    'dias_gracia', v_config.dias_gracia,
    'calculos_procesados', v_calculos_procesados,
    'cargos_generados', v_cargos_generados,
    'calculos', v_resultados
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_interes_moratorio_masivo(
  p_fecha_hasta DATE DEFAULT NULL,
  p_limite INT DEFAULT 500,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy_cr DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_fecha_hasta DATE := COALESCE(p_fecha_hasta, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE);
  v_limite INT := LEAST(GREATEST(COALESCE(p_limite, 500), 1), 5000);
  v_contrato RECORD;
  v_resultado JSONB;
  v_procesados INT := 0;
  v_calculos INT := 0;
  v_cargos INT := 0;
  v_errores JSONB := '[]'::JSONB;
BEGIN
  PERFORM public.assert_control_cuotas_admin();

  IF v_fecha_hasta > v_hoy_cr THEN
    RAISE EXCEPTION 'La fecha de sincronizacion % no puede ser posterior a la fecha actual de Costa Rica %',
      v_fecha_hasta,
      v_hoy_cr;
  END IF;

  FOR v_contrato IN
    SELECT contrato.id_contrato
    FROM public.contrato AS contrato
    WHERE EXISTS (
      SELECT 1
      FROM public.contrato_plan_pago AS plan
      WHERE plan.id_contrato = contrato.id_contrato
        AND plan.estado = 'VIGENTE'
    )
    ORDER BY contrato.id_contrato
    LIMIT v_limite
    FOR UPDATE OF contrato SKIP LOCKED
  LOOP
    BEGIN
      v_resultado := public.sincronizar_interes_moratorio_contrato(
        p_id_contrato => v_contrato.id_contrato,
        p_fecha_hasta => v_fecha_hasta,
        p_usuario => p_usuario
      );

      v_procesados := v_procesados + 1;
      v_calculos := v_calculos + COALESCE((v_resultado ->> 'calculos_procesados')::INT, 0);
      v_cargos := v_cargos + COALESCE((v_resultado ->> 'cargos_generados')::INT, 0);
    EXCEPTION WHEN OTHERS THEN
      -- Cada iteracion corre en una subtransaccion PL/pgSQL. Un contrato con
      -- datos inconsistentes no deja cambios parciales ni bloquea el lote.
      v_errores := v_errores || jsonb_build_array(
        jsonb_build_object(
          'id_contrato', v_contrato.id_contrato,
          'error', SQLERRM,
          'sqlstate', SQLSTATE
        )
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_errores) = 0,
    'fecha_hasta', v_fecha_hasta,
    'limite', v_limite,
    'contratos_procesados', v_procesados,
    'calculos_procesados', v_calculos,
    'cargos_generados', v_cargos,
    'errores', v_errores
  );
END;
$$;

-- Se elimina la firma anterior para que PostgREST exponga un unico RPC. El
-- noveno parametro tiene DEFAULT NULL, por lo que los clientes que hoy envian
-- los ocho parametros anteriores siguen siendo compatibles.
DROP FUNCTION IF EXISTS public.registrar_pago_contrato(
  INT,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
);

CREATE OR REPLACE FUNCTION public.registrar_pago_contrato(
  p_id_contrato INT,
  p_monto_total NUMERIC,
  p_fecha_pago TIMESTAMPTZ DEFAULT NOW(),
  p_metodo_pago TEXT DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
  p_numero_factura TEXT DEFAULT NULL,
  p_observacion TEXT DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_fecha_pago TIMESTAMPTZ := COALESCE(p_fecha_pago, NOW());
  v_hoy_cr DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_fecha_pago_cr DATE;
  v_idempotency_key TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  v_pago_existente public.contrato_pago%ROWTYPE;
  v_pago_id BIGINT;
  v_plan_id BIGINT;
  v_corte_posterior DATE;
  v_monto_pago NUMERIC(14,2) := ROUND(COALESCE(p_monto_total, 0)::NUMERIC, 2);
  v_monto_restante NUMERIC(14,2);
  v_aplicado_total NUMERIC(14,2) := 0;
  v_pago_interes NUMERIC(14,2);
  v_pago_capital NUMERIC(14,2);
  v_pago_otros NUMERIC(14,2);
  v_pagado_otros_actual NUMERIC(14,2);
  v_restante_interes NUMERIC(14,2);
  v_restante_capital NUMERIC(14,2);
  v_restante_otros NUMERIC(14,2);
  v_saldo_capital NUMERIC(14,2);
  v_tiene_cuotas_pendientes BOOLEAN;
  v_tiene_mora_pendiente BOOLEAN;
  rec_cuota RECORD;
BEGIN
  PERFORM public.assert_control_cuotas_admin();

  IF v_monto_pago <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  IF v_idempotency_key IS NOT NULL AND LENGTH(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'La llave de idempotencia no puede exceder 200 caracteres';
  END IF;

  v_fecha_pago_cr := (v_fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE;
  IF v_fecha_pago_cr > v_hoy_cr THEN
    RAISE EXCEPTION 'La fecha del pago no puede ser futura en Costa Rica';
  END IF;

  PERFORM 1
  FROM public.contrato AS contrato
  WHERE contrato.id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT pago.*
      INTO v_pago_existente
    FROM public.contrato_pago AS pago
    WHERE pago.id_contrato = p_id_contrato
      AND pago.tipo_pago = 'CUOTA'
      AND pago.idempotency_key = v_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_pago_existente.monto_total <> v_monto_pago THEN
        RAISE EXCEPTION 'La llave de idempotencia ya fue usada con un monto diferente';
      END IF;

      IF v_pago_existente.estado <> 'APLICADO' THEN
        RAISE EXCEPTION 'La llave de idempotencia pertenece a un pago no aplicado';
      END IF;

      SELECT
        COALESCE(SUM(
          aplicacion.monto_interes
          + aplicacion.monto_capital
          + aplicacion.monto_otros
        ), 0)::NUMERIC(14,2),
        MIN(cuota.id_plan_pago)
        INTO v_aplicado_total, v_plan_id
      FROM public.contrato_pago_aplicacion AS aplicacion
      LEFT JOIN public.contrato_cuota AS cuota
        ON cuota.id_cuota = aplicacion.id_cuota
      WHERE aplicacion.id_pago = v_pago_existente.id_pago;

      SELECT COALESCE(
        SUM(GREATEST(cuota.monto_capital_programado - cuota.monto_pagado_capital, 0)),
        0
      )::NUMERIC(14,2)
        INTO v_saldo_capital
      FROM public.contrato_cuota AS cuota
      WHERE cuota.id_plan_pago = v_plan_id;

      RETURN jsonb_build_object(
        'ok', TRUE,
        'idempotent_replay', TRUE,
        'tipo_pago', 'CUOTA',
        'id_pago', v_pago_existente.id_pago,
        'id_plan_pago', v_plan_id,
        'monto_aplicado', v_aplicado_total,
        'saldo_capital_pendiente', COALESCE(v_saldo_capital, 0)
      );
    END IF;
  END IF;

  SELECT MAX(calculo.fecha_corte)
    INTO v_corte_posterior
  FROM public.contrato_interes_moratorio_calculo AS calculo
  WHERE calculo.id_contrato = p_id_contrato
    AND calculo.estado <> 'ANULADO'
    AND calculo.fecha_corte > v_fecha_pago_cr;

  IF v_corte_posterior IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede registrar un pago de cuota con fecha %: el periodo moratorio ya tiene cortes cerrados hasta %',
      v_fecha_pago_cr,
      v_corte_posterior
      USING ERRCODE = '22007';
  END IF;

  -- El cargo que venza en esta fecha debe calcularse antes de disminuir el
  -- saldo de cuotas con el nuevo pago.
  PERFORM public.sincronizar_interes_moratorio_contrato(
    p_id_contrato => p_id_contrato,
    p_fecha_hasta => v_fecha_pago_cr,
    p_usuario => v_usuario
  );

  SELECT plan.id_plan_pago
    INTO v_plan_id
  FROM public.contrato_plan_pago AS plan
  WHERE plan.id_contrato = p_id_contrato
    AND plan.estado = 'VIGENTE'
  ORDER BY plan.version DESC, plan.id_plan_pago DESC
  LIMIT 1
  FOR UPDATE;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'El contrato % no tiene un plan de pago vigente', p_id_contrato;
  END IF;

  v_monto_restante := v_monto_pago;

  INSERT INTO public.contrato_pago (
    id_contrato,
    fecha_pago,
    monto_total,
    metodo_pago,
    referencia,
    numero_factura,
    estado,
    observacion,
    registrado_por,
    tipo_pago,
    idempotency_key
  )
  VALUES (
    p_id_contrato,
    v_fecha_pago,
    v_monto_pago,
    NULLIF(TRIM(COALESCE(p_metodo_pago, '')), ''),
    NULLIF(TRIM(COALESCE(p_referencia, '')), ''),
    NULLIF(TRIM(COALESCE(p_numero_factura, '')), ''),
    'APLICADO',
    p_observacion,
    v_usuario,
    'CUOTA',
    v_idempotency_key
  )
  RETURNING id_pago INTO v_pago_id;

  -- Pago CUOTA: exclusivamente cuotas, en FIFO. No consume ningun cargo.
  FOR rec_cuota IN
    SELECT cuota.*
    FROM public.contrato_cuota AS cuota
    WHERE cuota.id_plan_pago = v_plan_id
      AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      AND cuota.monto_cuota_total_programada - cuota.monto_pagado_total > 0.009
    ORDER BY cuota.fecha_vencimiento, cuota.numero_cuota
    FOR UPDATE
  LOOP
    EXIT WHEN v_monto_restante <= 0.009;

    v_pagado_otros_actual := GREATEST(
      COALESCE(rec_cuota.monto_pagado_total, 0)
      - COALESCE(rec_cuota.monto_pagado_interes, 0)
      - COALESCE(rec_cuota.monto_pagado_capital, 0),
      0
    );
    v_restante_interes := ROUND(
      GREATEST(
        COALESCE(rec_cuota.monto_interes_programado, 0)
        - COALESCE(rec_cuota.monto_pagado_interes, 0),
        0
      )::NUMERIC,
      2
    );
    v_restante_capital := ROUND(
      GREATEST(
        COALESCE(rec_cuota.monto_capital_programado, 0)
        - COALESCE(rec_cuota.monto_pagado_capital, 0),
        0
      )::NUMERIC,
      2
    );
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

    IF v_pago_interes + v_pago_capital + v_pago_otros > 0 THEN
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
        monto_pagado_total = ROUND(
          (monto_pagado_total + v_pago_interes + v_pago_capital + v_pago_otros)::NUMERIC,
          2
        ),
        monto_pagado_interes = ROUND((monto_pagado_interes + v_pago_interes)::NUMERIC, 2),
        monto_pagado_capital = ROUND((monto_pagado_capital + v_pago_capital)::NUMERIC, 2),
        fecha_ultimo_pago = v_fecha_pago,
        numero_factura = COALESCE(
          NULLIF(TRIM(COALESCE(p_numero_factura, '')), ''),
          numero_factura
        ),
        estado = CASE
          WHEN ROUND(
            (monto_pagado_total + v_pago_interes + v_pago_capital + v_pago_otros)::NUMERIC,
            2
          ) >= ROUND(monto_cuota_total_programada::NUMERIC, 2)
            THEN 'PAGADA'
          WHEN fecha_vencimiento < v_hoy_cr THEN 'VENCIDA'
          ELSE 'PARCIAL'
        END
      WHERE id_cuota = rec_cuota.id_cuota;

      v_aplicado_total := ROUND(
        (v_aplicado_total + v_pago_interes + v_pago_capital + v_pago_otros)::NUMERIC,
        2
      );
    END IF;
  END LOOP;

  IF v_monto_restante > 0.009 THEN
    RAISE EXCEPTION 'El pago de cuota excede el saldo de cuotas aplicable del contrato % por %',
      p_id_contrato,
      v_monto_restante;
  END IF;

  SELECT COALESCE(
    SUM(GREATEST(cuota.monto_capital_programado - cuota.monto_pagado_capital, 0)),
    0
  )::NUMERIC(14,2)
    INTO v_saldo_capital
  FROM public.contrato_cuota AS cuota
  WHERE cuota.id_plan_pago = v_plan_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.contrato_cuota AS cuota
    WHERE cuota.id_plan_pago = v_plan_id
      AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
      AND cuota.monto_cuota_total_programada - cuota.monto_pagado_total > 0.009
  )
    INTO v_tiene_cuotas_pendientes;

  SELECT EXISTS (
    SELECT 1
    FROM public.contrato_cargo AS cargo
    WHERE cargo.id_contrato = p_id_contrato
      AND cargo.tipo_cargo = 'INTERES_MORATORIO'
      AND cargo.estado IN ('PENDIENTE', 'PARCIAL')
      AND cargo.monto_original - cargo.monto_pagado > 0.009
  )
    INTO v_tiene_mora_pendiente;

  UPDATE public.contrato_plan_pago
  SET estado = CASE
    WHEN NOT v_tiene_cuotas_pendientes AND NOT v_tiene_mora_pendiente THEN 'LIQUIDADO'
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
      'tipo_pago', 'CUOTA',
      'monto_total', v_monto_pago,
      'monto_aplicado', v_aplicado_total,
      'idempotency_key', v_idempotency_key
    ),
    p_observacion,
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'idempotent_replay', FALSE,
    'tipo_pago', 'CUOTA',
    'id_pago', v_pago_id,
    'id_plan_pago', v_plan_id,
    'monto_aplicado', v_aplicado_total,
    'saldo_capital_pendiente', v_saldo_capital
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pago_mora_contrato(
  p_id_contrato INT,
  p_monto_total NUMERIC,
  p_fecha_pago TIMESTAMPTZ DEFAULT NOW(),
  p_metodo_pago TEXT DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
  p_numero_factura TEXT DEFAULT NULL,
  p_observacion TEXT DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_fecha_pago TIMESTAMPTZ := COALESCE(p_fecha_pago, NOW());
  v_hoy_cr DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_fecha_pago_cr DATE;
  v_idempotency_key TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  v_pago_existente public.contrato_pago%ROWTYPE;
  v_pago_id BIGINT;
  v_plan_id BIGINT;
  v_corte_posterior DATE;
  v_monto_pago NUMERIC(14,2) := ROUND(COALESCE(p_monto_total, 0)::NUMERIC, 2);
  v_monto_restante NUMERIC(14,2);
  v_aplicado_total NUMERIC(14,2) := 0;
  v_pago_cargo NUMERIC(14,2);
  v_mora_pendiente NUMERIC(14,2) := 0;
  v_tiene_cuotas_pendientes BOOLEAN;
  v_tiene_mora_pendiente BOOLEAN;
  rec_cargo RECORD;
BEGIN
  PERFORM public.assert_control_cuotas_admin();

  IF v_monto_pago <= 0 THEN
    RAISE EXCEPTION 'El monto del pago de mora debe ser mayor a cero';
  END IF;

  IF v_idempotency_key IS NOT NULL AND LENGTH(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'La llave de idempotencia no puede exceder 200 caracteres';
  END IF;

  v_fecha_pago_cr := (v_fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE;
  IF v_fecha_pago_cr > v_hoy_cr THEN
    RAISE EXCEPTION 'La fecha del pago no puede ser futura en Costa Rica';
  END IF;

  PERFORM 1
  FROM public.contrato AS contrato
  WHERE contrato.id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT pago.*
      INTO v_pago_existente
    FROM public.contrato_pago AS pago
    WHERE pago.id_contrato = p_id_contrato
      AND pago.tipo_pago = 'MORA'
      AND pago.idempotency_key = v_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_pago_existente.monto_total <> v_monto_pago THEN
        RAISE EXCEPTION 'La llave de idempotencia ya fue usada con un monto diferente';
      END IF;

      IF v_pago_existente.estado <> 'APLICADO' THEN
        RAISE EXCEPTION 'La llave de idempotencia pertenece a un pago no aplicado';
      END IF;

      SELECT COALESCE(SUM(aplicacion.monto_otros), 0)::NUMERIC(14,2)
        INTO v_aplicado_total
      FROM public.contrato_pago_aplicacion AS aplicacion
      WHERE aplicacion.id_pago = v_pago_existente.id_pago;

      SELECT COALESCE(
        SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
          WHERE cargo.estado IN ('PENDIENTE', 'PARCIAL')
        ),
        0
      )::NUMERIC(14,2)
        INTO v_mora_pendiente
      FROM public.contrato_cargo AS cargo
      WHERE cargo.id_contrato = p_id_contrato
        AND cargo.tipo_cargo = 'INTERES_MORATORIO';

      RETURN jsonb_build_object(
        'ok', TRUE,
        'idempotent_replay', TRUE,
        'tipo_pago', 'MORA',
        'id_pago', v_pago_existente.id_pago,
        'monto_aplicado', v_aplicado_total,
        'mora_pendiente', v_mora_pendiente
      );
    END IF;
  END IF;

  SELECT MAX(calculo.fecha_corte)
    INTO v_corte_posterior
  FROM public.contrato_interes_moratorio_calculo AS calculo
  WHERE calculo.id_contrato = p_id_contrato
    AND calculo.estado <> 'ANULADO'
    AND calculo.fecha_corte > v_fecha_pago_cr;

  IF v_corte_posterior IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede registrar un pago de mora con fecha %: el periodo moratorio ya tiene cortes cerrados hasta %',
      v_fecha_pago_cr,
      v_corte_posterior
      USING ERRCODE = '22007';
  END IF;

  -- Materializa todos los cortes vencidos antes de consultar el saldo que se
  -- puede cobrar. El abono actual no reduce retroactivamente la base del corte.
  PERFORM public.sincronizar_interes_moratorio_contrato(
    p_id_contrato => p_id_contrato,
    p_fecha_hasta => v_fecha_pago_cr,
    p_usuario => v_usuario
  );

  SELECT plan.id_plan_pago
    INTO v_plan_id
  FROM public.contrato_plan_pago AS plan
  WHERE plan.id_contrato = p_id_contrato
    AND plan.estado = 'VIGENTE'
  ORDER BY plan.version DESC, plan.id_plan_pago DESC
  LIMIT 1
  FOR UPDATE;

  v_monto_restante := v_monto_pago;

  INSERT INTO public.contrato_pago (
    id_contrato,
    fecha_pago,
    monto_total,
    metodo_pago,
    referencia,
    numero_factura,
    estado,
    observacion,
    registrado_por,
    tipo_pago,
    idempotency_key
  )
  VALUES (
    p_id_contrato,
    v_fecha_pago,
    v_monto_pago,
    NULLIF(TRIM(COALESCE(p_metodo_pago, '')), ''),
    NULLIF(TRIM(COALESCE(p_referencia, '')), ''),
    NULLIF(TRIM(COALESCE(p_numero_factura, '')), ''),
    'APLICADO',
    p_observacion,
    v_usuario,
    'MORA',
    v_idempotency_key
  )
  RETURNING id_pago INTO v_pago_id;

  -- Pago MORA: exclusivamente cargos INTERES_MORATORIO y siempre FIFO.
  FOR rec_cargo IN
    SELECT
      cargo.*,
      calculo.fecha_corte AS fecha_corte_mora
    FROM public.contrato_cargo AS cargo
    JOIN public.contrato_interes_moratorio_calculo AS calculo
      ON calculo.id_cargo = cargo.id_cargo
    WHERE cargo.id_contrato = p_id_contrato
      AND cargo.tipo_cargo = 'INTERES_MORATORIO'
      AND cargo.estado IN ('PENDIENTE', 'PARCIAL')
      AND cargo.monto_original - cargo.monto_pagado > 0.009
      AND calculo.estado = 'GENERADO'
    ORDER BY calculo.fecha_corte, cargo.id_cargo
    FOR UPDATE OF cargo
  LOOP
    EXIT WHEN v_monto_restante <= 0.009;

    v_pago_cargo := LEAST(
      v_monto_restante,
      ROUND((rec_cargo.monto_original - rec_cargo.monto_pagado)::NUMERIC, 2)
    );
    v_monto_restante := ROUND((v_monto_restante - v_pago_cargo)::NUMERIC, 2);

    IF v_pago_cargo > 0 THEN
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
        v_pago_cargo,
        p_observacion
      );

      UPDATE public.contrato_cargo
      SET
        monto_pagado = ROUND((monto_pagado + v_pago_cargo)::NUMERIC, 2),
        estado = CASE
          WHEN ROUND((monto_pagado + v_pago_cargo)::NUMERIC, 2)
            >= ROUND(monto_original::NUMERIC, 2)
            THEN 'PAGADO'
          ELSE 'PARCIAL'
        END
      WHERE id_cargo = rec_cargo.id_cargo;

      v_aplicado_total := ROUND((v_aplicado_total + v_pago_cargo)::NUMERIC, 2);
    END IF;
  END LOOP;

  IF v_monto_restante > 0.009 THEN
    RAISE EXCEPTION 'El pago de mora excede el saldo moratorio aplicable del contrato % por %',
      p_id_contrato,
      v_monto_restante;
  END IF;

  SELECT COALESCE(
    SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
      WHERE cargo.estado IN ('PENDIENTE', 'PARCIAL')
    ),
    0
  )::NUMERIC(14,2)
    INTO v_mora_pendiente
  FROM public.contrato_cargo AS cargo
  WHERE cargo.id_contrato = p_id_contrato
    AND cargo.tipo_cargo = 'INTERES_MORATORIO';

  IF v_plan_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.contrato_cuota AS cuota
      WHERE cuota.id_plan_pago = v_plan_id
        AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
        AND cuota.monto_cuota_total_programada - cuota.monto_pagado_total > 0.009
    )
      INTO v_tiene_cuotas_pendientes;

    v_tiene_mora_pendiente := v_mora_pendiente > 0.009;

    UPDATE public.contrato_plan_pago
    SET estado = CASE
      WHEN NOT v_tiene_cuotas_pendientes AND NOT v_tiene_mora_pendiente THEN 'LIQUIDADO'
      ELSE 'VIGENTE'
    END
    WHERE id_plan_pago = v_plan_id;
  END IF;

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
    'PAGO_MORA',
    jsonb_build_object(
      'id_pago', v_pago_id,
      'tipo_pago', 'MORA',
      'monto_total', v_monto_pago,
      'monto_aplicado', v_aplicado_total,
      'mora_pendiente', v_mora_pendiente,
      'idempotency_key', v_idempotency_key
    ),
    p_observacion,
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'idempotent_replay', FALSE,
    'tipo_pago', 'MORA',
    'id_pago', v_pago_id,
    'id_plan_pago', v_plan_id,
    'monto_aplicado', v_aplicado_total,
    'mora_pendiente', v_mora_pendiente
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_proxima_fecha_calculo_mora(
  p_id_contrato INT
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.contrato_interes_moratorio_configuracion%ROWTYPE;
  v_id_plan_pago BIGINT;
  v_ultima_fecha DATE;
  v_ultimo_estado VARCHAR(20);
  v_ultimo_cierre DATE;
  v_fecha_ancla DATE;
  v_periodos_ciclo INT;
  v_proxima_fecha DATE;
BEGIN
  SELECT configuracion.*
    INTO v_config
  FROM public.contrato_interes_moratorio_configuracion AS configuracion
  WHERE configuracion.id_configuracion = 1;

  IF NOT FOUND OR NOT v_config.activo THEN
    RETURN NULL;
  END IF;

  SELECT calculo.fecha_corte, calculo.estado
    INTO v_ultima_fecha, v_ultimo_estado
  FROM public.contrato_interes_moratorio_calculo AS calculo
  WHERE calculo.id_contrato = p_id_contrato
    AND calculo.estado <> 'ANULADO'
  ORDER BY calculo.fecha_corte DESC, calculo.id_calculo_mora DESC
  LIMIT 1;

  IF FOUND AND v_ultimo_estado = 'GENERADO' THEN
    SELECT MAX(calculo.fecha_corte)
      INTO v_ultimo_cierre
    FROM public.contrato_interes_moratorio_calculo AS calculo
    WHERE calculo.id_contrato = p_id_contrato
      AND calculo.estado = 'SIN_CARGO'
      AND calculo.fecha_corte < v_ultima_fecha;

    SELECT
      MIN(calculo.fecha_corte),
      COUNT(*)::INT
      INTO v_fecha_ancla, v_periodos_ciclo
    FROM public.contrato_interes_moratorio_calculo AS calculo
    WHERE calculo.id_contrato = p_id_contrato
      AND calculo.estado <> 'ANULADO'
      AND (v_ultimo_cierre IS NULL OR calculo.fecha_corte > v_ultimo_cierre);

    RETURN public.calcular_fecha_corte_mora_mensual(v_fecha_ancla, v_periodos_ciclo);
  END IF;

  SELECT plan.id_plan_pago
    INTO v_id_plan_pago
  FROM public.contrato_plan_pago AS plan
  WHERE plan.id_contrato = p_id_contrato
    AND plan.estado = 'VIGENTE'
  ORDER BY plan.version DESC, plan.id_plan_pago DESC
  LIMIT 1;

  IF v_id_plan_pago IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT MIN(
    GREATEST(
      cuota.fecha_vencimiento + v_config.dias_gracia::INT,
      v_config.fecha_efectiva
    )::DATE
  )
    INTO v_proxima_fecha
  FROM public.contrato_cuota AS cuota
  WHERE cuota.id_plan_pago = v_id_plan_pago
    AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND cuota.monto_cuota_total_programada - cuota.monto_pagado_total > 0.009
    AND (
      v_ultima_fecha IS NULL
      OR GREATEST(
        cuota.fecha_vencimiento + v_config.dias_gracia::INT,
        v_config.fecha_efectiva
      )::DATE > v_ultima_fecha
    );

  RETURN v_proxima_fecha;
END;
$$;

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
        OR (
          cuota.estado IN ('PENDIENTE', 'PARCIAL')
          AND cuota.fecha_vencimiento
            < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE
        )
    )::INT AS cuotas_vencidas,
    COALESCE(
      SUM(GREATEST(cuota.monto_cuota_total_programada - cuota.monto_pagado_total, 0)) FILTER (
        WHERE cuota.estado = 'VENCIDA'
          OR (
            cuota.estado IN ('PENDIENTE', 'PARCIAL')
            AND cuota.fecha_vencimiento
              < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE
          )
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
),
mora_resumen AS (
  SELECT
    cargo.id_contrato,
    COALESCE(
      SUM(cargo.monto_original) FILTER (WHERE cargo.estado <> 'ANULADO'),
      0
    )::NUMERIC(14,2) AS mora_generada_total,
    COALESCE(
      SUM(cargo.monto_pagado) FILTER (WHERE cargo.estado <> 'ANULADO'),
      0
    )::NUMERIC(14,2) AS mora_pagada_total,
    COALESCE(
      SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
        WHERE cargo.estado IN ('PENDIENTE', 'PARCIAL')
      ),
      0
    )::NUMERIC(14,2) AS mora_pendiente
  FROM public.contrato_cargo AS cargo
  WHERE cargo.tipo_cargo = 'INTERES_MORATORIO'
  GROUP BY cargo.id_contrato
),
ultimo_calculo_mora AS (
  SELECT DISTINCT ON (calculo.id_contrato)
    calculo.id_contrato,
    calculo.fecha_corte,
    calculo.base_total,
    calculo.monto_generado
  FROM public.contrato_interes_moratorio_calculo AS calculo
  WHERE calculo.estado <> 'ANULADO'
  ORDER BY calculo.id_contrato, calculo.fecha_corte DESC, calculo.id_calculo_mora DESC
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
  resumen.proxima_fecha_vencimiento,
  COALESCE(mora.mora_pendiente, 0)::NUMERIC(14,2) AS mora_pendiente,
  COALESCE(mora.mora_generada_total, 0)::NUMERIC(14,2) AS mora_generada_total,
  COALESCE(mora.mora_pagada_total, 0)::NUMERIC(14,2) AS mora_pagada_total,
  ultimo_calculo.fecha_corte AS ultima_fecha_calculo_mora,
  COALESCE(ultimo_calculo.base_total, 0)::NUMERIC(14,2) AS ultima_base_moratoria,
  COALESCE(ultimo_calculo.monto_generado, 0)::NUMERIC(14,2) AS ultimo_interes_moratorio_generado,
  public.obtener_proxima_fecha_calculo_mora(contrato.id_contrato) AS proxima_fecha_calculo_mora,
  (
    COALESCE(resumen.monto_vencido, 0)
    + COALESCE(mora.mora_pendiente, 0)
  )::NUMERIC(14,2) AS total_vencido_con_mora
FROM public.contrato AS contrato
LEFT JOIN public.cliente AS cliente
  ON cliente.id_cliente = contrato.id_cliente
LEFT JOIN plan_vigente AS plan
  ON plan.id_contrato = contrato.id_contrato
LEFT JOIN cuota_resumen AS resumen
  ON resumen.id_plan_pago = plan.id_plan_pago
LEFT JOIN mora_resumen AS mora
  ON mora.id_contrato = contrato.id_contrato
LEFT JOIN ultimo_calculo_mora AS ultimo_calculo
  ON ultimo_calculo.id_contrato = contrato.id_contrato;

COMMENT ON TABLE public.contrato_interes_moratorio_calculo IS
  'Auditoria inmutable de cada corte mensual de interes moratorio contractual.';
COMMENT ON COLUMN public.contrato_interes_moratorio_calculo.base_cuotas_vencidas IS
  'Saldo de cuotas cuyo sexto dia de atraso ya ocurrio al inicio de fecha_corte.';
COMMENT ON COLUMN public.contrato_interes_moratorio_calculo.base_mora_anterior IS
  'Saldo pendiente de cargos INTERES_MORATORIO anteriores al inicio de fecha_corte.';
COMMENT ON COLUMN public.contrato_pago.tipo_pago IS
  'Concepto exclusivo del recibo: CUOTA o MORA. No existe modalidad MIXTO.';

REVOKE ALL ON FUNCTION public.validar_aplicacion_tipo_pago_contrato()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_cambio_tipo_pago_contrato()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_control_cuotas_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calcular_fecha_corte_mora_mensual(DATE, INT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_interes_moratorio_contrato(INT, DATE, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_interes_moratorio_masivo(DATE, INT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_pago_contrato(
  INT,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_pago_mora_contrato(
  INT,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_proxima_fecha_calculo_mora(INT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.calcular_fecha_corte_mora_mensual(DATE, INT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_interes_moratorio_contrato(INT, DATE, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_interes_moratorio_masivo(DATE, INT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_contrato(
  INT,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_mora_contrato(
  INT,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_proxima_fecha_calculo_mora(INT)
  TO authenticated;

-- Los clientes solo consultan la configuracion y la auditoria. Toda escritura
-- moratoria debe pasar por los RPC SECURITY DEFINER y sus validaciones.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_interes_moratorio_configuracion
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_interes_moratorio_calculo
  FROM anon, authenticated;

GRANT SELECT ON public.contrato_interes_moratorio_configuracion TO authenticated;
GRANT SELECT ON public.contrato_interes_moratorio_calculo TO authenticated;
GRANT SELECT ON public.vw_control_cuotas_resumen TO authenticated;

NOTIFY pgrst, 'reload schema';
