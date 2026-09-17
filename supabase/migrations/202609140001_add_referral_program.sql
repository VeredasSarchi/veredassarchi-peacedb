BEGIN;

-- Programa de referidos:
--   * Un referido nace desde un contrato vigente y pertenece al cliente referente.
--   * La administracion decide que referido se vincula a un precontrato.
--   * Al formalizar ese precontrato se genera una unica unidad de beneficio por CRC 15 000.
--   * El beneficio es un credito no monetario aplicable solo al principal de mantenimiento.
--   * Tres unidades completamente intactas permiten mostrar elegibilidad para placa 10x30.

CREATE OR REPLACE FUNCTION public.normalizar_telefono_referido(p_valor TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(p_valor, ''), '[^0-9]+', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.normalizar_email_referido(p_valor TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(LOWER(TRIM(COALESCE(p_valor, ''))), '');
$$;

CREATE TABLE public.referido (
  id_referido BIGSERIAL PRIMARY KEY,
  id_cliente_referente INT NOT NULL
    REFERENCES public.cliente (id_cliente) ON DELETE RESTRICT,
  id_contrato_origen INT NOT NULL
    REFERENCES public.contrato (id_contrato) ON DELETE RESTRICT,
  id_vendedor_captador INT NOT NULL
    REFERENCES public.vendedor (id_vendedor) ON DELETE RESTRICT,
  id_vendedor_responsable INT NOT NULL
    REFERENCES public.vendedor (id_vendedor) ON DELETE RESTRICT,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(40) NOT NULL,
  telefono_normalizado TEXT GENERATED ALWAYS AS (
    public.normalizar_telefono_referido(telefono)
  ) STORED,
  email VARCHAR(320),
  email_normalizado TEXT GENERATED ALWAYS AS (
    public.normalizar_email_referido(email)
  ) STORED,
  estado VARCHAR(20) NOT NULL DEFAULT 'REGISTRADO',
  observaciones TEXT,
  motivo_inutilizacion TEXT,
  id_cliente_convertido INT NULL
    REFERENCES public.cliente (id_cliente) ON DELETE RESTRICT,
  id_contrato_convertido INT NULL UNIQUE
    REFERENCES public.contrato (id_contrato) ON DELETE RESTRICT,
  fecha_conversion TIMESTAMPTZ,
  creado_por TEXT,
  actualizado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_referido_nombre
    CHECK (LENGTH(TRIM(nombre)) BETWEEN 2 AND 150),
  CONSTRAINT chk_referido_telefono
    CHECK (
      telefono_normalizado IS NOT NULL
      AND LENGTH(telefono_normalizado) BETWEEN 8 AND 20
    ),
  CONSTRAINT chk_referido_email
    CHECK (
      email_normalizado IS NULL
      OR (
        LENGTH(email_normalizado) <= 320
        AND email_normalizado ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  CONSTRAINT chk_referido_estado
    CHECK (
      estado IN (
        'REGISTRADO',
        'EN_GESTION',
        'VINCULADO',
        'CONVERTIDO',
        'DESCARTADO',
        'INUTILIZABLE'
      )
    ),
  CONSTRAINT chk_referido_conversion
    CHECK (
      (estado = 'CONVERTIDO'
        AND id_cliente_convertido IS NOT NULL
        AND id_contrato_convertido IS NOT NULL
        AND fecha_conversion IS NOT NULL)
      OR estado <> 'CONVERTIDO'
    )
);

ALTER TABLE public.contrato
  ADD COLUMN id_referido_origen BIGINT NULL;

ALTER TABLE public.contrato
  ADD CONSTRAINT fk_contrato_referido_origen
  FOREIGN KEY (id_referido_origen)
  REFERENCES public.referido (id_referido)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_contrato_referido_origen
  ON public.contrato (id_referido_origen)
  WHERE id_referido_origen IS NOT NULL;

CREATE INDEX idx_referido_cliente_contrato
  ON public.referido (id_cliente_referente, id_contrato_origen);

CREATE INDEX idx_referido_vendedor_estado
  ON public.referido (id_vendedor_responsable, estado);

CREATE INDEX idx_referido_telefono_normalizado
  ON public.referido (telefono_normalizado);

CREATE INDEX idx_referido_email_normalizado
  ON public.referido (email_normalizado)
  WHERE email_normalizado IS NOT NULL;

CREATE TABLE public.referido_beneficio (
  id_beneficio BIGSERIAL PRIMARY KEY,
  id_referido BIGINT NOT NULL UNIQUE
    REFERENCES public.referido (id_referido) ON DELETE RESTRICT,
  id_contrato_venta_referida INT NOT NULL UNIQUE
    REFERENCES public.contrato (id_contrato) ON DELETE RESTRICT,
  monto_original NUMERIC(14,2) NOT NULL DEFAULT 15000,
  monto_disponible NUMERIC(14,2) NOT NULL DEFAULT 15000,
  monto_anulado NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',
  fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generado_por TEXT,
  motivo_anulacion TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_referido_beneficio_monto_original
    CHECK (monto_original = 15000),
  CONSTRAINT chk_referido_beneficio_montos
    CHECK (
      monto_disponible >= 0
      AND monto_anulado >= 0
      AND monto_disponible + monto_anulado <= monto_original
    ),
  CONSTRAINT chk_referido_beneficio_estado
    CHECK (estado IN ('DISPONIBLE', 'PARCIAL', 'AGOTADO', 'ANULADO'))
);

ALTER TABLE public.contrato_mantenimiento_cuota
  ADD COLUMN monto_creditado NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.contrato_mantenimiento_cuota
  ADD CONSTRAINT chk_contrato_mantenimiento_cuota_creditado
  CHECK (
    monto_creditado >= 0
    AND monto_creditado <= monto_pagado
  );

CREATE TABLE public.referido_beneficio_aplicacion (
  id_aplicacion BIGSERIAL PRIMARY KEY,
  id_beneficio BIGINT NOT NULL
    REFERENCES public.referido_beneficio (id_beneficio) ON DELETE RESTRICT,
  id_contrato_destino INT NOT NULL
    REFERENCES public.contrato (id_contrato) ON DELETE RESTRICT,
  id_cuota_mantenimiento BIGINT NOT NULL
    REFERENCES public.contrato_mantenimiento_cuota (id_cuota_mantenimiento)
    ON DELETE RESTRICT,
  monto_aplicado NUMERIC(14,2) NOT NULL,
  monto_solicitado NUMERIC(14,2) NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  estado VARCHAR(20) NOT NULL DEFAULT 'APLICADA',
  aplicado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_referido_beneficio_aplicacion_monto
    CHECK (monto_aplicado > 0 AND monto_solicitado >= monto_aplicado),
  CONSTRAINT chk_referido_beneficio_aplicacion_estado
    CHECK (estado = 'APLICADA'),
  CONSTRAINT chk_referido_beneficio_aplicacion_idempotencia
    CHECK (
      LENGTH(TRIM(idempotency_key)) BETWEEN 1 AND 200
      AND idempotency_key = TRIM(idempotency_key)
    )
);

CREATE INDEX idx_referido_beneficio_aplicacion_beneficio
  ON public.referido_beneficio_aplicacion (id_beneficio, created_at);

CREATE INDEX idx_referido_beneficio_aplicacion_contrato
  ON public.referido_beneficio_aplicacion (id_contrato_destino, created_at);

CREATE TABLE public.referido_evento (
  id_evento BIGSERIAL PRIMARY KEY,
  id_referido BIGINT NOT NULL
    REFERENCES public.referido (id_referido) ON DELETE RESTRICT,
  tipo_evento VARCHAR(40) NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::JSONB,
  usuario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_referido_evento_detalle
    CHECK (jsonb_typeof(detalle) = 'object')
);

CREATE INDEX idx_referido_evento_referido_fecha
  ON public.referido_evento (id_referido, created_at DESC);

CREATE OR REPLACE FUNCTION public.assert_referidos_role(
  p_solo_admin BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT usuario.raw_app_meta_data ->> 'role'
    INTO v_rol
  FROM auth.users AS usuario
  WHERE usuario.id = auth.uid();

  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'vendedor') THEN
    RAISE EXCEPTION 'No tiene permisos para gestionar referidos'
      USING ERRCODE = '42501';
  END IF;

  IF p_solo_admin AND v_rol <> 'admin' THEN
    RAISE EXCEPTION 'Esta operacion de referidos requiere rol administrador'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_rol;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_referido(
  p_id_contrato_origen INT,
  p_nombre TEXT,
  p_telefono TEXT,
  p_email TEXT DEFAULT NULL,
  p_id_vendedor_responsable INT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato public.contrato%ROWTYPE;
  v_nombre TEXT := NULLIF(TRIM(COALESCE(p_nombre, '')), '');
  v_telefono TEXT := NULLIF(TRIM(COALESCE(p_telefono, '')), '');
  v_telefono_normalizado TEXT := public.normalizar_telefono_referido(p_telefono);
  v_email TEXT := public.normalizar_email_referido(p_email);
  v_id_vendedor_responsable INT;
  v_id_referido BIGINT;
  v_cliente_activo TEXT;
  v_duplicados INT := 0;
  v_usuario TEXT := COALESCE(
    auth.jwt() ->> 'email',
    NULLIF(TRIM(p_usuario), ''),
    'sistema'
  );
BEGIN
  PERFORM public.assert_referidos_role(FALSE);

  IF v_nombre IS NULL OR LENGTH(v_nombre) < 2 THEN
    RAISE EXCEPTION 'El nombre del referido es obligatorio';
  END IF;

  IF v_telefono_normalizado IS NULL
     OR LENGTH(v_telefono_normalizado) NOT BETWEEN 8 AND 20 THEN
    RAISE EXCEPTION 'El telefono del referido debe contener entre 8 y 20 digitos';
  END IF;

  IF v_email IS NOT NULL
     AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'El correo del referido no es valido';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('referido-telefono:' || v_telefono_normalizado, 0)
  );
  IF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('referido-email:' || v_email, 0)
    );
  END IF;

  SELECT contrato.*
    INTO v_contrato
  FROM public.contrato AS contrato
  WHERE contrato.id_contrato = p_id_contrato_origen
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato origen no existe';
  END IF;

  IF v_contrato.estado_contrato::TEXT <> 'VIGENTE' THEN
    RAISE EXCEPTION 'Solo se pueden registrar referidos desde contratos vigentes';
  END IF;

  SELECT cliente.nombre_completo
    INTO v_cliente_activo
  FROM public.cliente AS cliente
  WHERE EXISTS (
    SELECT 1
    FROM public.contrato AS contrato
    WHERE contrato.id_cliente = cliente.id_cliente
      AND contrato.estado_contrato::TEXT = 'VIGENTE'
  )
    AND (
      public.normalizar_telefono_referido(cliente.telefono1) = v_telefono_normalizado
      OR public.normalizar_telefono_referido(cliente.telefono2) = v_telefono_normalizado
      OR (
        v_email IS NOT NULL
        AND public.normalizar_email_referido(cliente.email) = v_email
      )
    )
  LIMIT 1;

  IF v_cliente_activo IS NOT NULL THEN
    RAISE EXCEPTION
      'El referido ya coincide con el cliente activo % y no puede participar en el programa',
      v_cliente_activo;
  END IF;

  v_id_vendedor_responsable := COALESCE(
    p_id_vendedor_responsable,
    v_contrato.id_vendedor
  );

  PERFORM 1
  FROM public.vendedor
  WHERE id_vendedor = v_id_vendedor_responsable;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El vendedor responsable no existe';
  END IF;

  SELECT COUNT(*)::INT
    INTO v_duplicados
  FROM public.referido AS referido
  WHERE referido.estado IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO')
    AND (
      referido.telefono_normalizado = v_telefono_normalizado
      OR (
        v_email IS NOT NULL
        AND referido.email_normalizado = v_email
      )
    );

  INSERT INTO public.referido (
    id_cliente_referente,
    id_contrato_origen,
    id_vendedor_captador,
    id_vendedor_responsable,
    nombre,
    telefono,
    email,
    observaciones,
    creado_por,
    actualizado_por
  )
  VALUES (
    v_contrato.id_cliente,
    v_contrato.id_contrato,
    v_contrato.id_vendedor,
    v_id_vendedor_responsable,
    v_nombre,
    v_telefono,
    v_email,
    NULLIF(TRIM(COALESCE(p_observaciones, '')), ''),
    v_usuario,
    v_usuario
  )
  RETURNING id_referido INTO v_id_referido;

  INSERT INTO public.referido_evento (
    id_referido,
    tipo_evento,
    detalle,
    usuario
  )
  VALUES (
    v_id_referido,
    'REGISTRO',
    jsonb_build_object(
      'id_contrato_origen', v_contrato.id_contrato,
      'id_cliente_referente', v_contrato.id_cliente,
      'id_vendedor_captador', v_contrato.id_vendedor,
      'id_vendedor_responsable', v_id_vendedor_responsable,
      'duplicados_previos', v_duplicados
    ),
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id_referido', v_id_referido,
    'duplicados_detectados', v_duplicados
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_administracion_referido_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' AND NEW.id_referido_origen IS NOT NULL THEN
      PERFORM public.assert_referidos_role(TRUE);
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.id_referido_origen IS DISTINCT FROM OLD.id_referido_origen THEN
        PERFORM public.assert_referidos_role(TRUE);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_administracion_referido_contrato
BEFORE UPDATE OF id_referido_origen ON public.contrato
FOR EACH ROW
EXECUTE FUNCTION public.validar_administracion_referido_contrato();

CREATE TRIGGER trg_validar_administracion_referido_contrato_insert
BEFORE INSERT ON public.contrato
FOR EACH ROW
WHEN (NEW.id_referido_origen IS NOT NULL)
EXECUTE FUNCTION public.validar_administracion_referido_contrato();

CREATE OR REPLACE FUNCTION public.vincular_referido_precontrato(
  p_id_referido BIGINT,
  p_id_contrato INT,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referido public.referido%ROWTYPE;
  v_contrato public.contrato%ROWTYPE;
  v_cliente public.cliente%ROWTYPE;
  v_anterior BIGINT;
  v_usuario TEXT := COALESCE(
    auth.jwt() ->> 'email',
    NULLIF(TRIM(p_usuario), ''),
    'sistema'
  );
  v_coincide BOOLEAN := FALSE;
BEGIN
  PERFORM public.assert_referidos_role(TRUE);

  SELECT * INTO v_referido
  FROM public.referido
  WHERE id_referido = p_id_referido
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El referido no existe';
  END IF;

  IF v_referido.estado NOT IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO') THEN
    RAISE EXCEPTION 'El referido no se encuentra disponible para vinculacion';
  END IF;

  SELECT * INTO v_contrato
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND OR v_contrato.estado_contrato::TEXT <> 'PRECONTRATO' THEN
    RAISE EXCEPTION 'Debe seleccionar un precontrato valido';
  END IF;

  IF v_contrato.id_cliente = v_referido.id_cliente_referente THEN
    RAISE EXCEPTION 'El cliente referente no puede ser su propio referido';
  END IF;

  SELECT * INTO v_cliente
  FROM public.cliente
  WHERE id_cliente = v_contrato.id_cliente;

  v_coincide := COALESCE((
    public.normalizar_telefono_referido(v_cliente.telefono1) = v_referido.telefono_normalizado
    OR public.normalizar_telefono_referido(v_cliente.telefono2) = v_referido.telefono_normalizado
    OR (
      v_referido.email_normalizado IS NOT NULL
      AND public.normalizar_email_referido(v_cliente.email) = v_referido.email_normalizado
    )
  ), FALSE);

  IF NOT v_coincide THEN
    RAISE EXCEPTION
      'El telefono o correo del precontrato no coincide con el referido seleccionado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contrato AS activo
    WHERE activo.id_cliente = v_contrato.id_cliente
      AND activo.id_contrato <> v_contrato.id_contrato
      AND activo.estado_contrato::TEXT = 'VIGENTE'
  ) THEN
    RAISE EXCEPTION 'El referido ya corresponde a un cliente activo';
  END IF;

  -- Permite que la administracion corrija la atribucion antes de formalizar.
  UPDATE public.contrato
  SET id_referido_origen = NULL
  WHERE id_referido_origen = p_id_referido
    AND id_contrato <> p_id_contrato
    AND estado_contrato::TEXT = 'PRECONTRATO';

  v_anterior := v_contrato.id_referido_origen;

  IF v_anterior IS NOT NULL AND v_anterior <> p_id_referido THEN
    UPDATE public.referido
    SET
      estado = 'REGISTRADO',
      actualizado_por = v_usuario,
      updated_at = NOW()
    WHERE id_referido = v_anterior
      AND estado = 'VINCULADO';
  END IF;

  UPDATE public.contrato
  SET id_referido_origen = p_id_referido
  WHERE id_contrato = p_id_contrato;

  UPDATE public.referido
  SET
    estado = 'VINCULADO',
    motivo_inutilizacion = NULL,
    actualizado_por = v_usuario,
    updated_at = NOW()
  WHERE id_referido = p_id_referido;

  INSERT INTO public.referido_evento (
    id_referido,
    tipo_evento,
    detalle,
    usuario
  )
  VALUES (
    p_id_referido,
    'VINCULACION_PRECONTRATO',
    jsonb_build_object(
      'id_contrato', p_id_contrato,
      'id_cliente_convertible', v_contrato.id_cliente,
      'id_referido_anterior', v_anterior
    ),
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id_referido', p_id_referido,
    'id_contrato', p_id_contrato
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.desvincular_referido_precontrato(
  p_id_contrato INT,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_referido BIGINT;
  v_usuario TEXT := COALESCE(
    auth.jwt() ->> 'email',
    NULLIF(TRIM(p_usuario), ''),
    'sistema'
  );
BEGIN
  PERFORM public.assert_referidos_role(TRUE);

  SELECT id_referido_origen INTO v_id_referido
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
    AND estado_contrato::TEXT = 'PRECONTRATO'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debe seleccionar un precontrato valido';
  END IF;

  IF v_id_referido IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'sin_cambios', TRUE);
  END IF;

  UPDATE public.contrato
  SET id_referido_origen = NULL
  WHERE id_contrato = p_id_contrato;

  UPDATE public.referido
  SET
    estado = CASE WHEN estado = 'VINCULADO' THEN 'REGISTRADO' ELSE estado END,
    actualizado_por = v_usuario,
    updated_at = NOW()
  WHERE id_referido = v_id_referido;

  INSERT INTO public.referido_evento (
    id_referido,
    tipo_evento,
    detalle,
    usuario
  ) VALUES (
    v_id_referido,
    'DESVINCULACION_PRECONTRATO',
    jsonb_build_object('id_contrato', p_id_contrato),
    v_usuario
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id_referido', v_id_referido,
    'id_contrato', p_id_contrato
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_estado_referido(
  p_id_referido BIGINT,
  p_estado TEXT,
  p_observacion TEXT DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado TEXT := UPPER(TRIM(COALESCE(p_estado, '')));
  v_estado_anterior TEXT;
  v_usuario TEXT := COALESCE(
    auth.jwt() ->> 'email',
    NULLIF(TRIM(p_usuario), ''),
    'sistema'
  );
BEGIN
  PERFORM public.assert_referidos_role(TRUE);

  IF v_estado NOT IN ('REGISTRADO', 'EN_GESTION', 'DESCARTADO') THEN
    RAISE EXCEPTION 'Estado manual de referido no permitido';
  END IF;

  SELECT estado INTO v_estado_anterior
  FROM public.referido
  WHERE id_referido = p_id_referido
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El referido no existe';
  END IF;

  IF v_estado_anterior IN ('CONVERTIDO', 'INUTILIZABLE') THEN
    RAISE EXCEPTION 'No se puede cambiar manualmente un referido convertido o inutilizable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contrato
    WHERE id_referido_origen = p_id_referido
      AND estado_contrato::TEXT = 'PRECONTRATO'
  ) THEN
    RAISE EXCEPTION 'Desvincule el referido del precontrato antes de cambiar su estado';
  END IF;

  UPDATE public.referido
  SET
    estado = v_estado,
    observaciones = COALESCE(
      NULLIF(TRIM(COALESCE(p_observacion, '')), ''),
      observaciones
    ),
    actualizado_por = v_usuario,
    updated_at = NOW()
  WHERE id_referido = p_id_referido;

  INSERT INTO public.referido_evento (
    id_referido,
    tipo_evento,
    detalle,
    usuario
  ) VALUES (
    p_id_referido,
    'CAMBIO_ESTADO',
    jsonb_build_object(
      'estado_anterior', v_estado_anterior,
      'estado_nuevo', v_estado,
      'observacion', NULLIF(TRIM(COALESCE(p_observacion, '')), '')
    ),
    v_usuario
  );

  RETURN jsonb_build_object('ok', TRUE, 'estado', v_estado);
END;
$$;

CREATE OR REPLACE FUNCTION public.procesar_referido_al_formalizar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referido public.referido%ROWTYPE;
  v_cliente public.cliente%ROWTYPE;
  v_usuario TEXT := COALESCE(auth.jwt() ->> 'email', 'formalizacion');
  v_id_beneficio BIGINT;
  v_inutilizados INT := 0;
BEGIN
  IF OLD.estado_contrato::TEXT = 'PRECONTRATO'
     AND NEW.estado_contrato::TEXT = 'VIGENTE'
     AND NEW.id_referido_origen IS NOT NULL THEN
    IF auth.uid() IS NOT NULL THEN
      PERFORM public.assert_referidos_role(TRUE);
    END IF;

    SELECT * INTO v_referido
    FROM public.referido
    WHERE id_referido = NEW.id_referido_origen
    FOR UPDATE;

    IF NOT FOUND OR v_referido.estado NOT IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO') THEN
      RAISE EXCEPTION 'El referido vinculado ya no es elegible para beneficio';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'referido-telefono:' || v_referido.telefono_normalizado,
        0
      )
    );
    IF v_referido.email_normalizado IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended(
          'referido-email:' || v_referido.email_normalizado,
          0
        )
      );
    END IF;

    IF v_referido.id_cliente_referente = NEW.id_cliente THEN
      RAISE EXCEPTION 'El cliente referente no puede ser su propio referido';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.contrato AS origen
      WHERE origen.id_contrato = v_referido.id_contrato_origen
        AND origen.id_cliente = v_referido.id_cliente_referente
        AND origen.estado_contrato::TEXT = 'VIGENTE'
    ) THEN
      RAISE EXCEPTION 'El contrato que origino el referido ya no se encuentra vigente';
    END IF;

    SELECT * INTO v_cliente
    FROM public.cliente
    WHERE id_cliente = NEW.id_cliente;

    IF EXISTS (
      SELECT 1
      FROM public.contrato AS activo
      JOIN public.cliente AS cliente_activo
        ON cliente_activo.id_cliente = activo.id_cliente
      WHERE activo.id_contrato <> NEW.id_contrato
        AND activo.estado_contrato::TEXT = 'VIGENTE'
        AND (
          activo.id_cliente = NEW.id_cliente
          OR public.normalizar_telefono_referido(cliente_activo.telefono1)
             IN (
               v_referido.telefono_normalizado,
               public.normalizar_telefono_referido(v_cliente.telefono1),
               public.normalizar_telefono_referido(v_cliente.telefono2)
             )
          OR public.normalizar_telefono_referido(cliente_activo.telefono2)
             IN (
               v_referido.telefono_normalizado,
               public.normalizar_telefono_referido(v_cliente.telefono1),
               public.normalizar_telefono_referido(v_cliente.telefono2)
             )
          OR (
            COALESCE(
              v_referido.email_normalizado,
              public.normalizar_email_referido(v_cliente.email)
            ) IS NOT NULL
            AND public.normalizar_email_referido(cliente_activo.email)
                IN (
                  v_referido.email_normalizado,
                  public.normalizar_email_referido(v_cliente.email)
                )
          )
        )
    ) THEN
      RAISE EXCEPTION 'El referido ya coincide con un cliente activo';
    END IF;

    UPDATE public.referido
    SET
      estado = 'CONVERTIDO',
      id_cliente_convertido = NEW.id_cliente,
      id_contrato_convertido = NEW.id_contrato,
      fecha_conversion = NOW(),
      motivo_inutilizacion = NULL,
      actualizado_por = v_usuario,
      updated_at = NOW()
    WHERE id_referido = v_referido.id_referido;

    INSERT INTO public.referido_beneficio (
      id_referido,
      id_contrato_venta_referida,
      generado_por
    )
    VALUES (
      v_referido.id_referido,
      NEW.id_contrato,
      v_usuario
    )
    RETURNING id_beneficio INTO v_id_beneficio;

    WITH inutilizados AS (
      UPDATE public.referido AS duplicado
      SET
        estado = 'INUTILIZABLE',
        motivo_inutilizacion = format(
          'El prospecto fue convertido por el referido #%s en el contrato #%s',
          v_referido.id_referido,
          NEW.id_contrato
        ),
        actualizado_por = v_usuario,
        updated_at = NOW()
      WHERE duplicado.id_referido <> v_referido.id_referido
        AND duplicado.estado IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO')
        AND (
          duplicado.telefono_normalizado = v_referido.telefono_normalizado
          OR (
            v_referido.email_normalizado IS NOT NULL
            AND duplicado.email_normalizado = v_referido.email_normalizado
          )
        )
      RETURNING 1
    )
    SELECT COUNT(*)::INT INTO v_inutilizados FROM inutilizados;

    INSERT INTO public.referido_evento (
      id_referido,
      tipo_evento,
      detalle,
      usuario
    ) VALUES (
      v_referido.id_referido,
      'CONVERSION_Y_BENEFICIO',
      jsonb_build_object(
        'id_cliente_convertido', NEW.id_cliente,
        'id_contrato_convertido', NEW.id_contrato,
        'id_beneficio', v_id_beneficio,
        'monto_beneficio', 15000,
        'duplicados_inutilizados', v_inutilizados
      ),
      v_usuario
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_procesar_referido_al_formalizar
AFTER UPDATE OF estado_contrato ON public.contrato
FOR EACH ROW
EXECUTE FUNCTION public.procesar_referido_al_formalizar();

CREATE OR REPLACE FUNCTION public.gestionar_beneficio_al_anular_venta_referida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_beneficio public.referido_beneficio%ROWTYPE;
  v_aplicado NUMERIC(14,2) := 0;
  v_usuario TEXT := COALESCE(NEW.usuario_anulacion, auth.jwt() ->> 'email', 'anulacion');
BEGIN
  IF OLD.estado_contrato::TEXT = 'VIGENTE'
     AND NEW.estado_contrato::TEXT = 'ANULADO'
     AND NEW.id_referido_origen IS NOT NULL THEN
    SELECT * INTO v_beneficio
    FROM public.referido_beneficio
    WHERE id_contrato_venta_referida = NEW.id_contrato
    FOR UPDATE;

    IF FOUND THEN
      SELECT COALESCE(SUM(aplicacion.monto_aplicado), 0)::NUMERIC(14,2)
        INTO v_aplicado
      FROM public.referido_beneficio_aplicacion AS aplicacion
      WHERE aplicacion.id_beneficio = v_beneficio.id_beneficio
        AND aplicacion.estado = 'APLICADA';

      IF v_beneficio.monto_disponible > 0 THEN
        UPDATE public.referido_beneficio
        SET
          monto_anulado = monto_anulado + monto_disponible,
          monto_disponible = 0,
          estado = CASE WHEN v_aplicado > 0 THEN 'AGOTADO' ELSE 'ANULADO' END,
          motivo_anulacion = CASE
            WHEN v_aplicado > 0
              THEN 'Venta referida anulada; se conserva lo ya aplicado y se invalida el remanente'
            ELSE 'Venta referida anulada antes de aplicar el beneficio'
          END,
          updated_at = NOW()
        WHERE id_beneficio = v_beneficio.id_beneficio;
      END IF;

      INSERT INTO public.referido_evento (
        id_referido,
        tipo_evento,
        detalle,
        usuario
      ) VALUES (
        v_beneficio.id_referido,
        'ANULACION_VENTA_REFERIDA',
        jsonb_build_object(
          'id_contrato_anulado', NEW.id_contrato,
          'monto_aplicado_conservado', v_aplicado,
          'monto_remanente_anulado', v_beneficio.monto_disponible
        ),
        v_usuario
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gestionar_beneficio_al_anular_venta
AFTER UPDATE OF estado_contrato ON public.contrato
FOR EACH ROW
EXECUTE FUNCTION public.gestionar_beneficio_al_anular_venta_referida();

CREATE OR REPLACE FUNCTION public.aplicar_beneficio_referido_mantenimiento(
  p_id_beneficio BIGINT,
  p_id_contrato_destino INT,
  p_monto NUMERIC DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_beneficio public.referido_beneficio%ROWTYPE;
  v_referido public.referido%ROWTYPE;
  v_contrato public.contrato%ROWTYPE;
  v_cuota public.contrato_mantenimiento_cuota%ROWTYPE;
  v_aplicacion public.referido_beneficio_aplicacion%ROWTYPE;
  v_hoy_cr DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_monto_solicitado NUMERIC(14,2);
  v_monto_aplicar NUMERIC(14,2);
  v_saldo_cuota NUMERIC(14,2);
  v_nuevo_disponible NUMERIC(14,2);
  v_usuario TEXT := COALESCE(
    auth.jwt() ->> 'email',
    NULLIF(TRIM(p_usuario), ''),
    'sistema'
  );
  v_idempotency_key TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
BEGIN
  PERFORM public.assert_control_mantenimiento_admin();

  IF v_idempotency_key IS NULL OR LENGTH(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'Debe indicar una llave de idempotencia valida';
  END IF;

  -- Serializa reintentos concurrentes con la misma llave antes de consultarla.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_idempotency_key, 0));

  SELECT * INTO v_aplicacion
  FROM public.referido_beneficio_aplicacion
  WHERE idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_aplicacion.id_beneficio <> p_id_beneficio
       OR v_aplicacion.id_contrato_destino <> p_id_contrato_destino THEN
      RAISE EXCEPTION 'La llave de idempotencia ya fue utilizada con datos diferentes';
    END IF;

    IF p_monto IS NOT NULL
       AND ROUND(p_monto::NUMERIC, 2) <> v_aplicacion.monto_solicitado THEN
      RAISE EXCEPTION 'La llave de idempotencia ya fue utilizada con un monto diferente';
    END IF;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'idempotent_replay', TRUE,
      'id_aplicacion', v_aplicacion.id_aplicacion,
      'monto_aplicado', v_aplicacion.monto_aplicado
    );
  END IF;

  SELECT * INTO v_beneficio
  FROM public.referido_beneficio
  WHERE id_beneficio = p_id_beneficio
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El beneficio no existe';
  END IF;

  IF v_beneficio.estado NOT IN ('DISPONIBLE', 'PARCIAL')
     OR v_beneficio.monto_disponible <= 0 THEN
    RAISE EXCEPTION 'El beneficio no tiene saldo disponible';
  END IF;

  SELECT * INTO v_referido
  FROM public.referido
  WHERE id_referido = v_beneficio.id_referido;

  SELECT * INTO v_contrato
  FROM public.contrato
  WHERE id_contrato = p_id_contrato_destino
  FOR UPDATE;

  IF NOT FOUND OR v_contrato.estado_contrato::TEXT <> 'VIGENTE' THEN
    RAISE EXCEPTION 'El contrato destino debe estar vigente';
  END IF;

  IF v_contrato.id_cliente <> v_referido.id_cliente_referente THEN
    RAISE EXCEPTION 'El contrato destino no pertenece al cliente referente';
  END IF;

  v_monto_solicitado := ROUND(
    COALESCE(p_monto, v_beneficio.monto_disponible)::NUMERIC,
    2
  );

  IF v_monto_solicitado <= 0 THEN
    RAISE EXCEPTION 'El monto a aplicar debe ser mayor a cero';
  END IF;

  -- Los cortes se materializan antes del credito para no alterar mora historica.
  PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
    p_id_contrato => p_id_contrato_destino,
    p_hasta_fecha => v_hoy_cr,
    p_usuario => v_usuario
  );

  PERFORM public.sincronizar_interes_moratorio_mantenimiento_contrato(
    p_id_contrato => p_id_contrato_destino,
    p_fecha_hasta => v_hoy_cr,
    p_usuario => v_usuario
  );

  SELECT cuota.* INTO v_cuota
  FROM public.contrato_mantenimiento_cuota AS cuota
  WHERE cuota.id_contrato = p_id_contrato_destino
    AND cuota.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
    AND cuota.monto_programado - cuota.monto_pagado > 0.009
  ORDER BY cuota.fecha_vencimiento, cuota.numero_periodo
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato no tiene una anualidad de mantenimiento pendiente';
  END IF;

  v_saldo_cuota := ROUND(
    GREATEST(v_cuota.monto_programado - v_cuota.monto_pagado, 0)::NUMERIC,
    2
  );

  v_monto_aplicar := LEAST(
    v_monto_solicitado,
    v_beneficio.monto_disponible,
    v_saldo_cuota
  );

  IF v_monto_aplicar <= 0 THEN
    RAISE EXCEPTION 'No existe saldo de mantenimiento al cual aplicar el beneficio';
  END IF;

  INSERT INTO public.referido_beneficio_aplicacion (
    id_beneficio,
    id_contrato_destino,
    id_cuota_mantenimiento,
    monto_aplicado,
    monto_solicitado,
    idempotency_key,
    aplicado_por
  ) VALUES (
    p_id_beneficio,
    p_id_contrato_destino,
    v_cuota.id_cuota_mantenimiento,
    v_monto_aplicar,
    v_monto_solicitado,
    v_idempotency_key,
    v_usuario
  )
  RETURNING * INTO v_aplicacion;

  UPDATE public.contrato_mantenimiento_cuota
  SET
    monto_pagado = ROUND((monto_pagado + v_monto_aplicar)::NUMERIC, 2),
    monto_creditado = ROUND((monto_creditado + v_monto_aplicar)::NUMERIC, 2),
    fecha_ultimo_pago = NOW(),
    notas = concat_ws(
      E'\n',
      NULLIF(TRIM(COALESCE(notas, '')), ''),
      format('Credito por referido #%s aplicado por %s', v_referido.id_referido, v_usuario)
    ),
    estado = CASE
      WHEN ROUND((monto_pagado + v_monto_aplicar)::NUMERIC, 2)
           >= ROUND(monto_programado::NUMERIC, 2)
        THEN 'PAGADA'
      WHEN (
        date_trunc('month', fecha_vencimiento)::DATE + INTERVAL '1 month'
      )::DATE <= v_hoy_cr
        THEN 'VENCIDA'
      ELSE 'PARCIAL'
    END
  WHERE id_cuota_mantenimiento = v_cuota.id_cuota_mantenimiento;

  v_nuevo_disponible := ROUND(
    (v_beneficio.monto_disponible - v_monto_aplicar)::NUMERIC,
    2
  );

  UPDATE public.referido_beneficio
  SET
    monto_disponible = v_nuevo_disponible,
    estado = CASE WHEN v_nuevo_disponible <= 0.009 THEN 'AGOTADO' ELSE 'PARCIAL' END,
    updated_at = NOW()
  WHERE id_beneficio = p_id_beneficio;

  INSERT INTO public.referido_evento (
    id_referido,
    tipo_evento,
    detalle,
    usuario
  ) VALUES (
    v_referido.id_referido,
    'APLICACION_MANTENIMIENTO',
    jsonb_build_object(
      'id_beneficio', p_id_beneficio,
      'id_contrato_destino', p_id_contrato_destino,
      'id_cuota_mantenimiento', v_cuota.id_cuota_mantenimiento,
      'monto_aplicado', v_monto_aplicar,
      'monto_disponible', v_nuevo_disponible
    ),
    v_usuario
  );

  -- Si se cubrio la anualidad, mantiene la regla de una unica cuota anual abierta.
  PERFORM public.sincronizar_cuotas_mantenimiento_contrato(
    p_id_contrato => p_id_contrato_destino,
    p_hasta_fecha => NULL,
    p_usuario => v_usuario
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'idempotent_replay', FALSE,
    'id_aplicacion', v_aplicacion.id_aplicacion,
    'monto_aplicado', v_monto_aplicar,
    'monto_disponible', v_nuevo_disponible,
    'id_contrato_destino', p_id_contrato_destino
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_creditos_referidos_mantenimiento(
  p_id_contrato INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado JSONB;
BEGIN
  PERFORM public.assert_control_mantenimiento_admin();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id_aplicacion', aplicacion.id_aplicacion,
        'id_beneficio', aplicacion.id_beneficio,
        'id_contrato_destino', aplicacion.id_contrato_destino,
        'id_cuota_mantenimiento', aplicacion.id_cuota_mantenimiento,
        'monto_aplicado', aplicacion.monto_aplicado,
        'aplicado_por', aplicacion.aplicado_por,
        'created_at', aplicacion.created_at,
        'id_referido', referido.id_referido,
        'referido_nombre', referido.nombre,
        'cliente_referente_nombre', cliente.nombre_completo,
        'contrato_venta_formulario', venta.numero_formulario
      )
      ORDER BY aplicacion.created_at DESC, aplicacion.id_aplicacion DESC
    ),
    '[]'::JSONB
  ) INTO v_resultado
  FROM public.referido_beneficio_aplicacion AS aplicacion
  JOIN public.referido_beneficio AS beneficio
    ON beneficio.id_beneficio = aplicacion.id_beneficio
  JOIN public.referido AS referido
    ON referido.id_referido = beneficio.id_referido
  JOIN public.cliente AS cliente
    ON cliente.id_cliente = referido.id_cliente_referente
  JOIN public.contrato AS venta
    ON venta.id_contrato = beneficio.id_contrato_venta_referida
  WHERE aplicacion.id_contrato_destino = p_id_contrato
    AND aplicacion.estado = 'APLICADA';

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_panel_referidos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado JSONB;
BEGIN
  PERFORM public.assert_referidos_role(FALSE);

  WITH aplicaciones AS (
    SELECT
      aplicacion.id_beneficio,
      COALESCE(SUM(aplicacion.monto_aplicado), 0)::NUMERIC(14,2) AS monto_aplicado,
      COUNT(*)::INT AS aplicaciones
    FROM public.referido_beneficio_aplicacion AS aplicacion
    WHERE aplicacion.estado = 'APLICADA'
    GROUP BY aplicacion.id_beneficio
  ),
  detalle AS (
    SELECT
      referido.id_referido,
      referido.nombre,
      referido.telefono,
      referido.email,
      referido.estado,
      referido.observaciones,
      referido.motivo_inutilizacion,
      referido.created_at,
      referido.fecha_conversion,
      referido.id_cliente_referente,
      cliente_referente.nombre_completo AS cliente_referente_nombre,
      referido.id_contrato_origen,
      contrato_origen.numero_formulario AS contrato_origen_formulario,
      referido.id_vendedor_captador,
      vendedor_captador.nombre_completo AS vendedor_captador_nombre,
      referido.id_vendedor_responsable,
      vendedor_responsable.nombre_completo AS vendedor_responsable_nombre,
      contrato_vinculado.id_contrato AS id_contrato_vinculado,
      contrato_vinculado.numero_formulario AS contrato_vinculado_formulario,
      contrato_vinculado.estado_contrato::TEXT AS contrato_vinculado_estado,
      cliente_vinculado.nombre_completo AS cliente_vinculado_nombre,
      referido.id_cliente_convertido,
      referido.id_contrato_convertido,
      beneficio.id_beneficio,
      beneficio.monto_original,
      beneficio.monto_disponible,
      beneficio.monto_anulado,
      beneficio.estado AS beneficio_estado,
      COALESCE(aplicaciones.monto_aplicado, 0)::NUMERIC(14,2) AS monto_aplicado,
      COALESCE(aplicaciones.aplicaciones, 0)::INT AS cantidad_aplicaciones,
      (
        SELECT COUNT(*)::INT
        FROM public.referido AS posible_duplicado
        WHERE posible_duplicado.id_referido <> referido.id_referido
          AND posible_duplicado.estado IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO')
          AND (
            posible_duplicado.telefono_normalizado = referido.telefono_normalizado
            OR (
              referido.email_normalizado IS NOT NULL
              AND posible_duplicado.email_normalizado = referido.email_normalizado
            )
          )
      ) AS duplicados_activos
    FROM public.referido AS referido
    JOIN public.cliente AS cliente_referente
      ON cliente_referente.id_cliente = referido.id_cliente_referente
    JOIN public.contrato AS contrato_origen
      ON contrato_origen.id_contrato = referido.id_contrato_origen
    JOIN public.vendedor AS vendedor_captador
      ON vendedor_captador.id_vendedor = referido.id_vendedor_captador
    JOIN public.vendedor AS vendedor_responsable
      ON vendedor_responsable.id_vendedor = referido.id_vendedor_responsable
    LEFT JOIN public.contrato AS contrato_vinculado
      ON contrato_vinculado.id_referido_origen = referido.id_referido
    LEFT JOIN public.cliente AS cliente_vinculado
      ON cliente_vinculado.id_cliente = contrato_vinculado.id_cliente
    LEFT JOIN public.referido_beneficio AS beneficio
      ON beneficio.id_referido = referido.id_referido
    LEFT JOIN aplicaciones
      ON aplicaciones.id_beneficio = beneficio.id_beneficio
  ),
  placa AS (
    SELECT
      referido.id_cliente_referente,
      COUNT(*) FILTER (
        WHERE beneficio.estado = 'DISPONIBLE'
          AND beneficio.monto_disponible = beneficio.monto_original
          AND NOT EXISTS (
            SELECT 1
            FROM public.referido_beneficio_aplicacion AS aplicacion
            WHERE aplicacion.id_beneficio = beneficio.id_beneficio
          )
      )::INT AS unidades_intactas
    FROM public.referido AS referido
    LEFT JOIN public.referido_beneficio AS beneficio
      ON beneficio.id_referido = referido.id_referido
    GROUP BY referido.id_cliente_referente
  )
  SELECT jsonb_build_object(
    'resumen', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.referido),
      'en_gestion', (
        SELECT COUNT(*) FROM public.referido
        WHERE estado IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO')
      ),
      'convertidos', (
        SELECT COUNT(*) FROM public.referido WHERE estado = 'CONVERTIDO'
      ),
      'beneficios_disponibles', (
        SELECT COUNT(*) FROM public.referido_beneficio
        WHERE estado IN ('DISPONIBLE', 'PARCIAL') AND monto_disponible > 0
      ),
      'clientes_elegibles_placa', (
        SELECT COUNT(*) FROM placa WHERE unidades_intactas >= 3
      )
    ),
    'referidos', COALESCE(
      (SELECT jsonb_agg(to_jsonb(detalle) ORDER BY detalle.created_at DESC) FROM detalle),
      '[]'::JSONB
    ),
    'clientes_placa', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id_cliente', placa.id_cliente_referente,
            'unidades_intactas', placa.unidades_intactas,
            'elegible', placa.unidades_intactas >= 3
          )
        )
        FROM placa
      ),
      '[]'::JSONB
    ),
    'contratos_origen', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id_contrato', contrato.id_contrato,
            'numero_formulario', contrato.numero_formulario,
            'id_cliente', contrato.id_cliente,
            'cliente_nombre', cliente.nombre_completo,
            'id_vendedor', contrato.id_vendedor,
            'vendedor_nombre', vendedor.nombre_completo
          )
          ORDER BY cliente.nombre_completo, contrato.id_contrato
        )
        FROM public.contrato AS contrato
        JOIN public.cliente AS cliente ON cliente.id_cliente = contrato.id_cliente
        JOIN public.vendedor AS vendedor ON vendedor.id_vendedor = contrato.id_vendedor
        WHERE contrato.estado_contrato::TEXT = 'VIGENTE'
      ),
      '[]'::JSONB
    ),
    'precontratos', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id_contrato', contrato.id_contrato,
            'numero_formulario', contrato.numero_formulario,
            'id_cliente', contrato.id_cliente,
            'cliente_nombre', cliente.nombre_completo,
            'telefono1', cliente.telefono1,
            'telefono2', cliente.telefono2,
            'email', cliente.email,
            'id_referido_actual', contrato.id_referido_origen
          )
          ORDER BY cliente.nombre_completo, contrato.id_contrato
        )
        FROM public.contrato AS contrato
        JOIN public.cliente AS cliente ON cliente.id_cliente = contrato.id_cliente
        WHERE contrato.estado_contrato::TEXT = 'PRECONTRATO'
      ),
      '[]'::JSONB
    ),
    'contratos_destino', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id_contrato', contrato.id_contrato,
            'numero_formulario', contrato.numero_formulario,
            'id_cliente', contrato.id_cliente,
            'cliente_nombre', cliente.nombre_completo,
            'total_pendiente', COALESCE(mantenimiento.total_pendiente, 0),
            'proxima_fecha_vencimiento', mantenimiento.proxima_fecha_vencimiento
          )
          ORDER BY cliente.nombre_completo, contrato.id_contrato
        )
        FROM public.contrato AS contrato
        JOIN public.cliente AS cliente ON cliente.id_cliente = contrato.id_cliente
        LEFT JOIN public.vw_control_mantenimiento_resumen AS mantenimiento
          ON mantenimiento.id_contrato = contrato.id_contrato
        WHERE contrato.estado_contrato::TEXT = 'VIGENTE'
      ),
      '[]'::JSONB
    ),
    'vendedores', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id_vendedor', vendedor.id_vendedor,
            'nombre_completo', vendedor.nombre_completo
          ) ORDER BY vendedor.nombre_completo
        )
        FROM public.vendedor AS vendedor
      ),
      '[]'::JSONB
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

