import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function loadModule(path) {
  const source = await readFile(new URL("../src/lib/" + path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
}
const { fetchAllPages, fetchAllByIds } = await loadModule("supabase-pagination.ts");
const { calculateGardenAvailability } = await loadModule("garden-availability.ts");

function paged(rows, cap = 1000) {
  return async (from, to) => ({
    data: rows.slice(from, Math.min(to + 1, from + cap)),
    error: null, count: rows.length,
  });
}

test("regression: all 1329 lots counted, including LA ROCA after first 1000", async () => {
  // Aggregate counts observed read-only on 2026-10-24, with synthetic lot IDs.
  const counts = [[16, 367], [17, 204], [19, 232], [20, 129], [21, 99], [22, 151], [23, 147]];
  let id = 0;
  const lots = counts.flatMap(([id_jardin, count]) =>
    Array.from({ length: count }, () => ({ id_lote: ++id, id_jardin })));
  const gardenIds = counts.map(([gardenId]) => gardenId);
  const truncated = calculateGardenAvailability(gardenIds, lots.slice(0, 1000), [], [], []);
  assert.equal(truncated[23].lotesDisponibles, 0);
  assert.equal(truncated[22].lotesDisponibles, 0);
  assert.equal(truncated[21].lotesDisponibles, 68);

  const result = await fetchAllPages(paged(lots));
  assert.equal(result.error, null);
  assert.equal(result.data.length, 1329);
  const stats = calculateGardenAvailability(gardenIds, result.data, [], [], []);
  for (const [gardenId, count] of counts) {
    assert.deepEqual(stats[gardenId], { lotesDisponibles: count, cenizariosDisponibles: 0 });
  }
});

test("reads exactly-full pages, empty results and server caps below requested page size", async () => {
  for (const size of [0, 1, 500, 1000, 1329]) {
    const rows = Array.from({ length: size }, (_, id) => ({ id }));
    for (const cap of [100, 1000]) {
      const result = await fetchAllPages(paged(rows, cap));
      assert.deepEqual(result, { data: rows, error: null });
    }
  }
});

test("failed or incomplete later pages never return partial counts", async () => {
  const rows = Array.from({ length: 900 }, (_, id) => ({ id }));
  const error = { message: "Permission denied" };
  const failed = await fetchAllPages((from, to) =>
    from === 0 ? paged(rows)(from, to) : Promise.resolve({ data: null, error }));
  assert.deepEqual(failed, { data: null, error });
  const interrupted = await fetchAllPages(async (from, to) => {
    if (from > 0) throw new Error("Network error");
    return paged(rows)(from, to);
  });
  assert.equal(interrupted.data, null);
  assert.equal(interrupted.error.message, "Network error");
  const incomplete = await fetchAllPages(async () => ({ data: [], error: null, count: 20 }));
  assert.equal(incomplete.data, null);
  assert.ok(incomplete.error);
});

test("occupied spaces and active products on later pages exclude lots and cenizarios", async () => {
  const lots = [
    { id_lote: 1, id_jardin: 1 }, { id_lote: 2, id_jardin: 1 },
    { id_lote: 3, id_jardin: 1 }, { id_lote: 4, id_jardin: 1 },
    { id_lote: 5, id_jardin: 1 }, { id_lote: 6, id_jardin: 1 },
    { id_lote: 7, id_jardin: 1 },
  ];
  const spaces = Array.from({ length: 1100 }, () => ({ id_lote: 5, estado: "DISPONIBLE", nombre_ocupante: " " }));
  spaces.push({ id_lote: 1, estado: "OCUPADO", nombre_ocupante: null });
  spaces.push({ id_lote: 2, estado: "DISPONIBLE", nombre_ocupante: "Ocupante de prueba" });
  const products = Array.from({ length: 1100 }, () => ({
    tipo_producto: "LOTE", id_lote: 5, id_tipo_cenizario: null, contrato: { estado_contrato: "ANULADO" },
  }));
  products.push(
    { tipo_producto: "LOTE", id_lote: 3, id_tipo_cenizario: null, contrato: { estado_contrato: "PRECONTRATO" } },
    { tipo_producto: "LOTE", id_lote: 4, id_tipo_cenizario: null, contrato: { estado_contrato: "VIGENTE" } },
    { tipo_producto: "LOTE", id_lote: 4, id_tipo_cenizario: null, contrato: { estado_contrato: "PRECONTRATO" } },
    { tipo_producto: "LOTE", id_lote: 6, id_tipo_cenizario: null, contrato: null },
    { tipo_producto: "CENIZARIO", id_lote: null, id_tipo_cenizario: 1, contrato: { estado_contrato: "PRECONTRATO" } },
    { tipo_producto: "CENIZARIO", id_lote: null, id_tipo_cenizario: 2, contrato: { estado_contrato: "VIGENTE" } },
    { tipo_producto: "CENIZARIO", id_lote: null, id_tipo_cenizario: 3, contrato: { estado_contrato: "ANULADO" } },
  );
  const cenizarios = Array.from({ length: 1200 }, (_, i) => ({ id_tipo_cenizario: i + 1, id_jardin: 1 }));
  const [allSpaces, allProducts, allCenizarios] = await Promise.all([
    fetchAllPages(paged(spaces)), fetchAllPages(paged(products)), fetchAllPages(paged(cenizarios)),
  ]);
  const stats = calculateGardenAvailability([1, 2], lots, allSpaces.data, allCenizarios.data, allProducts.data);
  assert.deepEqual(stats[1], { lotesDisponibles: 3, cenizariosDisponibles: 1198 });
  assert.deepEqual(stats[2], { lotesDisponibles: 0, cenizariosDisponibles: 0 });
});

test("large IN filters are batched without missing or duplicating products", async () => {
  const ids = Array.from({ length: 451 }, (_, i) => i + 1);
  const rows = ids.flatMap((id_lote) => Array.from({ length: 4 }, (_, position) => ({ id_lote, position })));
  const result = await fetchAllByIds([...ids, ...ids], (batch, from, to) => {
    assert.ok(batch.length <= 200);
    return paged(rows.filter((row) => batch.includes(row.id_lote)))(from, to);
  });
  assert.deepEqual(result, { data: rows, error: null });
  const empty = await fetchAllByIds([], () => { throw new Error("Must not query"); });
  assert.deepEqual(empty, { data: [], error: null });
  const failed = await fetchAllByIds(ids, (batch, from, to) =>
    batch[0] > 200 ? Promise.resolve({ data: null, error: { message: "Later batch failed" } })
      : paged(rows.filter((row) => batch.includes(row.id_lote)))(from, to));
  assert.equal(failed.data, null);
  assert.equal(failed.error.message, "Later batch failed");
});
