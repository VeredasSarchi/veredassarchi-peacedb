BEGIN;

-- Only the garden's row catalog cascades. Lot and cenizario FKs remain RESTRICT.
ALTER TABLE public.jardin_fila
  DROP CONSTRAINT jardin_fila_id_jardin_fkey,
  ADD CONSTRAINT jardin_fila_id_jardin_fkey
    FOREIGN KEY (id_jardin) REFERENCES public.jardin(id_jardin)
    ON UPDATE CASCADE ON DELETE CASCADE;

CREATE FUNCTION public.eliminar_jardin_con_filas(
  p_id_jardin INTEGER,
  p_nombre_confirmacion TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nombre_actual TEXT;
BEGIN
  IF NOT public.es_usuario_admin_actual() THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar jardines.'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the selected garden while validating its current name and relationships.
  SELECT nombre INTO nombre_actual FROM public.jardin
    WHERE id_jardin = p_id_jardin FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El jardin ya no existe. Actualiza la pagina.'
      USING ERRCODE = 'P0002';
  END IF;
  IF p_nombre_confirmacion IS NULL OR p_nombre_confirmacion = ''
     OR p_nombre_confirmacion IS DISTINCT FROM nombre_actual THEN
    RAISE EXCEPTION 'El nombre escrito no coincide exactamente con el jardin.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.lote WHERE id_jardin = p_id_jardin)
     OR EXISTS (SELECT 1 FROM public.tipo_cenizario WHERE id_jardin = p_id_jardin) THEN
    RAISE EXCEPTION 'No se puede eliminar: el jardin tiene lotes o cenizarios asociados.'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.jardin WHERE id_jardin = p_id_jardin;
  RETURN p_id_jardin;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_jardin_con_filas(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_jardin_con_filas(INTEGER, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
