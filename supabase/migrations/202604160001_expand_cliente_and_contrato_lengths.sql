ALTER TABLE public.cliente
  ALTER COLUMN cedula TYPE VARCHAR(30);

ALTER TABLE public.cliente
  ALTER COLUMN email TYPE VARCHAR(120);

ALTER TABLE public.contrato
  ALTER COLUMN numero_contrato TYPE VARCHAR(50);
