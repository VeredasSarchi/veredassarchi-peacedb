-- Pagos extraordinarios aplicados exclusivamente al capital.
-- Mantienen cuota, tasa y dia de pago; reducen saldo, intereses futuros y plazo.

BEGIN;

-- PostgreSQL no permite cambiar el tipo de una columna incluida en la lista
-- UPDATE OF de un trigger. La migracion de mora creo el primer trigger; el
-- segundo DROP hace que esta migracion tambien sea reejecutable.
DROP TRIGGER IF EXISTS trg_bloquear_anulacion_pago_extraordinario
  ON public.contrato_pago;

DROP TRIGGER IF EXISTS trg_validar_cambio_tipo_pago_contrato
  ON public.contrato_pago;

ALTER TABLE public.contrato_pago
  DROP CONSTRAINT IF EXISTS chk_contrato_pago_tipo_pago;

ALTER TABLE public.contrato_pago
  ALTER COLUMN tipo_pago TYPE VARCHAR(20);

ALTER TABLE public.contrato_pago
  ADD CONSTRAINT chk_contrato_pago_tipo_pago
  CHECK (tipo_pago IN ('CUOTA', 'MORA', 'EXTRAORDINARIO'));

ALTER TABLE public.contrato_pago_aplicacion
  ADD COLUMN IF NOT EXISTS id_plan_pago BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contrato_pago_aplicacion_id_plan_pago_fkey'
      AND conrelid = 'public.contrato_pago_aplicacion'::regclass
  ) THEN
    ALTER TABLE public.contrato_pago_aplicacion
      ADD CONSTRAINT contrato_pago_aplicacion_id_plan_pago_fkey
      FOREIGN KEY (id_plan_pago)
      REFERENCES public.contrato_plan_pago (id_plan_pago)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.contrato_pago_aplicacion
  DROP CONSTRAINT IF EXISTS chk_contrato_pago_aplicacion_destino;

ALTER TABLE public.contrato_pago_aplicacion
  ADD CONSTRAINT chk_contrato_pago_aplicacion_destino
  CHECK (
    (
      (id_cuota IS NOT NULL)::INT
      + (id_cargo IS NOT NULL)::INT
      + (id_plan_pago IS NOT NULL)::INT
    ) = 1
  );

CREATE INDEX IF NOT EXISTS idx_contrato_pago_aplicacion_plan
  ON public.contrato_pago_aplicacion (id_plan_pago)
  WHERE id_plan_pago IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contrato_pago_extraordinario (
  id_pago BIGINT PRIMARY KEY
    REFERENCES public.contrato_pago (id_pago) ON DELETE RESTRICT,
  id_contrato INT NOT NULL
    REFERENCES public.contrato (id_contrato) ON DELETE RESTRICT,
  id_plan_origen BIGINT NOT NULL
    REFERENCES public.contrato_plan_pago (id_plan_pago) ON DELETE RESTRICT,
  id_plan_resultante BIGINT NOT NULL
    REFERENCES public.contrato_plan_pago (id_plan_pago) ON DELETE RESTRICT,
  fecha_pago DATE NOT NULL,
  monto_extraordinario NUMERIC(14,2) NOT NULL,
  saldo_capital_antes NUMERIC(14,2) NOT NULL,
  saldo_capital_despues NUMERIC(14,2) NOT NULL,
  cuota_base NUMERIC(14,2) NOT NULL,
  tasa_interes_anual NUMERIC(9,6) NOT NULL,
  tasa_interes_mensual NUMERIC(12,10) NOT NULL,
  cuotas_restantes_antes INT NOT NULL,
  cuotas_restantes_despues INT NOT NULL,
  interes_futuro_antes NUMERIC(14,2) NOT NULL,
  interes_futuro_despues NUMERIC(14,2) NOT NULL,
  ahorro_intereses NUMERIC(14,2) NOT NULL,
  fecha_fin_antes DATE,
  fecha_fin_despues DATE,
  liquidacion_total BOOLEAN NOT NULL DEFAULT FALSE,
  registrado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_contrato_pago_extraordinario_plan_origen UNIQUE (id_plan_origen),
  CONSTRAINT uq_contrato_pago_extraordinario_plan_resultante UNIQUE (id_plan_resultante),
  CONSTRAINT chk_contrato_pago_extraordinario_montos CHECK (
    monto_extraordinario > 0
    AND saldo_capital_antes > 0
    AND saldo_capital_despues >= 0
    AND saldo_capital_despues <= saldo_capital_antes
    AND monto_extraordinario <= saldo_capital_antes
    AND saldo_capital_despues = ROUND(saldo_capital_antes - monto_extraordinario, 2)
    AND cuota_base > 0
    AND tasa_interes_anual >= 0
    AND tasa_interes_mensual >= 0
    AND interes_futuro_antes >= 0
    AND interes_futuro_despues >= 0
    AND interes_futuro_despues <= interes_futuro_antes
    AND ahorro_intereses >= 0
    AND ahorro_intereses = ROUND(
      GREATEST(interes_futuro_antes - interes_futuro_despues, 0),
      2
    )
  ),
  CONSTRAINT chk_contrato_pago_extraordinario_cuotas CHECK (
    cuotas_restantes_antes > 0
    AND cuotas_restantes_despues >= 0
    AND cuotas_restantes_despues < cuotas_restantes_antes
  ),
  CONSTRAINT chk_contrato_pago_extraordinario_liquidacion CHECK (
    liquidacion_total = (saldo_capital_despues = 0)
  )
);

