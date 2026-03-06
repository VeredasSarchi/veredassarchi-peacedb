UPDATE public.contrato
SET estado_contrato = 'CONTRATO'::public.estado_contrato_enum
WHERE estado_contrato::text = 'VIGENTE';
