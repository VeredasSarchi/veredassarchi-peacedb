BEGIN;

-- Vinculo explicito entre la cuenta de Auth y el vendedor comercial.
-- Una cuenta vendedor sin vinculo no recibe datos ni puede registrar referidos.
CREATE TABLE public.vendedor_usuario_referidos (
  id_vendedor INT PRIMARY KEY REFERENCES public.vendedor (id_vendedor) ON DELETE RESTRICT,
  id_usuario UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  asociado_por UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vendedor_usuario_referidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vendedor_usuario_referidos FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.asociar_usuario_vendedor_referidos(
  p_id_usuario UUID,
  p_id_vendedor INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  PERFORM public.assert_referidos_role(TRUE);

  IF p_id_usuario IS NULL THEN
    RAISE EXCEPTION 'Seleccione una cuenta de usuario';
  END IF;

  SELECT usuario.raw_app_meta_data ->> 'role' INTO v_rol
  FROM auth.users AS usuario
  WHERE usuario.id = p_id_usuario;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta de usuario no existe';
  END IF;

  IF p_id_vendedor IS NOT NULL THEN
    IF v_rol IS DISTINCT FROM 'vendedor' THEN
      RAISE EXCEPTION 'Solo puede asociar cuentas con rol vendedor';
    END IF;

    PERFORM 1 FROM public.vendedor
    WHERE id_vendedor = p_id_vendedor
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El vendedor comercial no existe';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.vendedor_usuario_referidos
      WHERE id_vendedor = p_id_vendedor AND id_usuario <> p_id_usuario
    ) THEN
      RAISE EXCEPTION 'Este vendedor comercial ya está asociado a otra cuenta';
    END IF;
  END IF;

  DELETE FROM public.vendedor_usuario_referidos
  WHERE id_usuario = p_id_usuario;

  IF p_id_vendedor IS NOT NULL THEN
    INSERT INTO public.vendedor_usuario_referidos (
      id_vendedor, id_usuario, asociado_por
    ) VALUES (p_id_vendedor, p_id_usuario, auth.uid());
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id_usuario', p_id_usuario,
    'id_vendedor', p_id_vendedor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_asociaciones_vendedores_referidos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_referidos_role(TRUE);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id_vendedor', asociacion.id_vendedor,
      'id_usuario', asociacion.id_usuario
    ) ORDER BY asociacion.id_vendedor)
    FROM public.vendedor_usuario_referidos AS asociacion
  ), '[]'::JSONB);
END;
$$;

-- Impide que una llamada directa a registrar_referido elija un contrato ajeno
-- o reasigne el registro a otro vendedor, aunque la interfaz fuese manipulada.
CREATE OR REPLACE FUNCTION public.validar_referido_del_vendedor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
  v_id_vendedor INT;
BEGIN
  v_rol := public.assert_referidos_role(FALSE);
  IF v_rol = 'vendedor' THEN
    SELECT asociacion.id_vendedor INTO v_id_vendedor
    FROM public.vendedor_usuario_referidos AS asociacion
    WHERE asociacion.id_usuario = auth.uid();

    IF v_id_vendedor IS NULL THEN
      RAISE EXCEPTION 'La cuenta no está asociada a un vendedor comercial. Solicite la asociación a administración'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.id_vendedor_captador <> v_id_vendedor
       OR NEW.id_vendedor_responsable <> v_id_vendedor
       OR NOT EXISTS (
         SELECT 1 FROM public.contrato AS contrato
         WHERE contrato.id_contrato = NEW.id_contrato_origen
           AND contrato.id_cliente = NEW.id_cliente_referente
           AND contrato.id_vendedor = v_id_vendedor
           AND contrato.estado_contrato::TEXT = 'VIGENTE'
       ) THEN
      RAISE EXCEPTION 'Solo puede registrar referidos desde sus propios contratos vigentes'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_referido_del_vendedor
BEFORE INSERT ON public.referido
FOR EACH ROW
EXECUTE FUNCTION public.validar_referido_del_vendedor();

-- La implementación previa sigue disponible solo como función interna. El
-- nombre público devuelve el panel completo al administrador y filtra en SQL
-- todos los datos del vendedor, incluyendo métricas y listas auxiliares.
ALTER FUNCTION public.obtener_panel_referidos()
  RENAME TO obtener_panel_referidos_sin_filtro;
REVOKE ALL ON FUNCTION public.obtener_panel_referidos_sin_filtro()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.obtener_panel_referidos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
  v_id_vendedor INT;
  v_panel JSONB;
  v_referidos JSONB;
  v_contratos JSONB;
  v_vendedores JSONB;
  v_placas JSONB;
  v_resumen JSONB;
