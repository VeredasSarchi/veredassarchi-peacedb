BEGIN;

-- La autorizacion administrativa se consulta contra auth.users para que una
-- degradacion o eliminacion tenga efecto sin confiar en metadata editable por
-- el usuario ni en un rol viejo contenido en un JWT ya emitido.
CREATE OR REPLACE FUNCTION public.es_usuario_admin_actual()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF session_user IN ('postgres', 'supabase_admin')
     OR auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.users AS usuario
    WHERE usuario.id = auth.uid()
      AND usuario.raw_app_meta_data ->> 'role' = 'admin'
      AND usuario.deleted_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.es_usuario_admin_actual()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_ingresos_campo_santo_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_usuario_admin_actual() THEN
    RAISE EXCEPTION 'No autorizado para consultar ingresos de Campo Santo'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_control_cuotas_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_usuario_admin_actual() THEN
    RAISE EXCEPTION 'No autorizado para modificar el control de cuotas'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_control_mantenimiento_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_usuario_admin_actual() THEN
    RAISE EXCEPTION 'No autorizado para modificar el control de mantenimiento'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ingresos_campo_santo_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_control_cuotas_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_control_mantenimiento_admin()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_ingresos_campo_santo_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_control_cuotas_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_control_mantenimiento_admin()
  TO authenticated;

CREATE TABLE IF NOT EXISTS public.usuario_administracion_auditoria (
  id_auditoria BIGSERIAL PRIMARY KEY,
  id_operacion UUID NOT NULL,
  actor_id UUID NOT NULL,
  actor_email TEXT,
  target_id UUID,
  target_email TEXT,
  accion TEXT NOT NULL
    CHECK (accion IN ('CREAR', 'EDITAR', 'ELIMINAR')),
  resultado TEXT NOT NULL
    CHECK (resultado IN ('INTENTO', 'EXITO', 'ERROR')),
  rol_anterior TEXT
    CHECK (rol_anterior IS NULL OR rol_anterior IN ('admin', 'vendedor')),
  rol_nuevo TEXT
    CHECK (rol_nuevo IS NULL OR rol_nuevo IN ('admin', 'vendedor')),
  cambios JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(cambios) = 'object'),
  detalle_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibilidad defensiva si una version preliminar de la tabla ya fue
-- creada manualmente antes de aplicar esta migracion. El intento de crear un
-- usuario aun no tiene target_id y cada ejecucion debe compartir un UUID.
ALTER TABLE public.usuario_administracion_auditoria
  ADD COLUMN IF NOT EXISTS id_operacion UUID,
  ADD COLUMN IF NOT EXISTS target_id UUID;

UPDATE public.usuario_administracion_auditoria
SET id_operacion = gen_random_uuid()
WHERE id_operacion IS NULL;

ALTER TABLE public.usuario_administracion_auditoria
  ALTER COLUMN id_operacion SET NOT NULL,
  ALTER COLUMN target_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuario_administracion_auditoria_operacion
  ON public.usuario_administracion_auditoria (id_operacion, created_at);
CREATE INDEX IF NOT EXISTS idx_usuario_administracion_auditoria_fecha
  ON public.usuario_administracion_auditoria (created_at DESC);

COMMENT ON TABLE public.usuario_administracion_auditoria IS
  'Trazabilidad server-side de altas, ediciones y eliminaciones de usuarios Auth; nunca almacena contrasenas.';

ALTER TABLE public.usuario_administracion_auditoria ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.usuario_administracion_auditoria
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.usuario_administracion_auditoria_id_auditoria_seq
  FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.usuario_administracion_auditoria
  FROM service_role;
REVOKE ALL ON SEQUENCE public.usuario_administracion_auditoria_id_auditoria_seq
  FROM service_role;

GRANT SELECT, INSERT ON TABLE public.usuario_administracion_auditoria
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.usuario_administracion_auditoria_id_auditoria_seq
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
