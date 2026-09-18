BEGIN;

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
    public.normalizar_telefono_referido(v_cliente.telefono1) = v_referido.telefono_normalizado
    OR public.normalizar_telefono_referido(v_cliente.telefono2) = v_referido.telefono_normalizado,
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
               public.normalizar_telefono_referido(v_cliente.telefono1),
               public.normalizar_telefono_referido(v_cliente.telefono2)
             )
          OR public.normalizar_telefono_referido(cliente_activo.telefono2)
             IN (
               v_referido.telefono_normalizado,
               public.normalizar_telefono_referido(v_cliente.telefono1),
               public.normalizar_telefono_referido(v_cliente.telefono2)
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
