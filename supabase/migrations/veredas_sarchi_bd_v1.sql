CREATE TYPE "estado_contrato_enum" AS ENUM (
  'PRECONTRATO',
  'VIGENTE',
  'FINALIZADO',
  'FALLIDO',
  'ANULADO'
);

CREATE TYPE "tipo_producto_enum" AS ENUM (
  'LOTE',
  'PAQUETE_FUNERARIO',
  'CENIZARIO',
  'CREMACION'
);

CREATE TABLE "cliente" (
  "id_cliente" SERIAL PRIMARY KEY,
  "nombre_completo" VARCHAR(150) NOT NULL,
  "cedula" VARCHAR(20),
  "email" VARCHAR(20),
  "direccion" VARCHAR(250),
  "estado_civil" VARCHAR(50),
  "profesion" VARCHAR(100),
  "telefono1" VARCHAR(100),
  "telefono2" VARCHAR(100),
  "observaciones" TEXT
);

CREATE TABLE "vendedor" (
  "id_vendedor" SERIAL PRIMARY KEY,
  "nombre_completo" VARCHAR(150) NOT NULL
);

CREATE TABLE "jardin" (
  "id_jardin" SERIAL PRIMARY KEY,
  "nombre" VARCHAR(100) NOT NULL
);

CREATE TABLE "tipo_lote" (
  "id_tipo_lote" SERIAL PRIMARY KEY,
  "descripcion" VARCHAR(100) NOT NULL,
  "cantidad_espacios" INT NOT NULL
);

CREATE TABLE "lote" (
  "id_lote" SERIAL PRIMARY KEY,
  "numero_lote" VARCHAR(50) NOT NULL,
  "id_jardin" INT NOT NULL,
  "id_tipo_lote" INT NOT NULL
);

CREATE TABLE "tipo_cenizario" (
  "id_tipo_cenizario" SERIAL PRIMARY KEY,
  "numero_cenizario" VARCHAR(50) NOT NULL,
  "id_jardin" INT NOT NULL,
  "descripcion" VARCHAR(100) NOT NULL
);

CREATE TABLE "tipo_cremacion" (
  "id_tipo_cremacion" SERIAL PRIMARY KEY,
  "descripcion" VARCHAR(100) NOT NULL
);

CREATE TABLE "paquete_funerario" (
  "id_paquete" SERIAL PRIMARY KEY,
  "descripcion" VARCHAR(150) NOT NULL
);

CREATE TABLE "contrato" (
  "id_contrato" SERIAL PRIMARY KEY,
  "numero_contrato" VARCHAR(20) NOT NULL,
  "fecha_firma" DATE,
  "id_cliente" INT NOT NULL,
  "id_vendedor" INT NOT NULL,
  "numero_folio_real" VARCHAR(50),
  "monto_arrendamiento_total" NUMERIC(14,2),
  "plazo_anios" INT,
  "cuota_mensual" NUMERIC(14,2),
  "dia_pago_mensual" SMALLINT,
  "total_meses" INT,
  "tasa_interes_anual" NUMERIC(5,2),
  "monto_entregado_inicial" NUMERIC(14,2),
  "saldo_pendiente" NUMERIC(14,2),
  "cantidad_lotes" INT,
  "monto_mantenimiento_anual" NUMERIC(14,2),
  "anio_inicio_mantenimiento" SMALLINT,
  "monto_apertura" NUMERIC(14,2),
  "observaciones_contrato" TEXT,
  "estado_contrato" estado_contrato_enum NOT NULL DEFAULT 'PRECONTRATO'
);

CREATE TABLE "contrato_autorizados" (
  "id_contrato_autorizado" SERIAL PRIMARY KEY,
  "id_contrato" INT NOT NULL,
  "nombre" VARCHAR(120) NOT NULL,
  "cedula" VARCHAR(30)
);

CREATE TABLE "contrato_beneficiarios" (
  "id_contrato_beneficiario" SERIAL PRIMARY KEY,
  "id_contrato" INT NOT NULL,
  "nombre" VARCHAR(120) NOT NULL,
  "cedula" VARCHAR(30),
  "contacto" VARCHAR(30)
);

