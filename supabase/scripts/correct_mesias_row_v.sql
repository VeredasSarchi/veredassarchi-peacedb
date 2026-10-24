-- Run AFTER 202610230001_persist_garden_row_identifiers.sql.
-- User confirmed on 2026-10-23: MESIAS id 17, six lots in row 12 belong to V.
BEGIN;
LOCK TABLE public.jardin, public.jardin_fila, public.lote IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.jardin
    WHERE id_jardin = 17 AND translate(upper(btrim(nombre)), 'Í', 'I') = 'MESIAS' AND filas_lote = 12
  ) THEN RAISE EXCEPTION 'MESIAS no coincide con el jardin auditado. Revisar manualmente.'; END IF;
  IF (SELECT count(*) FROM public.lote WHERE id_jardin = 17 AND numero_fila_lote = '12') <> 6
    OR NOT EXISTS (SELECT 1 FROM public.jardin_fila WHERE id_jardin = 17 AND identificador = '12')
    OR EXISTS (SELECT 1 FROM public.jardin_fila WHERE id_jardin = 17 AND identificador = 'V')
  THEN RAISE EXCEPTION 'La fila 12 o sus seis lotes cambiaron. Revisar antes de corregir.'; END IF;
  -- ON UPDATE CASCADE preserves all other lot data and relationships.
  UPDATE public.jardin_fila SET identificador = 'V'
  WHERE id_jardin = 17 AND identificador = '12';
END;
$$;
COMMIT;
