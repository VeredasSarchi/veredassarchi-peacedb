export type GardenRow = {
  id_jardin_fila: number;
  id_jardin: number;
  identificador: string;
  orden: number;
};

export type RowDraft = { id_jardin_fila?: number; identificador: string };

export function normalizeRowIdentifier(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

export function validateRowDrafts(rows: RowDraft[]): string | null {
  if (!rows.length || rows.length > 32767) return "Configura entre 1 y 32767 filas.";
  const identifiers = rows.map((row) => normalizeRowIdentifier(row.identificador));
  if (identifiers.some((id) => !/^[A-Z0-9]{1,20}$/.test(id))) {
    return "Cada fila debe tener entre 1 y 20 letras o numeros.";
  }
  if (new Set(identifiers).size !== identifiers.length) {
    return "Los identificadores de fila no pueden repetirse en el mismo jardin.";
  }
  return null;
}

export function groupLotsByRows<T extends { id_lote: number; numero_fila_lote: string | null }>(
  rows: GardenRow[],
  lots: T[],
): { identifier: string | null; configured: boolean; lots: T[] }[] {
  const groups = [...rows].sort((a, b) => a.orden - b.orden).map((row) => ({
    identifier: normalizeRowIdentifier(row.identificador) as string | null,
    configured: true,
    lots: [] as T[],
  }));
  const byIdentifier = new Map(groups.map((group) => [group.identifier, group]));
  for (const lot of [...lots].sort((a, b) => a.id_lote - b.id_lote)) {
    const identifier = lot.numero_fila_lote == null ? null : normalizeRowIdentifier(lot.numero_fila_lote);
    let group = byIdentifier.get(identifier);
    if (!group) {
      // Keep legacy NULLs and unexpected data visible, without assigning a made-up row.
      group = { identifier, configured: false, lots: [] };
      byIdentifier.set(identifier, group);
      groups.push(group);
    }
    group.lots.push(lot);
  }
  return groups;
}

