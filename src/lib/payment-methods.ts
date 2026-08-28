export const PAYMENT_METHOD_OPTIONS = [
  { value: "Transferencia", label: "Transferencia" },
  { value: "Efectivo", label: "Efectivo" },
  { value: "Deposito", label: "Depósito" },
  { value: "SINPE", label: "SINPE" },
  { value: "Tarjeta", label: "Tarjeta" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]["value"];
