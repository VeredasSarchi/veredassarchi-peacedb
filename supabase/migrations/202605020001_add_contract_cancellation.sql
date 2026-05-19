ALTER TABLE public.contrato
  ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS usuario_anulacion TEXT,
  ADD COLUMN IF NOT EXISTS onedrive_anulacion_estado VARCHAR(20),
  ADD COLUMN IF NOT EXISTS onedrive_anulacion_error TEXT,
  ADD COLUMN IF NOT EXISTS onedrive_anulacion_actualizado_en TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_onedrive_anulacion_estado'
      AND conrelid = 'public.contrato'::regclass
  ) THEN
    ALTER TABLE public.contrato
      ADD CONSTRAINT chk_contrato_onedrive_anulacion_estado
      CHECK (
        onedrive_anulacion_estado IS NULL
        OR onedrive_anulacion_estado IN ('PENDIENTE', 'COMPLETADO', 'ERROR')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.contrato_anulacion_log (
  id_log BIGSERIAL PRIMARY KEY,
  id_contrato INT NOT NULL REFERENCES public.contrato (id_contrato) ON DELETE CASCADE,
  usuario TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resultado VARCHAR(40) NOT NULL,
  detalle TEXT,
  onedrive_estado VARCHAR(20),
  onedrive_error TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_contrato_anulacion_log_onedrive_estado'
      AND conrelid = 'public.contrato_anulacion_log'::regclass
  ) THEN
    ALTER TABLE public.contrato_anulacion_log
      ADD CONSTRAINT chk_contrato_anulacion_log_onedrive_estado
      CHECK (
        onedrive_estado IS NULL
        OR onedrive_estado IN ('PENDIENTE', 'COMPLETADO', 'ERROR')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contrato_anulacion_log_contrato
  ON public.contrato_anulacion_log (id_contrato, fecha DESC);

CREATE OR REPLACE FUNCTION public.anular_contrato(
  p_id_contrato INT,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado_actual TEXT;
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
  v_espacios_liberados INT := 0;
BEGIN
  SELECT estado_contrato::TEXT
    INTO v_estado_actual
  FROM public.contrato
  WHERE id_contrato = p_id_contrato
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  IF v_estado_actual = 'ANULADO' THEN
    RAISE EXCEPTION 'El contrato ya esta anulado';
  END IF;

  IF v_estado_actual <> 'VIGENTE' THEN
    RAISE EXCEPTION 'Solo se pueden anular contratos vigentes';
  END IF;

  UPDATE public.lote_espacio AS espacio
  SET
    estado = 'DISPONIBLE',
    nombre_ocupante = NULL,
    fecha_ocupacion = NULL,
    id_contrato_producto = NULL
  WHERE espacio.id_contrato_producto IN (
    SELECT producto.id_contrato_producto
    FROM public.contrato_producto AS producto
    WHERE producto.id_contrato = p_id_contrato
  );

  GET DIAGNOSTICS v_espacios_liberados = ROW_COUNT;

  UPDATE public.contrato
  SET
    estado_contrato = 'ANULADO'::public.estado_contrato_enum,
    fecha_anulacion = NOW(),
    usuario_anulacion = v_usuario,
    onedrive_anulacion_estado = 'PENDIENTE',
    onedrive_anulacion_error = NULL,
    onedrive_anulacion_actualizado_en = NOW()
  WHERE id_contrato = p_id_contrato;

  INSERT INTO public.contrato_anulacion_log (
    id_contrato,
    usuario,
    resultado,
    detalle,
    onedrive_estado
  )
  VALUES (
    p_id_contrato,
    v_usuario,
    'DB_COMPLETADO',
    FORMAT('Contrato anulado. Espacios liberados: %s', v_espacios_liberados),
    'PENDIENTE'
  );

  RETURN jsonb_build_object(
    'id_contrato', p_id_contrato,
    'estado_contrato', 'ANULADO',
    'espacios_liberados', v_espacios_liberados,
    'onedrive_estado', 'PENDIENTE'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_sync_anulacion_onedrive(
  p_id_contrato INT,
  p_estado TEXT,
  p_error TEXT DEFAULT NULL,
  p_usuario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado TEXT := UPPER(COALESCE(NULLIF(TRIM(p_estado), ''), ''));
  v_usuario TEXT := COALESCE(NULLIF(TRIM(p_usuario), ''), 'sistema');
BEGIN
  IF v_estado NOT IN ('PENDIENTE', 'COMPLETADO', 'ERROR') THEN
    RAISE EXCEPTION 'Estado de sincronizacion OneDrive invalido: %', p_estado;
  END IF;

  UPDATE public.contrato
  SET
    onedrive_anulacion_estado = v_estado,
    onedrive_anulacion_error = CASE WHEN v_estado = 'ERROR' THEN p_error ELSE NULL END,
    onedrive_anulacion_actualizado_en = NOW()
  WHERE id_contrato = p_id_contrato;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % no existe', p_id_contrato;
  END IF;

  INSERT INTO public.contrato_anulacion_log (
    id_contrato,
    usuario,
    resultado,
    detalle,
    onedrive_estado,
    onedrive_error
  )
  VALUES (
    p_id_contrato,
    v_usuario,
    CASE WHEN v_estado = 'COMPLETADO' THEN 'ONEDRIVE_COMPLETADO' ELSE 'ONEDRIVE_' || v_estado END,
    CASE
      WHEN v_estado = 'COMPLETADO' THEN 'Carpeta de OneDrive renombrada correctamente'
      WHEN v_estado = 'ERROR' THEN 'La anulacion quedo en DB, pero OneDrive requiere reintento'
      ELSE 'Sincronizacion de OneDrive pendiente'
    END,
    v_estado,
    CASE WHEN v_estado = 'ERROR' THEN p_error ELSE NULL END
  );

  RETURN jsonb_build_object(
    'id_contrato', p_id_contrato,
    'onedrive_estado', v_estado,
    'onedrive_error', CASE WHEN v_estado = 'ERROR' THEN p_error ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_contrato(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_sync_anulacion_onedrive(INT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
