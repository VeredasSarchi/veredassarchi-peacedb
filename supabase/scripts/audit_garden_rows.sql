-- Read-only preflight. Compatible with SMALLINT and VARCHAR.
SELECT j.id_jardin, j.nombre, j.filas_lote,
       l.numero_fila_lote::TEXT AS identificador, count(l.id_lote) AS lotes
FROM public.jardin j LEFT JOIN public.lote l USING (id_jardin)
GROUP BY j.id_jardin, j.nombre, j.filas_lote, l.numero_fila_lote
ORDER BY j.id_jardin, l.numero_fila_lote;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.lote'::regclass;

SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid = 'public.lote'::regclass AND NOT tgisinternal;

SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies WHERE tablename IN ('lote', 'jardin', 'jardin_fila');

SELECT DISTINCT v.relname AS vista_dependiente
FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class v ON v.oid = r.ev_class
WHERE d.refobjid = 'public.lote'::regclass
  AND d.refobjsubid = (
    SELECT attnum FROM pg_attribute
    WHERE attrelid = 'public.lote'::regclass AND attname = 'numero_fila_lote'
  );

SELECT n.nspname, p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND p.prosrc ILIKE '%numero_fila_lote%';
