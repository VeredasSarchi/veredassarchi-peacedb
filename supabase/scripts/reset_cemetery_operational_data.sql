-- ONE-TIME DESTRUCTIVE SCRIPT
-- Run manually from the Supabase SQL Editor only after verifying a backup.
--
-- Preserves:
--   * Supabase Auth users, identities and sessions
--   * public.vendedor
--   * public.vendedor_usuario_referidos
--   * public.onedrive_integration_config
--   * product catalogs and global financial configurations
--
-- Deletes:
--   * clients, contracts and precontracts
--   * payment, installment, maintenance and moratory-interest history
--   * referrals and their benefits/history
--   * gardens, lots, lot spaces and cenizarios
--
-- Identity sequences are intentionally preserved to avoid reusing identifiers
-- that may already exist in OneDrive folders or external documents.

BEGIN;

CREATE TEMP TABLE reset_preserved_counts
ON COMMIT DROP
AS
SELECT
  (SELECT COUNT(*) FROM auth.users)::BIGINT AS auth_users,
  (SELECT COUNT(*) FROM public.vendedor)::BIGINT AS vendedores,
  (
    SELECT COUNT(*)
    FROM public.vendedor_usuario_referidos
  )::BIGINT AS asociaciones_vendedores,
  (
    SELECT COUNT(*)
    FROM public.onedrive_integration_config
  )::BIGINT AS configuraciones_onedrive;

DO $$
DECLARE
  v_vendedores_sin_asociacion BIGINT;
BEGIN
  IF (SELECT auth_users FROM reset_preserved_counts) = 0 THEN
    RAISE EXCEPTION
      'Limpieza cancelada: no se encontraron usuarios en auth.users';
  END IF;

  SELECT COUNT(*)
    INTO v_vendedores_sin_asociacion
  FROM auth.users AS usuario
  WHERE usuario.raw_app_meta_data ->> 'role' = 'vendedor'
    AND NOT EXISTS (
      SELECT 1
      FROM public.vendedor_usuario_referidos AS asociacion
      WHERE asociacion.id_usuario = usuario.id
    );

  IF v_vendedores_sin_asociacion > 0 THEN
    RAISE EXCEPTION
      'Limpieza cancelada: hay % cuenta(s) vendedor sin asociacion comercial',
      v_vendedores_sin_asociacion;
  END IF;
END;
$$;

-- RESTRICT is intentional: if a new dependent table exists and is not listed,
-- PostgreSQL cancels the operation instead of deleting unexpected data.
TRUNCATE TABLE
  public.referido_evento,
  public.referido_beneficio_aplicacion,
  public.referido_beneficio,
  public.referido,
  public.contrato_mantenimiento_interes_moratorio_calculo,
  public.contrato_mantenimiento_pago_aplicacion,
  public.contrato_mantenimiento_cargo,
  public.contrato_mantenimiento_pago,
  public.contrato_mantenimiento_cuota,
  public.contrato_interes_moratorio_calculo,
  public.contrato_pago_extraordinario,
  public.contrato_pago_aplicacion,
  public.contrato_evento_financiero,
  public.contrato_pago,
  public.contrato_cargo,
  public.contrato_cuota,
  public.contrato_plan_pago,
  public.contrato_anulacion_log,
  public.contrato_edicion_log,
  public.lote_espacio,
  public.contrato_autorizados,
  public.contrato_beneficiarios,
  public.contrato_producto,
  public.contrato,
  public.cliente,
  public.tipo_cenizario,
  public.lote,
  public.jardin
CONTINUE IDENTITY
RESTRICT;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM auth.users)
       IS DISTINCT FROM (SELECT auth_users FROM reset_preserved_counts)
    OR (SELECT COUNT(*) FROM public.vendedor)
       IS DISTINCT FROM (SELECT vendedores FROM reset_preserved_counts)
    OR (SELECT COUNT(*) FROM public.vendedor_usuario_referidos)
       IS DISTINCT FROM (
         SELECT asociaciones_vendedores FROM reset_preserved_counts
       )
    OR (SELECT COUNT(*) FROM public.onedrive_integration_config)
       IS DISTINCT FROM (
         SELECT configuraciones_onedrive FROM reset_preserved_counts
       ) THEN
    RAISE EXCEPTION
      'Limpieza cancelada: cambio inesperado en datos preservados';
  END IF;
END;
$$;

COMMIT;

SELECT 'auth.users' AS tabla, COUNT(*) AS registros
FROM auth.users
UNION ALL
SELECT 'public.vendedor', COUNT(*)
FROM public.vendedor
UNION ALL
SELECT 'public.vendedor_usuario_referidos', COUNT(*)
FROM public.vendedor_usuario_referidos
UNION ALL
SELECT 'public.onedrive_integration_config', COUNT(*)
FROM public.onedrive_integration_config
UNION ALL
SELECT 'public.cliente', COUNT(*)
FROM public.cliente
UNION ALL
SELECT 'public.contrato', COUNT(*)
FROM public.contrato
UNION ALL
SELECT 'public.jardin', COUNT(*)
FROM public.jardin
UNION ALL
SELECT 'public.lote', COUNT(*)
FROM public.lote
UNION ALL
SELECT 'public.tipo_cenizario', COUNT(*)
FROM public.tipo_cenizario
ORDER BY tabla;
