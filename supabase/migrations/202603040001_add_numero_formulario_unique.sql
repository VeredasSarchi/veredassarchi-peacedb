ALTER TABLE public.contrato
  ADD COLUMN IF NOT EXISTS numero_formulario VARCHAR(50);

UPDATE public.contrato
SET numero_formulario = numero_contrato
WHERE (numero_formulario IS NULL OR btrim(numero_formulario) = '')
  AND numero_contrato IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_numero_formulario
  ON public.contrato (numero_formulario)
  WHERE numero_formulario IS NOT NULL
    AND btrim(numero_formulario) <> '';