ALTER TABLE public.referido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referido_beneficio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referido_beneficio_aplicacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referido_evento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.referido FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.referido_beneficio FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.referido_beneficio_aplicacion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.referido_evento FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.assert_referidos_role(BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_referido(INT, TEXT, TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vincular_referido_precontrato(BIGINT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.desvincular_referido_precontrato(INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_estado_referido(BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aplicar_beneficio_referido_mantenimiento(BIGINT, INT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_creditos_referidos_mantenimiento(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_panel_referidos() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_referido(INT, TEXT, TEXT, TEXT, INT, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_referido_precontrato(BIGINT, INT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.desvincular_referido_precontrato(INT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_referido(BIGINT, TEXT, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_beneficio_referido_mantenimiento(BIGINT, INT, NUMERIC, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_creditos_referidos_mantenimiento(INT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_panel_referidos()
  TO authenticated;

COMMENT ON TABLE public.referido IS
  'Prospectos recomendados por clientes con contrato vigente; permite duplicados hasta que administracion atribuya la venta.';
COMMENT ON TABLE public.referido_beneficio IS
  'Unidad individual de CRC 15 000 generada al formalizar una venta referida.';
COMMENT ON TABLE public.referido_beneficio_aplicacion IS
  'Aplicacion no monetaria del beneficio al principal de mantenimiento; no representa ingreso de caja.';
COMMENT ON COLUMN public.contrato_mantenimiento_cuota.monto_creditado IS
  'Parte de monto_pagado cubierta con beneficios no monetarios de referidos.';

COMMIT;