-- Refuerza los invariantes tambien al reintentar una ejecucion que hubiera
-- alcanzado a crear la tabla antes de fallar en un paso posterior.
ALTER TABLE public.contrato_pago_extraordinario
  DROP CONSTRAINT IF EXISTS uq_contrato_pago_extraordinario_plan_origen,
  DROP CONSTRAINT IF EXISTS uq_contrato_pago_extraordinario_plan_resultante,
  DROP CONSTRAINT IF EXISTS chk_contrato_pago_extraordinario_montos,
  DROP CONSTRAINT IF EXISTS chk_contrato_pago_extraordinario_cuotas,
  DROP CONSTRAINT IF EXISTS chk_contrato_pago_extraordinario_liquidacion;

ALTER TABLE public.contrato_pago_extraordinario
  ADD CONSTRAINT uq_contrato_pago_extraordinario_plan_origen
    UNIQUE (id_plan_origen),
  ADD CONSTRAINT uq_contrato_pago_extraordinario_plan_resultante
    UNIQUE (id_plan_resultante),
  ADD CONSTRAINT chk_contrato_pago_extraordinario_montos CHECK (
    monto_extraordinario > 0
    AND saldo_capital_antes > 0
    AND saldo_capital_despues >= 0
    AND saldo_capital_despues <= saldo_capital_antes
    AND monto_extraordinario <= saldo_capital_antes
    AND saldo_capital_despues = ROUND(saldo_capital_antes - monto_extraordinario, 2)
    AND cuota_base > 0
    AND tasa_interes_anual >= 0
    AND tasa_interes_mensual >= 0
    AND interes_futuro_antes >= 0
    AND interes_futuro_despues >= 0
    AND interes_futuro_despues <= interes_futuro_antes
    AND ahorro_intereses >= 0
    AND ahorro_intereses = ROUND(
      GREATEST(interes_futuro_antes - interes_futuro_despues, 0),
      2
    )
  ),
  ADD CONSTRAINT chk_contrato_pago_extraordinario_cuotas CHECK (
    cuotas_restantes_antes > 0
    AND cuotas_restantes_despues >= 0
    AND cuotas_restantes_despues < cuotas_restantes_antes
  ),
  ADD CONSTRAINT chk_contrato_pago_extraordinario_liquidacion CHECK (
    liquidacion_total = (saldo_capital_despues = 0)
  );

CREATE INDEX IF NOT EXISTS idx_contrato_pago_extraordinario_contrato_fecha
  ON public.contrato_pago_extraordinario (id_contrato, fecha_pago DESC, id_pago DESC);

ALTER TABLE public.contrato_plan_pago
  DROP CONSTRAINT IF EXISTS chk_contrato_plan_pago_tipo;

ALTER TABLE public.contrato_plan_pago
  ADD CONSTRAINT chk_contrato_plan_pago_tipo
  CHECK (
    tipo_plan IN (
      'ORIGINAL',
      'ARREGLO_PAGO',
      'REESTRUCTURACION',
      'BACKFILL',
      'EXTRAORDINARIO'
    )
  );

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
      'ANULACION_MORA',
      'PAGO_EXTRAORDINARIO'
    )
  );

CREATE OR REPLACE FUNCTION public.validar_aplicacion_tipo_pago_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_pago VARCHAR(20);
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
    IF NEW.id_cuota IS NULL
       OR NEW.id_cargo IS NOT NULL
       OR NEW.id_plan_pago IS NOT NULL THEN
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
    IF NEW.id_cargo IS NULL
       OR NEW.id_cuota IS NOT NULL
       OR NEW.id_plan_pago IS NOT NULL THEN
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
  ELSIF v_tipo_pago = 'EXTRAORDINARIO' THEN
    IF NEW.id_plan_pago IS NULL
       OR NEW.id_cuota IS NOT NULL
       OR NEW.id_cargo IS NOT NULL THEN
      RAISE EXCEPTION 'Un pago EXTRAORDINARIO solo puede aplicarse al capital de un plan'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.monto_interes <> 0 OR NEW.monto_otros <> 0 OR NEW.monto_capital <= 0 THEN
      RAISE EXCEPTION 'La aplicacion EXTRAORDINARIO debe registrarse exclusivamente en monto_capital'
        USING ERRCODE = '23514';
    END IF;

    SELECT plan.id_contrato
      INTO v_id_contrato_destino
    FROM public.contrato_plan_pago AS plan
    WHERE plan.id_plan_pago = NEW.id_plan_pago;
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
BEFORE INSERT OR UPDATE OF
  id_pago,
  id_cuota,
  id_cargo,
  id_plan_pago,
  monto_interes,
  monto_capital,
  monto_otros
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
    LEFT JOIN public.contrato_plan_pago AS plan_cuota
      ON plan_cuota.id_plan_pago = cuota.id_plan_pago
    LEFT JOIN public.contrato_plan_pago AS plan_directo
      ON plan_directo.id_plan_pago = aplicacion.id_plan_pago
    WHERE aplicacion.id_pago = OLD.id_pago
      AND (
        (
          NEW.tipo_pago = 'CUOTA'
          AND (
            aplicacion.id_cuota IS NULL
            OR aplicacion.id_cargo IS NOT NULL
            OR aplicacion.id_plan_pago IS NOT NULL
          )
        )
        OR (
          NEW.tipo_pago = 'MORA'
          AND (
            aplicacion.id_cargo IS NULL
            OR aplicacion.id_cuota IS NOT NULL
            OR aplicacion.id_plan_pago IS NOT NULL
            OR cargo.tipo_cargo IS DISTINCT FROM 'INTERES_MORATORIO'
          )
        )
        OR (
          NEW.tipo_pago = 'EXTRAORDINARIO'
          AND (
            aplicacion.id_plan_pago IS NULL
            OR aplicacion.id_cuota IS NOT NULL
            OR aplicacion.id_cargo IS NOT NULL
          )
        )
        OR COALESCE(
          cargo.id_contrato,
          plan_cuota.id_contrato,
          plan_directo.id_contrato
        ) IS DISTINCT FROM NEW.id_contrato
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

-- Un extraordinario aplicado sostiene un plan nuevo y su auditoria. Sus datos
-- financieros quedan inmutables hasta contar con un RPC de reversa que restaure
-- atomicamente el plan anterior, el saldo y los intereses.
CREATE OR REPLACE FUNCTION public.bloquear_anulacion_pago_extraordinario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.tipo_pago = 'EXTRAORDINARIO'
     AND (
       NEW.id_pago IS DISTINCT FROM OLD.id_pago
       OR NEW.id_contrato IS DISTINCT FROM OLD.id_contrato
       OR NEW.tipo_pago IS DISTINCT FROM OLD.tipo_pago
       OR NEW.monto_total IS DISTINCT FROM OLD.monto_total
       OR NEW.fecha_pago IS DISTINCT FROM OLD.fecha_pago
       OR NEW.estado IS DISTINCT FROM OLD.estado
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     ) THEN
    RAISE EXCEPTION 'Los datos financieros de un pago extraordinario aplicado son inmutables; se requiere una reversa transaccional'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_anulacion_pago_extraordinario
  ON public.contrato_pago;

CREATE TRIGGER trg_bloquear_anulacion_pago_extraordinario
BEFORE UPDATE OF
  id_pago,
  id_contrato,
  tipo_pago,
  monto_total,
  fecha_pago,
  estado,
  idempotency_key
ON public.contrato_pago
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_anulacion_pago_extraordinario();

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_aplicacion_extraordinaria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.contrato_pago AS pago
    WHERE pago.id_pago = OLD.id_pago
      AND pago.tipo_pago = 'EXTRAORDINARIO'
  ) THEN
    RAISE EXCEPTION 'La aplicacion de capital de un pago extraordinario es inmutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_mutacion_aplicacion_extraordinaria
  ON public.contrato_pago_aplicacion;

