CREATE TABLE "lote_espacio" (
  "id_lote_espacio" SERIAL PRIMARY KEY,
  "id_lote" INT NOT NULL,
  "numero_espacio" SMALLINT NOT NULL,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',
  "nombre_ocupante" VARCHAR(150),
  "fecha_ocupacion" DATE,
  "id_contrato_producto" INT
);

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
