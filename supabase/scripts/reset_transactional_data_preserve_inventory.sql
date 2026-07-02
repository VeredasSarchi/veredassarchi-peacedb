-- Reset de datos transaccionales para pruebas.
--
-- Preserva:
--   - public.jardin
--   - public.tipo_lote
--   - public.lote
--   - public.lote_espacio
--   - public.tipo_cenizario
--   - public.tipo_cremacion
--   - public.paquete_funerario
--   - public.vendedor
--   - public.onedrive_integration_config
--   - auth.users y metadata de roles para login admin/vendedor
--
-- Elimina:
--   - clientes
--   - contratos/precontratos
--   - productos asociados al contrato
--   - cuotas, pagos, cargos, eventos financieros
--   - cuotas y pagos de mantenimiento
--   - logs de edicion/anulacion de contratos
--
-- Importante:
--   - No elimina carpetas ya creadas en OneDrive.
--   - No borra usuarios de autenticacion ni roles de login.
--   - No debe ejecutarse como migracion de produccion.

BEGIN;

UPDATE public.lote_espacio
SET
  estado = 'DISPONIBLE',
  nombre_ocupante = NULL,
  fecha_ocupacion = NULL,
  id_contrato_producto = NULL
WHERE estado <> 'DISPONIBLE'
   OR nombre_ocupante IS NOT NULL
   OR fecha_ocupacion IS NOT NULL
   OR id_contrato_producto IS NOT NULL;

DELETE FROM public.contrato_mantenimiento_pago_aplicacion;
DELETE FROM public.contrato_pago_aplicacion;

DELETE FROM public.contrato_evento_financiero;
DELETE FROM public.contrato_mantenimiento_pago;
DELETE FROM public.contrato_mantenimiento_cuota;
DELETE FROM public.contrato_pago;
DELETE FROM public.contrato_cargo;
DELETE FROM public.contrato_cuota;

UPDATE public.contrato_plan_pago
SET id_plan_anterior = NULL
WHERE id_plan_anterior IS NOT NULL;

DELETE FROM public.contrato_plan_pago;
DELETE FROM public.contrato_anulacion_log;
DELETE FROM public.contrato_edicion_log;
DELETE FROM public.contrato_autorizados;
DELETE FROM public.contrato_beneficiarios;
DELETE FROM public.contrato_producto;
DELETE FROM public.contrato;
DELETE FROM public.cliente;

ALTER SEQUENCE IF EXISTS public.cliente_id_cliente_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_id_contrato_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_autorizados_id_contrato_autorizado_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_beneficiarios_id_contrato_beneficiario_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_producto_id_contrato_producto_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_anulacion_log_id_log_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_edicion_log_id_log_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_plan_pago_id_plan_pago_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_cuota_id_cuota_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_cargo_id_cargo_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_pago_id_pago_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_pago_aplicacion_id_aplicacion_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_evento_financiero_id_evento_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_mantenimiento_cuota_id_cuota_mantenimiento_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_mantenimiento_pago_id_pago_mantenimiento_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.contrato_mantenimiento_pago_aplicacion_id_aplicacion_mantenimiento_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.precontrato_numero_formulario_seq RESTART WITH 1;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM public.cliente) AS clientes_restantes,
  (SELECT COUNT(*) FROM public.contrato) AS contratos_restantes,
  (SELECT COUNT(*) FROM public.contrato_producto) AS productos_contrato_restantes,
  (SELECT COUNT(*) FROM public.contrato_pago) AS pagos_contrato_restantes,
  (SELECT COUNT(*) FROM public.contrato_mantenimiento_pago) AS pagos_mantenimiento_restantes,
  (SELECT COUNT(*) FROM public.jardin) AS jardines_preservados,
  (SELECT COUNT(*) FROM public.lote) AS lotes_preservados,
  (SELECT COUNT(*) FROM public.tipo_cenizario) AS cenizarios_preservados,
  (SELECT COUNT(*) FROM public.vendedor) AS vendedores_preservados,
  (
    SELECT COUNT(*)
    FROM public.lote_espacio
    WHERE estado <> 'DISPONIBLE'
       OR id_contrato_producto IS NOT NULL
       OR nombre_ocupante IS NOT NULL
       OR fecha_ocupacion IS NOT NULL
  ) AS espacios_no_liberados;
