-- Estandariza cremaciones a los nombres operativos definidos
-- y evita duplicados por descripcion.

UPDATE public.tipo_cremacion
SET descripcion = 'LA LUZ'
WHERE upper(trim(descripcion)) IN ('CREMACION LUZ', 'LUZ', 'CREMACION LA LUZ', 'LA LUZ');

UPDATE public.tipo_cremacion
SET descripcion = 'RENACER'
WHERE upper(trim(descripcion)) IN ('CREMACION RENACER', 'RENACER');

INSERT INTO public.tipo_cremacion (descripcion)
SELECT v.descripcion
FROM (
  VALUES
    ('ESPERANZA'),
    ('LA LUZ'),
    ('MASCOTAS'),
    ('RENACER')
) AS v(descripcion)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tipo_cremacion tc
  WHERE upper(trim(tc.descripcion)) = upper(trim(v.descripcion))
);

WITH normalized AS (
  SELECT
    id_tipo_cremacion,
    upper(trim(descripcion)) AS descripcion_norm,
    min(id_tipo_cremacion) OVER (PARTITION BY upper(trim(descripcion))) AS keep_id,
    row_number() OVER (PARTITION BY upper(trim(descripcion)) ORDER BY id_tipo_cremacion) AS rn
  FROM public.tipo_cremacion
),
duplicates AS (
  SELECT id_tipo_cremacion, keep_id
  FROM normalized
  WHERE rn > 1
)
UPDATE public.contrato_producto cp
SET id_tipo_cremacion = d.keep_id
FROM duplicates d
WHERE cp.id_tipo_cremacion = d.id_tipo_cremacion
  AND cp.id_tipo_cremacion IS DISTINCT FROM d.keep_id;

WITH normalized AS (
  SELECT
    id_tipo_cremacion,
    row_number() OVER (PARTITION BY upper(trim(descripcion)) ORDER BY id_tipo_cremacion) AS rn
  FROM public.tipo_cremacion
)
DELETE FROM public.tipo_cremacion tc
USING normalized n
WHERE tc.id_tipo_cremacion = n.id_tipo_cremacion
  AND n.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tipo_cremacion_descripcion_norm
ON public.tipo_cremacion ((upper(trim(descripcion))));
