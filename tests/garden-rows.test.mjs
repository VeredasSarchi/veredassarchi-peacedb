import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const compiled = ts.transpileModule(await read("src/lib/garden-rows.ts"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { groupLotsByRows, normalizeRowIdentifier, validateRowDrafts } =
  await import("data:text/javascript;base64," + Buffer.from(compiled.outputText).toString("base64"));

test("configured order, empty rows, textual identity, NULL and lot insertion order", () => {
  const rows = ["1", "2", "P", "U", "V"].map((identificador, index) => ({
    id_jardin_fila: index + 1, id_jardin: 10, identificador, orden: index + 1,
  }));
  const lots = [
    { id_lote: 12, numero_fila_lote: "P", numero_lote: "1" },
    { id_lote: 3, numero_fila_lote: " p ", numero_lote: "25" },
    { id_lote: 17, numero_fila_lote: null, numero_lote: "F1-OLD" },
  ];
  const groups = groupLotsByRows([...rows].reverse(), lots);
  assert.deepEqual(groups.map((group) => group.identifier), ["1", "2", "P", "U", "V", null]);
  assert.deepEqual(groups[2].lots.map((lot) => lot.id_lote), [3, 12]);
  assert.equal(groups[4].lots.length, 0);
  assert.equal(groups[5].lots[0].numero_lote, "F1-OLD");
  assert.equal(normalizeRowIdentifier(" p 1 "), "P1");
  assert.ok(validateRowDrafts([{ identificador: "P" }, { identificador: " p " }]));
  assert.equal(validateRowDrafts([{ identificador: "V" }, { identificador: "3" }]), null);
  assert.ok(validateRowDrafts([{ identificador: " " }]));
  assert.ok(validateRowDrafts([{ identificador: "a".repeat(21) }]));
  assert.deepEqual(groupLotsByRows(rows, [{ id_lote: 1, numero_fila_lote: "X" }]).at(-1),
    { identifier: "X", configured: false, lots: [{ id_lote: 1, numero_fila_lote: "X" }] });
});

test("PostgreSQL migration and garden/lot integration", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec([
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;",
    "CREATE TABLE jardin(id_jardin SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, filas_lote SMALLINT NOT NULL DEFAULT 8);",
    "CREATE TABLE tipo_lote(id_tipo_lote SERIAL PRIMARY KEY, descripcion TEXT, cantidad_espacios SMALLINT);",
    "CREATE TABLE lote(id_lote SERIAL PRIMARY KEY, numero_lote VARCHAR(50) NOT NULL, id_jardin INTEGER NOT NULL REFERENCES jardin ON DELETE RESTRICT, id_tipo_lote INTEGER NOT NULL REFERENCES tipo_lote ON DELETE RESTRICT);",
    "CREATE TABLE lote_espacio(id_lote_espacio SERIAL PRIMARY KEY, id_lote INTEGER REFERENCES lote, nombre_ocupante TEXT);",
    "CREATE TABLE tipo_cenizario(id_tipo_cenizario SERIAL PRIMARY KEY, id_jardin INTEGER NOT NULL REFERENCES jardin ON DELETE RESTRICT);",
    // Simulate the existing admin helper, without connecting to Supabase Auth.
    "CREATE FUNCTION es_usuario_admin_actual() RETURNS BOOLEAN LANGUAGE SQL AS $$ SELECT current_setting('test.admin', true) IS DISTINCT FROM 'false' $$;",
    "INSERT INTO tipo_lote VALUES (1, 'Individual', 2), (2, 'Familiar', 2);",
    "INSERT INTO jardin VALUES (16, 'LA PAZ', 9), (17, 'MESÍAS', 12); SELECT setval('jardin_id_jardin_seq', 17);",
  ].join("\n"));
  await db.exec(await read("supabase/migrations/202610190001_add_lote_numero_fila.sql"));
  await db.exec([
    "INSERT INTO lote(numero_lote,id_jardin,id_tipo_lote,numero_fila_lote) SELECT 'LP-' || n,16,1,n FROM generate_series(1,9) n;",
    "INSERT INTO lote(numero_lote,id_jardin,id_tipo_lote,numero_fila_lote) SELECT 'M-' || n,17,2,12 FROM generate_series(1,6) n;",
    "INSERT INTO lote(numero_lote,id_jardin,id_tipo_lote) VALUES ('F3-UNKNOWN',16,1);",
    "INSERT INTO lote_espacio(id_lote,nombre_ocupante) VALUES (1,'fixture');",
  ].join("\n"));
  const before = (await db.query("SELECT id_lote,numero_lote,id_jardin,id_tipo_lote,numero_fila_lote::text FROM lote ORDER BY id_lote")).rows;
  await db.exec(await read("supabase/migrations/202610230001_persist_garden_row_identifiers.sql"));
  await db.exec(await read("supabase/migrations/202610230002_delete_garden_with_rows.sql"));

  const save = async (name, identifiers, id = null) => {
    const payload = identifiers.map((value) => typeof value === "string" ? { identificador: value } : value);
    return (await db.query("SELECT guardar_jardin_con_filas($1,$2,$3::jsonb) AS data",
      [id, name, JSON.stringify(payload)])).rows[0].data;
  };
  const insertLot = async (gardenId, row, name = "25") =>
    (await db.query("INSERT INTO lote(id_jardin,numero_fila_lote,numero_lote,id_tipo_lote) VALUES($1,$2,$3,1) RETURNING *",
      [gardenId, row, name])).rows[0];
  let numeric, mixed, lotP;

  await t.test("legacy rows convert to text, preserving lot data, spaces and empty rows", async () => {
    assert.deepEqual((await db.query("SELECT * FROM lote ORDER BY id_lote")).rows, before);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM jardin_fila WHERE id_jardin=16")).rows[0].n, 9);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM lote_espacio")).rows[0].n, 1);
    assert.equal((await db.query("SELECT character_maximum_length FROM information_schema.columns WHERE table_name='lote' AND column_name='numero_fila_lote'")).rows[0].character_maximum_length, 20);
  });
  await t.test("create numeric garden atomically", async () => {
    numeric = await save("Numerico", ["1","2","3"]);
    assert.equal(numeric.jardin.filas_lote, 3);
    assert.deepEqual(numeric.filas.map((f) => f.identificador), ["1","2","3"]);
  });
  await t.test("create mixed garden and preserve configured order", async () => {
    mixed = await save("Mixto", ["1","2"," p ","U","V"]);
    assert.equal(mixed.jardin.filas_lote, 5);
    assert.deepEqual(mixed.filas.map((f) => f.identificador), ["1","2","P","U","V"]);
  });
  await t.test("SQL insert lot in P and numeric 3", async () => {
    lotP = await insertLot(mixed.jardin.id_jardin, " p ");
    assert.equal(lotP.numero_fila_lote, "P");
    assert.equal(lotP.numero_lote, "25");
    assert.equal((await insertLot(numeric.jardin.id_jardin, "3")).numero_fila_lote, "3");
  });
  await t.test("move lot P to V and reload rows and lots", async () => {
    await db.query("UPDATE lote SET numero_fila_lote='V' WHERE id_lote=$1", [lotP.id_lote]);
    const rows = (await db.query("SELECT * FROM jardin_fila WHERE id_jardin=$1 ORDER BY orden", [mixed.jardin.id_jardin])).rows;
    const lots = (await db.query("SELECT * FROM lote WHERE id_jardin=$1 ORDER BY id_lote", [mixed.jardin.id_jardin])).rows;
    const groups = groupLotsByRows(rows, lots);
    assert.equal(groups.length, 5);
    assert.equal(groups[2].lots.length, 0);
    assert.equal(groups[4].lots[0].id_lote, lotP.id_lote);
  });
  await t.test("duplicate identifiers rejected without partial garden", async () => {
    await assert.rejects(save("Duplicate", ["P"," p "]), /duplicados/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM jardin WHERE nombre='Duplicate'")).rows[0].n, 0);
  });
  await t.test("different gardens may have P; wrong-garden assignments are rejected", async () => {
    const another = await save("Otro", ["P"]);
    assert.equal((await insertLot(another.jardin.id_jardin, "P")).numero_fila_lote, "P");
    await assert.rejects(insertLot(numeric.jardin.id_jardin, "P"), /foreign key/);
    await assert.rejects(insertLot(mixed.jardin.id_jardin, "3"), /foreign key/);
    await assert.rejects(insertLot(mixed.jardin.id_jardin, ""), /invalido/);
  });
  await t.test("reordering rows preserves identities and assignments", async () => {
    mixed = await save("Mixto", [...mixed.filas].reverse(), mixed.jardin.id_jardin);
    assert.deepEqual(mixed.filas.map((f) => f.identificador), ["V","U","P","2","1"]);
    assert.equal((await db.query("SELECT numero_fila_lote FROM lote WHERE id_lote=$1", [lotP.id_lote])).rows[0].numero_fila_lote, "V");
  });
  await t.test("rename configured row with cascade, preserving other lot data", async () => {
    mixed = await save("Mixto", mixed.filas.map((f) => f.identificador === "V" ? { ...f, identificador: "W" } : f), mixed.jardin.id_jardin);
    assert.deepEqual((await db.query("SELECT * FROM lote WHERE id_lote=$1", [lotP.id_lote])).rows[0], { ...lotP, numero_fila_lote: "W" });
  });
  await t.test("occupied row deletion fails atomically", async () => {
    await assert.rejects(save("Mixto", mixed.filas.filter((f) => f.identificador !== "W"), mixed.jardin.id_jardin), /foreign key/);
    assert.equal((await db.query("SELECT filas_lote FROM jardin WHERE id_jardin=$1", [mixed.jardin.id_jardin])).rows[0].filas_lote, 5);
  });
  await t.test("SQL import with explicit catalog; inconsistent counts rejected", async () => {
    await db.exec("BEGIN; INSERT INTO jardin(id_jardin,nombre,filas_lote) VALUES(100,'SQL',2); INSERT INTO jardin_fila(id_jardin,identificador,orden) VALUES(100,'U',1),(100,'P',2); COMMIT;");
    assert.equal((await insertLot(100, "U")).numero_fila_lote, "U");
    await assert.rejects(db.exec("UPDATE jardin SET filas_lote=3 WHERE id_jardin=100"), /no coincide/);
    assert.equal((await db.query("SELECT filas_lote FROM jardin WHERE id_jardin=100")).rows[0].filas_lote, 2);
  });
  await t.test("direct SQL rejects duplicate normalized identifiers and duplicate order", async () => {
    await assert.rejects(db.exec("INSERT INTO jardin_fila(id_jardin,identificador,orden) VALUES(100,' p ',3)"), /unique/);
    await assert.rejects(db.exec("UPDATE jardin_fila SET orden=1 WHERE id_jardin=100 AND identificador='P'"), /unique/);
  });
  await t.test("MESIAS correction changes only the six lots; LA PAZ intact", async () => {
    const pazBefore = (await db.query("SELECT * FROM lote WHERE id_jardin=16 ORDER BY id_lote")).rows;
    await db.exec(await read("supabase/scripts/correct_mesias_row_v.sql"));
    const mesias = (await db.query("SELECT * FROM lote WHERE id_jardin=17 ORDER BY id_lote")).rows;
    assert.equal(mesias.length, 6);
    assert.ok(mesias.every((lot) => lot.numero_fila_lote === "V"));
    assert.deepEqual((await db.query("SELECT * FROM lote WHERE id_jardin=16 ORDER BY id_lote")).rows, pazBefore);
  });
  await t.test("anonymous cannot read catalog; authenticated cannot write directly", async () => {
    await db.exec("SET ROLE anon");
    await assert.rejects(db.exec("SELECT * FROM jardin_fila"), /permission denied/);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    assert.ok((await db.query("SELECT * FROM jardin_fila")).rows.length > 0);
    await assert.rejects(db.exec("DELETE FROM jardin_fila"), /permission denied/);
    await db.exec("RESET ROLE");
  });
  await t.test("configuration RPC rejects non-admin", async () => {
    await db.exec("SET test.admin = 'false'; SET ROLE authenticated");
    await assert.rejects(save("Forbidden", ["P"]), /administrador/);
    await db.exec("RESET ROLE; SET test.admin = 'true'");
  });

  const remove = async (id, name) => (await db.query(
    "SELECT eliminar_jardin_con_filas($1,$2) AS deleted_id", [id, name],
  )).rows[0].deleted_id;

  await t.test("delete requires exact name including accents and casing", async () => {
    const target = await save("Jardín Seguro", ["P","V"]);
    for (const name of [null, "", "Otro", "jardín seguro", "Jardin Seguro", " Jardín Seguro"]) {
      await assert.rejects(remove(target.jardin.id_jardin, name), /no coincide/);
    }
    assert.equal((await db.query("SELECT count(*)::int AS n FROM jardin_fila WHERE id_jardin=$1",
      [target.jardin.id_jardin])).rows[0].n, 2);
    await remove(target.jardin.id_jardin, "Jardín Seguro");
  });

  await t.test("delete cascades only selected garden rows even when names match", async () => {
    const target = await save("Mismo nombre", ["P","V"]);
    await save("Mismo nombre", ["P","V"]);
    const others = (await db.query("SELECT * FROM jardin WHERE id_jardin <> $1 ORDER BY id_jardin",
      [target.jardin.id_jardin])).rows;
    const otherRows = (await db.query("SELECT * FROM jardin_fila WHERE id_jardin <> $1 ORDER BY id_jardin_fila",
      [target.jardin.id_jardin])).rows;
    const lotsBefore = (await db.query("SELECT * FROM lote ORDER BY id_lote")).rows;
    const spacesBefore = (await db.query("SELECT * FROM lote_espacio ORDER BY id_lote_espacio")).rows;
    assert.equal(await remove(target.jardin.id_jardin, target.jardin.nombre), target.jardin.id_jardin);
    assert.deepEqual((await db.query("SELECT * FROM jardin ORDER BY id_jardin")).rows, others);
    assert.deepEqual((await db.query("SELECT * FROM jardin_fila ORDER BY id_jardin_fila")).rows, otherRows);
    assert.deepEqual((await db.query("SELECT * FROM lote ORDER BY id_lote")).rows, lotsBefore);
    assert.deepEqual((await db.query("SELECT * FROM lote_espacio ORDER BY id_lote_espacio")).rows, spacesBefore);
    await assert.rejects(remove(target.jardin.id_jardin, target.jardin.nombre), /ya no existe/);
  });

  await t.test("delete blocks lots, including unassigned lots, and preserves all rows", async () => {
    await assert.rejects(remove(16, "LA PAZ"), /lotes o cenizarios/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM jardin_fila WHERE id_jardin=16")).rows[0].n, 9);
    const target = await save("Sin asignacion", ["P"]);
    await insertLot(target.jardin.id_jardin, null);
    await assert.rejects(remove(target.jardin.id_jardin, target.jardin.nombre), /lotes o cenizarios/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM jardin_fila WHERE id_jardin=$1",
      [target.jardin.id_jardin])).rows[0].n, 1);
  });

  await t.test("delete blocks cenizarios even without lots", async () => {
    const target = await save("Con cenizario", ["P"]);
    await db.query("INSERT INTO tipo_cenizario(id_jardin) VALUES($1)", [target.jardin.id_jardin]);
    await assert.rejects(remove(target.jardin.id_jardin, target.jardin.nombre), /lotes o cenizarios/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM tipo_cenizario WHERE id_jardin=$1",
      [target.jardin.id_jardin])).rows[0].n, 1);
  });

  await t.test("server rejects stale confirmation after garden renamed", async () => {
    const target = await save("Antes", ["P"]);
    await save("Despues", target.filas, target.jardin.id_jardin);
    await assert.rejects(remove(target.jardin.id_jardin, "Antes"), /no coincide/);
    await remove(target.jardin.id_jardin, "Despues");
  });

  await t.test("delete denies anonymous and non-admin; admin succeeds", async () => {
    const target = await save("Solo admin", ["P"]);
    await db.exec("SET ROLE anon");
    await assert.rejects(remove(target.jardin.id_jardin, target.jardin.nombre), /permission denied/);
    await db.exec("RESET ROLE; SET test.admin = 'false'; SET ROLE authenticated");
    await assert.rejects(remove(target.jardin.id_jardin, target.jardin.nombre), /administrador/);
    await db.exec("SET test.admin = 'true'");
    assert.equal(await remove(target.jardin.id_jardin, target.jardin.nombre), target.jardin.id_jardin);
    await db.exec("RESET ROLE");
  });
});
