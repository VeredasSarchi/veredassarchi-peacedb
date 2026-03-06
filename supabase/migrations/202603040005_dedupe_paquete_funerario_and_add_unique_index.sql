-- Consolidar paquetes funerarios duplicados por nombre (ignora mayusculas/espacios)
-- 1) Reasigna referencias en contrato_producto al id "ganador" (menor id_paquete)
-- 2) Elimina filas duplicadas
-- 3) Evita futuros duplicados con indice unico normalizado

WITH normalized AS (
  SELECT
    id_paquete,
    upper(trim(descripcion)) AS descripcion_norm,
    min(id_paquete) OVER (PARTITION BY upper(trim(descripcion))) AS keep_id,
    row_number() OVER (PARTITION BY upper(trim(descripcion)) ORDER BY id_paquete) AS rn
  FROM public.paquete_funerario
),
duplicates AS (
  SELECT id_paquete, keep_id
  FROM normalized
  WHERE rn > 1
)
UPDATE public.contrato_producto cp
SET id_paquete = d.keep_id
FROM duplicates d
WHERE cp.id_paquete = d.id_paquete
  AND cp.id_paquete IS DISTINCT FROM d.keep_id;

WITH normalized AS (
  SELECT
    id_paquete,
    row_number() OVER (PARTITION BY upper(trim(descripcion)) ORDER BY id_paquete) AS rn
  FROM public.paquete_funerario
)
DELETE FROM public.paquete_funerario pf
USING normalized n
WHERE pf.id_paquete = n.id_paquete
  AND n.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_paquete_funerario_descripcion_norm
ON public.paquete_funerario ((upper(trim(descripcion))));
