type ContractDisplayLike = {
  numero_formulario?: string | null;
  numero_contrato?: string | null;
  id_contrato?: number | null;
};

function normalizeValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isInternalPrecontractNumber(value: string | null): boolean {
  return value ? /^PRE-\d+$/i.test(value) : false;
}

export function getContractVisibleNumber(
  contract: ContractDisplayLike | null | undefined,
): string | null {
  const visibleNumber = normalizeValue(contract?.numero_formulario);
  if (isInternalPrecontractNumber(visibleNumber)) {
    return null;
  }

  return visibleNumber;
}

export function formatContractDisplayLabel(
  contract: ContractDisplayLike | null | undefined,
  options?: {
    prefix?: boolean;
    fallback?: string;
  },
): string {
  const visibleNumber = getContractVisibleNumber(contract);
  if (visibleNumber) {
    return options?.prefix === false
      ? visibleNumber
      : `Formulario ${visibleNumber}`;
  }

  return options?.fallback ?? "Formulario pendiente";
}

export function getContractSearchTokens(
  contract: ContractDisplayLike | null | undefined,
): string {
  return [
    normalizeValue(contract?.numero_formulario),
    normalizeValue(contract?.numero_contrato),
    contract?.id_contrato != null ? String(contract.id_contrato) : null,
  ]
    .filter(Boolean)
    .join(" ");
}
