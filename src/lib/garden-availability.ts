export type GardenStats = { lotesDisponibles: number; cenizariosDisponibles: number };
type Lot = { id_lote: number; id_jardin: number };
type Space = { id_lote: number; estado: string; nombre_ocupante: string | null };
type Cenizario = { id_tipo_cenizario: number; id_jardin: number };
type Product = {
  tipo_producto: string;
  id_lote: number | null;
  id_tipo_cenizario: number | null;
  contrato: { estado_contrato: string } | null;
};

export function calculateGardenAvailability(
  gardenIds: number[],
  lots: Lot[],
  spaces: Space[],
  cenizarios: Cenizario[],
  products: Product[],
): Record<number, GardenStats> {
  const stats: Record<number, GardenStats> = {};
  for (const id of gardenIds) stats[id] = { lotesDisponibles: 0, cenizariosDisponibles: 0 };
  const unavailableLots = new Set<number>();
  const unavailableCenizarios = new Set<number>();
  for (const space of spaces) {
    if (space.estado === "OCUPADO" || (space.nombre_ocupante ?? "").trim().length > 0) {
      unavailableLots.add(space.id_lote);
    }
  }
  for (const product of products) {
    const state = product.contrato?.estado_contrato;
    if (state !== "PRECONTRATO" && state !== "VIGENTE") continue;
    if (product.tipo_producto === "LOTE" && product.id_lote != null) {
      unavailableLots.add(product.id_lote);
    }
    if (product.tipo_producto === "CENIZARIO" && product.id_tipo_cenizario != null) {
      unavailableCenizarios.add(product.id_tipo_cenizario);
    }
  }
  for (const lot of lots) {
    if (stats[lot.id_jardin] && !unavailableLots.has(lot.id_lote)) stats[lot.id_jardin].lotesDisponibles++;
  }
  for (const cenizario of cenizarios) {
    if (stats[cenizario.id_jardin] && !unavailableCenizarios.has(cenizario.id_tipo_cenizario)) {
      stats[cenizario.id_jardin].cenizariosDisponibles++;
    }
  }
  return stats;
}
