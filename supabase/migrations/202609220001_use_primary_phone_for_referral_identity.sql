BEGIN;

-- El telefono 1 identifica al prospecto. El telefono 2 es un contacto
-- alternativo compartible y no participa en coincidencias de identidad.
-- Las validaciones de correo permanecen sin cambios.
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

  IF NOT COALESCE(
    public.normalizar_telefono_referido(v_cliente.telefono1)
      = v_referido.telefono_normalizado,
    FALSE
  ) THEN
    RAISE EXCEPTION
      'El telefono del precontrato no coincide con el referido seleccionado';
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
      hashtextextended('referido-telefono:' || v_referido.telefono_normalizado, 0)
    );

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
               public.normalizar_telefono_referido(v_cliente.telefono1)
             )
        )
    ) THEN
      RAISE EXCEPTION 'El referido ya coincide con un cliente activo por telefono';
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
        AND duplicado.telefono_normalizado = v_referido.telefono_normalizado
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

COMMIT;

NOTIFY pgrst, 'reload schema';
