-- READ-ONLY AUDIT
-- Lists every physical table in the public schema and its exact row count.
-- The transaction is rolled back so this script leaves no database changes.

BEGIN;

CREATE TEMP TABLE audit_table_counts (
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_count BIGINT NOT NULL,
  recommendation TEXT NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_table RECORD;
  v_count BIGINT;
  v_recommendation TEXT;
BEGIN
  FOR v_table IN
    SELECT schemaname, tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I',
      v_table.schemaname,
      v_table.tablename
    ) INTO v_count;

    v_recommendation := CASE
      WHEN v_table.tablename IN (
        'vendedor',
        'vendedor_usuario_referidos'
      ) THEN 'PRESERVAR - usuarios vendedores'
      WHEN v_table.tablename = 'onedrive_integration_config'
        THEN 'PRESERVAR - conexion OneDrive'
      WHEN v_table.tablename IN (
        'tipo_lote',
        'tipo_cremacion',
        'paquete_funerario'
      ) THEN 'PRESERVAR - catalogo reutilizable'
      WHEN v_table.tablename IN (
        'contrato_interes_moratorio_configuracion',
        'contrato_mantenimiento_interes_moratorio_configuracion'
      ) THEN 'PRESERVAR - configuracion global'
      WHEN v_table.tablename = 'usuario_administracion_auditoria'
        THEN 'PRESERVAR - auditoria de usuarios'
      WHEN v_table.tablename IN (
        'referido_evento',
        'referido_beneficio_aplicacion',
        'referido_beneficio',
        'referido',
        'contrato_mantenimiento_interes_moratorio_calculo',
        'contrato_mantenimiento_pago_aplicacion',
        'contrato_mantenimiento_cargo',
        'contrato_mantenimiento_pago',
        'contrato_mantenimiento_cuota',
        'contrato_interes_moratorio_calculo',
        'contrato_pago_extraordinario',
        'contrato_pago_aplicacion',
        'contrato_evento_financiero',
        'contrato_pago',
        'contrato_cargo',
        'contrato_cuota',
        'contrato_plan_pago',
        'contrato_anulacion_log',
        'contrato_edicion_log',
        'lote_espacio',
        'contrato_autorizados',
        'contrato_beneficiarios',
        'contrato_producto',
        'contrato',
        'cliente',
        'tipo_cenizario',
        'lote',
        'jardin'
      ) THEN 'ELIMINAR - datos operativos'
      ELSE 'REVISAR - tabla no clasificada'
    END;

    INSERT INTO audit_table_counts (
      schema_name,
      table_name,
      row_count,
      recommendation
    ) VALUES (
      v_table.schemaname,
      v_table.tablename,
      v_count,
      v_recommendation
    );
  END LOOP;

  INSERT INTO audit_table_counts (
    schema_name,
    table_name,
    row_count,
    recommendation
  )
  SELECT
    'auth',
    'users',
    COUNT(*),
    'PRESERVAR - cuentas de acceso'
  FROM auth.users;
END;
$$;

SELECT
  schema_name,
  table_name,
  row_count,
  recommendation
FROM audit_table_counts
ORDER BY
  CASE
    WHEN recommendation LIKE 'REVISAR%' THEN 1
    WHEN recommendation LIKE 'ELIMINAR%' THEN 2
    ELSE 3
  END,
  schema_name,
  table_name;

ROLLBACK;
