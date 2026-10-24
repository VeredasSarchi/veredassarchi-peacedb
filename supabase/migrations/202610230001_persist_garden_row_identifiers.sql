BEGIN;

LOCK TABLE public.jardin, public.lote IN SHARE ROW EXCLUSIVE MODE;

-- Preserve the legacy 1..filas_lote configuration, including empty rows.
-- Stop rather than silently inventing assignments for inconsistent data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jardin WHERE filas_lote < 1)
     OR EXISTS (
       SELECT 1 FROM public.lote l JOIN public.jardin j USING (id_jardin)
       WHERE l.numero_fila_lote IS NOT NULL
         AND (l.numero_fila_lote < 1 OR l.numero_fila_lote > j.filas_lote)
     ) THEN
    RAISE EXCEPTION 'Filas existentes fuera de configuracion. Revisar antes de migrar.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lote WHERE numero_fila_lote IS NULL) THEN
    RAISE WARNING 'Existen lotes sin fila. Se conservaran con NULL, sin inventar asignaciones.';
  END IF;
END;
$$;

DROP TRIGGER validar_numero_fila_lote_trigger ON public.lote;
ALTER TABLE public.lote DROP CONSTRAINT lote_numero_fila_lote_positive;
ALTER TABLE public.lote ALTER COLUMN numero_fila_lote TYPE VARCHAR(20)
  USING numero_fila_lote::VARCHAR(20);

CREATE TABLE public.jardin_fila (
  id_jardin_fila SERIAL PRIMARY KEY,
  id_jardin INTEGER NOT NULL REFERENCES public.jardin(id_jardin)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  identificador VARCHAR(20) NOT NULL,
  orden INTEGER NOT NULL CHECK (orden > 0),
  CONSTRAINT jardin_fila_identificador_valido CHECK (
    identificador ~ '^[A-Z0-9]{1,20}$'
  ),
  CONSTRAINT jardin_fila_identificador_unique UNIQUE (id_jardin, identificador),
  CONSTRAINT jardin_fila_orden_unique UNIQUE (id_jardin, orden)
    DEFERRABLE INITIALLY DEFERRED
);

INSERT INTO public.jardin_fila (id_jardin, identificador, orden)
SELECT j.id_jardin, n::TEXT, n
FROM public.jardin j
CROSS JOIN LATERAL generate_series(1, j.filas_lote) n;

