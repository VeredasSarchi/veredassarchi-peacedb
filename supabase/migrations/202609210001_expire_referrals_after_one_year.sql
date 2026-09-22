BEGIN;

-- La vigencia comienza cuando se registra el referido y termina exactamente
-- un año calendario después, usando la hora local de Costa Rica.
CREATE OR REPLACE FUNCTION public.fecha_vencimiento_referido(
  p_created_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    (p_created_at AT TIME ZONE 'America/Costa_Rica') + INTERVAL '1 year'
  ) AT TIME ZONE 'America/Costa_Rica';
$$;

-- Protege también las vinculaciones hechas fuera de la interfaz/RPC.
CREATE OR REPLACE FUNCTION public.validar_vigencia_al_vincular_referido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_at TIMESTAMPTZ;
BEGIN
  IF NEW.id_referido_origen IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT referido.created_at INTO v_created_at
  FROM public.referido AS referido
  WHERE referido.id_referido = NEW.id_referido_origen
  FOR UPDATE;

  IF v_created_at IS NULL THEN
    RAISE EXCEPTION 'El referido seleccionado no existe';
  END IF;

  IF clock_timestamp() >= public.fecha_vencimiento_referido(v_created_at) THEN
    RAISE EXCEPTION 'El referido ya cumplió un año desde su registro y no puede atribuirse a una venta';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_vigencia_referido_insert
BEFORE INSERT ON public.contrato
FOR EACH ROW
WHEN (NEW.id_referido_origen IS NOT NULL)
EXECUTE FUNCTION public.validar_vigencia_al_vincular_referido();

CREATE TRIGGER trg_validar_vigencia_referido_update
BEFORE UPDATE OF id_referido_origen ON public.contrato
FOR EACH ROW
WHEN (NEW.id_referido_origen IS NOT NULL)
EXECUTE FUNCTION public.validar_vigencia_al_vincular_referido();

-- Un precontrato vinculado antes del vencimiento puede formalizarse después.
-- La venta continúa, pero se elimina la atribución y no se genera beneficio.
CREATE OR REPLACE FUNCTION public.omitir_beneficio_referido_vencido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referido public.referido%ROWTYPE;
  v_usuario TEXT := COALESCE(auth.jwt() ->> 'email', 'formalizacion');
  v_duplicados_inutilizados INT := 0;
BEGIN
  IF OLD.estado_contrato::TEXT <> 'PRECONTRATO'
     OR NEW.estado_contrato::TEXT <> 'VIGENTE'
     OR NEW.id_referido_origen IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_referido
  FROM public.referido
  WHERE id_referido = NEW.id_referido_origen
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF clock_timestamp() < public.fecha_vencimiento_referido(v_referido.created_at) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    PERFORM public.assert_referidos_role(TRUE);
  END IF;

  -- El evento conserva la trazabilidad de la vinculación vencida sin convertir
  -- al referido ni activar el trigger que concede CRC 15 000.
  -- La venta vuelve activo al prospecto: otros referidos del mismo contacto
  -- tampoco pueden generar un beneficio en una venta posterior.
  WITH inutilizados AS (
    UPDATE public.referido AS duplicado
    SET
      estado = 'INUTILIZABLE',
      motivo_inutilizacion = format(
        'El prospecto se formalizó en el contrato #%s sin beneficio: el referido #%s estaba vencido',
        NEW.id_contrato,
        v_referido.id_referido
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
  SELECT COUNT(*)::INT INTO v_duplicados_inutilizados FROM inutilizados;

  INSERT INTO public.referido_evento (
    id_referido, tipo_evento, detalle, usuario
  ) VALUES (
    v_referido.id_referido,
    'VENCIMIENTO_SIN_BENEFICIO',
    jsonb_build_object(
      'id_contrato_formalizado', NEW.id_contrato,
      'fecha_vencimiento', public.fecha_vencimiento_referido(v_referido.created_at),
      'duplicados_inutilizados', v_duplicados_inutilizados
    ),
    v_usuario
  );

  UPDATE public.referido
  SET
    estado = CASE WHEN estado = 'VINCULADO' THEN 'REGISTRADO' ELSE estado END,
    actualizado_por = v_usuario,
    updated_at = NOW()
  WHERE id_referido = v_referido.id_referido;

  NEW.id_referido_origen := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_omitir_beneficio_referido_vencido
BEFORE UPDATE OF estado_contrato ON public.contrato
FOR EACH ROW
EXECUTE FUNCTION public.omitir_beneficio_referido_vencido();

-- La función existente ya limita los datos por vendedor. Se conserva como
-- implementación interna y se añade la vigencia al JSON sin alterar el alcance.
ALTER FUNCTION public.obtener_panel_referidos()
  RENAME TO obtener_panel_referidos_sin_vigencia;
REVOKE ALL ON FUNCTION public.obtener_panel_referidos_sin_vigencia()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.obtener_panel_referidos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_panel JSONB;
  v_referidos JSONB;
  v_en_seguimiento BIGINT;
  v_vencidos BIGINT;
BEGIN
  v_panel := public.obtener_panel_referidos_sin_vigencia();

  WITH filas AS (
    SELECT
      item,
      ordinal,
      public.fecha_vencimiento_referido((item ->> 'created_at')::TIMESTAMPTZ)
        AS fecha_vencimiento,
      item ->> 'estado' IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO')
        AS estado_abierto
    FROM jsonb_array_elements(v_panel -> 'referidos')
      WITH ORDINALITY AS fila(item, ordinal)
  )
  SELECT
    COALESCE(jsonb_agg(
      item || jsonb_build_object(
        'fecha_vencimiento', fecha_vencimiento,
        'vigente_para_beneficio', estado_abierto AND NOW() < fecha_vencimiento,
        'estado_efectivo', CASE
          WHEN estado_abierto AND NOW() >= fecha_vencimiento THEN 'EXPIRADO'
          ELSE item ->> 'estado'
        END
      ) ORDER BY ordinal
    ), '[]'::JSONB),
    COUNT(*) FILTER (WHERE estado_abierto AND NOW() < fecha_vencimiento),
    COUNT(*) FILTER (WHERE estado_abierto AND NOW() >= fecha_vencimiento)
  INTO v_referidos, v_en_seguimiento, v_vencidos
  FROM filas;

  RETURN jsonb_set(
    jsonb_set(v_panel, '{referidos}', v_referidos),
    '{resumen}',
    (v_panel -> 'resumen') || jsonb_build_object(
      'en_gestion', v_en_seguimiento,
      'expirados', v_vencidos
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fecha_vencimiento_referido(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_vigencia_al_vincular_referido()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.omitir_beneficio_referido_vencido()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_panel_referidos()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_panel_referidos() TO authenticated;

COMMIT;