CREATE TRIGGER trg_bloquear_mutacion_aplicacion_extraordinaria
BEFORE UPDATE OR DELETE
ON public.contrato_pago_aplicacion
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_mutacion_aplicacion_extraordinaria();

-- Funcion interna y sin permisos directos. Proyecta el nuevo cronograma usando
-- exactamente el mismo redondeo mensual del plan de pagos.
CREATE OR REPLACE FUNCTION public.proyectar_pago_extraordinario_contrato(
  p_id_contrato INT,
  p_monto_extraordinario NUMERIC,
  p_fecha_pago DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_plan public.contrato_plan_pago%ROWTYPE;
  v_estado_contrato TEXT;
  v_monto NUMERIC(14,2) := ROUND(COALESCE(p_monto_extraordinario, 0)::NUMERIC, 2);
  v_saldo_antes NUMERIC(14,2) := 0;
  v_saldo_despues NUMERIC(14,2) := 0;
  v_cuotas_antes INT := 0;
  v_cuotas_despues INT := 0;
  v_interes_antes NUMERIC(14,2) := 0;
  v_interes_despues NUMERIC(14,2) := 0;
  v_ahorro NUMERIC(14,2) := 0;
  v_fecha_primera DATE;
  v_fecha_fin_antes DATE;
  v_fecha_fin_despues DATE;
  v_saldo_iteracion NUMERIC(14,2);
  v_interes NUMERIC(14,2);
  v_capital NUMERIC(14,2);
BEGIN
  IF p_fecha_pago IS NULL THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'La fecha del pago extraordinario es obligatoria',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF v_monto <= 0 THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'El monto extraordinario debe ser mayor a cero',
      'monto_extraordinario', v_monto
    );
  END IF;

  SELECT contrato.estado_contrato::TEXT
    INTO v_estado_contrato
  FROM public.contrato AS contrato
  WHERE contrato.id_contrato = p_id_contrato;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'El contrato indicado no existe',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF v_estado_contrato <> 'VIGENTE' THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'Solo se permiten pagos extraordinarios en contratos vigentes',
      'monto_extraordinario', v_monto
    );
  END IF;

  SELECT plan.*
    INTO v_plan
  FROM public.contrato_plan_pago AS plan
  WHERE plan.id_contrato = p_id_contrato
    AND plan.estado = 'VIGENTE'
  ORDER BY plan.version DESC, plan.id_plan_pago DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'El contrato no tiene un plan de pago vigente',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF (v_plan.fecha_generacion AT TIME ZONE 'America/Costa_Rica')::DATE > p_fecha_pago THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'La fecha del extraordinario no puede ser anterior a la generacion del plan vigente',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contrato_pago AS pago
    WHERE pago.id_contrato = p_id_contrato
      AND pago.estado = 'APLICADO'
      AND (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE > p_fecha_pago
  ) THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'No se puede recalcular el plan con una fecha anterior a pagos ya registrados',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contrato_interes_moratorio_calculo AS calculo
    WHERE calculo.id_contrato = p_id_contrato
      AND calculo.estado <> 'ANULADO'
      AND calculo.fecha_corte > p_fecha_pago
  ) THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'No se puede recalcular el plan antes de un corte moratorio ya cerrado',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contrato_cuota AS cuota
    WHERE cuota.id_plan_pago = v_plan.id_plan_pago
      AND cuota.estado <> 'ANULADA'
      AND cuota.monto_cuota_total_programada - cuota.monto_pagado_total > 0.009
      AND (
        cuota.estado = 'PARCIAL'
        OR cuota.monto_pagado_total > 0.009
      )
  ) THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'Primero debe completar la cuota que se encuentra pagada parcialmente',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contrato_cuota AS cuota
    WHERE cuota.id_plan_pago = v_plan.id_plan_pago
      AND cuota.estado <> 'ANULADA'
      AND cuota.monto_cuota_total_programada - cuota.monto_pagado_total > 0.009
      AND cuota.fecha_vencimiento <= p_fecha_pago
  ) THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'Primero debe pagar todas las cuotas exigibles a la fecha',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contrato_cargo AS cargo
    WHERE cargo.id_contrato = p_id_contrato
      AND cargo.tipo_cargo = 'INTERES_MORATORIO'
      AND cargo.estado IN ('PENDIENTE', 'PARCIAL')
      AND cargo.monto_original - cargo.monto_pagado > 0.009
  ) THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'Primero debe cancelar toda la mora pendiente',
      'monto_extraordinario', v_monto
    );
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(
      cuota.monto_capital_programado - cuota.monto_pagado_capital,
      0
    )), 0)::NUMERIC(14,2),
    COUNT(*)::INT,
    COALESCE(SUM(GREATEST(
      cuota.monto_interes_programado - cuota.monto_pagado_interes,
      0
    )), 0)::NUMERIC(14,2),
    MIN(cuota.fecha_vencimiento),
    MAX(cuota.fecha_vencimiento)
    INTO
      v_saldo_antes,
      v_cuotas_antes,
      v_interes_antes,
      v_fecha_primera,
      v_fecha_fin_antes
  FROM public.contrato_cuota AS cuota
  WHERE cuota.id_plan_pago = v_plan.id_plan_pago
    AND cuota.estado <> 'ANULADA'
    AND cuota.monto_cuota_total_programada - cuota.monto_pagado_total > 0.009;

  IF v_saldo_antes <= 0.009 OR v_cuotas_antes <= 0 OR v_fecha_primera IS NULL THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'El contrato no tiene capital futuro pendiente para aplicar el extraordinario',
      'monto_extraordinario', v_monto
    );
  END IF;

  IF v_monto - v_saldo_antes > 0.009 THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'El pago extraordinario no puede superar el saldo de capital pendiente',
      'monto_extraordinario', v_monto,
      'saldo_capital_antes', v_saldo_antes,
      'cuota_base', v_plan.cuota_base
    );
  END IF;

  v_monto := LEAST(v_monto, v_saldo_antes);
  v_saldo_despues := ROUND((v_saldo_antes - v_monto)::NUMERIC, 2);
  IF v_saldo_despues <= 0.009 THEN
    v_saldo_despues := 0;
  END IF;

  IF v_saldo_despues > 0 THEN
    v_saldo_iteracion := v_saldo_despues;

    WHILE v_saldo_iteracion > 0.009 LOOP
      v_cuotas_despues := v_cuotas_despues + 1;
      IF v_cuotas_despues > 1200 THEN
        RETURN jsonb_build_object(
          'permitido', FALSE,
          'motivo_bloqueo', 'El nuevo plazo supera el maximo permitido de 1200 cuotas',
          'monto_extraordinario', v_monto
        );
      END IF;

      v_interes := ROUND((v_saldo_iteracion * v_plan.tasa_interes_mensual)::NUMERIC, 2);
      v_capital := ROUND((v_plan.cuota_base - v_interes)::NUMERIC, 2);

      IF v_capital <= 0.009 THEN
        RETURN jsonb_build_object(
          'permitido', FALSE,
          'motivo_bloqueo', 'La cuota mensual no cubre el interes del nuevo saldo',
          'monto_extraordinario', v_monto
        );
      END IF;

      IF v_capital >= v_saldo_iteracion THEN
        v_capital := v_saldo_iteracion;
      END IF;

      v_interes_despues := ROUND((v_interes_despues + v_interes)::NUMERIC, 2);
      v_saldo_iteracion := ROUND((v_saldo_iteracion - v_capital)::NUMERIC, 2);
      IF v_saldo_iteracion <= 0.009 THEN
        v_saldo_iteracion := 0;
      END IF;
    END LOOP;

    v_fecha_fin_despues := public.calcular_fecha_vencimiento_cuota(
      v_fecha_primera,
      v_cuotas_despues
    );
  END IF;

  IF v_cuotas_despues >= v_cuotas_antes THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'El monto indicado no reduce al menos una cuota del plazo actual',
      'monto_extraordinario', v_monto,
      'saldo_capital_antes', v_saldo_antes,
      'saldo_capital_despues', v_saldo_despues,
      'cuotas_restantes_antes', v_cuotas_antes,
      'cuotas_restantes_despues', v_cuotas_despues,
      'cuota_base', v_plan.cuota_base
    );
  END IF;

  IF v_interes_despues - v_interes_antes > 0.009 THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'El plan vigente requiere revision porque el extraordinario no reduce los intereses futuros',
      'monto_extraordinario', v_monto
    );
  END IF;

  v_ahorro := ROUND(GREATEST(v_interes_antes - v_interes_despues, 0)::NUMERIC, 2);

  RETURN jsonb_build_object(
    'permitido', TRUE,
    'motivo_bloqueo', NULL,
    'id_plan_origen', v_plan.id_plan_pago,
    'monto_extraordinario', v_monto,
    'cuota_base', v_plan.cuota_base,
    'tasa_interes_anual', v_plan.tasa_interes_anual,
    'tasa_interes_mensual', v_plan.tasa_interes_mensual,
    'saldo_capital_antes', v_saldo_antes,
    'saldo_capital_despues', v_saldo_despues,
    'cuotas_restantes_antes', v_cuotas_antes,
    'cuotas_restantes_despues', v_cuotas_despues,
    'interes_futuro_antes', v_interes_antes,
    'interes_futuro_despues', v_interes_despues,
    'ahorro_intereses', v_ahorro,
    'fecha_primera_cuota_nueva', v_fecha_primera,
    'fecha_fin_antes', v_fecha_fin_antes,
    'fecha_fin_despues', v_fecha_fin_despues,
    'liquidacion_total', v_saldo_despues = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.simular_pago_extraordinario_contrato(
  p_id_contrato INT,
  p_monto_extraordinario NUMERIC,
  p_fecha_pago TIMESTAMPTZ DEFAULT NOW(),
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fecha_pago TIMESTAMPTZ := COALESCE(p_fecha_pago, NOW());
  v_fecha_pago_cr DATE := (v_fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_hoy_cr DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_proyeccion JSONB;
BEGIN
  PERFORM public.assert_control_cuotas_admin();

  IF v_fecha_pago_cr > v_hoy_cr THEN
    RETURN jsonb_build_object(
      'permitido', FALSE,
      'motivo_bloqueo', 'La fecha del pago no puede ser futura en Costa Rica',
      'monto_extraordinario', ROUND(COALESCE(p_monto_extraordinario, 0)::NUMERIC, 2)
    );
  END IF;

  -- Evita materializar mora innecesariamente si ya existe otro impedimento.
  v_proyeccion := public.proyectar_pago_extraordinario_contrato(
    p_id_contrato,
    p_monto_extraordinario,
    v_fecha_pago_cr
  );

  IF NOT COALESCE((v_proyeccion ->> 'permitido')::BOOLEAN, FALSE) THEN
    RETURN v_proyeccion;
  END IF;

  PERFORM public.sincronizar_interes_moratorio_contrato(
    p_id_contrato => p_id_contrato,
    p_fecha_hasta => v_fecha_pago_cr,
    p_usuario => v_usuario
  );

  RETURN public.proyectar_pago_extraordinario_contrato(
    p_id_contrato,
    p_monto_extraordinario,
    v_fecha_pago_cr
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pago_extraordinario_contrato(
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
  v_fecha_pago_cr DATE := (v_fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_hoy_cr DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_monto NUMERIC(14,2) := ROUND(COALESCE(p_monto_total, 0)::NUMERIC, 2);
  v_idempotency_key TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  v_pago_existente public.contrato_pago%ROWTYPE;
  v_auditoria_existente public.contrato_pago_extraordinario%ROWTYPE;
  v_plan public.contrato_plan_pago%ROWTYPE;
  v_proyeccion JSONB;
  v_pago_id BIGINT;
  v_plan_nuevo_id BIGINT;
  v_version SMALLINT;
  v_saldo_antes NUMERIC(14,2);
  v_saldo_despues NUMERIC(14,2);
  v_cuotas_antes INT;
  v_cuotas_despues INT;
  v_interes_antes NUMERIC(14,2);
  v_interes_despues NUMERIC(14,2);
  v_ahorro NUMERIC(14,2);
  v_fecha_primera DATE;
  v_fecha_fin_antes DATE;
  v_fecha_fin_despues DATE;
  v_liquidacion BOOLEAN;
  v_saldo_iteracion NUMERIC(14,2);
  v_saldo_final NUMERIC(14,2);
  v_interes NUMERIC(14,2);
  v_capital NUMERIC(14,2);
  v_cuota_total NUMERIC(14,2);
  v_capital_acumulado NUMERIC(14,2) := 0;
  v_fecha_vencimiento DATE;
  v_numero_cuota INT;
  v_fecha_posterior DATE;
  v_estado_contrato TEXT;
BEGIN
  PERFORM public.assert_control_cuotas_admin();

  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto extraordinario debe ser mayor a cero';
  END IF;

  IF v_idempotency_key IS NOT NULL AND LENGTH(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'La llave de idempotencia no puede exceder 200 caracteres';
  END IF;

  IF v_fecha_pago_cr > v_hoy_cr THEN
    RAISE EXCEPTION 'La fecha del pago no puede ser futura en Costa Rica';
  END IF;

  SELECT contrato.estado_contrato::TEXT
    INTO v_estado_contrato
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
      AND pago.tipo_pago = 'EXTRAORDINARIO'
      AND pago.idempotency_key = v_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_pago_existente.monto_total <> v_monto
         OR (v_pago_existente.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE <> v_fecha_pago_cr THEN
        RAISE EXCEPTION 'La llave de idempotencia ya fue usada con datos diferentes';
      END IF;

      IF v_pago_existente.estado <> 'APLICADO' THEN
        RAISE EXCEPTION 'La llave de idempotencia pertenece a un pago no aplicado';
      END IF;

      SELECT extraordinario.*
        INTO v_auditoria_existente
      FROM public.contrato_pago_extraordinario AS extraordinario
      WHERE extraordinario.id_pago = v_pago_existente.id_pago;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'El pago extraordinario existente no tiene auditoria asociada';
      END IF;

      RETURN jsonb_build_object(
        'ok', TRUE,
        'idempotent_replay', TRUE,
        'tipo_pago', 'EXTRAORDINARIO',
        'id_pago', v_pago_existente.id_pago,
        'id_plan_origen', v_auditoria_existente.id_plan_origen,
        'id_plan_resultante', v_auditoria_existente.id_plan_resultante,
        'monto_extraordinario', v_auditoria_existente.monto_extraordinario,
        'saldo_capital_antes', v_auditoria_existente.saldo_capital_antes,
        'saldo_capital_despues', v_auditoria_existente.saldo_capital_despues,
        'cuotas_restantes_antes', v_auditoria_existente.cuotas_restantes_antes,
        'cuotas_restantes_despues', v_auditoria_existente.cuotas_restantes_despues,
        'interes_futuro_antes', v_auditoria_existente.interes_futuro_antes,
        'interes_futuro_despues', v_auditoria_existente.interes_futuro_despues,
        'ahorro_intereses', v_auditoria_existente.ahorro_intereses,
        'fecha_fin_antes', v_auditoria_existente.fecha_fin_antes,
        'fecha_fin_despues', v_auditoria_existente.fecha_fin_despues,
        'liquidacion_total', v_auditoria_existente.liquidacion_total
      );
    END IF;
  END IF;

  -- Un reintento identico debe poder recuperar el resultado historico aunque
  -- el contrato haya cambiado de estado despues del pago original.
  IF v_estado_contrato <> 'VIGENTE' THEN
    RAISE EXCEPTION 'Solo se permiten pagos extraordinarios en contratos vigentes';
  END IF;

  SELECT MAX((pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE)
    INTO v_fecha_posterior
  FROM public.contrato_pago AS pago
  WHERE pago.id_contrato = p_id_contrato
    AND pago.estado = 'APLICADO'
    AND (pago.fecha_pago AT TIME ZONE 'America/Costa_Rica')::DATE > v_fecha_pago_cr;

  IF v_fecha_posterior IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede registrar el extraordinario con fecha %: ya existen pagos hasta %',
      v_fecha_pago_cr,
      v_fecha_posterior
      USING ERRCODE = '22007';
  END IF;

  SELECT MAX(calculo.fecha_corte)
    INTO v_fecha_posterior
  FROM public.contrato_interes_moratorio_calculo AS calculo
  WHERE calculo.id_contrato = p_id_contrato
    AND calculo.estado <> 'ANULADO'
    AND calculo.fecha_corte > v_fecha_pago_cr;

  IF v_fecha_posterior IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede registrar el extraordinario con fecha %: el periodo moratorio ya tiene cortes cerrados hasta %',
      v_fecha_pago_cr,
      v_fecha_posterior
      USING ERRCODE = '22007';
  END IF;

  PERFORM public.sincronizar_interes_moratorio_contrato(
    p_id_contrato => p_id_contrato,
    p_fecha_hasta => v_fecha_pago_cr,
    p_usuario => v_usuario
  );

  SELECT plan.*
    INTO v_plan
  FROM public.contrato_plan_pago AS plan
  WHERE plan.id_contrato = p_id_contrato
    AND plan.estado = 'VIGENTE'
  ORDER BY plan.version DESC, plan.id_plan_pago DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato % no tiene un plan de pago vigente', p_id_contrato;
  END IF;

  PERFORM 1
  FROM public.contrato_cuota AS cuota
  WHERE cuota.id_plan_pago = v_plan.id_plan_pago
  ORDER BY cuota.numero_cuota
  FOR UPDATE;

  PERFORM 1
  FROM public.contrato_cargo AS cargo
  WHERE cargo.id_contrato = p_id_contrato
  ORDER BY cargo.id_cargo
  FOR UPDATE;

  v_proyeccion := public.proyectar_pago_extraordinario_contrato(
    p_id_contrato,
    v_monto,
    v_fecha_pago_cr
  );

  IF NOT COALESCE((v_proyeccion ->> 'permitido')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION '%', COALESCE(
      v_proyeccion ->> 'motivo_bloqueo',
      'El contrato no cumple las condiciones para registrar un extraordinario'
    ) USING ERRCODE = 'P0001';
  END IF;

  v_saldo_antes := (v_proyeccion ->> 'saldo_capital_antes')::NUMERIC(14,2);
  v_saldo_despues := (v_proyeccion ->> 'saldo_capital_despues')::NUMERIC(14,2);
  v_cuotas_antes := (v_proyeccion ->> 'cuotas_restantes_antes')::INT;
  v_cuotas_despues := (v_proyeccion ->> 'cuotas_restantes_despues')::INT;
  v_interes_antes := (v_proyeccion ->> 'interes_futuro_antes')::NUMERIC(14,2);
  v_interes_despues := (v_proyeccion ->> 'interes_futuro_despues')::NUMERIC(14,2);
  v_ahorro := (v_proyeccion ->> 'ahorro_intereses')::NUMERIC(14,2);
  v_fecha_primera := (v_proyeccion ->> 'fecha_primera_cuota_nueva')::DATE;
  v_fecha_fin_antes := NULLIF(v_proyeccion ->> 'fecha_fin_antes', '')::DATE;
  v_fecha_fin_despues := NULLIF(v_proyeccion ->> 'fecha_fin_despues', '')::DATE;
  v_liquidacion := (v_proyeccion ->> 'liquidacion_total')::BOOLEAN;

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
    v_monto,
    NULLIF(TRIM(COALESCE(p_metodo_pago, '')), ''),
    NULLIF(TRIM(COALESCE(p_referencia, '')), ''),
    NULLIF(TRIM(COALESCE(p_numero_factura, '')), ''),
    'APLICADO',
    p_observacion,
    v_usuario,
    'EXTRAORDINARIO',
    v_idempotency_key
  )
  RETURNING id_pago INTO v_pago_id;

  INSERT INTO public.contrato_pago_aplicacion (
    id_pago,
    id_plan_pago,
    monto_interes,
    monto_capital,
    monto_otros,
    notas
  )
  VALUES (
    v_pago_id,
    v_plan.id_plan_pago,
    0,
    v_monto,
    0,
    COALESCE(p_observacion, 'Pago extraordinario aplicado directamente al capital')
  );

  UPDATE public.contrato_plan_pago
  SET estado = 'REEMPLAZADO'
  WHERE id_plan_pago = v_plan.id_plan_pago;

  SELECT (COALESCE(MAX(plan.version), 0) + 1)::SMALLINT
    INTO v_version
  FROM public.contrato_plan_pago AS plan
  WHERE plan.id_contrato = p_id_contrato;

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
    CASE WHEN v_liquidacion THEN 'LIQUIDADO' ELSE 'VIGENTE' END,
    'EXTRAORDINARIO',
    v_plan.id_plan_pago,
    v_fecha_pago_cr,
    v_fecha_primera,
    v_plan.dia_pago_mensual,
    v_cuotas_despues,
    v_plan.tasa_interes_anual,
    v_plan.tasa_interes_mensual,
    v_saldo_despues,
    0,
    v_plan.cuota_base,
    v_saldo_despues,
    COALESCE(p_observacion, 'Plan recalculado por pago extraordinario'),
    v_usuario
  )
  RETURNING id_plan_pago INTO v_plan_nuevo_id;

  IF v_saldo_despues > 0 THEN
    v_saldo_iteracion := v_saldo_despues;

    FOR v_numero_cuota IN 1..v_cuotas_despues LOOP
      v_fecha_vencimiento := public.calcular_fecha_vencimiento_cuota(
        v_fecha_primera,
        v_numero_cuota
      );
      v_interes := ROUND((v_saldo_iteracion * v_plan.tasa_interes_mensual)::NUMERIC, 2);
      v_capital := ROUND((v_plan.cuota_base - v_interes)::NUMERIC, 2);
      v_cuota_total := v_plan.cuota_base;

      IF v_numero_cuota = v_cuotas_despues OR v_capital >= v_saldo_iteracion THEN
        v_capital := v_saldo_iteracion;
        v_cuota_total := ROUND((v_interes + v_capital)::NUMERIC, 2);
      END IF;

      v_saldo_final := ROUND((v_saldo_iteracion - v_capital)::NUMERIC, 2);
      IF v_saldo_final <= 0.009 THEN
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
        v_plan_nuevo_id,
        v_numero_cuota,
        v_fecha_vencimiento,
        'PENDIENTE',
        v_saldo_iteracion,
        v_plan.cuota_base,
        0,
        v_cuota_total,
        v_interes,
        v_capital,
        v_saldo_final,
        v_capital_acumulado
      );

      v_saldo_iteracion := v_saldo_final;
    END LOOP;
  END IF;

  UPDATE public.contrato
  SET
    saldo_pendiente = v_saldo_despues,
    total_meses = v_cuotas_despues
  WHERE id_contrato = p_id_contrato;

  INSERT INTO public.contrato_pago_extraordinario (
    id_pago,
    id_contrato,
    id_plan_origen,
    id_plan_resultante,
    fecha_pago,
    monto_extraordinario,
    saldo_capital_antes,
    saldo_capital_despues,
    cuota_base,
    tasa_interes_anual,
    tasa_interes_mensual,
    cuotas_restantes_antes,
    cuotas_restantes_despues,
    interes_futuro_antes,
    interes_futuro_despues,
    ahorro_intereses,
    fecha_fin_antes,
    fecha_fin_despues,
    liquidacion_total,
    registrado_por
  )
  VALUES (
    v_pago_id,
    p_id_contrato,
    v_plan.id_plan_pago,
    v_plan_nuevo_id,
    v_fecha_pago_cr,
    v_monto,
    v_saldo_antes,
    v_saldo_despues,
    v_plan.cuota_base,
    v_plan.tasa_interes_anual,
    v_plan.tasa_interes_mensual,
    v_cuotas_antes,
    v_cuotas_despues,
    v_interes_antes,
    v_interes_despues,
    v_ahorro,
    v_fecha_fin_antes,
    v_fecha_fin_despues,
    v_liquidacion,
    v_usuario
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
    v_plan.id_plan_pago,
    v_plan_nuevo_id,
    'PAGO_EXTRAORDINARIO',
    jsonb_build_object(
      'id_pago', v_pago_id,
      'tipo_pago', 'EXTRAORDINARIO',
      'monto_extraordinario', v_monto,
      'saldo_capital_antes', v_saldo_antes,
      'saldo_capital_despues', v_saldo_despues,
      'cuota_base', v_plan.cuota_base,
      'cuotas_restantes_antes', v_cuotas_antes,
      'cuotas_restantes_despues', v_cuotas_despues,
      'interes_futuro_antes', v_interes_antes,
      'interes_futuro_despues', v_interes_despues,
      'ahorro_intereses', v_ahorro,
      'fecha_fin_antes', v_fecha_fin_antes,
      'fecha_fin_despues', v_fecha_fin_despues,
      'liquidacion_total', v_liquidacion,
      'idempotency_key', v_idempotency_key
    ),
    COALESCE(p_observacion, 'Pago extraordinario aplicado directamente al capital'),
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'idempotent_replay', FALSE,
    'tipo_pago', 'EXTRAORDINARIO',
    'id_pago', v_pago_id,
    'id_plan_origen', v_plan.id_plan_pago,
    'id_plan_resultante', v_plan_nuevo_id,
    'monto_extraordinario', v_monto,
    'saldo_capital_antes', v_saldo_antes,
    'saldo_capital_despues', v_saldo_despues,
    'cuotas_restantes_antes', v_cuotas_antes,
    'cuotas_restantes_despues', v_cuotas_despues,
    'interes_futuro_antes', v_interes_antes,
    'interes_futuro_despues', v_interes_despues,
    'ahorro_intereses', v_ahorro,
    'fecha_fin_antes', v_fecha_fin_antes,
    'fecha_fin_despues', v_fecha_fin_despues,
    'liquidacion_total', v_liquidacion
  );
END;
$$;

CREATE OR REPLACE VIEW public.vw_contrato_pago_extraordinario_historial AS
SELECT
  extraordinario.id_pago,
  extraordinario.id_contrato,
  contrato.numero_contrato,
  pago.fecha_pago AS fecha_pago_timestamp,
  extraordinario.fecha_pago,
  pago.metodo_pago,
  pago.referencia,
  pago.numero_factura,
  pago.estado AS estado_pago,
  pago.observacion,
  pago.registrado_por,
  extraordinario.id_plan_origen,
  extraordinario.id_plan_resultante,
  extraordinario.monto_extraordinario,
  extraordinario.saldo_capital_antes,
  extraordinario.saldo_capital_despues,
  extraordinario.cuota_base,
  extraordinario.tasa_interes_anual,
  extraordinario.cuotas_restantes_antes,
  extraordinario.cuotas_restantes_despues,
  extraordinario.interes_futuro_antes,
  extraordinario.interes_futuro_despues,
  extraordinario.ahorro_intereses,
  extraordinario.fecha_fin_antes,
  extraordinario.fecha_fin_despues,
  extraordinario.liquidacion_total,
  extraordinario.created_at
FROM public.contrato_pago_extraordinario AS extraordinario
JOIN public.contrato_pago AS pago
  ON pago.id_pago = extraordinario.id_pago
JOIN public.contrato AS contrato
  ON contrato.id_contrato = extraordinario.id_contrato;

-- El resumen debe conservar el ultimo plan LIQUIDADO. De otro modo, al pagar
-- todo el capital el contrato pareceria no tener plan y ocultaria su historial.
CREATE OR REPLACE VIEW public.vw_control_cuotas_resumen AS
WITH plan_actual AS (
  SELECT DISTINCT ON (plan.id_contrato)
    plan.*
  FROM public.contrato_plan_pago AS plan
  WHERE plan.estado IN ('VIGENTE', 'LIQUIDADO')
  ORDER BY
    plan.id_contrato,
    CASE WHEN plan.estado = 'VIGENTE' THEN 0 ELSE 1 END,
    plan.version DESC,
    plan.id_plan_pago DESC
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
LEFT JOIN plan_actual AS plan
  ON plan.id_contrato = contrato.id_contrato
LEFT JOIN cuota_resumen AS resumen
  ON resumen.id_plan_pago = plan.id_plan_pago
LEFT JOIN mora_resumen AS mora
  ON mora.id_contrato = contrato.id_contrato
LEFT JOIN ultimo_calculo_mora AS ultimo_calculo
  ON ultimo_calculo.id_contrato = contrato.id_contrato;

COMMENT ON COLUMN public.contrato_pago.tipo_pago IS
  'Concepto exclusivo del recibo: CUOTA, MORA o EXTRAORDINARIO. No existe modalidad MIXTO.';
COMMENT ON COLUMN public.contrato_pago_aplicacion.id_plan_pago IS
  'Plan cuyo capital recibe un pago EXTRAORDINARIO; no representa el pago de una cuota programada.';
COMMENT ON TABLE public.contrato_pago_extraordinario IS
  'Auditoria uno a uno del impacto de cada pago extraordinario sobre saldo, intereses y plazo.';
COMMENT ON VIEW public.vw_contrato_pago_extraordinario_historial IS
  'Historial consultable del pago extraordinario y su plan anterior/resultante.';

REVOKE ALL ON FUNCTION public.proyectar_pago_extraordinario_contrato(INT, NUMERIC, DATE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_anulacion_pago_extraordinario()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_mutacion_aplicacion_extraordinaria()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.simular_pago_extraordinario_contrato(INT, NUMERIC, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_pago_extraordinario_contrato(
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

GRANT EXECUTE ON FUNCTION public.simular_pago_extraordinario_contrato(INT, NUMERIC, TIMESTAMPTZ, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_extraordinario_contrato(
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

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_pago_extraordinario
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contrato_pago,
     public.contrato_pago_aplicacion,
     public.contrato_plan_pago,
     public.contrato_cuota,
     public.contrato_cargo,
     public.contrato_evento_financiero
  FROM anon, authenticated;
GRANT SELECT ON public.contrato_pago_extraordinario TO authenticated;
GRANT SELECT ON public.contrato_pago,
                public.contrato_pago_aplicacion,
                public.contrato_plan_pago,
                public.contrato_cuota,
                public.contrato_cargo,
                public.contrato_evento_financiero
  TO authenticated;
GRANT SELECT ON public.vw_contrato_pago_extraordinario_historial TO authenticated;
GRANT SELECT ON public.vw_control_cuotas_resumen TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