ALTER TABLE public.lote ADD CONSTRAINT fk_lote_jardin_fila
  FOREIGN KEY (id_jardin, numero_fila_lote)
  REFERENCES public.jardin_fila(id_jardin, identificador)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE FUNCTION public.normalizar_jardin_fila()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Serialize configuration changes per garden, including direct SQL imports.
  PERFORM 1 FROM public.jardin WHERE id_jardin = NEW.id_jardin FOR UPDATE;
  IF TG_OP = 'UPDATE' AND NEW.id_jardin <> OLD.id_jardin THEN
    RAISE EXCEPTION 'Una fila no puede trasladarse a otro jardin.';
  END IF;
  NEW.identificador := upper(regexp_replace(NEW.identificador, '[[:space:]]', '', 'g'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER normalizar_jardin_fila_trigger
BEFORE INSERT OR UPDATE ON public.jardin_fila
FOR EACH ROW EXECUTE FUNCTION public.normalizar_jardin_fila();

CREATE OR REPLACE FUNCTION public.validar_numero_fila_lote()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero_fila_lote IS NOT NULL THEN
    NEW.numero_fila_lote := upper(regexp_replace(NEW.numero_fila_lote, '[[:space:]]', '', 'g'));
    IF NEW.numero_fila_lote !~ '^[A-Z0-9]{1,20}$' THEN
      RAISE EXCEPTION 'Identificador de fila invalido.';
    END IF;
  END IF;
  -- The composite FK validates the identifier against this particular garden.
  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_numero_fila_lote_trigger
BEFORE INSERT OR UPDATE OF numero_fila_lote, id_jardin ON public.lote
FOR EACH ROW EXECUTE FUNCTION public.validar_numero_fila_lote();

-- Deferred so garden and row changes can be made atomically in either order.
CREATE FUNCTION public.validar_cantidad_jardin_filas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jardin_id INTEGER;
  cantidad INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN jardin_id := OLD.id_jardin;
  ELSE jardin_id := NEW.id_jardin;
  END IF;
  SELECT filas_lote INTO cantidad FROM public.jardin
    WHERE id_jardin = jardin_id FOR UPDATE;
  IF FOUND AND (
    cantidad < 1 OR cantidad <> (
      SELECT count(*) FROM public.jardin_fila WHERE id_jardin = jardin_id
    )
  ) THEN
    RAISE EXCEPTION 'La cantidad de filas del jardin % no coincide con su catalogo.', jardin_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER jardin_filas_cantidad
AFTER INSERT OR UPDATE ON public.jardin DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validar_cantidad_jardin_filas();

CREATE CONSTRAINT TRIGGER jardin_filas_catalogo_cantidad
AFTER INSERT OR UPDATE OR DELETE ON public.jardin_fila DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validar_cantidad_jardin_filas();

ALTER TABLE public.jardin_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jardin_fila FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jardin_fila TO authenticated;
GRANT ALL ON public.jardin_fila TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.jardin_fila_id_jardin_fila_seq TO service_role;
CREATE POLICY jardin_fila_lectura ON public.jardin_fila
  FOR SELECT TO authenticated USING (true);

-- Only this admin RPC writes configuration from the application.
CREATE FUNCTION public.guardar_jardin_con_filas(
  p_id_jardin INTEGER, p_nombre TEXT, p_filas JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jardin_id INTEGER := p_id_jardin;
  cantidad INTEGER;
  fila JSONB;
  posicion BIGINT;
  fila_id INTEGER;
  etiqueta TEXT;
  ids INTEGER[] := '{}';
BEGIN
  IF NOT public.es_usuario_admin_actual() THEN
    RAISE EXCEPTION 'Solo un administrador puede configurar jardines.' USING ERRCODE = '42501';
  END IF;
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'Ingresa un nombre de jardin.';
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Las filas deben ser un arreglo.';
  END IF;
  cantidad := jsonb_array_length(p_filas);
  IF cantidad < 1 OR cantidad > 32767 THEN
    RAISE EXCEPTION 'La cantidad de filas debe estar entre 1 y 32767.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_filas) f
    WHERE f->>'identificador' IS NULL OR
      upper(regexp_replace(f->>'identificador', '[[:space:]]', '', 'g')) !~ '^[A-Z0-9]{1,20}$'
  ) OR (
    SELECT count(DISTINCT upper(regexp_replace(f->>'identificador', '[[:space:]]', '', 'g')))
    FROM jsonb_array_elements(p_filas) f
  ) <> cantidad THEN
    RAISE EXCEPTION 'Usa identificadores alfanumericos de 1 a 20 caracteres, sin duplicados.';
  END IF;

  IF jardin_id IS NULL THEN
    INSERT INTO public.jardin(nombre, filas_lote)
      VALUES (btrim(p_nombre), cantidad) RETURNING id_jardin INTO jardin_id;
  ELSE
    PERFORM 1 FROM public.jardin WHERE id_jardin = jardin_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El jardin no existe.'; END IF;
    UPDATE public.jardin SET nombre = btrim(p_nombre), filas_lote = cantidad
      WHERE id_jardin = jardin_id;
  END IF;

  FOR fila, posicion IN SELECT value, ordinality FROM jsonb_array_elements(p_filas) WITH ORDINALITY LOOP
    etiqueta := upper(regexp_replace(fila->>'identificador', '[[:space:]]', '', 'g'));
    fila_id := (fila->>'id_jardin_fila')::INTEGER;
    IF fila_id IS NULL THEN
      INSERT INTO public.jardin_fila(id_jardin, identificador, orden)
        VALUES (jardin_id, etiqueta, posicion) RETURNING id_jardin_fila INTO fila_id;
    ELSE
      IF fila_id = ANY(ids) THEN RAISE EXCEPTION 'Fila repetida.'; END IF;
      UPDATE public.jardin_fila SET identificador = etiqueta, orden = posicion
        WHERE id_jardin_fila = fila_id AND id_jardin = jardin_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'La fila no pertenece al jardin.'; END IF;
    END IF;
    ids := array_append(ids, fila_id);
  END LOOP;
  -- FK RESTRICT prevents removing any row that still contains lots.
  DELETE FROM public.jardin_fila WHERE id_jardin = jardin_id AND NOT (id_jardin_fila = ANY(ids));
  RETURN jsonb_build_object(
    'jardin', (SELECT to_jsonb(j) FROM public.jardin j WHERE id_jardin = jardin_id),
    'filas', (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.orden) FROM public.jardin_fila f WHERE id_jardin = jardin_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_jardin_con_filas(INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_jardin_con_filas(INTEGER, TEXT, JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.normalizar_jardin_fila(), public.validar_numero_fila_lote(),
  public.validar_cantidad_jardin_filas() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.lote.numero_fila_lote IS
  'Identificador textual de jardin_fila dentro del jardin. NULL conserva lotes sin asignacion.';
COMMENT ON COLUMN public.jardin.filas_lote IS
  'Cantidad de filas; los identificadores y el orden residen en jardin_fila.';
NOTIFY pgrst, 'reload schema';
COMMIT;

