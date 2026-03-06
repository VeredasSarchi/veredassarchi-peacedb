INSERT INTO public.paquete_funerario (descripcion)
SELECT v.descripcion
FROM (
  VALUES
    ('ALQUILERES DE CAPILLA'),
    ('FE'),
    ('OLIVO'),
    ('PARAISO'),
    ('PASION'),
    ('PLUS APERTURA'),
    ('PREMIUM')
) AS v(descripcion)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.paquete_funerario pf
  WHERE upper(trim(pf.descripcion)) = upper(trim(v.descripcion))
);
