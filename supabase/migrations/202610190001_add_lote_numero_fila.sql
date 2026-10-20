ALTER TABLE public.lote
  ADD COLUMN numero_fila_lote SMALLINT NULL;

ALTER TABLE public.lote
  ADD CONSTRAINT lote_numero_fila_lote_positive
  CHECK (numero_fila_lote IS NULL OR numero_fila_lote > 0);

COMMENT ON COLUMN public.lote.numero_fila_lote IS
  'Numero de fila del lote dentro del jardin. NULL identifica registros anteriores sin fila persistida.';

CREATE OR REPLACE FUNCTION public.validar_numero_fila_lote()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  filas_configuradas SMALLINT;
BEGIN
  IF NEW.numero_fila_lote IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT filas_lote
    INTO filas_configuradas
  FROM public.jardin
  WHERE id_jardin = NEW.id_jardin;

  IF filas_configuradas IS NULL THEN
    RAISE EXCEPTION 'No existe el jardin con id %', NEW.id_jardin;
  END IF;

  IF NEW.numero_fila_lote > filas_configuradas THEN
    RAISE EXCEPTION
      'La fila % supera las % filas configuradas para el jardin %',
      NEW.numero_fila_lote,
      filas_configuradas,
      NEW.id_jardin;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_numero_fila_lote_trigger
BEFORE INSERT OR UPDATE OF numero_fila_lote, id_jardin
ON public.lote
FOR EACH ROW
EXECUTE FUNCTION public.validar_numero_fila_lote();