BEGIN
  v_rol := public.assert_referidos_role(FALSE);

  IF v_rol = 'vendedor' THEN
    SELECT asociacion.id_vendedor INTO v_id_vendedor
    FROM public.vendedor_usuario_referidos AS asociacion
    WHERE asociacion.id_usuario = auth.uid();

    IF v_id_vendedor IS NULL THEN
      RAISE EXCEPTION 'La cuenta no está asociada a un vendedor comercial. Solicite la asociación a administración'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_panel := public.obtener_panel_referidos_sin_filtro();
  IF v_rol = 'admin' THEN
    RETURN v_panel;
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::JSONB) INTO v_referidos
  FROM jsonb_array_elements(v_panel -> 'referidos')
    WITH ORDINALITY AS fila(item, ordinal)
  WHERE (item ->> 'id_vendedor_captador')::INT = v_id_vendedor;

  -- El indicador de duplicados tampoco revela registros de otros vendedores.
  WITH filas AS (
    SELECT item, ordinal
    FROM jsonb_array_elements(v_referidos)
      WITH ORDINALITY AS fila(item, ordinal)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_set(filas.item, '{duplicados_activos}', to_jsonb((
      SELECT COUNT(*)::INT FROM filas AS otro
      WHERE otro.ordinal <> filas.ordinal
        AND otro.item ->> 'estado' IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO')
        AND (
          public.normalizar_telefono_referido(otro.item ->> 'telefono')
            = public.normalizar_telefono_referido(filas.item ->> 'telefono')
          OR (
            public.normalizar_email_referido(filas.item ->> 'email') IS NOT NULL
            AND public.normalizar_email_referido(otro.item ->> 'email')
                = public.normalizar_email_referido(filas.item ->> 'email')
          )
        )
    ))) ORDER BY filas.ordinal
  ), '[]'::JSONB) INTO v_referidos
  FROM filas;

  SELECT COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::JSONB) INTO v_contratos
  FROM jsonb_array_elements(v_panel -> 'contratos_origen')
    WITH ORDINALITY AS fila(item, ordinal)
  WHERE (item ->> 'id_vendedor')::INT = v_id_vendedor;

  SELECT COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::JSONB) INTO v_vendedores
  FROM jsonb_array_elements(v_panel -> 'vendedores')
    WITH ORDINALITY AS fila(item, ordinal)
  WHERE (item ->> 'id_vendedor')::INT = v_id_vendedor;

  WITH filas AS (
    SELECT item FROM jsonb_array_elements(v_referidos) AS item
  ), placas AS (
    SELECT
      (item ->> 'id_cliente_referente')::INT AS id_cliente,
      COUNT(*) FILTER (
        WHERE item ->> 'beneficio_estado' = 'DISPONIBLE'
          AND (item ->> 'monto_disponible')::NUMERIC
              = (item ->> 'monto_original')::NUMERIC
          AND (item ->> 'cantidad_aplicaciones')::INT = 0
      )::INT AS unidades_intactas
    FROM filas
    GROUP BY (item ->> 'id_cliente_referente')::INT
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id_cliente', id_cliente,
    'unidades_intactas', unidades_intactas,
    'elegible', unidades_intactas >= 3
  )), '[]'::JSONB) INTO v_placas
  FROM placas;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'en_gestion', COUNT(*) FILTER (
      WHERE item ->> 'estado' IN ('REGISTRADO', 'EN_GESTION', 'VINCULADO')
    ),
    'convertidos', COUNT(*) FILTER (WHERE item ->> 'estado' = 'CONVERTIDO'),
    'beneficios_disponibles', COUNT(*) FILTER (
      WHERE item ->> 'beneficio_estado' IN ('DISPONIBLE', 'PARCIAL')
        AND (item ->> 'monto_disponible')::NUMERIC > 0
    ),
    'clientes_elegibles_placa', (
      SELECT COUNT(*) FROM jsonb_array_elements(v_placas) AS placa
      WHERE (placa ->> 'unidades_intactas')::INT >= 3
    )
  ) INTO v_resumen
  FROM jsonb_array_elements(v_referidos) AS item;

  RETURN jsonb_build_object(
    'resumen', v_resumen,
    'referidos', v_referidos,
    'clientes_placa', v_placas,
    'contratos_origen', v_contratos,
    'precontratos', '[]'::JSONB,
    'contratos_destino', '[]'::JSONB,
    'vendedores', v_vendedores
  );
END;
$$;

REVOKE ALL ON FUNCTION public.asociar_usuario_vendedor_referidos(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_asociaciones_vendedores_referidos() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_panel_referidos() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validar_referido_del_vendedor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asociar_usuario_vendedor_referidos(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_asociaciones_vendedores_referidos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_panel_referidos() TO authenticated;

COMMIT;