CREATE TABLE "contrato_producto" (
  "id_contrato_producto" SERIAL PRIMARY KEY,
  "id_contrato" INT NOT NULL,
  "tipo_producto" tipo_producto_enum NOT NULL,
  "id_lote" INT,
  "id_tipo_cenizario" INT,
  "id_tipo_cremacion" INT,
  "id_paquete" INT,
  "precio" NUMERIC(14,2),
  "cantidad" INT
);

CREATE TABLE "lote_espacio" (
  "id_lote_espacio" SERIAL PRIMARY KEY,
  "id_lote" INT NOT NULL,
  "numero_espacio" SMALLINT NOT NULL,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',
  "nombre_ocupante" VARCHAR(150),
  "fecha_ocupacion" DATE,
  "id_contrato_producto" INT
);


ALTER TABLE "lote"
  ADD CONSTRAINT "fk_lote_jardin"
  FOREIGN KEY ("id_jardin") REFERENCES "jardin" ("id_jardin")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tipo_cenizario"
  ADD CONSTRAINT "fk_cenizario_jardin"
  FOREIGN KEY ("id_jardin") REFERENCES "jardin" ("id_jardin")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lote"
  ADD CONSTRAINT "fk_lote_tipo_lote"
  FOREIGN KEY ("id_tipo_lote") REFERENCES "tipo_lote" ("id_tipo_lote")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contrato"
  ADD CONSTRAINT "fk_contrato_cliente"
  FOREIGN KEY ("id_cliente") REFERENCES "cliente" ("id_cliente")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contrato"
  ADD CONSTRAINT "fk_contrato_vendedor"
  FOREIGN KEY ("id_vendedor") REFERENCES "vendedor" ("id_vendedor")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contrato_producto"
  ADD CONSTRAINT "fk_contrato_producto_contrato"
  FOREIGN KEY ("id_contrato") REFERENCES "contrato" ("id_contrato")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contrato_producto"
  ADD CONSTRAINT "fk_contrato_producto_lote"
  FOREIGN KEY ("id_lote") REFERENCES "lote" ("id_lote")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contrato_producto"
  ADD CONSTRAINT "fk_contrato_producto_cenizario"
  FOREIGN KEY ("id_tipo_cenizario") REFERENCES "tipo_cenizario" ("id_tipo_cenizario")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contrato_producto"
  ADD CONSTRAINT "fk_contrato_producto_cremacion"
  FOREIGN KEY ("id_tipo_cremacion") REFERENCES "tipo_cremacion" ("id_tipo_cremacion")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contrato_producto"
  ADD CONSTRAINT "fk_contrato_producto_paquete"
  FOREIGN KEY ("id_paquete") REFERENCES "paquete_funerario" ("id_paquete")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contrato_autorizados"
  ADD CONSTRAINT "fk_contrato_autorizado_contrato"
  FOREIGN KEY ("id_contrato") REFERENCES "contrato" ("id_contrato")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contrato_beneficiarios"
  ADD CONSTRAINT "fk_contrato_beneficiario_contrato"
  FOREIGN KEY ("id_contrato") REFERENCES "contrato" ("id_contrato")
  ON DELETE CASCADE ON UPDATE CASCADE;

  

  ALTER TABLE "lote_espacio"
  ADD CONSTRAINT "fk_lote_espacio_lote"
  FOREIGN KEY ("id_lote") REFERENCES "lote" ("id_lote")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lote_espacio"
  ADD CONSTRAINT "fk_lote_espacio_contrato_producto"
  FOREIGN KEY ("id_contrato_producto") REFERENCES "contrato_producto" ("id_contrato_producto")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lote_espacio"
  ADD CONSTRAINT "chk_lote_espacio_estado"
  CHECK ("estado" IN ('DISPONIBLE', 'OCUPADO'));

ALTER TABLE "lote_espacio"
  ADD CONSTRAINT "uq_lote_espacio_lote_numero"
  UNIQUE ("id_lote", "numero_espacio");
