BEGIN;

-- Interes moratorio de mantenimiento:
--   * La anualidad puede pagarse durante todo su mes de vencimiento.
--   * El primer corte es el dia 1 del mes calendario siguiente.
--   * Cada corte posterior ocurre el dia 1.
--   * La base es exclusivamente el principal pendiente al iniciar el corte.
--   * Los intereses moratorios acumulados nunca forman parte de la base.

CREATE TABLE IF NOT EXISTS public.contrato_mantenimiento_interes_moratorio_configuracion (
  id_configuracion SMALLINT PRIMARY KEY DEFAULT 1,
  fecha_efectiva DATE NOT NULL,
  tasa_mensual NUMERIC(9,6) NOT NULL DEFAULT 0.020000,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  usuario_actualizacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_mantenimiento_mora_config_unica CHECK (id_configuracion = 1),
  CONSTRAINT chk_mantenimiento_mora_config_fecha_corte
    CHECK (fecha_efectiva = date_trunc('month', fecha_efectiva)::DATE),
  CONSTRAINT chk_mantenimiento_mora_config_tasa
    CHECK (tasa_mensual >= 0 AND tasa_mensual <= 1)
);

INSERT INTO public.contrato_mantenimiento_interes_moratorio_configuracion (
  id_configuracion,
  fecha_efectiva,
  tasa_mensual,
  activo,
  usuario_actualizacion
)
VALUES (
  1,
  date_trunc(
    'month',
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  )::DATE,
  0.020000,
  TRUE,
  'migracion_202608110002'
)
ON CONFLICT (id_configuracion) DO NOTHING;

ALTER TABLE public.contrato_mantenimiento_pago
  ADD COLUMN IF NOT EXISTS tipo_pago VARCHAR(10),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

UPDATE public.contrato_mantenimiento_pago
SET tipo_pago = 'CUOTA'
WHERE tipo_pago IS NULL;

ALTER TABLE public.contrato_mantenimiento_pago
  ALTER COLUMN tipo_pago SET DEFAULT 'CUOTA',
  ALTER COLUMN tipo_pago SET NOT NULL;

ALTER TABLE public.contrato_mantenimiento_pago
  DROP CONSTRAINT IF EXISTS chk_contrato_mantenimiento_pago_tipo_pago;

ALTER TABLE public.contrato_mantenimiento_pago
  ADD CONSTRAINT chk_contrato_mantenimiento_pago_tipo_pago
  CHECK (tipo_pago IN ('CUOTA', 'MORA'));

ALTER TABLE public.contrato_mantenimiento_pago
  DROP CONSTRAINT IF EXISTS chk_contrato_mantenimiento_pago_idempotency_key;

