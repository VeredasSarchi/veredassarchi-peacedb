-- VIGENTE is the canonical status for formalized contracts.
-- If an older environment already received the temporary CONTRATO value,
-- normalize its rows back to VIGENTE without depending on CONTRATO existing.
UPDATE public.contrato
SET estado_contrato = 'VIGENTE'::public.estado_contrato_enum
WHERE estado_contrato::text = 'CONTRATO';
