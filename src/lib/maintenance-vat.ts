export const MAINTENANCE_VAT_RATE = 0.13;

export type MaintenanceVatBreakdown = {
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
};

function roundCurrency(value: number): number {
  const correction = Math.sign(value || 1) * Number.EPSILON;
  return Math.round((value + correction) * 100) / 100;
}

export function calculateMaintenanceVat(
  baseAmount: number | null | undefined,
): MaintenanceVatBreakdown | null {
  if (baseAmount === null || baseAmount === undefined || !Number.isFinite(baseAmount)) {
    return null;
  }

  const normalizedBase = roundCurrency(baseAmount);
  const vatAmount = roundCurrency(normalizedBase * MAINTENANCE_VAT_RATE);

  return {
    baseAmount: normalizedBase,
    vatAmount,
    totalAmount: roundCurrency(normalizedBase + vatAmount),
  };
}

export function getMaintenanceBaseFromVatIncludedTotal(
  totalAmount: number | null | undefined,
): number | null {
  if (totalAmount === null || totalAmount === undefined || !Number.isFinite(totalAmount)) {
    return null;
  }

  return roundCurrency(totalAmount / (1 + MAINTENANCE_VAT_RATE));
}