ALTER TABLE public.contrato_mantenimiento_pago
  ADD CONSTRAINT chk_contrato_mantenimiento_pago_idempotency_key
  CHECK (
    idempotency_key IS NULL
    OR (
      LENGTH(TRIM(idempotency_key)) BETWEEN 1 AND 200
      AND idempotency_key = TRIM(idempotency_key)
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_mantenimiento_pago_idempotency
  ON public.contrato_mantenimiento_pago (
    id_contrato,
    tipo_pago,
    idempotency_key
  )
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contrato_mantenimiento_pago_tipo_fecha
  ON public.contrato_mantenimiento_pago (
    id_contrato,
    tipo_pago,
    fecha_pago DESC
  );

CREATE TABLE IF NOT EXISTS public.contrato_mantenimiento_cargo (
  id_cargo_mantenimiento BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL
    REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  id_cuota_mantenimiento BIGINT NOT NULL
    REFERENCES public.contrato_mantenimiento_cuota (id_cuota_mantenimiento)
    ON DELETE RESTRICT,
  tipo_cargo VARCHAR(30) NOT NULL DEFAULT 'INTERES_MORATORIO',
  descripcion TEXT NOT NULL,
  fecha_corte DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  monto_original NUMERIC(14,2) NOT NULL,
  monto_pagado NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_contrato_mantenimiento_cargo_tipo
    CHECK (tipo_cargo = 'INTERES_MORATORIO'),
  CONSTRAINT chk_contrato_mantenimiento_cargo_estado
    CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADO', 'ANULADO')),
  CONSTRAINT chk_contrato_mantenimiento_cargo_montos
    CHECK (
      monto_original > 0
      AND monto_pagado >= 0
      AND monto_pagado <= monto_original
    ),
  CONSTRAINT chk_contrato_mantenimiento_cargo_fechas
    CHECK (fecha_vencimiento = fecha_corte)
);

CREATE INDEX IF NOT EXISTS idx_contrato_mantenimiento_cargo_fifo
  ON public.contrato_mantenimiento_cargo (
    id_contrato,
    fecha_corte,
    id_cargo_mantenimiento
  )
  WHERE estado IN ('PENDIENTE', 'PARCIAL');

CREATE TABLE IF NOT EXISTS public.contrato_mantenimiento_interes_moratorio_calculo (
  id_calculo_mora_mantenimiento BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL
    REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  id_cuota_mantenimiento BIGINT NOT NULL
    REFERENCES public.contrato_mantenimiento_cuota (id_cuota_mantenimiento)
    ON DELETE RESTRICT,
  id_cargo_mantenimiento BIGINT NULL UNIQUE
    REFERENCES public.contrato_mantenimiento_cargo (id_cargo_mantenimiento)
    ON DELETE RESTRICT,
  periodo_mora DATE NOT NULL,
  fecha_corte DATE NOT NULL,
  tasa_mensual NUMERIC(9,6) NOT NULL,
  base_principal_pendiente NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_generado NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'GENERADO',
  detalle_principal JSONB NOT NULL DEFAULT '{}'::JSONB,
  usuario_creacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anulado_at TIMESTAMPTZ,
  anulado_por TEXT,
  motivo_anulacion TEXT,
  CONSTRAINT chk_mantenimiento_mora_calculo_estado
    CHECK (estado IN ('GENERADO', 'SIN_CARGO', 'ANULADO')),
  CONSTRAINT chk_mantenimiento_mora_calculo_periodo
    CHECK (
      periodo_mora = date_trunc('month', fecha_corte)::DATE
      AND fecha_corte = date_trunc('month', fecha_corte)::DATE
    ),
  CONSTRAINT chk_mantenimiento_mora_calculo_tasa
    CHECK (tasa_mensual >= 0 AND tasa_mensual <= 1),
  CONSTRAINT chk_mantenimiento_mora_calculo_montos
    CHECK (
      base_principal_pendiente >= 0
      AND monto_generado = ROUND(
        (base_principal_pendiente * tasa_mensual)::NUMERIC,
        2
      )
    ),
  CONSTRAINT chk_mantenimiento_mora_calculo_cargo
    CHECK (
      (
        estado = 'GENERADO'
        AND monto_generado > 0
        AND id_cargo_mantenimiento IS NOT NULL
      )
      OR (
        estado = 'SIN_CARGO'
        AND monto_generado = 0
        AND id_cargo_mantenimiento IS NULL
      )
      OR estado = 'ANULADO'
    ),
  CONSTRAINT chk_mantenimiento_mora_calculo_detalle
    CHECK (jsonb_typeof(detalle_principal) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mantenimiento_mora_calculo_corte
  ON public.contrato_mantenimiento_interes_moratorio_calculo (
    id_cuota_mantenimiento,
    fecha_corte
  );

CREATE INDEX IF NOT EXISTS idx_mantenimiento_mora_calculo_contrato_fecha
  ON public.contrato_mantenimiento_interes_moratorio_calculo (
    id_contrato,
    fecha_corte DESC
  );

ALTER TABLE public.contrato_mantenimiento_pago_aplicacion
  ALTER COLUMN id_cuota_mantenimiento DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS id_cargo_mantenimiento BIGINT NULL
    REFERENCES public.contrato_mantenimiento_cargo (id_cargo_mantenimiento)
    ON DELETE RESTRICT;

ALTER TABLE public.contrato_mantenimiento_pago_aplicacion
  DROP CONSTRAINT IF EXISTS chk_mantenimiento_pago_aplicacion_destino;

ALTER TABLE public.contrato_mantenimiento_pago_aplicacion
  ADD CONSTRAINT chk_mantenimiento_pago_aplicacion_destino
  CHECK (
    (id_cuota_mantenimiento IS NOT NULL)::INT
    + (id_cargo_mantenimiento IS NOT NULL)::INT
    = 1
  );

CREATE INDEX IF NOT EXISTS idx_mantenimiento_pago_aplicacion_cargo
  ON public.contrato_mantenimiento_pago_aplicacion (id_cargo_mantenimiento)
  WHERE id_cargo_mantenimiento IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_control_mantenimiento_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Consultar auth.users evita confiar en user_metadata o en un JWT viejo.
  -- La migracion 202608270001 vuelve a centralizar este helper, pero esta
  -- definicion tambien debe ser segura si se ejecuta antes que ella.
  IF session_user IN ('postgres', 'supabase_admin')
     OR auth.role() = 'service_role'
     OR EXISTS (
       SELECT 1
       FROM auth.users AS usuario
       WHERE usuario.id = auth.uid()
         AND usuario.raw_app_meta_data ->> 'role' = 'admin'
         AND usuario.deleted_at IS NULL
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'No autorizado para modificar el control de mantenimiento'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_aplicacion_tipo_pago_mantenimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_pago VARCHAR(10);
  v_id_contrato_pago INT;
  v_id_contrato_destino INT;
BEGIN
  SELECT pago.tipo_pago, pago.id_contrato
    INTO v_tipo_pago, v_id_contrato_pago
  FROM public.contrato_mantenimiento_pago AS pago
  WHERE pago.id_pago_mantenimiento = NEW.id_pago_mantenimiento
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago de mantenimiento % no existe',
      NEW.id_pago_mantenimiento;
  END IF;

  IF v_tipo_pago = 'CUOTA' THEN
    IF NEW.id_cuota_mantenimiento IS NULL
       OR NEW.id_cargo_mantenimiento IS NOT NULL THEN
      RAISE EXCEPTION
        'Un pago CUOTA de mantenimiento solo puede aplicarse a una anualidad';
    END IF;

    SELECT cuota.id_contrato
      INTO v_id_contrato_destino
    FROM public.contrato_mantenimiento_cuota AS cuota
    WHERE cuota.id_cuota_mantenimiento = NEW.id_cuota_mantenimiento
    FOR SHARE;
  ELSIF v_tipo_pago = 'MORA' THEN
    IF NEW.id_cargo_mantenimiento IS NULL
       OR NEW.id_cuota_mantenimiento IS NOT NULL THEN
      RAISE EXCEPTION
        'Un pago MORA de mantenimiento solo puede aplicarse a un cargo moratorio';
    END IF;

    SELECT cargo.id_contrato
      INTO v_id_contrato_destino
    FROM public.contrato_mantenimiento_cargo AS cargo
    WHERE cargo.id_cargo_mantenimiento = NEW.id_cargo_mantenimiento
      AND cargo.tipo_cargo = 'INTERES_MORATORIO'
    FOR SHARE;
  ELSE
    RAISE EXCEPTION 'Tipo de pago de mantenimiento no soportado: %',
      v_tipo_pago;
  END IF;

  IF v_id_contrato_destino IS NULL THEN
    RAISE EXCEPTION 'El destino de la aplicacion de mantenimiento no existe';
  END IF;

  IF v_id_contrato_destino <> v_id_contrato_pago THEN
    RAISE EXCEPTION
      'El pago de mantenimiento y su aplicacion pertenecen a contratos diferentes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_aplicacion_tipo_pago_mantenimiento
  ON public.contrato_mantenimiento_pago_aplicacion;

CREATE TRIGGER trg_validar_aplicacion_tipo_pago_mantenimiento
BEFORE INSERT OR UPDATE
ON public.contrato_mantenimiento_pago_aplicacion
FOR EACH ROW
EXECUTE FUNCTION public.validar_aplicacion_tipo_pago_mantenimiento();

CREATE OR REPLACE FUNCTION public.validar_cambio_tipo_pago_mantenimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id_contrato IS DISTINCT FROM OLD.id_contrato
     AND EXISTS (
       SELECT 1
       FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
       WHERE aplicacion.id_pago_mantenimiento = OLD.id_pago_mantenimiento
     ) THEN
    RAISE EXCEPTION
      'No se puede cambiar el contrato de un pago de mantenimiento aplicado';
  END IF;

  IF NEW.tipo_pago IS DISTINCT FROM OLD.tipo_pago THEN
    IF NEW.tipo_pago = 'CUOTA'
       AND EXISTS (
         SELECT 1
         FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
         WHERE aplicacion.id_pago_mantenimiento = OLD.id_pago_mantenimiento
           AND (
             aplicacion.id_cuota_mantenimiento IS NULL
             OR aplicacion.id_cargo_mantenimiento IS NOT NULL
           )
       ) THEN
      RAISE EXCEPTION
        'El pago no puede convertirse a CUOTA porque posee aplicaciones de mora';
    END IF;

    IF NEW.tipo_pago = 'MORA'
       AND EXISTS (
         SELECT 1
         FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
         WHERE aplicacion.id_pago_mantenimiento = OLD.id_pago_mantenimiento
           AND (
             aplicacion.id_cargo_mantenimiento IS NULL
             OR aplicacion.id_cuota_mantenimiento IS NOT NULL
           )
       ) THEN
      RAISE EXCEPTION
        'El pago no puede convertirse a MORA porque posee aplicaciones de cuota';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cambio_tipo_pago_mantenimiento
  ON public.contrato_mantenimiento_pago;

CREATE TRIGGER trg_validar_cambio_tipo_pago_mantenimiento
BEFORE UPDATE OF id_contrato, tipo_pago
ON public.contrato_mantenimiento_pago
FOR EACH ROW
EXECUTE FUNCTION public.validar_cambio_tipo_pago_mantenimiento();

-- Los saldos de cuota/cargo se almacenan de forma acumulada. Hasta contar con
-- un RPC de reversa que restaure ambos lados atomicamente, un pago aplicado y
-- sus aplicaciones financieras deben permanecer inmutables.
CREATE OR REPLACE FUNCTION public.bloquear_mutacion_pago_mantenimiento_aplicado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
    WHERE aplicacion.id_pago_mantenimiento = OLD.id_pago_mantenimiento
  ) AND (
    NEW.id_pago_mantenimiento IS DISTINCT FROM OLD.id_pago_mantenimiento
    OR NEW.id_contrato IS DISTINCT FROM OLD.id_contrato
    OR NEW.fecha_pago IS DISTINCT FROM OLD.fecha_pago
    OR NEW.monto_total IS DISTINCT FROM OLD.monto_total
    OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago
    OR NEW.referencia IS DISTINCT FROM OLD.referencia
    OR NEW.observacion IS DISTINCT FROM OLD.observacion
    OR NEW.estado IS DISTINCT FROM OLD.estado
    OR NEW.registrado_por IS DISTINCT FROM OLD.registrado_por
    OR NEW.tipo_pago IS DISTINCT FROM OLD.tipo_pago
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  ) THEN
    RAISE EXCEPTION
      'Los datos financieros de un pago de mantenimiento aplicado son inmutables; se requiere una reversa transaccional'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_mutacion_pago_mantenimiento_aplicado
  ON public.contrato_mantenimiento_pago;

CREATE TRIGGER trg_bloquear_mutacion_pago_mantenimiento_aplicado
BEFORE UPDATE OF
  id_pago_mantenimiento,
  id_contrato,
  fecha_pago,
  monto_total,
  metodo_pago,
  referencia,
  observacion,
  estado,
  registrado_por,
  tipo_pago,
  idempotency_key
ON public.contrato_mantenimiento_pago
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_mutacion_pago_mantenimiento_aplicado();

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_aplicacion_mantenimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'La aplicacion financiera de un pago de mantenimiento es inmutable'
      USING ERRCODE = '23514';
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'La aplicacion financiera de un pago de mantenimiento es inmutable'
    USING ERRCODE = '23514';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_mutacion_aplicacion_mantenimiento
  ON public.contrato_mantenimiento_pago_aplicacion;

CREATE TRIGGER trg_bloquear_mutacion_aplicacion_mantenimiento
BEFORE UPDATE OR DELETE
ON public.contrato_mantenimiento_pago_aplicacion
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_mutacion_aplicacion_mantenimiento();

CREATE OR REPLACE FUNCTION public.sincronizar_interes_moratorio_mantenimiento_contrato(
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
  v_config public.contrato_mantenimiento_interes_moratorio_configuracion%ROWTYPE;
  v_estado_contrato TEXT;
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_hoy_cr DATE := (
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  )::DATE;
  v_fecha_hasta DATE := COALESCE(
    p_fecha_hasta,
    (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE
  );
  v_fecha_corte DATE;
  v_ultima_fecha_corte DATE;
  v_ultimo_estado VARCHAR(20);
  v_base_principal NUMERIC(14,2);
  v_monto_generado NUMERIC(14,2);
  v_id_cargo BIGINT;
  v_id_calculo BIGINT;
  v_calculos_procesados INT := 0;
  v_cargos_generados INT := 0;
  v_resultados JSONB := '[]'::JSONB;
  rec_cuota RECORD;
BEGIN
  PERFORM public.assert_control_mantenimiento_admin();

  IF p_id_contrato IS NULL THEN
    RAISE EXCEPTION 'El contrato es obligatorio';
  END IF;

  IF v_fecha_hasta > v_hoy_cr THEN
    RAISE EXCEPTION
      'La fecha de sincronizacion % no puede ser posterior a la fecha actual de Costa Rica %',
      v_fecha_hasta,
      v_hoy_cr;
  END IF;

  SELECT configuracion.*
    INTO v_config
  FROM public.contrato_mantenimiento_interes_moratorio_configuracion AS configuracion
  WHERE configuracion.id_configuracion = 1
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'No existe la configuracion de interes moratorio de mantenimiento';
  END IF;

  SELECT contrato.estado_contrato::TEXT
    INTO v_estado_contrato
  FROM public.contrato AS contrato
  WHERE contrato.id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF v_estado_contrato <> 'VIGENTE' THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'omitido', TRUE,
      'motivo', 'CONTRATO_NO_VIGENTE',
      'id_contrato', p_id_contrato,
      'fecha_hasta', v_fecha_hasta,
      'calculos_procesados', 0,
      'cargos_generados', 0,
      'calculos', '[]'::JSONB
    );
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

  -- El lock de la cabecera serializa sincronizaciones concurrentes. Los locks
  -- siguientes protegen las anualidades, cargos y cortes ya materializados.
  PERFORM 1
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.id_contrato = p_id_contrato
  FOR UPDATE;

  PERFORM 1
  FROM public.contrato_mantenimiento_cargo AS cargo
  WHERE cargo.id_contrato = p_id_contrato
  FOR UPDATE;

  PERFORM 1
  FROM public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
  WHERE calculo.id_contrato = p_id_contrato
  FOR UPDATE;

  FOR rec_cuota IN
    SELECT
      cuota.id_cuota_mantenimiento,
      cuota.numero_periodo,
      cuota.fecha_vencimiento,
      cuota.monto_programado
    FROM public.contrato_mantenimiento_cuota AS cuota
    WHERE cuota.id_contrato = p_id_contrato
      AND cuota.estado <> 'ANULADA'
      AND GREATEST(
        (
          date_trunc('month', cuota.fecha_vencimiento)::DATE
          + INTERVAL '1 month'
        )::DATE,
        v_config.fecha_efectiva
      ) <= v_fecha_hasta
    ORDER BY cuota.fecha_vencimiento, cuota.numero_periodo
  LOOP
    SELECT calculo.fecha_corte, calculo.estado
      INTO v_ultima_fecha_corte, v_ultimo_estado
    FROM public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
    WHERE calculo.id_cuota_mantenimiento = rec_cuota.id_cuota_mantenimiento
    ORDER BY calculo.fecha_corte DESC,
      calculo.id_calculo_mora_mantenimiento DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_ultimo_estado IN ('SIN_CARGO', 'ANULADO') THEN
        CONTINUE;
      END IF;

      v_fecha_corte := (
        date_trunc('month', v_ultima_fecha_corte)::DATE
        + INTERVAL '1 month'
      )::DATE;
    ELSE
      -- La fecha efectiva evita cobros retroactivos. Al estar anclada al dia 1,
      -- el calendario de cortes permanece siempre en el primer dia de mes.
      v_fecha_corte := GREATEST(
        (
          date_trunc('month', rec_cuota.fecha_vencimiento)::DATE
          + INTERVAL '1 month'
        )::DATE,
        v_config.fecha_efectiva
      );
    END IF;

    WHILE v_fecha_corte <= v_fecha_hasta LOOP
      -- El corte ocurre al iniciar el dia local. Un pago del mismo dia sucede
      -- despues del corte y por eso solo se restan pagos con fecha local menor.
      SELECT ROUND(
        GREATEST(
          rec_cuota.monto_programado
          - COALESCE(
            SUM(aplicacion.monto_aplicado) FILTER (
              WHERE pago.id_pago_mantenimiento IS NOT NULL
            ),
            0
          ),
          0
        )::NUMERIC,
        2
      )
        INTO v_base_principal
      FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
      JOIN public.contrato_mantenimiento_pago AS pago
        ON pago.id_pago_mantenimiento = aplicacion.id_pago_mantenimiento
       AND pago.estado = 'APLICADO'
       AND pago.tipo_pago = 'CUOTA'
       AND (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE
         < v_fecha_corte
      WHERE aplicacion.id_cuota_mantenimiento
        = rec_cuota.id_cuota_mantenimiento
        AND aplicacion.id_cargo_mantenimiento IS NULL;

      v_base_principal := ROUND(COALESCE(v_base_principal, 0)::NUMERIC, 2);
      v_monto_generado := ROUND(
        (v_base_principal * v_config.tasa_mensual)::NUMERIC,
        2
      );
      v_id_cargo := NULL;

      -- Una anualidad pagada antes de su primer corte nunca crea registros de
      -- mora. Despues de iniciar un ciclo, un corte en cero lo cierra y audita.
      IF v_monto_generado <= 0 AND v_ultima_fecha_corte IS NULL THEN
        EXIT;
      END IF;

      IF v_monto_generado > 0 THEN
        INSERT INTO public.contrato_mantenimiento_cargo (
          id_contrato,
          id_cuota_mantenimiento,
          tipo_cargo,
          descripcion,
          fecha_corte,
          fecha_vencimiento,
          monto_original,
          monto_pagado,
          estado,
          notas
        )
        VALUES (
          p_id_contrato,
          rec_cuota.id_cuota_mantenimiento,
          'INTERES_MORATORIO',
          FORMAT(
            'Interes moratorio de mantenimiento del %s%% - corte %s',
            TRIM(
              TRAILING '.' FROM TRIM(
                TRAILING '0' FROM (v_config.tasa_mensual * 100)::TEXT
              )
            ),
            TO_CHAR(v_fecha_corte, 'YYYY-MM-DD')
          ),
          v_fecha_corte,
          v_fecha_corte,
          v_monto_generado,
          0,
          'PENDIENTE',
          'Generado automaticamente por sincronizacion moratoria de mantenimiento'
        )
        RETURNING id_cargo_mantenimiento INTO v_id_cargo;
      END IF;

      INSERT INTO public.contrato_mantenimiento_interes_moratorio_calculo (
        id_contrato,
        id_cuota_mantenimiento,
        id_cargo_mantenimiento,
        periodo_mora,
        fecha_corte,
        tasa_mensual,
        base_principal_pendiente,
        monto_generado,
        estado,
        detalle_principal,
        usuario_creacion
      )
      VALUES (
        p_id_contrato,
        rec_cuota.id_cuota_mantenimiento,
        v_id_cargo,
        date_trunc('month', v_fecha_corte)::DATE,
        v_fecha_corte,
        v_config.tasa_mensual,
        v_base_principal,
        v_monto_generado,
        CASE WHEN v_monto_generado > 0 THEN 'GENERADO' ELSE 'SIN_CARGO' END,
        jsonb_build_object(
          'id_cuota_mantenimiento', rec_cuota.id_cuota_mantenimiento,
          'numero_periodo', rec_cuota.numero_periodo,
          'fecha_vencimiento', rec_cuota.fecha_vencimiento,
          'monto_programado', rec_cuota.monto_programado,
          'base_principal_pendiente', v_base_principal,
          'incluye_interes_anterior', FALSE
        ),
        v_usuario
      )
      RETURNING id_calculo_mora_mantenimiento INTO v_id_calculo;

      v_calculos_procesados := v_calculos_procesados + 1;
      IF v_monto_generado > 0 THEN
        v_cargos_generados := v_cargos_generados + 1;
      END IF;

      v_resultados := v_resultados || jsonb_build_array(
        jsonb_build_object(
          'id_calculo_mora_mantenimiento', v_id_calculo,
          'id_cargo_mantenimiento', v_id_cargo,
          'id_cuota_mantenimiento', rec_cuota.id_cuota_mantenimiento,
          'fecha_corte', v_fecha_corte,
          'base_principal_pendiente', v_base_principal,
          'monto_generado', v_monto_generado,
          'estado', CASE
            WHEN v_monto_generado > 0 THEN 'GENERADO'
            ELSE 'SIN_CARGO'
          END
        )
      );

      v_ultima_fecha_corte := v_fecha_corte;
      EXIT WHEN v_monto_generado = 0;

      v_fecha_corte := (
        date_trunc('month', v_fecha_corte)::DATE
        + INTERVAL '1 month'
      )::DATE;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id_contrato', p_id_contrato,
    'fecha_hasta', v_fecha_hasta,
    'fecha_efectiva', v_config.fecha_efectiva,
    'tasa_mensual', v_config.tasa_mensual,
    'calculos_procesados', v_calculos_procesados,
    'cargos_generados', v_cargos_generados,
    'calculos', v_resultados
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
  v_hoy_cr DATE := (
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  )::DATE;
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
  v_fecha_mora DATE;
  v_estado VARCHAR(20);
  v_monto_cuota NUMERIC(14,2);
BEGIN
  PERFORM public.assert_control_mantenimiento_admin();

  SELECT *
    INTO v_contrato
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF v_contrato.estado_contrato::TEXT <> 'VIGENTE' THEN
    RAISE EXCEPTION
      'Solo se pueden sincronizar cuotas de mantenimiento para contratos vigentes';
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
    RAISE EXCEPTION
      'El contrato % no tiene fecha de inicio de mantenimiento definida',
      p_id_contrato;
  END IF;

  IF v_contrato.fecha_inicio_mantenimiento IS NULL THEN
    UPDATE public.contrato
    SET fecha_inicio_mantenimiento = v_fecha_inicio
    WHERE id_contrato = p_id_contrato;
  END IF;

  v_monto := ROUND(
    COALESCE(v_contrato.monto_mantenimiento_anual, 0)::NUMERIC,
    2
  );
  IF v_monto <= 0 THEN
    RAISE EXCEPTION
      'El contrato % no tiene un monto anual de mantenimiento valido',
      p_id_contrato;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.contrato_producto
    WHERE id_contrato = p_id_contrato
      AND tipo_producto IN ('LOTE', 'CENIZARIO')
  )
    INTO v_tiene_producto;

  IF NOT v_tiene_producto THEN
    RAISE EXCEPTION
      'El contrato % no tiene productos elegibles para mantenimiento',
      p_id_contrato;
  END IF;

  -- El vencimiento operativo comienza el primer dia del mes siguiente. Por
  -- tanto PENDIENTE/PARCIAL se conserva durante todo el mes calendario de la
  -- anualidad, aunque fecha_vencimiento sea el primer dia de ese mes.
  UPDATE public.contrato_mantenimiento_cuota
  SET estado = CASE
    WHEN estado = 'ANULADA' THEN 'ANULADA'
    WHEN monto_pagado >= monto_programado THEN 'PAGADA'
    WHEN monto_pagado > 0 THEN
      CASE
        WHEN (
          date_trunc('month', fecha_vencimiento)::DATE
          + INTERVAL '1 month'
        )::DATE <= v_hoy_cr THEN 'VENCIDA'
        ELSE 'PARCIAL'
      END
    WHEN (
      date_trunc('month', fecha_vencimiento)::DATE
      + INTERVAL '1 month'
    )::DATE <= v_hoy_cr THEN 'VENCIDA'
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
    v_monto_cuota := ROUND(v_cuota.monto_programado::NUMERIC, 2);

    -- Una anualidad sin pagos puede seguir el monto configurado del contrato,
    -- pero deja de ser mutable desde el primer corte moratorio para conservar
    -- exactamente la base historica que consta en la auditoria.
    IF v_cuota.monto_pagado <= 0.009
       AND NOT EXISTS (
         SELECT 1
         FROM public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
         WHERE calculo.id_cuota_mantenimiento
           = v_cuota.id_cuota_mantenimiento
       ) THEN
      UPDATE public.contrato_mantenimiento_cuota
      SET
        monto_programado = v_monto,
        estado = CASE
          WHEN (
            date_trunc('month', fecha_vencimiento)::DATE
            + INTERVAL '1 month'
          )::DATE <= v_hoy_cr THEN 'VENCIDA'
          ELSE 'PENDIENTE'
        END
      WHERE id_cuota_mantenimiento = v_cuota.id_cuota_mantenimiento;

      v_monto_cuota := v_monto;
    END IF;

    v_fecha_mora := (
      date_trunc('month', v_cuota.fecha_vencimiento)::DATE
      + INTERVAL '1 month'
    )::DATE;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'id_contrato', p_id_contrato,
      'cuotas_sincronizadas', 1,
      'id_cuota_mantenimiento', v_cuota.id_cuota_mantenimiento,
      'numero_periodo', v_cuota.numero_periodo,
      'proxima_fecha_vencimiento', v_cuota.fecha_vencimiento,
      'fecha_inicio_mora', v_fecha_mora,
      'monto_anual', v_monto_cuota,
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
    -- Un contrato sin historial inicia en la anualidad de su calendario
    -- vigente; no se generan automaticamente todos los anos anteriores.
    v_periodo_calendario := GREATEST(
      EXTRACT(YEAR FROM v_hoy_cr)::INT
      - EXTRACT(YEAR FROM v_fecha_inicio)::INT
      + 1,
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
  v_fecha_mora := (
    date_trunc('month', v_fecha_vencimiento)::DATE
    + INTERVAL '1 month'
  )::DATE;
  v_estado := CASE
    WHEN v_fecha_mora <= v_hoy_cr THEN 'VENCIDA'
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
    'ok', TRUE,
    'id_contrato', p_id_contrato,
    'cuotas_sincronizadas', 1,
    'id_cuota_mantenimiento', v_cuota_id,
    'numero_periodo', v_periodo,
    'proxima_fecha_vencimiento', v_fecha_vencimiento,
    'fecha_inicio_mora', v_fecha_mora,
    'monto_anual', v_monto,
    'usuario', v_usuario,
    'p_hasta_fecha_ignorada', p_hasta_fecha
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
  v_hoy_cr DATE := (
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  )::DATE;
  v_contrato RECORD;
  v_resultado_mora JSONB;
  v_procesados INT := 0;
  v_calculos_mora INT := 0;
  v_cargos_mora INT := 0;
BEGIN
  PERFORM public.assert_control_mantenimiento_admin();

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
    ORDER BY c.id_contrato
  LOOP
    PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
      p_id_contrato => v_contrato.id_contrato,
      p_hasta_fecha => NULL,
      p_usuario => v_usuario
    );

    v_resultado_mora :=
      public.sincronizar_interes_moratorio_mantenimiento_contrato(
        p_id_contrato => v_contrato.id_contrato,
        p_fecha_hasta => v_hoy_cr,
        p_usuario => v_usuario
      );

    v_procesados := v_procesados + 1;
    v_calculos_mora := v_calculos_mora
      + COALESCE((v_resultado_mora ->> 'calculos_procesados')::INT, 0);
    v_cargos_mora := v_cargos_mora
      + COALESCE((v_resultado_mora ->> 'cargos_generados')::INT, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'contratos_procesados', v_procesados,
    'cuotas_abiertas_por_contrato', 1,
    'calculos_mora_procesados', v_calculos_mora,
    'cargos_mora_generados', v_cargos_mora,
    'fecha_hasta', v_hoy_cr
  );
END;
$$;

-- La firma anterior queda eliminada para que PostgREST no encuentre dos
-- sobrecargas ambiguas cuando se envie la llave de idempotencia.
DROP FUNCTION IF EXISTS public.registrar_pago_mantenimiento(
  INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.registrar_pago_mantenimiento(
  p_id_contrato INT,
  p_monto_total NUMERIC,
  p_fecha_pago TIMESTAMPTZ DEFAULT NOW(),
  p_metodo_pago TEXT DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
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
  v_fecha_pago_cr DATE;
  v_hoy_cr DATE := (
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  )::DATE;
  v_metodo_pago TEXT := NULLIF(TRIM(COALESCE(p_metodo_pago, '')), '');
  v_referencia TEXT := NULLIF(TRIM(COALESCE(p_referencia, '')), '');
  v_idempotency_key TEXT := NULLIF(
    TRIM(COALESCE(p_idempotency_key, '')),
    ''
  );
  v_monto_pago NUMERIC(14,2) := ROUND(
    COALESCE(p_monto_total, 0)::NUMERIC,
    2
  );
  v_pago_existente public.contrato_mantenimiento_pago%ROWTYPE;
  v_pago_id BIGINT;
  v_id_cuota BIGINT;
  v_saldo_cuota NUMERIC(14,2);
  v_aplicado_total NUMERIC(14,2) := 0;
  v_corte_posterior DATE;
  v_pago_posterior DATE;
  v_proxima_fecha DATE;
  v_saldo_principal NUMERIC(14,2) := 0;
  v_cuota RECORD;
BEGIN
  PERFORM public.assert_control_mantenimiento_admin();

  IF p_id_contrato IS NULL THEN
    RAISE EXCEPTION 'El contrato es obligatorio';
  END IF;

  IF v_monto_pago <= 0 THEN
    RAISE EXCEPTION
      'El monto del pago de mantenimiento debe ser mayor a cero';
  END IF;

  IF v_idempotency_key IS NOT NULL
     AND LENGTH(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION
      'La llave de idempotencia no puede exceder 200 caracteres';
  END IF;

  IF v_metodo_pago IS NOT NULL
     AND v_metodo_pago NOT IN (
       'Transferencia',
       'Efectivo',
       'Deposito',
       'SINPE',
       'Tarjeta'
     ) THEN
    RAISE EXCEPTION 'Metodo de pago no permitido: %', v_metodo_pago;
  END IF;

  v_fecha_pago_cr := (
    v_fecha_pago AT TIME ZONE 'America/Costa_Rica'
  )::DATE;

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
    FROM public.contrato_mantenimiento_pago AS pago
    WHERE pago.id_contrato = p_id_contrato
      AND pago.tipo_pago = 'CUOTA'
      AND pago.idempotency_key = v_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF ROUND(v_pago_existente.monto_total::NUMERIC, 2) <> v_monto_pago
         OR (
           v_pago_existente.fecha_pago AT TIME ZONE 'America/Costa_Rica'
         )::DATE <> v_fecha_pago_cr
         OR v_pago_existente.metodo_pago IS DISTINCT FROM v_metodo_pago
         OR v_pago_existente.referencia IS DISTINCT FROM v_referencia
         OR v_pago_existente.observacion IS DISTINCT FROM p_observacion THEN
        RAISE EXCEPTION
          'La llave de idempotencia ya fue usada con datos diferentes';
      END IF;

      IF v_pago_existente.estado <> 'APLICADO' THEN
        RAISE EXCEPTION
          'La llave de idempotencia pertenece a un pago no aplicado';
      END IF;

      SELECT
        COALESCE(SUM(aplicacion.monto_aplicado), 0)::NUMERIC(14,2),
        MIN(aplicacion.id_cuota_mantenimiento)
        INTO v_aplicado_total, v_id_cuota
      FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
      WHERE aplicacion.id_pago_mantenimiento
        = v_pago_existente.id_pago_mantenimiento;

      IF ROUND(v_aplicado_total::NUMERIC, 2) <> v_monto_pago
         OR v_id_cuota IS NULL THEN
        RAISE EXCEPTION
          'El pago idempotente existente tiene aplicaciones inconsistentes';
      END IF;

      SELECT
        cuota.fecha_vencimiento,
        COALESCE(
          GREATEST(cuota.monto_programado - cuota.monto_pagado, 0),
          0
        )::NUMERIC(14,2)
        INTO v_proxima_fecha, v_saldo_principal
      FROM public.contrato_mantenimiento_cuota AS cuota
      WHERE cuota.id_contrato = p_id_contrato
        AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
        AND cuota.monto_programado - cuota.monto_pagado > 0.009
      ORDER BY cuota.fecha_vencimiento, cuota.numero_periodo
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', TRUE,
        'idempotent_replay', TRUE,
        'tipo_pago', 'CUOTA',
        'id_pago_mantenimiento',
          v_pago_existente.id_pago_mantenimiento,
        'id_cuota_mantenimiento', v_id_cuota,
        'monto_aplicado', v_aplicado_total,
        'saldo_principal_pendiente', v_saldo_principal,
        'proxima_fecha_vencimiento', v_proxima_fecha
      );
    END IF;
  END IF;

  SELECT MAX(
    (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE
  )
    INTO v_pago_posterior
  FROM public.contrato_mantenimiento_pago AS pago
  WHERE pago.id_contrato = p_id_contrato
    AND pago.estado = 'APLICADO'
    AND (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE
      > v_fecha_pago_cr;

  IF v_pago_posterior IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede registrar un pago de mantenimiento con fecha %: ya existen pagos posteriores hasta %',
      v_fecha_pago_cr,
      v_pago_posterior
      USING ERRCODE = '22007';
  END IF;

  SELECT MAX(calculo.fecha_corte)
    INTO v_corte_posterior
  FROM public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
  WHERE calculo.id_contrato = p_id_contrato
    AND calculo.estado <> 'ANULADO'
    AND calculo.fecha_corte > v_fecha_pago_cr;

  IF v_corte_posterior IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede registrar un pago de mantenimiento con fecha %: ya existen cortes moratorios posteriores hasta %',
      v_fecha_pago_cr,
      v_corte_posterior
      USING ERRCODE = '22007';
  END IF;

  -- Primero se garantiza la anualidad abierta. Despues se materializa cualquier
  -- corte que corresponda a la fecha del pago: el pago del mismo dia ocurre
  -- despues del corte y no puede disminuir su base historica.
  PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
    p_id_contrato => p_id_contrato,
    p_hasta_fecha => v_fecha_pago_cr,
    p_usuario => v_usuario
  );

  PERFORM public.sincronizar_interes_moratorio_mantenimiento_contrato(
    p_id_contrato => p_id_contrato,
    p_fecha_hasta => v_fecha_pago_cr,
    p_usuario => v_usuario
  );

  SELECT cuota.*
    INTO v_cuota
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.id_contrato = p_id_contrato
    AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND cuota.monto_programado - cuota.monto_pagado > 0.009
  ORDER BY cuota.fecha_vencimiento, cuota.numero_periodo
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'El contrato % no tiene un cobro de mantenimiento pendiente',
      p_id_contrato;
  END IF;

  v_id_cuota := v_cuota.id_cuota_mantenimiento;
  v_saldo_cuota := ROUND(
    GREATEST(v_cuota.monto_programado - v_cuota.monto_pagado, 0)::NUMERIC,
    2
  );

  IF v_monto_pago - v_saldo_cuota > 0.009 THEN
    RAISE EXCEPTION
      'El pago excede el principal de mantenimiento pendiente del contrato % por %',
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
    registrado_por,
    tipo_pago,
    idempotency_key
  )
  VALUES (
    p_id_contrato,
    v_fecha_pago,
    v_monto_pago,
    v_metodo_pago,
    v_referencia,
    p_observacion,
    'APLICADO',
    v_usuario,
    'CUOTA',
    v_idempotency_key
  )
  RETURNING id_pago_mantenimiento INTO v_pago_id;

  INSERT INTO public.contrato_mantenimiento_pago_aplicacion (
    id_pago_mantenimiento,
    id_cuota_mantenimiento,
    id_cargo_mantenimiento,
    monto_aplicado,
    notas
  )
  VALUES (
    v_pago_id,
    v_id_cuota,
    NULL,
    v_monto_pago,
    p_observacion
  );

  UPDATE public.contrato_mantenimiento_cuota
  SET
    monto_pagado = ROUND((monto_pagado + v_monto_pago)::NUMERIC, 2),
    fecha_ultimo_pago = v_fecha_pago,
    estado = CASE
      WHEN ROUND((monto_pagado + v_monto_pago)::NUMERIC, 2)
        >= ROUND(monto_programado::NUMERIC, 2)
        THEN 'PAGADA'
      WHEN (
        date_trunc('month', fecha_vencimiento)::DATE
        + INTERVAL '1 month'
      )::DATE <= v_hoy_cr THEN 'VENCIDA'
      ELSE 'PARCIAL'
    END
  WHERE id_cuota_mantenimiento = v_id_cuota;

  v_aplicado_total := v_monto_pago;

  -- Si se completo la anualidad, abre exactamente la siguiente. La mora ya
  -- generada permanece independiente y no se borra ni se paga implicitamente.
  PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
    p_id_contrato => p_id_contrato,
    p_hasta_fecha => NULL,
    p_usuario => v_usuario
  );

  SELECT
    cuota.fecha_vencimiento,
    COALESCE(
      GREATEST(cuota.monto_programado - cuota.monto_pagado, 0),
      0
    )::NUMERIC(14,2)
    INTO v_proxima_fecha, v_saldo_principal
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.id_contrato = p_id_contrato
    AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND cuota.monto_programado - cuota.monto_pagado > 0.009
  ORDER BY cuota.fecha_vencimiento, cuota.numero_periodo
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'idempotent_replay', FALSE,
    'tipo_pago', 'CUOTA',
    'id_pago_mantenimiento', v_pago_id,
    'id_cuota_mantenimiento', v_id_cuota,
    'monto_aplicado', v_aplicado_total,
    'saldo_principal_pendiente', v_saldo_principal,
    'proxima_fecha_vencimiento', v_proxima_fecha
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pago_mora_mantenimiento(
  p_id_contrato INT,
  p_monto_total NUMERIC,
  p_fecha_pago TIMESTAMPTZ DEFAULT NOW(),
  p_metodo_pago TEXT DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
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
  v_fecha_pago_cr DATE;
  v_hoy_cr DATE := (
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  )::DATE;
  v_metodo_pago TEXT := NULLIF(TRIM(COALESCE(p_metodo_pago, '')), '');
  v_referencia TEXT := NULLIF(TRIM(COALESCE(p_referencia, '')), '');
  v_idempotency_key TEXT := NULLIF(
    TRIM(COALESCE(p_idempotency_key, '')),
    ''
  );
  v_monto_pago NUMERIC(14,2) := ROUND(
    COALESCE(p_monto_total, 0)::NUMERIC,
    2
  );
  v_pago_existente public.contrato_mantenimiento_pago%ROWTYPE;
  v_pago_id BIGINT;
  v_corte_posterior DATE;
  v_pago_posterior DATE;
  v_monto_restante NUMERIC(14,2);
  v_monto_aplicar NUMERIC(14,2);
  v_aplicado_total NUMERIC(14,2) := 0;
  v_mora_pendiente NUMERIC(14,2) := 0;
  v_ultima_fecha_corte DATE;
  v_cargo RECORD;
BEGIN
  PERFORM public.assert_control_mantenimiento_admin();

  IF p_id_contrato IS NULL THEN
    RAISE EXCEPTION 'El contrato es obligatorio';
  END IF;

  IF v_monto_pago <= 0 THEN
    RAISE EXCEPTION
      'El monto del pago de mora de mantenimiento debe ser mayor a cero';
  END IF;

  IF v_idempotency_key IS NOT NULL
     AND LENGTH(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION
      'La llave de idempotencia no puede exceder 200 caracteres';
  END IF;

  IF v_metodo_pago IS NOT NULL
     AND v_metodo_pago NOT IN (
       'Transferencia',
       'Efectivo',
       'Deposito',
       'SINPE',
       'Tarjeta'
     ) THEN
    RAISE EXCEPTION 'Metodo de pago no permitido: %', v_metodo_pago;
  END IF;

  v_fecha_pago_cr := (
    v_fecha_pago AT TIME ZONE 'America/Costa_Rica'
  )::DATE;

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
    FROM public.contrato_mantenimiento_pago AS pago
    WHERE pago.id_contrato = p_id_contrato
      AND pago.tipo_pago = 'MORA'
      AND pago.idempotency_key = v_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF ROUND(v_pago_existente.monto_total::NUMERIC, 2) <> v_monto_pago
         OR (
           v_pago_existente.fecha_pago AT TIME ZONE 'America/Costa_Rica'
         )::DATE <> v_fecha_pago_cr
         OR v_pago_existente.metodo_pago IS DISTINCT FROM v_metodo_pago
         OR v_pago_existente.referencia IS DISTINCT FROM v_referencia
         OR v_pago_existente.observacion IS DISTINCT FROM p_observacion THEN
        RAISE EXCEPTION
          'La llave de idempotencia ya fue usada con datos diferentes';
      END IF;

      IF v_pago_existente.estado <> 'APLICADO' THEN
        RAISE EXCEPTION
          'La llave de idempotencia pertenece a un pago no aplicado';
      END IF;

      SELECT COALESCE(SUM(aplicacion.monto_aplicado), 0)::NUMERIC(14,2)
        INTO v_aplicado_total
      FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
      WHERE aplicacion.id_pago_mantenimiento
        = v_pago_existente.id_pago_mantenimiento;

      IF ROUND(v_aplicado_total::NUMERIC, 2) <> v_monto_pago THEN
        RAISE EXCEPTION
          'El pago idempotente existente tiene aplicaciones inconsistentes';
      END IF;

      SELECT COALESCE(
        SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
          WHERE cargo.estado IN ('PENDIENTE', 'PARCIAL')
        ),
        0
      )::NUMERIC(14,2)
        INTO v_mora_pendiente
      FROM public.contrato_mantenimiento_cargo AS cargo
      WHERE cargo.id_contrato = p_id_contrato
        AND cargo.tipo_cargo = 'INTERES_MORATORIO';

      RETURN jsonb_build_object(
        'ok', TRUE,
        'idempotent_replay', TRUE,
        'tipo_pago', 'MORA',
        'id_pago_mantenimiento',
          v_pago_existente.id_pago_mantenimiento,
        'monto_aplicado', v_aplicado_total,
        'mora_pendiente', v_mora_pendiente
      );
    END IF;
  END IF;

  SELECT MAX(
    (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE
  )
    INTO v_pago_posterior
  FROM public.contrato_mantenimiento_pago AS pago
  WHERE pago.id_contrato = p_id_contrato
    AND pago.estado = 'APLICADO'
    AND (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE
      > v_fecha_pago_cr;

  IF v_pago_posterior IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede registrar un pago de mora de mantenimiento con fecha %: ya existen pagos posteriores hasta %',
      v_fecha_pago_cr,
      v_pago_posterior
      USING ERRCODE = '22007';
  END IF;

  SELECT MAX(calculo.fecha_corte)
    INTO v_corte_posterior
  FROM public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
  WHERE calculo.id_contrato = p_id_contrato
    AND calculo.estado <> 'ANULADO'
    AND calculo.fecha_corte > v_fecha_pago_cr;

  IF v_corte_posterior IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede registrar un pago de mora de mantenimiento con fecha %: ya existen cortes posteriores hasta %',
      v_fecha_pago_cr,
      v_corte_posterior
      USING ERRCODE = '22007';
  END IF;

  -- La anualidad y todos los cortes alcanzados por la fecha se materializan
  -- antes de consultar el saldo moratorio que puede recibir el pago.
  PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
    p_id_contrato => p_id_contrato,
    p_hasta_fecha => v_fecha_pago_cr,
    p_usuario => v_usuario
  );

  PERFORM public.sincronizar_interes_moratorio_mantenimiento_contrato(
    p_id_contrato => p_id_contrato,
    p_fecha_hasta => v_fecha_pago_cr,
    p_usuario => v_usuario
  );

  SELECT
    COALESCE(
      SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
        WHERE cargo.estado IN ('PENDIENTE', 'PARCIAL')
      ),
      0
    )::NUMERIC(14,2),
    MAX(cargo.fecha_corte) FILTER (WHERE cargo.estado <> 'ANULADO')
      INTO v_mora_pendiente, v_ultima_fecha_corte
  FROM public.contrato_mantenimiento_cargo AS cargo
  WHERE cargo.id_contrato = p_id_contrato
    AND cargo.tipo_cargo = 'INTERES_MORATORIO';

  IF v_monto_pago - v_mora_pendiente > 0.009 THEN
    RAISE EXCEPTION
      'El pago excede la mora de mantenimiento pendiente del contrato % por %',
      p_id_contrato,
      ROUND((v_monto_pago - v_mora_pendiente)::NUMERIC, 2);
  END IF;

  v_monto_restante := v_monto_pago;

  INSERT INTO public.contrato_mantenimiento_pago (
    id_contrato,
    fecha_pago,
    monto_total,
    metodo_pago,
    referencia,
    observacion,
    estado,
    registrado_por,
    tipo_pago,
    idempotency_key
  )
  VALUES (
    p_id_contrato,
    v_fecha_pago,
    v_monto_pago,
    v_metodo_pago,
    v_referencia,
    p_observacion,
    'APLICADO',
    v_usuario,
    'MORA',
    v_idempotency_key
  )
  RETURNING id_pago_mantenimiento INTO v_pago_id;

  -- Los cargos moratorios se consumen exclusivamente en FIFO. Nunca se aplica
  -- un remanente al principal de la anualidad.
  FOR v_cargo IN
    SELECT cargo.*
    FROM public.contrato_mantenimiento_cargo AS cargo
    JOIN public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
      ON calculo.id_cargo_mantenimiento = cargo.id_cargo_mantenimiento
     AND calculo.estado = 'GENERADO'
    WHERE cargo.id_contrato = p_id_contrato
      AND cargo.tipo_cargo = 'INTERES_MORATORIO'
      AND cargo.estado IN ('PENDIENTE', 'PARCIAL')
      AND cargo.monto_original - cargo.monto_pagado > 0.009
    ORDER BY cargo.fecha_corte, cargo.id_cargo_mantenimiento
    FOR UPDATE OF cargo
  LOOP
    EXIT WHEN v_monto_restante <= 0.009;

    v_monto_aplicar := LEAST(
      v_monto_restante,
      ROUND(
        (v_cargo.monto_original - v_cargo.monto_pagado)::NUMERIC,
        2
      )
    );

    IF v_monto_aplicar > 0 THEN
      INSERT INTO public.contrato_mantenimiento_pago_aplicacion (
        id_pago_mantenimiento,
        id_cuota_mantenimiento,
        id_cargo_mantenimiento,
        monto_aplicado,
        notas
      )
      VALUES (
        v_pago_id,
        NULL,
        v_cargo.id_cargo_mantenimiento,
        v_monto_aplicar,
        p_observacion
      );

      UPDATE public.contrato_mantenimiento_cargo
      SET
        monto_pagado = ROUND(
          (monto_pagado + v_monto_aplicar)::NUMERIC,
          2
        ),
        estado = CASE
          WHEN ROUND((monto_pagado + v_monto_aplicar)::NUMERIC, 2)
            >= ROUND(monto_original::NUMERIC, 2)
            THEN 'PAGADO'
          ELSE 'PARCIAL'
        END
      WHERE id_cargo_mantenimiento = v_cargo.id_cargo_mantenimiento;

      v_aplicado_total := ROUND(
        (v_aplicado_total + v_monto_aplicar)::NUMERIC,
        2
      );
      v_monto_restante := ROUND(
        (v_monto_restante - v_monto_aplicar)::NUMERIC,
        2
      );
    END IF;
  END LOOP;

  IF v_monto_restante > 0.009 THEN
    RAISE EXCEPTION
      'El pago de mora excede el saldo moratorio aplicable del contrato % por %',
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
  FROM public.contrato_mantenimiento_cargo AS cargo
  WHERE cargo.id_contrato = p_id_contrato
    AND cargo.tipo_cargo = 'INTERES_MORATORIO';

  RETURN jsonb_build_object(
    'ok', TRUE,
    'idempotent_replay', FALSE,
    'tipo_pago', 'MORA',
    'id_pago_mantenimiento', v_pago_id,
    'monto_aplicado', v_aplicado_total,
    'mora_pendiente', v_mora_pendiente,
    'ultimo_corte_mora', v_ultima_fecha_corte
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_proxima_fecha_calculo_mora_mantenimiento(
  p_id_contrato INT
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.contrato_mantenimiento_interes_moratorio_configuracion%ROWTYPE;
  v_proxima_fecha DATE;
BEGIN
  IF p_id_contrato IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT configuracion.*
    INTO v_config
  FROM public.contrato_mantenimiento_interes_moratorio_configuracion
    AS configuracion
  WHERE configuracion.id_configuracion = 1;

  IF NOT FOUND OR NOT v_config.activo THEN
    RETURN NULL;
  END IF;

  WITH cuotas AS (
    SELECT
      cuota.id_cuota_mantenimiento,
      cuota.fecha_vencimiento,
      cuota.monto_programado,
      ultimo.fecha_corte AS ultima_fecha_corte,
      ultimo.estado AS ultimo_estado
    FROM public.contrato_mantenimiento_cuota AS cuota
    LEFT JOIN LATERAL (
      SELECT calculo.fecha_corte, calculo.estado
      FROM public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
      WHERE calculo.id_cuota_mantenimiento
        = cuota.id_cuota_mantenimiento
      ORDER BY
        calculo.fecha_corte DESC,
        calculo.id_calculo_mora_mantenimiento DESC
      LIMIT 1
    ) AS ultimo ON TRUE
    WHERE cuota.id_contrato = p_id_contrato
      AND cuota.estado <> 'ANULADA'
  ),
  candidatos AS (
    SELECT
      cuota.*,
      CASE
        WHEN cuota.ultimo_estado IN ('SIN_CARGO', 'ANULADO') THEN NULL
        WHEN cuota.ultimo_estado = 'GENERADO' THEN (
          date_trunc('month', cuota.ultima_fecha_corte)::DATE
          + INTERVAL '1 month'
        )::DATE
        ELSE GREATEST(
          (
            date_trunc('month', cuota.fecha_vencimiento)::DATE
            + INTERVAL '1 month'
          )::DATE,
          v_config.fecha_efectiva
        )
      END AS fecha_candidata
    FROM cuotas AS cuota
  ),
  candidatos_con_base AS (
    SELECT
      candidato.*,
      ROUND(
        GREATEST(
          candidato.monto_programado - COALESCE((
            SELECT SUM(aplicacion.monto_aplicado)
            FROM public.contrato_mantenimiento_pago_aplicacion AS aplicacion
            JOIN public.contrato_mantenimiento_pago AS pago
              ON pago.id_pago_mantenimiento
                = aplicacion.id_pago_mantenimiento
             AND pago.estado = 'APLICADO'
             AND pago.tipo_pago = 'CUOTA'
             AND (
               pago.fecha_pago AT TIME ZONE 'America/Costa_Rica'
             )::DATE < candidato.fecha_candidata
            WHERE aplicacion.id_cuota_mantenimiento
              = candidato.id_cuota_mantenimiento
              AND aplicacion.id_cargo_mantenimiento IS NULL
          ), 0),
          0
        )::NUMERIC,
        2
      ) AS base_principal_candidata
    FROM candidatos AS candidato
    WHERE candidato.fecha_candidata IS NOT NULL
  )
  SELECT MIN(candidato.fecha_candidata)
    INTO v_proxima_fecha
  FROM candidatos_con_base AS candidato
  WHERE candidato.ultimo_estado = 'GENERADO'
     OR (
       candidato.ultimo_estado IS NULL
       AND candidato.base_principal_candidata > 0.009
     );

  RETURN v_proxima_fecha;
END;
$$;

CREATE OR REPLACE VIEW public.vw_control_mantenimiento_resumen AS
WITH contexto AS (
  SELECT (
    CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica'
  )::DATE AS hoy_cr
),
contratos_elegibles AS (
  SELECT DISTINCT
    contrato.id_contrato,
    contrato.numero_contrato,
    contrato.numero_formulario,
    contrato.estado_contrato,
    contrato.fecha_firma,
    contrato.id_cliente,
    contrato.monto_mantenimiento_anual,
    COALESCE(
      contrato.fecha_inicio_mantenimiento,
      CASE
        WHEN contrato.anio_inicio_mantenimiento IS NOT NULL
          THEN make_date(contrato.anio_inicio_mantenimiento::INT, 1, 1)
        ELSE NULL
      END
    ) AS fecha_inicio_mantenimiento
  FROM public.contrato AS contrato
  JOIN public.contrato_producto AS producto
    ON producto.id_contrato = contrato.id_contrato
  WHERE contrato.estado_contrato = 'VIGENTE'::public.estado_contrato_enum
    AND producto.tipo_producto IN ('LOTE', 'CENIZARIO')
),
cuota_actual AS (
  SELECT DISTINCT ON (cuota.id_contrato)
    cuota.id_contrato,
    cuota.id_cuota_mantenimiento,
    cuota.fecha_vencimiento,
    (
      date_trunc('month', cuota.fecha_vencimiento)::DATE
      + INTERVAL '1 month'
    )::DATE AS fecha_inicio_mora,
    cuota.monto_programado,
    cuota.monto_pagado,
    cuota.estado
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND cuota.monto_programado - cuota.monto_pagado > 0.009
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
),
mora_resumen AS (
  SELECT
    cargo.id_contrato,
    COALESCE(
      SUM(cargo.monto_original) FILTER (WHERE cargo.estado <> 'ANULADO'),
      0
    )::NUMERIC(14,2) AS mora_generada,
    COALESCE(
      SUM(cargo.monto_pagado) FILTER (WHERE cargo.estado <> 'ANULADO'),
      0
    )::NUMERIC(14,2) AS mora_pagada,
    COALESCE(
      SUM(GREATEST(cargo.monto_original - cargo.monto_pagado, 0)) FILTER (
        WHERE cargo.estado IN ('PENDIENTE', 'PARCIAL')
      ),
      0
    )::NUMERIC(14,2) AS mora_pendiente
  FROM public.contrato_mantenimiento_cargo AS cargo
  WHERE cargo.tipo_cargo = 'INTERES_MORATORIO'
  GROUP BY cargo.id_contrato
),
ultimo_calculo_mora AS (
  SELECT DISTINCT ON (calculo.id_contrato)
    calculo.id_contrato,
    calculo.fecha_corte,
    calculo.base_principal_pendiente,
    calculo.monto_generado
  FROM public.contrato_mantenimiento_interes_moratorio_calculo AS calculo
  WHERE calculo.estado <> 'ANULADO'
  ORDER BY
    calculo.id_contrato,
    calculo.fecha_corte DESC,
    calculo.id_calculo_mora_mantenimiento DESC
)
SELECT
  -- Las primeras 18 columnas conservan exactamente el contrato de la vista
  -- anterior; PostgreSQL solo permite agregar las nuevas al final.
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
    AND contrato.fecha_inicio_mantenimiento IS NOT NULL
    AS configuracion_completa,
  CASE
    WHEN actual.id_cuota_mantenimiento IS NULL THEN 0
    ELSE 1
  END::INT AS cuotas_totales,
  COALESCE(historial.cuotas_pagadas, 0)::INT AS cuotas_pagadas,
  CASE WHEN actual.estado = 'PARCIAL' THEN 1 ELSE 0 END::INT
    AS cuotas_parciales,
  CASE
    WHEN actual.id_cuota_mantenimiento IS NOT NULL
      AND actual.fecha_inicio_mora <= contexto.hoy_cr THEN 1
    ELSE 0
  END::INT AS cuotas_vencidas,
  CASE
    WHEN actual.id_cuota_mantenimiento IS NOT NULL
      AND actual.fecha_inicio_mora <= contexto.hoy_cr
      THEN GREATEST(actual.monto_programado - actual.monto_pagado, 0)
    ELSE 0
  END::NUMERIC(14,2) AS monto_vencido,
  COALESCE(
    GREATEST(actual.monto_programado - actual.monto_pagado, 0),
    0
  )::NUMERIC(14,2) AS total_pendiente,
  actual.fecha_vencimiento AS proxima_fecha_vencimiento,
  historial.ultimo_periodo_cubierto_hasta,
  COALESCE(mora.mora_pendiente, 0)::NUMERIC(14,2) AS mora_pendiente,
  COALESCE(mora.mora_generada, 0)::NUMERIC(14,2) AS mora_generada,
  COALESCE(mora.mora_pagada, 0)::NUMERIC(14,2) AS mora_pagada,
  ultimo_calculo.fecha_corte AS ultima_fecha_calculo_mora,
  COALESCE(
    ultimo_calculo.base_principal_pendiente,
    0
  )::NUMERIC(14,2) AS ultima_base_moratoria,
  COALESCE(ultimo_calculo.monto_generado, 0)::NUMERIC(14,2)
    AS ultimo_interes_moratorio_generado,
  public.obtener_proxima_fecha_calculo_mora_mantenimiento(
    contrato.id_contrato
  ) AS proxima_fecha_calculo_mora,
  (
    COALESCE(
      GREATEST(actual.monto_programado - actual.monto_pagado, 0),
      0
    )
    + COALESCE(mora.mora_pendiente, 0)
  )::NUMERIC(14,2) AS total_pendiente_con_mora
FROM contratos_elegibles AS contrato
CROSS JOIN contexto
LEFT JOIN public.cliente AS cliente
  ON cliente.id_cliente = contrato.id_cliente
LEFT JOIN cuota_actual AS actual
  ON actual.id_contrato = contrato.id_contrato
LEFT JOIN historial
  ON historial.id_contrato = contrato.id_contrato
LEFT JOIN mora_resumen AS mora
  ON mora.id_contrato = contrato.id_contrato
LEFT JOIN ultimo_calculo_mora AS ultimo_calculo
  ON ultimo_calculo.id_contrato = contrato.id_contrato;

COMMENT ON TABLE public.contrato_mantenimiento_interes_moratorio_calculo IS
  'Auditoria inmutable de cada corte mensual de mora de mantenimiento.';
COMMENT ON COLUMN public.contrato_mantenimiento_interes_moratorio_calculo.base_principal_pendiente IS
  'Principal anual pendiente al iniciar el corte; nunca incluye mora acumulada.';
COMMENT ON TABLE public.contrato_mantenimiento_cargo IS
  'Cargos de mora de mantenimiento pagables de forma separada al principal.';
COMMENT ON COLUMN public.contrato_mantenimiento_pago.tipo_pago IS
  'Concepto exclusivo del recibo: CUOTA o MORA; no existe modalidad mixta.';
COMMENT ON VIEW public.vw_control_mantenimiento_resumen IS
  'Resumen de principal y mora de mantenimiento con gracia por mes calendario.';

REVOKE ALL ON FUNCTION public.validar_aplicacion_tipo_pago_mantenimiento()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_cambio_tipo_pago_mantenimiento()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_mutacion_pago_mantenimiento_aplicado()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_mutacion_aplicacion_mantenimiento()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_control_mantenimiento_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_interes_moratorio_mantenimiento_contrato(
  INT, DATE, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_cuotas_mantenimiento_contrato(
  INT, DATE, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_cuotas_mantenimiento_vigentes(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_pago_mantenimiento(
  INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_pago_mora_mantenimiento(
  INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_proxima_fecha_calculo_mora_mantenimiento(INT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sincronizar_interes_moratorio_mantenimiento_contrato(
  INT, DATE, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_cuotas_mantenimiento_contrato(
  INT, DATE, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_cuotas_mantenimiento_vigentes(TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_mantenimiento(
  INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_mora_mantenimiento(
  INT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_proxima_fecha_calculo_mora_mantenimiento(INT)
  TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_mantenimiento_cargo
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_mantenimiento_interes_moratorio_calculo
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_mantenimiento_interes_moratorio_configuracion
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_mantenimiento_pago
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_mantenimiento_pago_aplicacion
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.contrato_mantenimiento_cargo TO authenticated;
GRANT SELECT ON public.contrato_mantenimiento_interes_moratorio_calculo
  TO authenticated;
GRANT SELECT ON public.contrato_mantenimiento_pago TO authenticated;
GRANT SELECT ON public.contrato_mantenimiento_pago_aplicacion TO authenticated;
GRANT SELECT ON public.vw_control_mantenimiento_resumen TO authenticated;

-- Inicializa prospectivamente los cortes que ya correspondan al momento de
-- aplicar la migracion. No se generan cargos anteriores a fecha_efectiva.
SELECT public.sincronizar_cuotas_mantenimiento_vigentes(
  'migracion_mora_mantenimiento'
);

NOTIFY pgrst, 'reload schema';

COMMIT;
