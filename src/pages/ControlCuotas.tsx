import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Search,
  TrendingDown,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/payment-methods";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  formatContractDisplayLabel,
  getContractSearchTokens,
} from "@/lib/contract-display";
import {
  exportExcelReport,
  type ReportColumn,
  type ReportPayload,
} from "@/lib/report-export";
import { cn } from "@/lib/utils";

type ControlCuotasResumenRow =
  Database["public"]["Views"]["vw_control_cuotas_resumen"]["Row"];
type ControlCuotasPlanRow =
  Database["public"]["Views"]["vw_control_cuotas_plan_vigente"]["Row"];
type PagoRow = Tables<"contrato_pago">;
type PagoAplicacionRow = Tables<"contrato_pago_aplicacion">;
type CuotaReferenciaRow = Pick<
  Tables<"contrato_cuota">,
  "id_cuota" | "id_plan_pago" | "numero_cuota"
>;
type CargoRow = Tables<"contrato_cargo">;
type EventoFinancieroRow = Tables<"contrato_evento_financiero">;
type MoratoryInterestCalculationRow =
  Tables<"contrato_interes_moratorio_calculo">;

type FilterMode =
  | "vigentes"
  | "con-vencidas"
  | "con-plan"
  | "sin-plan"
  | "todos";

type FinancialDetailTab =
  | "cuotas"
  | "pagos"
  | "mora"
  | "cargos"
  | "historial";

type RegularPaymentKind = "CUOTA" | "EXTRAORDINARIO";
type PaymentKind = RegularPaymentKind | "MORA";

type ExtraordinaryPaymentSimulation = {
  requestKey: string;
  permitido: boolean;
  motivoBloqueo: string | null;
  montoExtraordinario: number;
  cuotaBase: number;
  saldoCapitalAntes: number;
  saldoCapitalDespues: number;
  cuotasRestantesAntes: number;
  cuotasRestantesDespues: number;
  interesFuturoAntes: number;
  interesFuturoDespues: number;
  ahorroIntereses: number;
  fechaFinAntes: string | null;
  fechaFinDespues: string | null;
  liquidacionTotal: boolean;
};

type PaymentFormState = {
  montoTotal: string;
  fechaPago: string;
  metodoPago: string;
  referencia: string;
  numeroFactura: string;
  observacion: string;
  idempotencyKey: string;
};

type ArrangementFormState = {
  fechaPrimeraCuota: string;
  plazoMeses: string;
  cuotaBase: string;
  tasaInteresAnual: string;
  observaciones: string;
};

type DetailState = {
  contractId: number | null;
  cuotas: ControlCuotasPlanRow[];
  cuotasReferencia: CuotaReferenciaRow[];
  pagos: PagoRow[];
  aplicaciones: PagoAplicacionRow[];
  cargos: CargoRow[];
  calculosMora: MoratoryInterestCalculationRow[];
  eventos: EventoFinancieroRow[];
};

function getEmptyDetailState(): DetailState {
  return {
    contractId: null,
    cuotas: [],
    cuotasReferencia: [],
    pagos: [],
    aplicaciones: [],
    cargos: [],
    calculosMora: [],
    eventos: [],
  };
}

type CobranzaAlert = {
  idContrato: number;
  clienteNombre: string;
  numeroContrato: string;
  numeroFormulario: string | null;
  proximaFecha: string | null;
  dias: number;
  cuotasVencidas: number;
  montoVencido: number;
  moraPendiente: number;
  totalVencidoConMora: number;
};

type JsonRecord = { [key: string]: Json | undefined };

type EventDetailItem = {
  label: string;
  value: string;
};

const FILTER_LABELS: Record<FilterMode, string> = {
  vigentes: "Solo vigentes",
  "con-vencidas": "Con saldo vencido",
  "con-plan": "Con plan generado",
  "sin-plan": "Sin plan generado",
  todos: "Todos",
};

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  const calendarDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (calendarDateMatch) {
    const [, year, month, day] = calendarDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "No definida";
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("es-CR");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "No definido";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-CR");
}

function toPaymentTimestamp(value: string): string {
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  parsed.setHours(12, 0, 0, 0);
  return parsed.toISOString();
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0 %";
  }
  return `${Number(value).toFixed(2)} %`;
}

function formatFractionAsPercent(value: number | null | undefined): string {
  return formatPercent((value ?? 0) * 100);
}

function normalizeSearchValue(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}

function getDaysUntilDate(value: string | null | undefined): number | null {
  const parsed = parseCalendarDate(value);
  if (!parsed) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  const diffMs = parsed.getTime() - today.getTime();
  return Math.round(diffMs / 86400000);
}

function getTodayInputValue(): string {
  const today = new Date();
  return formatDateParts(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate(),
  );
}

function getSuggestedFirstPaymentDate(
  fechaFirma: string | null | undefined,
  diaPagoMensual: number | null | undefined,
): string {
  if (!fechaFirma || !diaPagoMensual || diaPagoMensual < 1 || diaPagoMensual > 31) {
    return "";
  }

  const parsed = parseCalendarDate(fechaFirma);
  if (!parsed) {
    return "";
  }

  const nextMonthStart = new Date(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    1,
  );
  const lastDay = new Date(
    nextMonthStart.getFullYear(),
    nextMonthStart.getMonth() + 1,
    0,
  ).getDate();
  const day = Math.min(diaPagoMensual, lastDay);

  return formatDateParts(
    nextMonthStart.getFullYear(),
    nextMonthStart.getMonth() + 1,
    day,
  );
}

function isOverdue(
  fechaVencimiento: string | null | undefined,
  estado: string | null | undefined,
): boolean {
  if (!fechaVencimiento || estado === "PAGADA" || estado === "ANULADA") {
    return false;
  }
  const today = new Date();
  const dueDate = new Date(`${fechaVencimiento}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(dueDate.getTime()) && dueDate < today;
}

function getQuotaDisplayState(
  estado: string | null | undefined,
  fechaVencimiento: string | null | undefined,
): string {
  if (estado === "PENDIENTE" || estado === "PARCIAL") {
    return isOverdue(fechaVencimiento, estado) ? "VENCIDA" : estado;
  }
  return estado || "SIN ESTADO";
}

function getStatusBadgeClass(status: string): string {
  if (status === "PAGADA" || status === "LIQUIDADO" || status === "VIGENTE") {
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  }
  if (status === "PARCIAL") {
    return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  }
  if (status === "VENCIDA" || status === "ANULADO") {
    return "bg-rose-100 text-rose-800 hover:bg-rose-100";
  }
  if (status === "PENDIENTE" || status === "PRECONTRATO") {
    return "bg-slate-100 text-slate-800 hover:bg-slate-100";
  }
  return "bg-primary/10 text-primary hover:bg-primary/10";
}

function getPlanTypeLabel(tipoPlan: string | null | undefined): string {
  if (!tipoPlan) return "Sin plan";
  if (tipoPlan === "ORIGINAL") return "Plan original";
  if (tipoPlan === "ARREGLO_PAGO") return "Arreglo de pago";
  if (tipoPlan === "EXTRAORDINARIO") return "Plan por pago extraordinario";
  if (tipoPlan === "BACKFILL") return "Plan generado";
  if (tipoPlan === "REESTRUCTURACION") return "Reestructuracion";
  return tipoPlan;
}

function getChargeTypeLabel(type: string): string {
  if (type === "INTERES_MORATORIO") return "Interes moratorio";
  return formatTechnicalLabel(type.toLowerCase());
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function getRpcResultRecord(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const nested = record.resultado ?? record.simulacion;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return record;
}

function getRpcValue(
  record: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return null;
}

function getRpcNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | null {
  const value = getRpcValue(record, ...keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getRpcBoolean(
  record: Record<string, unknown>,
  ...keys: string[]
): boolean {
  const value = getRpcValue(record, ...keys);
  return value === true || value === "true";
}

function getRpcText(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  const value = getRpcValue(record, ...keys);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseExtraordinaryPaymentSimulation(
  value: unknown,
): ExtraordinaryPaymentSimulation | null {
  const record = getRpcResultRecord(value);
  if (!record) return null;

  const permitido = getRpcBoolean(
    record,
    "permitido",
    "puede_registrar",
    "elegible",
  );
  const motivoBloqueo = getRpcText(
    record,
    "motivo_bloqueo",
    "razon_bloqueo",
    "motivo",
    "mensaje",
  );

  if (!permitido) {
    return {
      permitido,
      requestKey: "",
      motivoBloqueo,
      montoExtraordinario:
        getRpcNumber(
          record,
          "monto_extraordinario",
          "monto_solicitado",
          "monto",
        ) ?? 0,
      cuotaBase: getRpcNumber(record, "cuota_base") ?? 0,
      saldoCapitalAntes: 0,
      saldoCapitalDespues: 0,
      cuotasRestantesAntes: 0,
      cuotasRestantesDespues: 0,
      interesFuturoAntes: 0,
      interesFuturoDespues: 0,
      ahorroIntereses: 0,
      fechaFinAntes: null,
      fechaFinDespues: null,
      liquidacionTotal: getRpcBoolean(record, "liquidacion_total"),
    };
  }

  const montoExtraordinario = getRpcNumber(
    record,
    "monto_extraordinario",
    "monto_solicitado",
    "monto",
  );
  const saldoCapitalAntes = getRpcNumber(
    record,
    "saldo_capital_antes",
    "saldo_antes",
  );
  const saldoCapitalDespues = getRpcNumber(
    record,
    "saldo_capital_despues",
    "saldo_despues",
  );
  const cuotasRestantesAntes = getRpcNumber(
    record,
    "cuotas_restantes_antes",
    "cantidad_cuotas_antes",
  );
  const cuotasRestantesDespues = getRpcNumber(
    record,
    "cuotas_restantes_despues",
    "cantidad_cuotas_despues",
  );
  const interesFuturoAntes = getRpcNumber(
    record,
    "interes_futuro_antes",
    "intereses_futuros_antes",
  );
  const interesFuturoDespues = getRpcNumber(
    record,
    "interes_futuro_despues",
    "intereses_futuros_despues",
  );
  const ahorroIntereses = getRpcNumber(
    record,
    "ahorro_intereses",
    "interes_ahorrado",
  );

  if (
    montoExtraordinario === null ||
    saldoCapitalAntes === null ||
    saldoCapitalDespues === null ||
    cuotasRestantesAntes === null ||
    cuotasRestantesDespues === null ||
    interesFuturoAntes === null ||
    interesFuturoDespues === null ||
    ahorroIntereses === null
  ) {
    return null;
  }

  return {
    permitido,
    requestKey: "",
    motivoBloqueo,
    montoExtraordinario,
    cuotaBase: getRpcNumber(record, "cuota_base") ?? 0,
    saldoCapitalAntes,
    saldoCapitalDespues,
    cuotasRestantesAntes,
    cuotasRestantesDespues,
    interesFuturoAntes,
    interesFuturoDespues,
    ahorroIntereses,
    fechaFinAntes: getRpcText(
      record,
      "fecha_fin_antes",
      "fecha_final_antes",
      "fecha_ultima_cuota_antes",
    ),
    fechaFinDespues: getRpcText(
      record,
      "fecha_fin_despues",
      "fecha_final_despues",
      "fecha_ultima_cuota_despues",
    ),
    liquidacionTotal: getRpcBoolean(record, "liquidacion_total"),
  };
}

function createPaymentIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pago-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getInitialPaymentForm(): PaymentFormState {
  return {
    montoTotal: "",
    fechaPago: getTodayInputValue(),
    metodoPago: "",
    referencia: "",
    numeroFactura: "",
    observacion: "",
    idempotencyKey: createPaymentIdempotencyKey(),
  };
}

function isMoratoryCharge(cargo: CargoRow | null | undefined): boolean {
  return cargo?.tipo_cargo === "INTERES_MORATORIO";
}

function getApplicationPlanId(
  application: PagoAplicacionRow,
): number | null {
  if (!("id_plan_pago" in application)) return null;
  const value = application.id_plan_pago;
  return typeof value === "number" ? value : null;
}

async function synchronizeMoratoryInterest(
  contractId: number,
  untilDate: string | null,
  userName: string,
): Promise<void> {
  const { error } = await supabase.rpc(
    "sincronizar_interes_moratorio_contrato",
    {
      p_id_contrato: contractId,
      p_fecha_hasta: untilDate,
      p_usuario: userName,
    },
  );

  if (error) {
    throw error;
  }
}

function getPaymentKind(
  pago: PagoRow,
  aplicaciones: PagoAplicacionRow[],
  cargoById: Map<number, CargoRow>,
): PaymentKind {
  const explicitKind = pago.tipo_pago;
  if (
    explicitKind === "MORA" ||
    explicitKind === "CUOTA" ||
    explicitKind === "EXTRAORDINARIO"
  ) {
    return explicitKind;
  }

  return aplicaciones.some((application) =>
    application.id_cargo !== null
      ? isMoratoryCharge(cargoById.get(application.id_cargo))
      : false,
  )
    ? "MORA"
    : "CUOTA";
}

function asRecord(value: Json | undefined): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function getTextDetail(record: JsonRecord | null, key: string): string | null {
  const value = record?.[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function getNumberDetail(record: JsonRecord | null, key: string): number | null {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatTechnicalLabel(key: string): string {
  const labels: Record<string, string> = {
    monto_total: "Monto total",
    monto_aplicado: "Monto aplicado",
    saldo_capital_reestructurado: "Saldo reestructurado",
    plazo_meses: "Plazo",
    cuota_base: "Cuota base",
    tasa_interes_anual: "Tasa de interes anual",
    fecha_primera_cuota: "Primera cuota",
    numero_formulario: "Formulario",
    tipo_plan: "Tipo de plan",
    tipo_pago: "Concepto del pago",
    periodo_mora: "Periodo de mora",
    fecha_corte: "Fecha de corte",
    tasa_mensual: "Tasa mensual",
    dias_gracia: "Dias de gracia",
    base_cuotas_vencidas: "Cuotas vencidas",
    base_mora_anterior: "Mora anterior",
    base_total: "Base moratoria total",
    monto_generado: "Mora generada",
    monto_extraordinario: "Pago extraordinario",
    saldo_capital_antes: "Saldo de capital anterior",
    saldo_capital_despues: "Nuevo saldo de capital",
    cuotas_restantes_antes: "Cuotas restantes anteriores",
    cuotas_restantes_despues: "Nuevas cuotas restantes",
    interes_futuro_antes: "Intereses futuros anteriores",
    interes_futuro_despues: "Nuevos intereses futuros",
    ahorro_intereses: "Ahorro estimado de intereses",
    fecha_fin_antes: "Fecha de finalizacion anterior",
    fecha_fin_despues: "Nueva fecha de finalizacion",
  };

  return (
    labels[key] ??
    key
      .replace(/^id_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function formatGenericValue(key: string, value: Json | undefined): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (
      key.includes("monto") ||
      key.includes("saldo") ||
      key.includes("cuota_base") ||
      key.includes("interes_futuro") ||
      key.includes("ahorro_intereses") ||
      key.startsWith("base_")
    ) {
      return formatCurrency(value);
    }
    if (key.includes("tasa")) {
      return key === "tasa_mensual"
        ? formatFractionAsPercent(value)
        : formatPercent(value);
    }
    if (key.includes("plazo")) {
      return `${value} meses`;
    }
    if (key.startsWith("id_")) {
      return `#${value}`;
    }
    return String(value);
  }

  if (typeof value === "string") {
    if (key.includes("fecha") || key.includes("periodo")) {
      return formatDate(value);
    }
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "Si" : "No";
  }

  return null;
}

function isOperationalHiddenEventKey(key: string): boolean {
  return (
    key === "resultado_plan" ||
    key === "ok" ||
    key === "version" ||
    key === "cuotas_generadas" ||
    key === "idempotency_key" ||
    key.startsWith("id_")
  );
}

function buildGenericDetails(record: JsonRecord | null): EventDetailItem[] {
  if (!record) return [];

  return Object.entries(record).flatMap(([key, value]) => {
    if (isOperationalHiddenEventKey(key)) return [];
    const formatted = formatGenericValue(key, value);
    return formatted ? [{ label: formatTechnicalLabel(key), value: formatted }] : [];
  });
}

function buildEventDetails(event: EventoFinancieroRow): EventDetailItem[] {
  const payload = asRecord(event.payload);
  const resultadoPlan = asRecord(payload?.resultado_plan);
  const details: EventDetailItem[] = [];

  if (event.tipo_evento === "FORMALIZACION") {
    const numeroFormulario = getTextDetail(payload, "numero_formulario");
    const fechaPrimeraCuota = getTextDetail(payload, "fecha_primera_cuota");
    const tipoPlan = getTextDetail(resultadoPlan, "tipo_plan");
    const plazoMeses = getNumberDetail(resultadoPlan, "plazo_meses");

    if (numeroFormulario) details.push({ label: "Formulario oficial", value: numeroFormulario });
    if (fechaPrimeraCuota) details.push({ label: "Primera cuota", value: formatDate(fechaPrimeraCuota) });
    if (tipoPlan) details.push({ label: "Tipo de plan", value: getPlanTypeLabel(tipoPlan) });
    if (plazoMeses !== null) details.push({ label: "Plazo", value: `${plazoMeses} meses` });

    return details;
  }

  if (event.tipo_evento === "BACKFILL") {
    const fechaPrimeraCuota = getTextDetail(payload, "fecha_primera_cuota");
    const tipoPlan = getTextDetail(resultadoPlan, "tipo_plan");
    const plazoMeses = getNumberDetail(resultadoPlan, "plazo_meses");

    if (fechaPrimeraCuota) details.push({ label: "Primera cuota", value: formatDate(fechaPrimeraCuota) });
    if (tipoPlan) details.push({ label: "Tipo de plan", value: getPlanTypeLabel(tipoPlan) });
    if (plazoMeses !== null) details.push({ label: "Plazo", value: `${plazoMeses} meses` });

    return details;
  }

  if (
    event.tipo_evento === "REGISTRO_PAGO" ||
    event.tipo_evento === "PAGO_MORA"
  ) {
    const montoTotal = getNumberDetail(payload, "monto_total");
    const montoAplicado = getNumberDetail(payload, "monto_aplicado");

    if (montoTotal !== null) details.push({ label: "Monto total", value: formatCurrency(montoTotal) });
    if (montoAplicado !== null) details.push({ label: "Monto aplicado", value: formatCurrency(montoAplicado) });

    return details;
  }

  if (event.tipo_evento === "PAGO_EXTRAORDINARIO") {
    return buildGenericDetails(payload);
  }

  if (event.tipo_evento === "ARREGLO_PAGO" || event.tipo_evento === "REESTRUCTURACION") {
    const saldo = getNumberDetail(payload, "saldo_capital_reestructurado");
    const plazoMeses = getNumberDetail(payload, "plazo_meses");
    const cuotaBase = getNumberDetail(payload, "cuota_base");
    const tasa = getNumberDetail(payload, "tasa_interes_anual");
    const fechaPrimeraCuota = getTextDetail(payload, "fecha_primera_cuota");

    if (saldo !== null) details.push({ label: "Saldo reestructurado", value: formatCurrency(saldo) });
    if (cuotaBase !== null) details.push({ label: "Nueva cuota", value: formatCurrency(cuotaBase) });
    if (plazoMeses !== null) details.push({ label: "Nuevo plazo", value: `${plazoMeses} meses` });
    if (tasa !== null) details.push({ label: "Tasa anual", value: formatPercent(tasa) });
    if (fechaPrimeraCuota) details.push({ label: "Primera cuota", value: formatDate(fechaPrimeraCuota) });

    return details;
  }

  return buildGenericDetails(payload);
}

function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    FORMALIZACION: "Formalizacion",
    BACKFILL: "Plan generado",
    ARREGLO_PAGO: "Arreglo de pago",
    REESTRUCTURACION: "Reestructuracion",
    CONGELAMIENTO: "Congelamiento",
    REGISTRO_PAGO: "Pago registrado",
    CALCULO_MORA: "Calculo de mora",
    PAGO_MORA: "Pago de mora",
    PAGO_EXTRAORDINARIO: "Pago extraordinario",
    AJUSTE_MORA: "Ajuste de mora",
    ANULACION_MORA: "Anulacion de mora",
    ANULACION_PAGO: "Pago anulado",
    AJUSTE_MANUAL: "Ajuste manual",
  };

  return labels[type] ?? formatTechnicalLabel(type.toLowerCase());
}

function SummaryMetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="border-border/70 bg-surface shadow-sm">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function ControlCuotas() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const menuPath = role === "vendedor" ? "/vendedor" : "/";

  const [rows, setRows] = useState<ControlCuotasResumenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailState>(getEmptyDetailState);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestIdRef = useRef(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("vigentes");
  const [selectedDetailTab, setSelectedDetailTab] =
    useState<FinancialDetailTab>("cuotas");
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillDate, setBackfillDate] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentKind, setPaymentKind] = useState<PaymentKind>("CUOTA");
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(
    getInitialPaymentForm(),
  );
  const [extraordinarySimulation, setExtraordinarySimulation] =
    useState<ExtraordinaryPaymentSimulation | null>(null);
  const [extraordinarySimulationLoading, setExtraordinarySimulationLoading] =
    useState(false);
  const [extraordinarySimulationError, setExtraordinarySimulationError] =
    useState<string | null>(null);
  const [arrangementOpen, setArrangementOpen] = useState(false);
  const [arrangementForm, setArrangementForm] = useState<ArrangementFormState>({
    fechaPrimeraCuota: "",
    plazoMeses: "",
    cuotaBase: "",
    tasaInteresAnual: "",
    observaciones: "",
  });
  const [submittingAction, setSubmittingAction] = useState<
    "backfill" | "payment" | "arrangement" | null
  >(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const loadResumen = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vw_control_cuotas_resumen")
        .select("*")
        .order("proxima_fecha_vencimiento", {
          ascending: true,
          nullsFirst: false,
        })
        .order("id_contrato", { ascending: false });

      if (error) {
        throw error;
      }

      setRows(data ?? []);
    } catch (error) {
      console.error("Error cargando resumen de cuotas", error);
      toast.error(
        getErrorMessage(
          error,
          "No se pudo cargar el resumen de control de cuotas",
        ),
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (contractId: number) => {
    const requestId = ++detailRequestIdRef.current;
    setDetail(getEmptyDetailState());
    setDetailLoading(true);
    try {
      if (isAdmin) {
        try {
          await synchronizeMoratoryInterest(
            contractId,
            getTodayInputValue(),
            user?.email ?? role ?? "usuario",
          );
        } catch (syncError) {
          console.error("Error sincronizando interes moratorio", syncError);
          if (requestId === detailRequestIdRef.current) {
            toast.warning(
              "No se pudo actualizar la mora; se muestran los ultimos datos disponibles.",
            );
          }
        }
      }

      if (requestId !== detailRequestIdRef.current) return;

      const [
        cuotasRes,
        pagosRes,
        cargosRes,
        calculosMoraRes,
        eventosRes,
        selectedSummaryRes,
      ] = await Promise.all([
        supabase
          .from("vw_control_cuotas_plan_vigente")
          .select("*")
          .eq("id_contrato", contractId)
          .order("numero_cuota", { ascending: true }),
        supabase
          .from("contrato_pago")
          .select("*")
          .eq("id_contrato", contractId)
          .order("fecha_pago", { ascending: false }),
        supabase
          .from("contrato_cargo")
          .select("*")
          .eq("id_contrato", contractId)
          .order("fecha_vencimiento", { ascending: true }),
        supabase
          .from("contrato_interes_moratorio_calculo")
          .select("*")
          .eq("id_contrato", contractId)
          .order("fecha_corte", { ascending: false }),
        supabase
          .from("contrato_evento_financiero")
          .select("*")
          .eq("id_contrato", contractId)
          .order("fecha_evento", { ascending: false }),
        supabase
          .from("vw_control_cuotas_resumen")
          .select("*")
          .eq("id_contrato", contractId)
          .maybeSingle(),
      ]);

      if (cuotasRes.error) throw cuotasRes.error;
      if (pagosRes.error) throw pagosRes.error;
      if (cargosRes.error) throw cargosRes.error;
      if (calculosMoraRes.error) throw calculosMoraRes.error;
      if (eventosRes.error) throw eventosRes.error;
      if (selectedSummaryRes.error) throw selectedSummaryRes.error;

      const pagos = pagosRes.data ?? [];
      const paymentIds = pagos.map((pago) => pago.id_pago);

      let aplicaciones: PagoAplicacionRow[] = [];
      let cuotasReferencia: CuotaReferenciaRow[] = [];
      if (paymentIds.length > 0) {
        const aplicacionesRes = await supabase
          .from("contrato_pago_aplicacion")
          .select("*")
          .in("id_pago", paymentIds)
          .order("id_aplicacion", { ascending: true });

        if (aplicacionesRes.error) {
          throw aplicacionesRes.error;
        }

        aplicaciones = aplicacionesRes.data ?? [];

        const historicalQuotaIds = Array.from(
          new Set(
            aplicaciones.flatMap((aplicacion) =>
              aplicacion.id_cuota === null ? [] : [aplicacion.id_cuota],
            ),
          ),
        );

        if (historicalQuotaIds.length > 0) {
          const cuotasReferenciaRes = await supabase
            .from("contrato_cuota")
            .select("id_cuota,id_plan_pago,numero_cuota")
            .in("id_cuota", historicalQuotaIds);

          if (cuotasReferenciaRes.error) {
            throw cuotasReferenciaRes.error;
          }

          cuotasReferencia = cuotasReferenciaRes.data ?? [];
        }
      }

      if (requestId !== detailRequestIdRef.current) return;

      setDetail({
        contractId,
        cuotas: cuotasRes.data ?? [],
        cuotasReferencia,
        pagos,
        aplicaciones,
        cargos: cargosRes.data ?? [],
        calculosMora: calculosMoraRes.data ?? [],
        eventos: eventosRes.data ?? [],
      });
      if (selectedSummaryRes.data) {
        setRows((current) =>
          current.map((row) =>
            row.id_contrato === contractId ? selectedSummaryRes.data : row,
          ),
        );
      }
    } catch (error) {
      if (requestId !== detailRequestIdRef.current) return;
      console.error("Error cargando detalle financiero", error);
      toast.error(
        getErrorMessage(error, "No se pudo cargar el detalle del contrato"),
      );
      setDetail(getEmptyDetailState());
    } finally {
      if (requestId === detailRequestIdRef.current) {
        setDetailLoading(false);
      }
    }
  }, [isAdmin, role, user?.email]);

  useEffect(() => {
    void loadResumen();
  }, [loadResumen]);

  const filteredRows = useMemo(() => {
    const normalizedTerm = normalizeSearchValue(searchTerm);
    return rows
      .filter((row) => {
        if (filterMode === "vigentes") {
          return row.estado_contrato === "VIGENTE";
        }
        if (filterMode === "con-vencidas") {
          return (
            (row.cuotas_vencidas ?? 0) > 0 || (row.mora_pendiente ?? 0) > 0
          );
        }
        if (filterMode === "con-plan") {
          return row.id_plan_pago !== null;
        }
        if (filterMode === "sin-plan") {
          return row.id_plan_pago === null;
        }
        return true;
      })
      .filter((row) => {
        if (!normalizedTerm) return true;
        const haystack = normalizeSearchValue(
          [
            row.cliente_nombre,
            getContractSearchTokens({
              numero_formulario: row.numero_formulario,
              numero_contrato: row.numero_contrato,
              id_contrato: row.id_contrato,
            }),
          ].join(" "),
        );
        return haystack.includes(normalizedTerm);
      })
      .sort((a, b) => {
        const overdueDelta =
          Number(
            (b.total_vencido_con_mora ??
              (b.monto_vencido ?? 0) + (b.mora_pendiente ?? 0)) > 0,
          ) -
          Number(
            (a.total_vencido_con_mora ??
              (a.monto_vencido ?? 0) + (a.mora_pendiente ?? 0)) > 0,
          );
        if (overdueDelta !== 0) return overdueDelta;

        const aTime =
          parseCalendarDate(a.proxima_fecha_vencimiento)?.getTime() ??
          Number.MAX_SAFE_INTEGER;
        const bTime =
          parseCalendarDate(b.proxima_fecha_vencimiento)?.getTime() ??
          Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return (b.id_contrato ?? 0) - (a.id_contrato ?? 0);
      });
  }, [filterMode, rows, searchTerm]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedContractId(null);
      detailRequestIdRef.current += 1;
      setDetail(getEmptyDetailState());
      setDetailLoading(false);
      return;
    }

    const stillExists = filteredRows.some(
      (row) => row.id_contrato === selectedContractId,
    );
    if (!stillExists) {
      setSelectedContractId(filteredRows[0]?.id_contrato ?? null);
    }
  }, [filteredRows, selectedContractId]);

  useEffect(() => {
    if (!selectedContractId) {
      detailRequestIdRef.current += 1;
      setDetail(getEmptyDetailState());
      setDetailLoading(false);
      return;
    }
    void loadDetail(selectedContractId);
  }, [loadDetail, selectedContractId]);

  const selectedRow = useMemo(
    () =>
      rows.find((row) => row.id_contrato === selectedContractId) ??
      filteredRows.find((row) => row.id_contrato === selectedContractId) ??
      null,
    [filteredRows, rows, selectedContractId],
  );

  useEffect(() => {
    if (
      !paymentOpen ||
      paymentKind !== "EXTRAORDINARIO" ||
      !selectedRow?.id_contrato
    ) {
      setExtraordinarySimulation(null);
      setExtraordinarySimulationError(null);
      setExtraordinarySimulationLoading(false);
      return;
    }

    const montoTotal = Number(paymentForm.montoTotal);
    if (
      !Number.isFinite(montoTotal) ||
      montoTotal <= 0 ||
      !paymentForm.fechaPago
    ) {
      setExtraordinarySimulation(null);
      setExtraordinarySimulationError(null);
      setExtraordinarySimulationLoading(false);
      return;
    }

    const requestKey = `${montoTotal}|${paymentForm.fechaPago}`;
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setExtraordinarySimulation(null);
      setExtraordinarySimulationError(null);
      setExtraordinarySimulationLoading(true);

      try {
        const { data, error } = await supabase.rpc(
          "simular_pago_extraordinario_contrato",
          {
            p_id_contrato: selectedRow.id_contrato,
            p_monto_extraordinario: montoTotal,
            p_fecha_pago: toPaymentTimestamp(paymentForm.fechaPago),
            p_usuario: user?.email ?? role ?? "usuario",
          },
        );

        if (error) throw error;

        const simulation = parseExtraordinaryPaymentSimulation(data);
        if (!simulation) {
          throw new Error(
            "La simulacion no devolvio el detalle financiero esperado.",
          );
        }

        if (!cancelled) {
          setExtraordinarySimulation({ ...simulation, requestKey });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error simulando pago extraordinario", error);
          setExtraordinarySimulationError(
            getErrorMessage(
              error,
              "No se pudo calcular la vista previa del pago extraordinario.",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setExtraordinarySimulationLoading(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    paymentForm.fechaPago,
    paymentForm.montoTotal,
    paymentKind,
    paymentOpen,
    role,
    selectedRow?.id_contrato,
    user?.email,
  ]);

  const quotasByPaymentId = useMemo(() => {
    const map = new Map<number, PagoAplicacionRow[]>();
    detail.aplicaciones.forEach((application) => {
      const current = map.get(application.id_pago) ?? [];
      current.push(application);
      map.set(application.id_pago, current);
    });
    return map;
  }, [detail.aplicaciones]);

  const quotaById = useMemo(() => {
    const map = new Map<
      number,
      Pick<ControlCuotasPlanRow, "id_cuota" | "id_plan_pago" | "numero_cuota">
    >();
    detail.cuotasReferencia.forEach((cuota) => {
      map.set(cuota.id_cuota, cuota);
    });
    detail.cuotas.forEach((cuota) => {
      if (cuota.id_cuota !== null) {
        map.set(cuota.id_cuota, cuota);
      }
    });
    return map;
  }, [detail.cuotas, detail.cuotasReferencia]);

  const cargoById = useMemo(() => {
    const map = new Map<number, CargoRow>();
    detail.cargos.forEach((cargo) => {
      map.set(cargo.id_cargo, cargo);
    });
    return map;
  }, [detail.cargos]);

  const dashboardSummary = useMemo(() => {
    const totalContratos = filteredRows.length;
    const conPlan = filteredRows.filter((row) => row.id_plan_pago !== null).length;
    const sinPlan = filteredRows.filter((row) => row.id_plan_pago === null).length;
    const conVencidas = filteredRows.filter(
      (row) =>
        (row.total_vencido_con_mora ??
          (row.monto_vencido ?? 0) + (row.mora_pendiente ?? 0)) > 0,
    ).length;
    const montoVencido = filteredRows.reduce(
      (acc, row) => acc + (row.monto_vencido ?? 0),
      0,
    );
    const saldoCapital = filteredRows.reduce(
      (acc, row) => acc + (row.saldo_capital_pendiente ?? 0),
      0,
    );
    const moraPendiente = filteredRows.reduce(
      (acc, row) => acc + (row.mora_pendiente ?? 0),
      0,
    );
    const totalVencidoConMora = filteredRows.reduce(
      (acc, row) =>
        acc +
        (row.total_vencido_con_mora ??
          (row.monto_vencido ?? 0) + (row.mora_pendiente ?? 0)),
      0,
    );

    return {
      totalContratos,
      conPlan,
      sinPlan,
      conVencidas,
      montoVencido,
      saldoCapital,
      moraPendiente,
      totalVencidoConMora,
    };
  }, [filteredRows]);

  const cobranzaAlerts = useMemo(() => {
    const baseRows = rows.filter(
      (row) =>
        row.estado_contrato === "VIGENTE" &&
        row.id_plan_pago !== null &&
        row.id_contrato !== null &&
        (row.proxima_fecha_vencimiento || (row.mora_pendiente ?? 0) > 0),
    );

    const normalized = baseRows
      .map((row) => {
        const dias = getDaysUntilDate(row.proxima_fecha_vencimiento);
        if (row.id_contrato === null) {
          return null;
        }

        return {
          idContrato: row.id_contrato,
          clienteNombre: row.cliente_nombre || "Cliente sin nombre",
          numeroContrato: row.numero_contrato || "sin numero",
          numeroFormulario: row.numero_formulario,
          proximaFecha: row.proxima_fecha_vencimiento,
          dias: dias ?? 0,
          cuotasVencidas: row.cuotas_vencidas ?? 0,
          montoVencido: row.monto_vencido ?? 0,
          moraPendiente: row.mora_pendiente ?? 0,
          totalVencidoConMora:
            row.total_vencido_con_mora ??
            (row.monto_vencido ?? 0) + (row.mora_pendiente ?? 0),
        } satisfies CobranzaAlert;
      })
      .filter((alert): alert is CobranzaAlert => alert !== null);

    const porVencer = normalized
      .filter(
        (alert) =>
          alert.proximaFecha !== null &&
          alert.cuotasVencidas === 0 &&
          alert.moraPendiente <= 0 &&
          alert.dias >= 1 &&
          alert.dias <= 4,
      )
      .sort((a, b) => a.dias - b.dias || a.idContrato - b.idContrato);

    const vencidos = normalized
      .filter(
        (alert) =>
          alert.cuotasVencidas > 0 ||
          alert.moraPendiente > 0 ||
          (alert.proximaFecha !== null && alert.dias < 0),
      )
      .sort((a, b) => {
        const overdueDaysA = a.dias < 0 ? Math.abs(a.dias) : 0;
        const overdueDaysB = b.dias < 0 ? Math.abs(b.dias) : 0;
        return (
          overdueDaysB - overdueDaysA ||
          b.cuotasVencidas - a.cuotasVencidas ||
          a.idContrato - b.idContrato
        );
      });

    return { porVencer, vencidos };
  }, [rows]);

  const selectedQuotaSummary = useMemo(() => {
    return detail.cuotas.reduce(
      (acc, cuota) => {
        const displayState = getQuotaDisplayState(
          cuota.estado,
          cuota.fecha_vencimiento,
        );

        if (displayState === "PAGADA" || displayState === "ANULADA") {
          return acc;
        }

        const capitalPendiente = Math.max(
          (cuota.monto_capital_programado ?? 0) -
            (cuota.monto_pagado_capital ?? 0),
          0,
        );
        const interesPendiente = Math.max(
          (cuota.monto_interes_programado ?? 0) -
            (cuota.monto_pagado_interes ?? 0),
          0,
        );
        const totalPendiente = Math.max(
          (cuota.monto_cuota_total_programada ?? 0) -
            (cuota.monto_pagado_total ?? 0),
          0,
        );

        acc.capitalPendiente += capitalPendiente;
        acc.interesPendiente += interesPendiente;
        acc.totalPendiente += totalPendiente;

        return acc;
      },
      {
        capitalPendiente: 0,
        interesPendiente: 0,
        totalPendiente: 0,
      },
    );
  }, [detail.cuotas]);

  const pendingChargesTotal = useMemo(() => {
    return detail.cargos.reduce((acc, cargo) => {
      if (
        isMoratoryCharge(cargo) ||
        cargo.estado === "PAGADO" ||
        cargo.estado === "ANULADO"
      ) {
        return acc;
      }
      return acc + Math.max((cargo.monto_original ?? 0) - (cargo.monto_pagado ?? 0), 0);
    }, 0);
  }, [detail.cargos]);

  const moratorySummary = useMemo(() => {
    const moratoryCharges = detail.cargos.filter(isMoratoryCharge);
    const pending = moratoryCharges.reduce((acc, cargo) => {
      if (cargo.estado === "ANULADO") return acc;
      return (
        acc +
        Math.max(
          (cargo.monto_original ?? 0) - (cargo.monto_pagado ?? 0),
          0,
        )
      );
    }, 0);
    const generated = moratoryCharges.reduce(
      (acc, cargo) =>
        cargo.estado === "ANULADO" ? acc : acc + (cargo.monto_original ?? 0),
      0,
    );
    const paid = moratoryCharges.reduce(
      (acc, cargo) =>
        cargo.estado === "ANULADO" ? acc : acc + (cargo.monto_pagado ?? 0),
      0,
    );
    const latestCalculation =
      detail.calculosMora.find((calculo) => calculo.estado !== "ANULADO") ??
      null;

    return {
      pending,
      generated,
      paid,
      latestCalculation,
      nextCalculationDate:
        selectedRow?.proxima_fecha_calculo_mora ?? null,
      totalOverdueWithMora:
        (selectedRow?.monto_vencido ?? 0) + pending,
    };
  }, [detail.calculosMora, detail.cargos, selectedRow]);

  const hasOpenQuotaBalance = selectedQuotaSummary.totalPendiente > 0.009;
  const hasPendingMora = moratorySummary.pending > 0.009;
  const canRegisterFinancialMovement =
    !detailLoading &&
    detail.contractId === selectedRow?.id_contrato &&
    selectedRow?.estado_contrato === "VIGENTE" &&
    Boolean(selectedRow.id_plan_pago) &&
    (hasOpenQuotaBalance || hasPendingMora);

  const refreshSelected = useCallback(async () => {
    if (selectedContractId) {
      await loadDetail(selectedContractId);
    }
    await loadResumen();
  }, [loadDetail, loadResumen, selectedContractId]);

  const exportSelectedFinancialDetail = useCallback(async () => {
    if (!selectedRow) return;

    const rowCountByTab: Record<FinancialDetailTab, number> = {
      cuotas: detail.cuotas.length,
      pagos: detail.pagos.length,
      mora: detail.calculosMora.length,
      cargos: detail.cargos.length,
      historial: detail.eventos.length,
    };

    if (rowCountByTab[selectedDetailTab] === 0) {
      toast.error("No hay datos para exportar en esta pestaña");
      return;
    }

    setExportingExcel(true);
    try {
      const contractLabel = formatContractDisplayLabel(selectedRow, {
        fallback: "Formulario pendiente",
      });
      const baseFilters = [
        { label: "Contrato", value: contractLabel },
        {
          label: "Cliente",
          value: selectedRow.cliente_nombre || "Cliente sin nombre",
        },
        { label: "Filtro de lista", value: FILTER_LABELS[filterMode] },
        { label: "Busqueda", value: searchTerm.trim() || "Sin busqueda" },
      ];

      if (selectedDetailTab === "cuotas") {
        const columns: ReportColumn<ControlCuotasPlanRow>[] = [
          {
            id: "numero",
            header: "#",
            getValue: (row) => Number(row.numero_cuota ?? 0),
            type: "number",
            align: "right",
          },
          {
            id: "vencimiento",
            header: "Vencimiento",
            getValue: (row) => parseCalendarDate(row.fecha_vencimiento),
            formatValue: (_value, row) => formatDate(row.fecha_vencimiento),
            type: "date",
          },
          {
            id: "estado",
            header: "Estado",
            getValue: (row) =>
              getQuotaDisplayState(row.estado, row.fecha_vencimiento),
            type: "text",
          },
          {
            id: "cuota",
            header: "Cuota",
            getValue: (row) => Number(row.monto_cuota_total_programada ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "interes",
            header: "Interes financiero",
            getValue: (row) => Number(row.monto_interes_programado ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "capital",
            header: "Capital",
            getValue: (row) => Number(row.monto_capital_programado ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "pagado",
            header: "Pagado",
            getValue: (row) => Number(row.monto_pagado_total ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "saldo_final",
            header: "Saldo final",
            getValue: (row) => Number(row.saldo_final_programado ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "factura",
            header: "Factura",
            getValue: (row) => row.numero_factura || "-",
            type: "text",
          },
        ];

        await exportExcelReport({
          systemName: "Veredas Sarchi - Poas",
          title: `Cuotas del plan - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Cuotas",
          fileBaseName: "Control_Cuotas_Cuotas",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: detail.cuotas,
        } satisfies ReportPayload<ControlCuotasPlanRow>);
      } else if (selectedDetailTab === "pagos") {
        type PaymentExportRow = PagoRow & {
          concepto: PaymentKind;
          totalInteres: number;
          totalCapital: number;
          totalMora: number;
          totalOtros: number;
          aplicacionesTexto: string;
        };

        const paymentRows: PaymentExportRow[] = detail.pagos.map((pago) => {
          const aplicaciones = quotasByPaymentId.get(pago.id_pago) ?? [];
          const totalInteres = aplicaciones.reduce(
            (acc, app) => acc + (app.monto_interes ?? 0),
            0,
          );
          const totalCapital = aplicaciones.reduce(
            (acc, app) => acc + (app.monto_capital ?? 0),
            0,
          );
          const totalMora = aplicaciones.reduce((acc, app) => {
            const cargo =
              app.id_cargo !== null ? cargoById.get(app.id_cargo) : undefined;
            return isMoratoryCharge(cargo)
              ? acc + (app.monto_otros ?? 0)
              : acc;
          }, 0);
          const totalOtros = aplicaciones.reduce(
            (acc, app) => {
              const cargo =
                app.id_cargo !== null
                  ? cargoById.get(app.id_cargo)
                  : undefined;
              return isMoratoryCharge(cargo)
                ? acc
                : acc + (app.monto_otros ?? 0);
            },
            0,
          );
          const aplicacionesTexto =
            aplicaciones
              .map((application) => {
                const cuota =
                  application.id_cuota !== null
                    ? quotaById.get(application.id_cuota)
                    : undefined;
                const cargo =
                  application.id_cargo !== null
                    ? cargoById.get(application.id_cargo)
                    : undefined;
                const planId = getApplicationPlanId(application);
                const label = cuota
                  ? `Cuota ${cuota.numero_cuota}`
                  : cargo
                    ? cargo.descripcion || getChargeTypeLabel(cargo.tipo_cargo)
                    : planId !== null
                      ? `Plan de origen #${planId}`
                      : "Aplicacion";
                const appliedMora = isMoratoryCharge(cargo)
                  ? application.monto_otros
                  : 0;
                const appliedOther = isMoratoryCharge(cargo)
                  ? 0
                  : application.monto_otros;
                return `${label}: Int. financiero ${formatCurrency(
                  application.monto_interes,
                )} | Cap. ${formatCurrency(
                  application.monto_capital,
                )} | Mora ${formatCurrency(appliedMora)} | Otros ${formatCurrency(
                  appliedOther,
                )}`;
              })
              .join(" | ") || "Sin detalle de aplicaciones";

          return {
            ...pago,
            concepto: getPaymentKind(pago, aplicaciones, cargoById),
            totalInteres,
            totalCapital,
            totalMora,
            totalOtros,
            aplicacionesTexto,
          };
        });

        const columns: ReportColumn<PaymentExportRow>[] = [
          {
            id: "pago",
            header: "Pago",
            getValue: (row) => `Pago #${row.id_pago}`,
            type: "text",
          },
          {
            id: "estado",
            header: "Estado",
            getValue: (row) => row.estado,
            type: "text",
          },
          {
            id: "concepto",
            header: "Concepto",
            getValue: (row) => row.concepto,
            type: "text",
          },
          {
            id: "fecha",
            header: "Fecha",
            getValue: (row) => formatDateTime(row.fecha_pago),
            type: "text",
          },
          {
            id: "metodo",
            header: "Metodo",
            getValue: (row) => row.metodo_pago || "",
            type: "text",
          },
          {
            id: "factura",
            header: "Factura",
            getValue: (row) => row.numero_factura || "",
            type: "text",
          },
          {
            id: "monto_total",
            header: "Monto total",
            getValue: (row) => Number(row.monto_total ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "interes_aplicado",
            header: "Interes financiero aplicado",
            getValue: (row) => row.totalInteres,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "mora_aplicada",
            header: "Mora aplicada",
            getValue: (row) => row.totalMora,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "capital_aplicado",
            header: "Capital aplicado",
            getValue: (row) => row.totalCapital,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "otros_aplicados",
            header: "Otros aplicados",
            getValue: (row) => row.totalOtros,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "referencia",
            header: "Referencia",
            getValue: (row) => row.referencia || "",
            type: "text",
          },
          {
            id: "observacion",
            header: "Observacion",
            getValue: (row) => row.observacion || "",
            type: "text",
          },
          {
            id: "aplicaciones",
            header: "Aplicaciones del pago",
            getValue: (row) => row.aplicacionesTexto,
            type: "text",
          },
        ];

        await exportExcelReport({
          systemName: "Veredas Sarchi - Poas",
          title: `Pagos del contrato - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Pagos",
          fileBaseName: "Control_Cuotas_Pagos",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: paymentRows,
        } satisfies ReportPayload<PaymentExportRow>);
      } else if (selectedDetailTab === "mora") {
        type MoraExportRow = MoratoryInterestCalculationRow & {
          montoPagado: number;
          montoPendiente: number;
          estadoVisible: string;
        };

        const moraRows: MoraExportRow[] = detail.calculosMora.map((calculo) => {
          const cargo =
            calculo.id_cargo !== null
              ? cargoById.get(calculo.id_cargo)
              : undefined;
          const montoPagado = cargo?.monto_pagado ?? 0;
          const isAnnulled =
            calculo.estado === "ANULADO" || cargo?.estado === "ANULADO";
          return {
            ...calculo,
            montoPagado,
            montoPendiente: isAnnulled
              ? 0
              : Math.max((cargo?.monto_original ?? 0) - montoPagado, 0),
            estadoVisible:
              isAnnulled ? "ANULADO" : cargo?.estado ?? calculo.estado,
          };
        });

        const columns: ReportColumn<MoraExportRow>[] = [
          {
            id: "periodo",
            header: "Periodo",
            getValue: (row) => formatDate(row.periodo_mora),
            type: "text",
          },
          {
            id: "fecha_corte",
            header: "Fecha de corte",
            getValue: (row) => parseCalendarDate(row.fecha_corte),
            formatValue: (_value, row) => formatDate(row.fecha_corte),
            type: "date",
          },
          {
            id: "base_cuotas",
            header: "Cuotas vencidas",
            getValue: (row) => Number(row.base_cuotas_vencidas ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "base_mora_anterior",
            header: "Mora anterior",
            getValue: (row) => Number(row.base_mora_anterior ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "base_total",
            header: "Base total",
            getValue: (row) => Number(row.base_total ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
          },
          {
            id: "tasa",
            header: "Tasa mensual",
            getValue: (row) => Number(row.tasa_mensual ?? 0),
            formatValue: (value) =>
              formatFractionAsPercent(Number(value ?? 0)),
            type: "number",
            align: "right",
          },
          {
            id: "generado",
            header: "Mora generada",
            getValue: (row) => Number(row.monto_generado ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "pagado",
            header: "Pagado",
            getValue: (row) => row.montoPagado,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "pendiente",
            header: "Pendiente",
            getValue: (row) => row.montoPendiente,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "estado",
            header: "Estado",
            getValue: (row) => row.estadoVisible,
            type: "text",
          },
        ];

        await exportExcelReport({
          systemName: "Veredas Sarchi - Poas",
          title: `Calculos moratorios - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Mora",
          fileBaseName: "Control_Cuotas_Mora",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: moraRows,
        } satisfies ReportPayload<MoraExportRow>);
      } else if (selectedDetailTab === "cargos") {
        const columns: ReportColumn<CargoRow>[] = [
          {
            id: "tipo",
            header: "Tipo",
            getValue: (row) => getChargeTypeLabel(row.tipo_cargo),
            type: "text",
          },
          {
            id: "descripcion",
            header: "Descripcion",
            getValue: (row) => row.descripcion || "-",
            type: "text",
          },
          {
            id: "vencimiento",
            header: "Vencimiento",
            getValue: (row) => parseCalendarDate(row.fecha_vencimiento),
            formatValue: (_value, row) => formatDate(row.fecha_vencimiento),
            type: "date",
          },
          {
            id: "estado",
            header: "Estado",
            getValue: (row) => row.estado,
            type: "text",
          },
          {
            id: "monto",
            header: "Monto",
            getValue: (row) => Number(row.monto_original ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "pagado",
            header: "Pagado",
            getValue: (row) => Number(row.monto_pagado ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "pendiente",
            header: "Pendiente",
            getValue: (row) =>
              Math.max(
                Number(row.monto_original ?? 0) - Number(row.monto_pagado ?? 0),
                0,
              ),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
        ];

        await exportExcelReport({
          systemName: "Veredas Sarchi - Poas",
          title: `Cargos del contrato - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Cargos",
          fileBaseName: "Control_Cuotas_Cargos",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: detail.cargos,
        } satisfies ReportPayload<CargoRow>);
      } else {
        type EventExportRow = EventoFinancieroRow & {
          tipoLabel: string;
          detalleTexto: string;
        };

        const eventRows: EventExportRow[] = detail.eventos.map((event) => {
          const eventDetails = buildEventDetails(event);
          return {
            ...event,
            tipoLabel: getEventTypeLabel(event.tipo_evento),
            detalleTexto:
              eventDetails
                .map((detailItem) => `${detailItem.label}: ${detailItem.value}`)
                .join(" | ") || "Sin detalle adicional",
          };
        });

        const columns: ReportColumn<EventExportRow>[] = [
          {
            id: "tipo",
            header: "Tipo",
            getValue: (row) => row.tipoLabel,
            type: "text",
          },
          {
            id: "fecha",
            header: "Fecha",
            getValue: (row) => formatDateTime(row.fecha_evento),
            type: "text",
          },
          {
            id: "observacion",
            header: "Observacion",
            getValue: (row) => row.observacion || "Sin observacion",
            type: "text",
          },
          {
            id: "usuario",
            header: "Usuario",
            getValue: (row) => row.usuario || "sistema",
            type: "text",
          },
          {
            id: "detalle",
            header: "Detalle",
            getValue: (row) => row.detalleTexto,
            type: "text",
          },
        ];

        await exportExcelReport({
          systemName: "Veredas Sarchi - Poas",
          title: `Historial financiero - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Historial",
          fileBaseName: "Control_Cuotas_Historial",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: eventRows,
        } satisfies ReportPayload<EventExportRow>);
      }

      toast.success("Excel generado correctamente");
    } catch (error) {
      console.error("Error exportando control de cuotas a Excel", error);
      toast.error(getErrorMessage(error, "No se pudo generar el Excel"));
    } finally {
      setExportingExcel(false);
    }
  }, [
    cargoById,
    detail.cargos,
    detail.calculosMora,
    detail.cuotas,
    detail.eventos,
    detail.pagos,
    filterMode,
    quotaById,
    quotasByPaymentId,
    role,
    searchTerm,
    selectedDetailTab,
    selectedRow,
    user?.email,
  ]);

  const openBackfillDialog = useCallback(() => {
    if (!selectedRow) return;
    setBackfillDate(
      selectedRow.plan_fecha_primera_cuota ??
        selectedRow.fecha_primera_cuota ??
        getSuggestedFirstPaymentDate(
          selectedRow.fecha_firma,
          selectedRow.dia_pago_mensual,
        ),
    );
    setBackfillOpen(true);
  }, [selectedRow]);

  const openPaymentDialog = useCallback((kind: PaymentKind) => {
    setPaymentKind(kind);
    setPaymentForm(getInitialPaymentForm());
    setExtraordinarySimulation(null);
    setExtraordinarySimulationError(null);
    setPaymentOpen(true);
  }, []);

  const openArrangementDialog = useCallback(() => {
    const firstCuota = detail.cuotas[0];
    setArrangementForm({
      fechaPrimeraCuota:
        selectedRow?.proxima_fecha_vencimiento ??
        selectedRow?.plan_fecha_primera_cuota ??
        getTodayInputValue(),
      plazoMeses: String(
        detail.cuotas.filter((cuota) => {
          const displayState = getQuotaDisplayState(
            cuota.estado,
            cuota.fecha_vencimiento,
          );
          return displayState !== "PAGADA" && displayState !== "ANULADA";
        }).length || selectedRow?.plazo_meses || 0,
      ),
      cuotaBase: String(selectedRow?.cuota_base ?? 0),
      tasaInteresAnual: String(firstCuota?.tasa_interes_anual ?? 0),
      observaciones: "",
    });
    setArrangementOpen(true);
  }, [detail.cuotas, selectedRow]);

  const handleGenerateBasePlan = useCallback(async () => {
    if (!selectedRow?.id_contrato) return;
    if (!backfillDate) {
      toast.error("Debes indicar la fecha de la primera cuota");
      return;
    }

    setSubmittingAction("backfill");
    try {
      const { error } = await supabase.rpc("generar_plan_pago_base_contrato", {
        p_id_contrato: selectedRow.id_contrato,
        p_fecha_primera_cuota: backfillDate,
        p_usuario: user?.email ?? role ?? "usuario",
      });

      if (error) {
        throw error;
      }

      toast.success("Plan base generado correctamente");
      setBackfillOpen(false);
      await refreshSelected();
    } catch (error) {
      console.error("Error generando plan base", error);
      toast.error(
        getErrorMessage(error, "No se pudo generar el plan base del contrato"),
      );
    } finally {
      setSubmittingAction(null);
    }
  }, [backfillDate, refreshSelected, role, selectedRow, user]);

  const handleRegisterPayment = useCallback(async () => {
    if (!selectedRow?.id_contrato) return;

    const montoTotal = Number(paymentForm.montoTotal);
    if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
      toast.error("Ingresa un monto de pago valido");
      return;
    }

    const saldoAplicable = paymentKind === "MORA"
      ? moratorySummary.pending
      : selectedQuotaSummary.totalPendiente;
    if (
      paymentKind !== "EXTRAORDINARIO" &&
      montoTotal - saldoAplicable > 0.009
    ) {
      toast.error(
        paymentKind === "MORA"
          ? "El pago no puede superar la mora pendiente"
          : "El pago no puede superar el saldo pendiente de las cuotas",
      );
      return;
    }

    if (!paymentForm.fechaPago) {
      toast.error("Debes indicar la fecha del pago");
      return;
    }

    if (paymentKind === "EXTRAORDINARIO") {
      const expectedRequestKey = `${montoTotal}|${paymentForm.fechaPago}`;
      if (
        extraordinarySimulationLoading ||
        extraordinarySimulation?.requestKey !== expectedRequestKey
      ) {
        toast.error("Espera a que finalice la vista previa del pago");
        return;
      }
      if (!extraordinarySimulation.permitido) {
        toast.error(
          extraordinarySimulation.motivoBloqueo ||
            "El contrato debe estar al dia en cuotas y mora.",
        );
        return;
      }
    }

    setSubmittingAction("payment");
    try {
      await synchronizeMoratoryInterest(
        selectedRow.id_contrato,
        paymentForm.fechaPago,
        user?.email ?? role ?? "usuario",
      );

      const rpcName =
        paymentKind === "MORA"
          ? "registrar_pago_mora_contrato"
          : paymentKind === "EXTRAORDINARIO"
            ? "registrar_pago_extraordinario_contrato"
            : "registrar_pago_contrato";
      const { error } = await supabase.rpc(rpcName, {
        p_id_contrato: selectedRow.id_contrato,
        p_monto_total: montoTotal,
        p_fecha_pago: toPaymentTimestamp(paymentForm.fechaPago),
        p_metodo_pago: paymentForm.metodoPago || null,
        p_referencia: paymentForm.referencia || null,
        p_numero_factura: paymentForm.numeroFactura || null,
        p_observacion: paymentForm.observacion || null,
        p_usuario: user?.email ?? role ?? "usuario",
        p_idempotency_key: paymentForm.idempotencyKey,
      });

      if (error) {
        throw error;
      }

      toast.success(
        paymentKind === "MORA"
          ? "Pago de mora registrado y aplicado correctamente"
          : paymentKind === "EXTRAORDINARIO"
            ? "Pago extraordinario aplicado al capital correctamente"
            : "Pago de cuota registrado y aplicado correctamente",
      );
      setPaymentOpen(false);
      setPaymentForm(getInitialPaymentForm());
      await refreshSelected();
    } catch (error) {
      console.error(`Error registrando pago de ${paymentKind.toLowerCase()}`, error);
      toast.error(
        getErrorMessage(
          error,
          paymentKind === "MORA"
            ? "No se pudo registrar el pago de mora"
            : paymentKind === "EXTRAORDINARIO"
              ? "No se pudo registrar el pago extraordinario"
              : "No se pudo registrar el pago de cuota",
        ),
      );
    } finally {
      setSubmittingAction(null);
    }
  }, [
    moratorySummary.pending,
    extraordinarySimulation,
    extraordinarySimulationLoading,
    paymentForm,
    paymentKind,
    refreshSelected,
    role,
    selectedQuotaSummary.totalPendiente,
    selectedRow,
    user,
  ]);

  const handleCreateArrangement = useCallback(async () => {
    if (!selectedRow?.id_contrato) return;

    const plazoMeses = Number(arrangementForm.plazoMeses);
    const cuotaBase = Number(arrangementForm.cuotaBase);
    const tasaInteresAnual = Number(arrangementForm.tasaInteresAnual);

    if (!arrangementForm.fechaPrimeraCuota) {
      toast.error("Debes indicar la fecha de la primera cuota del arreglo");
      return;
    }

    if (!Number.isFinite(plazoMeses) || plazoMeses <= 0) {
      toast.error("El plazo del arreglo de pago debe ser mayor a cero");
      return;
    }

    if (!Number.isFinite(cuotaBase) || cuotaBase <= 0) {
      toast.error("La cuota base del arreglo debe ser mayor a cero");
      return;
    }

    if (!Number.isFinite(tasaInteresAnual) || tasaInteresAnual < 0) {
      toast.error("La tasa de interes anual es invalida");
      return;
    }

    setSubmittingAction("arrangement");
    try {
      const { error } = await supabase.rpc("crear_arreglo_pago_contrato", {
        p_id_contrato: selectedRow.id_contrato,
        p_fecha_primera_cuota: arrangementForm.fechaPrimeraCuota,
        p_plazo_meses: plazoMeses,
        p_cuota_base: cuotaBase,
        p_tasa_interes_anual: tasaInteresAnual,
        p_observaciones: arrangementForm.observaciones || null,
        p_usuario: user?.email ?? role ?? "usuario",
      });

      if (error) {
        throw error;
      }

      toast.success("Arreglo de pago generado correctamente");
      setArrangementOpen(false);
      await refreshSelected();
    } catch (error) {
      console.error("Error generando arreglo de pago", error);
      toast.error(
        getErrorMessage(
          error,
          "No se pudo generar el arreglo de pago del contrato",
        ),
      );
    } finally {
      setSubmittingAction(null);
    }
  }, [arrangementForm, refreshSelected, role, selectedRow, user]);

  return (
    <div className="app-page">
      <div className="app-page-content space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-surface p-4 shadow-sm sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Button
              variant="ghost"
              className="w-fit px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => navigate(menuPath)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al menu
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-primary sm:text-3xl">
                Control de cuotas
              </h1>
              <p className="text-sm text-muted-foreground">
                Resumen por contrato, cuotas, pagos por concepto e interes
                moratorio calculado por periodo.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
              {filteredRows.length} contratos visibles
            </Badge>
            <Button
              variant="outline"
              onClick={() => void refreshSelected()}
              disabled={loading || detailLoading}
            >
              <RefreshCw
                className={cn(
                  "mr-2 h-4 w-4",
                  (loading || detailLoading) && "animate-spin",
                )}
              />
              Actualizar
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <SummaryMetricCard
            title="Contratos filtrados"
            value={String(dashboardSummary.totalContratos)}
            hint="Total segun el filtro actual."
          />
          <SummaryMetricCard
            title="Con plan vigente"
            value={String(dashboardSummary.conPlan)}
            hint="Contratos listos para control operativo."
          />
          <SummaryMetricCard
            title="Sin plan"
            value={String(dashboardSummary.sinPlan)}
            hint="Pendientes de backfill o generacion inicial."
          />
          <SummaryMetricCard
            title="Con saldo vencido"
            value={String(dashboardSummary.conVencidas)}
            hint="Contratos con cuotas vencidas o mora pendiente."
          />
          <SummaryMetricCard
            title="Cuotas vencidas"
            value={formatCurrency(dashboardSummary.montoVencido)}
            hint="Saldo vencido sin incluir mora."
          />
          <SummaryMetricCard
            title="Mora pendiente"
            value={formatCurrency(dashboardSummary.moraPendiente)}
            hint="Interes moratorio generado aun no pagado."
          />
          <SummaryMetricCard
            title="Total vencido con mora"
            value={formatCurrency(dashboardSummary.totalVencidoConMora)}
            hint={`Saldo capital visible: ${formatCurrency(
              dashboardSummary.saldoCapital,
            )}`}
          />
        </div>

        <Card className="border-border/70 bg-surface shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Alertas de cobranza</CardTitle>
            <CardDescription>
              Contratos que requieren seguimiento por vencimiento proximo o por
              atraso en sus cuotas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="por-vencer" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-2">
                <TabsTrigger value="por-vencer">
                  Por vencer ({cobranzaAlerts.porVencer.length})
                </TabsTrigger>
                <TabsTrigger value="vencidos">
                  Vencidos ({cobranzaAlerts.vencidos.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="por-vencer">
                {cobranzaAlerts.porVencer.length === 0 ? (
                  <EmptyPanel
                    title="Sin contratos por vencer en 4 dias"
                    description="No hay contratos vigentes con cuotas pendientes entre 1 y 4 dias."
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {cobranzaAlerts.porVencer.map((alert) => (
                      <button
                        key={`por-vencer-${alert.idContrato}`}
                        type="button"
                        onClick={() => setSelectedContractId(alert.idContrato)}
                        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left transition hover:border-amber-300 hover:bg-amber-100/60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">
                              {alert.clienteNombre}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatContractDisplayLabel(
                                {
                                  numero_formulario: alert.numeroFormulario,
                                  numero_contrato: alert.numeroContrato,
                                  id_contrato: alert.idContrato,
                                },
                                { fallback: "Formulario pendiente" },
                              )}
                            </p>
                          </div>
                          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                            {alert.dias} {alert.dias === 1 ? "dia" : "dias"}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-1 text-sm">
                          <p className="text-foreground">
                            Proxima cuota: {formatDate(alert.proximaFecha)}
                          </p>
                          <p className="text-muted-foreground">
                            Requiere seguimiento preventivo de cobro.
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="vencidos">
                {cobranzaAlerts.vencidos.length === 0 ? (
                  <EmptyPanel
                    title="Sin contratos vencidos"
                    description="No hay cuotas vencidas visibles en los contratos vigentes."
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {cobranzaAlerts.vencidos.map((alert) => (
                      <button
                        key={`vencido-${alert.idContrato}`}
                        type="button"
                        onClick={() => setSelectedContractId(alert.idContrato)}
                        className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-left transition hover:border-rose-300 hover:bg-rose-100/60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">
                              {alert.clienteNombre}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatContractDisplayLabel(
                                {
                                  numero_formulario: alert.numeroFormulario,
                                  numero_contrato: alert.numeroContrato,
                                  id_contrato: alert.idContrato,
                                },
                                { fallback: "Formulario pendiente" },
                              )}
                            </p>
                          </div>
                          <Badge className="bg-rose-100 text-rose-900 hover:bg-rose-100">
                            {alert.cuotasVencidas > 0
                              ? `${alert.cuotasVencidas} vencida${
                                  alert.cuotasVencidas === 1 ? "" : "s"
                                }`
                              : "Mora pendiente"}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-1 text-sm">
                          <p className="text-foreground">
                            Proxima cuota pendiente: {formatDate(alert.proximaFecha)}
                          </p>
                          <p className="text-muted-foreground">
                            Cuotas vencidas: {formatCurrency(alert.montoVencido)}
                          </p>
                          <p className="text-muted-foreground">
                            Mora pendiente: {formatCurrency(alert.moraPendiente)}
                          </p>
                          <p className="font-medium text-rose-800">
                            Total vencido: {formatCurrency(
                              alert.totalVencidoConMora,
                            )}
                          </p>
                          {alert.dias < 0 && (
                            <p className="text-rose-700">
                              Atraso de {Math.abs(alert.dias)}{" "}
                              {Math.abs(alert.dias) === 1 ? "dia" : "dias"}.
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="border-border/70 bg-surface shadow-sm">
            <CardHeader className="space-y-4">
              <div>
                <CardTitle className="text-xl">Contratos</CardTitle>
                <CardDescription>
                  Selecciona un contrato para ver su vida financiera.
                </CardDescription>
              </div>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por cliente, contrato o formulario"
                    className="pl-9"
                  />
                </div>
                <Select
                  value={filterMode}
                  onValueChange={(value) => setFilterMode(value as FilterMode)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar contratos" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FILTER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-24 w-full rounded-lg" />
                  ))}
                </div>
              ) : filteredRows.length === 0 ? (
                <EmptyPanel
                  title="No hay contratos para mostrar"
                  description="Ajusta el filtro o la busqueda para encontrar contratos."
                />
              ) : (
                <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                  {filteredRows.map((row) => {
                    const selected = row.id_contrato === selectedContractId;
                    const cuotasVencidas = row.cuotas_vencidas ?? 0;
                    return (
                      <button
                        key={row.id_contrato ?? `row-${row.numero_contrato}`}
                        type="button"
                        onClick={() => setSelectedContractId(row.id_contrato)}
                        className={cn(
                          "w-full rounded-xl border px-4 py-4 text-left transition-all",
                          selected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border/70 bg-background hover:border-primary/40 hover:bg-muted/20",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">
                              {row.cliente_nombre || "Cliente sin nombre"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatContractDisplayLabel(row, {
                                fallback: "Formulario pendiente",
                              })}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              className={getStatusBadgeClass(
                                row.estado_contrato || "SIN ESTADO",
                              )}
                            >
                              {row.estado_contrato || "Sin estado"}
                            </Badge>
                            <Badge
                              className={
                                row.id_plan_pago
                                  ? "bg-primary/10 text-primary hover:bg-primary/10"
                                  : "bg-slate-100 text-slate-800 hover:bg-slate-100"
                              }
                            >
                              {row.id_plan_pago ? getPlanTypeLabel(row.tipo_plan) : "Sin plan"}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Proxima cuota
                            </p>
                            <p className="font-medium text-foreground">
                              {formatDate(row.proxima_fecha_vencimiento)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Saldo capital
                            </p>
                            <p className="font-medium text-foreground">
                              {formatCurrency(row.saldo_capital_pendiente)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Cuotas vencidas
                            </p>
                            <p
                              className={cn(
                                "font-medium",
                                cuotasVencidas > 0
                                  ? "text-rose-700"
                                  : "text-foreground",
                              )}
                            >
                              {cuotasVencidas}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Monto vencido
                            </p>
                            <p
                              className={cn(
                                "font-medium",
                                (row.monto_vencido ?? 0) > 0
                                  ? "text-rose-700"
                                  : "text-foreground",
                              )}
                            >
                              {formatCurrency(row.monto_vencido)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Mora pendiente
                            </p>
                            <p
                              className={cn(
                                "font-medium",
                                (row.mora_pendiente ?? 0) > 0
                                  ? "text-rose-700"
                                  : "text-foreground",
                              )}
                            >
                              {formatCurrency(row.mora_pendiente)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Total vencido con mora
                            </p>
                            <p
                              className={cn(
                                "font-medium",
                                (row.total_vencido_con_mora ?? 0) > 0
                                  ? "text-rose-700"
                                  : "text-foreground",
                              )}
                            >
                              {formatCurrency(
                                row.total_vencido_con_mora ??
                                  (row.monto_vencido ?? 0) +
                                    (row.mora_pendiente ?? 0),
                              )}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {!selectedRow ? (
              <Card className="border-border/70 bg-surface shadow-sm">
                <CardContent className="pt-6">
                  <EmptyPanel
                    title="Selecciona un contrato"
                    description="El detalle financiero, cuotas, pagos y eventos se mostrarán aqui."
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-border/70 bg-surface shadow-sm">
                  <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-2xl">
                          {selectedRow.cliente_nombre || "Cliente sin nombre"}
                        </CardTitle>
                        <Badge
                          className={getStatusBadgeClass(
                            selectedRow.estado_contrato || "SIN ESTADO",
                          )}
                        >
                          {selectedRow.estado_contrato || "Sin estado"}
                        </Badge>
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                          {selectedRow.id_plan_pago
                            ? getPlanTypeLabel(selectedRow.tipo_plan)
                            : "Sin plan generado"}
                        </Badge>
                      </div>
                      <CardDescription className="text-sm">
                        {formatContractDisplayLabel(selectedRow, {
                          fallback: "Formulario pendiente",
                        })}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && !selectedRow.id_plan_pago && selectedRow.estado_contrato === "VIGENTE" && (
                        <Button onClick={openBackfillDialog}>
                          <FileText className="mr-2 h-4 w-4" />
                          Generar plan base
                        </Button>
                      )}
                      {isAdmin && canRegisterFinancialMovement && (
                        <>
                          {hasOpenQuotaBalance && (
                            <Button
                              variant="outline"
                              onClick={() => openPaymentDialog("CUOTA")}
                            >
                              <DollarSign className="mr-2 h-4 w-4" />
                              Registrar pago
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            onClick={() => openPaymentDialog("MORA")}
                            disabled={!hasPendingMora}
                            title={
                              !hasPendingMora
                                ? "El contrato no tiene mora pendiente"
                                : undefined
                            }
                          >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Registrar pago de mora
                          </Button>
                          {hasOpenQuotaBalance && (
                            <Button variant="outline" onClick={openArrangementDialog}>
                              <Calendar className="mr-2 h-4 w-4" />
                              Arreglo de pago
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Saldo capital pendiente
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedQuotaSummary.capitalPendiente)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Principal pendiente de amortizar.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Interes financiero pendiente
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedQuotaSummary.interesPendiente)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Interes ordinario restante dentro de las cuotas.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Total proyectado cuotas
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedQuotaSummary.totalPendiente)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Capital + interes pendiente de las cuotas del plan.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Monto vencido
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedRow.monto_vencido)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Solo cuotas ya vencidas al dia de hoy.
                        </p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                        <p className="text-xs uppercase tracking-wide text-rose-700">
                          Mora pendiente
                        </p>
                        <p className="mt-1 text-xl font-semibold text-rose-800">
                          {formatCurrency(moratorySummary.pending)}
                        </p>
                        <p className="mt-1 text-xs text-rose-700/80">
                          Generada {formatCurrency(moratorySummary.generated)} ·
                          pagada {formatCurrency(moratorySummary.paid)}.
                        </p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                        <p className="text-xs uppercase tracking-wide text-rose-700">
                          Total vencido con mora
                        </p>
                        <p className="mt-1 text-xl font-semibold text-rose-800">
                          {formatCurrency(
                            moratorySummary.totalOverdueWithMora,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-rose-700/80">
                          Cuotas vencidas + interes moratorio pendiente.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Proximo corte de mora
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatDate(moratorySummary.nextCalculationDate)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          La mora se calcula al 2 % mensual tras 6 dias de gracia.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Avance del plan
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {selectedRow.cuotas_pagadas ?? 0}/{selectedRow.cuotas_totales ?? 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Cuotas liquidadas respecto al total del plan vigente.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Proxima cuota
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatDate(selectedRow.proxima_fecha_vencimiento)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Fecha de la siguiente cuota con saldo pendiente.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Otros cargos pendientes
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(pendingChargesTotal)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Mantenimientos, apertura u otros cargos fuera de cuotas.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border border-border/70 bg-background px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Cuota base
                        </p>
                        <p className="font-medium text-foreground">
                          {formatCurrency(selectedRow.cuota_base)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Fecha primera cuota
                        </p>
                        <p className="font-medium text-foreground">
                          {formatDate(
                            selectedRow.plan_fecha_primera_cuota ??
                              selectedRow.fecha_primera_cuota,
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Plazo meses
                        </p>
                        <p className="font-medium text-foreground">
                          {selectedRow.plazo_meses ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Dia de pago
                        </p>
                        <p className="font-medium text-foreground">
                          {selectedRow.dia_pago_mensual ?? "No definido"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-surface shadow-sm">
                  <CardHeader className="gap-3 pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">Detalle financiero</CardTitle>
                      <CardDescription>
                        Exporta la pestaña activa del contrato seleccionado.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void exportSelectedFinancialDetail()}
                      disabled={
                        detailLoading ||
                        exportingExcel ||
                        !selectedRow.id_plan_pago ||
                        (selectedDetailTab === "cuotas"
                          ? detail.cuotas.length === 0
                          : selectedDetailTab === "pagos"
                            ? detail.pagos.length === 0
                            : selectedDetailTab === "mora"
                              ? detail.calculosMora.length === 0
                              : selectedDetailTab === "cargos"
                                ? detail.cargos.length === 0
                                : detail.eventos.length === 0)
                      }
                    >
                      {exportingExcel ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                      )}
                      Excel
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {detailLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-10 w-80 rounded-md" />
                        <Skeleton className="h-64 w-full rounded-xl" />
                      </div>
                    ) : !selectedRow.id_plan_pago ? (
                      <EmptyPanel
                        title="El contrato aun no tiene plan financiero"
                        description={
                          isAdmin
                            ? "Genera el plan base para empezar a registrar cuotas y pagos."
                            : "Este contrato todavia no tiene un plan financiero generado."
                        }
                      />
                    ) : (
                      <Tabs
                        value={selectedDetailTab}
                        onValueChange={(value) =>
                          setSelectedDetailTab(value as FinancialDetailTab)
                        }
                        className="w-full"
                      >
                        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-5">
                          <TabsTrigger value="cuotas">Cuotas</TabsTrigger>
                          <TabsTrigger value="pagos">Pagos</TabsTrigger>
                          <TabsTrigger value="mora">Mora</TabsTrigger>
                          <TabsTrigger value="cargos">Cargos</TabsTrigger>
                          <TabsTrigger value="historial">Historial</TabsTrigger>
                        </TabsList>

                        <TabsContent value="cuotas">
                          {detail.cuotas.length === 0 ? (
                            <EmptyPanel
                              title="No hay cuotas generadas"
                              description="El plan existe, pero todavia no hay filas de amortizacion visibles."
                            />
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>#</TableHead>
                                  <TableHead>Vencimiento</TableHead>
                                  <TableHead>Estado</TableHead>
                                  <TableHead>Cuota</TableHead>
                                  <TableHead>Interes financiero</TableHead>
                                  <TableHead>Capital</TableHead>
                                  <TableHead>Pagado</TableHead>
                                  <TableHead>Saldo final</TableHead>
                                  <TableHead>Factura</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {detail.cuotas.map((cuota) => {
                                  const displayState = getQuotaDisplayState(
                                    cuota.estado,
                                    cuota.fecha_vencimiento,
                                  );
                                  return (
                                    <TableRow key={cuota.id_cuota ?? cuota.numero_cuota}>
                                      <TableCell className="font-medium">
                                        {cuota.numero_cuota ?? "-"}
                                      </TableCell>
                                      <TableCell>
                                        {formatDate(cuota.fecha_vencimiento)}
                                      </TableCell>
                                      <TableCell>
                                        <Badge className={getStatusBadgeClass(displayState)}>
                                          {displayState}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(
                                          cuota.monto_cuota_total_programada,
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(
                                          cuota.monto_interes_programado,
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(
                                          cuota.monto_capital_programado,
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(cuota.monto_pagado_total)}
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(
                                          cuota.saldo_final_programado,
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {cuota.numero_factura || "-"}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </TabsContent>

                        <TabsContent value="pagos">
                          {detail.pagos.length === 0 ? (
                            <EmptyPanel
                              title="No hay pagos registrados"
                              description="Registra una cuota, un pago extraordinario al capital o un pago de mora segun el concepto recibido."
                            />
                          ) : (
                            <div className="space-y-4">
                              {detail.pagos.map((pago) => {
                                const aplicaciones =
                                  quotasByPaymentId.get(pago.id_pago) ?? [];
                                const totalInteres = aplicaciones.reduce(
                                  (acc, app) => acc + (app.monto_interes ?? 0),
                                  0,
                                );
                                const totalCapital = aplicaciones.reduce(
                                  (acc, app) => acc + (app.monto_capital ?? 0),
                                  0,
                                );
                                const totalMora = aplicaciones.reduce(
                                  (acc, app) => {
                                    const cargo =
                                      app.id_cargo !== null
                                        ? cargoById.get(app.id_cargo)
                                        : undefined;
                                    return isMoratoryCharge(cargo)
                                      ? acc + (app.monto_otros ?? 0)
                                      : acc;
                                  },
                                  0,
                                );
                                const totalOtros = aplicaciones.reduce(
                                  (acc, app) => {
                                    const cargo =
                                      app.id_cargo !== null
                                        ? cargoById.get(app.id_cargo)
                                        : undefined;
                                    return isMoratoryCharge(cargo)
                                      ? acc
                                      : acc + (app.monto_otros ?? 0);
                                  },
                                  0,
                                );
                                const paymentConcept = getPaymentKind(
                                  pago,
                                  aplicaciones,
                                  cargoById,
                                );

                                return (
                                  <div
                                    key={pago.id_pago}
                                    className="rounded-xl border border-border/70 bg-background p-4"
                                  >
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="font-semibold text-foreground">
                                            Pago #{pago.id_pago}
                                          </p>
                                          <Badge
                                            className={getStatusBadgeClass(
                                              pago.estado,
                                            )}
                                          >
                                            {pago.estado}
                                          </Badge>
                                          <Badge
                                            className={
                                              paymentConcept === "MORA"
                                                ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
                                                : paymentConcept ===
                                                    "EXTRAORDINARIO"
                                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                                  : "bg-sky-100 text-sky-800 hover:bg-sky-100"
                                            }
                                          >
                                            {paymentConcept}
                                          </Badge>
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                          {formatDateTime(pago.fecha_pago)}
                                          {pago.metodo_pago
                                            ? ` - ${pago.metodo_pago}`
                                            : ""}
                                          {pago.numero_factura
                                            ? ` - Factura ${pago.numero_factura}`
                                            : ""}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Monto total
                                        </p>
                                        <p className="text-lg font-semibold text-foreground">
                                          {formatCurrency(pago.monto_total)}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Interes financiero aplicado
                                        </p>
                                        <p className="font-medium text-foreground">
                                          {formatCurrency(totalInteres)}
                                        </p>
                                      </div>
                                      <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2">
                                        <p className="text-xs uppercase tracking-wide text-rose-700">
                                          Mora aplicada
                                        </p>
                                        <p className="font-medium text-rose-800">
                                          {formatCurrency(totalMora)}
                                        </p>
                                      </div>
                                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Capital aplicado
                                        </p>
                                        <p className="font-medium text-foreground">
                                          {formatCurrency(totalCapital)}
                                        </p>
                                      </div>
                                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Otros aplicados
                                        </p>
                                        <p className="font-medium text-foreground">
                                          {formatCurrency(totalOtros)}
                                        </p>
                                      </div>
                                    </div>

                                    {pago.referencia && (
                                      <p className="mt-3 text-sm text-muted-foreground">
                                        Referencia: {pago.referencia}
                                      </p>
                                    )}
                                    {pago.observacion && (
                                      <p className="mt-2 text-sm text-muted-foreground">
                                        {pago.observacion}
                                      </p>
                                    )}

                                    <div className="mt-4 space-y-2">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Aplicaciones del pago
                                      </p>
                                      {aplicaciones.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                          Sin detalle de aplicaciones.
                                        </p>
                                      ) : (
                                        <div className="flex flex-wrap gap-2">
                                          {aplicaciones.map((application) => {
                                            const cuota =
                                              application.id_cuota !== null
                                                ? quotaById.get(application.id_cuota)
                                                : undefined;
                                            const cargo =
                                              application.id_cargo !== null
                                                ? cargoById.get(application.id_cargo)
                                                : undefined;
                                            const planId =
                                              getApplicationPlanId(application);
                                            const label = cuota
                                              ? `Cuota ${cuota.numero_cuota}`
                                              : cargo
                                                ? cargo.descripcion ||
                                                  getChargeTypeLabel(
                                                    cargo.tipo_cargo,
                                                  )
                                                : planId !== null
                                                  ? `Plan de origen #${planId}`
                                                  : "Aplicacion";
                                            const appliedMora =
                                              isMoratoryCharge(cargo)
                                                ? application.monto_otros
                                                : 0;
                                            const appliedOther =
                                              isMoratoryCharge(cargo)
                                                ? 0
                                                : application.monto_otros;
                                            return (
                                              <div
                                                key={application.id_aplicacion}
                                                className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary"
                                              >
                                                {label}: Int. financiero{" "}
                                                {formatCurrency(
                                                  application.monto_interes,
                                                )}{" "}
                                                | Cap.{" "}
                                                {formatCurrency(
                                                  application.monto_capital,
                                                )}{" "}
                                                | Mora{" "}
                                                {formatCurrency(appliedMora)}{" "}
                                                | Otros{" "}
                                                {formatCurrency(
                                                  appliedOther,
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="mora">
                          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-900">
                            <p className="font-medium">Calculo moratorio separado</p>
                            <p className="mt-1 text-rose-800/80">
                              Se aplica un 2 % mensual desde el sexto dia de
                              atraso sobre las cuotas vencidas y la mora anterior
                              que continuen pendientes al corte.
                            </p>
                          </div>
                          {detail.calculosMora.length === 0 ? (
                            <EmptyPanel
                              title="No hay calculos moratorios"
                              description="El contrato no ha alcanzado un corte con saldo vencido sujeto a mora."
                            />
                          ) : (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Periodo</TableHead>
                                    <TableHead>Corte</TableHead>
                                    <TableHead>Cuotas vencidas</TableHead>
                                    <TableHead>Mora anterior</TableHead>
                                    <TableHead>Base total</TableHead>
                                    <TableHead>Tasa</TableHead>
                                    <TableHead>Generado</TableHead>
                                    <TableHead>Pagado</TableHead>
                                    <TableHead>Pendiente</TableHead>
                                    <TableHead>Estado</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {detail.calculosMora.map((calculo) => {
                                    const cargo =
                                      calculo.id_cargo !== null
                                        ? cargoById.get(calculo.id_cargo)
                                        : undefined;
                                    const montoPagado = cargo?.monto_pagado ?? 0;
                                    const isAnnulled =
                                      calculo.estado === "ANULADO" ||
                                      cargo?.estado === "ANULADO";
                                    const pendiente =
                                      isAnnulled
                                        ? 0
                                        : Math.max(
                                            (cargo?.monto_original ?? 0) -
                                              montoPagado,
                                            0,
                                          );
                                    const estado =
                                      isAnnulled
                                        ? "ANULADO"
                                        : cargo?.estado ?? calculo.estado;

                                    return (
                                      <TableRow key={calculo.id_calculo_mora}>
                                        <TableCell className="font-medium">
                                          {formatDate(calculo.periodo_mora)}
                                        </TableCell>
                                        <TableCell>
                                          <div>{formatDate(calculo.fecha_corte)}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {calculo.dias_gracia} dias de gracia
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {formatCurrency(
                                            calculo.base_cuotas_vencidas,
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {formatCurrency(
                                            calculo.base_mora_anterior,
                                          )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                          {formatCurrency(calculo.base_total)}
                                        </TableCell>
                                        <TableCell>
                                          {formatFractionAsPercent(
                                            calculo.tasa_mensual,
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {formatCurrency(calculo.monto_generado)}
                                        </TableCell>
                                        <TableCell>
                                          {formatCurrency(montoPagado)}
                                        </TableCell>
                                        <TableCell>
                                          {formatCurrency(pendiente)}
                                        </TableCell>
                                        <TableCell>
                                          <Badge
                                            className={getStatusBadgeClass(estado)}
                                          >
                                            {estado}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="cargos">
                          {detail.cargos.length === 0 ? (
                            <EmptyPanel
                              title="No hay cargos adicionales"
                              description="Aqui apareceran intereses moratorios y otros cargos operativos."
                            />
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Tipo</TableHead>
                                  <TableHead>Descripcion</TableHead>
                                  <TableHead>Vencimiento</TableHead>
                                  <TableHead>Estado</TableHead>
                                  <TableHead>Monto</TableHead>
                                  <TableHead>Pagado</TableHead>
                                  <TableHead>Pendiente</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {detail.cargos.map((cargo) => {
                                  const pendiente = Math.max(
                                    (cargo.monto_original ?? 0) -
                                      (cargo.monto_pagado ?? 0),
                                    0,
                                  );
                                  return (
                                    <TableRow
                                      key={cargo.id_cargo}
                                      className={cn(
                                        isMoratoryCharge(cargo) &&
                                          "bg-rose-50/40",
                                      )}
                                    >
                                      <TableCell
                                        className={cn(
                                          "font-medium",
                                          isMoratoryCharge(cargo) &&
                                            "text-rose-800",
                                        )}
                                      >
                                        {getChargeTypeLabel(cargo.tipo_cargo)}
                                      </TableCell>
                                      <TableCell>
                                        {cargo.descripcion || "-"}
                                      </TableCell>
                                      <TableCell>
                                        {formatDate(cargo.fecha_vencimiento)}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          className={getStatusBadgeClass(
                                            cargo.estado,
                                          )}
                                        >
                                          {cargo.estado}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(cargo.monto_original)}
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(cargo.monto_pagado)}
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(pendiente)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </TabsContent>

                        <TabsContent value="historial">
                          {detail.eventos.length === 0 ? (
                            <EmptyPanel
                              title="No hay eventos financieros"
                              description="El historial mostrara formalizaciones, cuotas, pagos extraordinarios, mora y arreglos de pago."
                            />
                          ) : (
                            <div className="space-y-4">
                              {detail.eventos.map((event) => {
                                const eventDetails = buildEventDetails(event);

                                return (
                                  <div
                                    key={event.id_evento}
                                    className="rounded-xl border border-border/70 bg-background p-4"
                                  >
                                    <div className="flex flex-col gap-2">
                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                                            {getEventTypeLabel(event.tipo_evento)}
                                          </Badge>
                                          <span className="text-sm text-muted-foreground">
                                            {formatDateTime(event.fecha_evento)}
                                          </span>
                                        </div>
                                        <p className="mt-2 text-sm text-foreground">
                                          {event.observacion || "Sin observacion"}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          Usuario: {event.usuario || "sistema"}
                                        </p>
                                      </div>
                                    </div>

                                    {eventDetails.length > 0 ? (
                                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                        {eventDetails.map((detailItem) => (
                                          <div
                                            key={`${event.id_evento}-${detailItem.label}`}
                                            className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                                          >
                                            <p className="text-xs uppercase text-muted-foreground">
                                              {detailItem.label}
                                            </p>
                                            <p className="mt-1 font-medium text-foreground">
                                              {detailItem.value}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="mt-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                                        Sin detalle adicional para este evento.
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={backfillOpen} onOpenChange={setBackfillOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar plan base</DialogTitle>
            <DialogDescription>
              Usa este flujo para contratos vigentes existentes que aun no tengan
              tabla financiera generada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backfill-fecha-primera-cuota">
                Fecha de primera cuota
              </Label>
              <Input
                id="backfill-fecha-primera-cuota"
                type="date"
                value={backfillDate}
                onChange={(event) => setBackfillDate(event.target.value)}
                disabled={submittingAction === "backfill"}
              />
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Genera una version inicial del plan con los datos actuales del
                  contrato. Revisa primero plazo, cuota y tasa antes de confirmar.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setBackfillOpen(false)}
                disabled={submittingAction === "backfill"}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => void handleGenerateBasePlan()}
                disabled={submittingAction === "backfill"}
              >
                {submittingAction === "backfill" && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Generar plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {paymentKind === "MORA"
                ? "Registrar pago de mora"
                : "Registrar pago"}
            </DialogTitle>
            <DialogDescription>
              {paymentKind === "MORA"
                ? "Este ingreso se aplicara exclusivamente a cargos de interes moratorio pendientes."
                : paymentKind === "EXTRAORDINARIO"
                  ? "El pago extraordinario se aplica completamente al capital y reduce el plazo restante."
                  : "Selecciona si deseas registrar una cuota normal o un pago extraordinario al capital."}
            </DialogDescription>
          </DialogHeader>
          {paymentKind !== "MORA" && (
            <div className="space-y-2">
              <Label htmlFor="pago-concepto">Tipo de pago</Label>
              <Select
                value={paymentKind}
                onValueChange={(value) => {
                  setPaymentKind(value as RegularPaymentKind);
                  setPaymentForm(getInitialPaymentForm());
                  setExtraordinarySimulation(null);
                  setExtraordinarySimulationError(null);
                }}
                disabled={submittingAction === "payment"}
              >
                <SelectTrigger id="pago-concepto">
                  <SelectValue placeholder="Selecciona el tipo de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUOTA">Pago de cuota</SelectItem>
                  <SelectItem value="EXTRAORDINARIO">
                    Pago extraordinario
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Cada registro corresponde a un solo concepto; no se combinan
                cuota y extraordinario en una misma operacion.
              </p>
            </div>
          )}
          <div
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              paymentKind === "MORA"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : paymentKind === "EXTRAORDINARIO"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-sky-200 bg-sky-50 text-sky-900",
            )}
          >
            <p className="text-xs uppercase tracking-wide opacity-80">
              {paymentKind === "EXTRAORDINARIO"
                ? "Saldo de capital actual"
                : "Saldo disponible para este concepto"}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatCurrency(
                paymentKind === "MORA"
                  ? moratorySummary.pending
                  : paymentKind === "EXTRAORDINARIO"
                    ? selectedRow?.saldo_capital_pendiente
                    : selectedQuotaSummary.totalPendiente,
              )}
            </p>
            <p className="mt-1 text-xs opacity-80">
              {paymentKind === "EXTRAORDINARIO"
                ? "Solo puede registrarse si el contrato esta al dia en cuota y mora."
                : "No se trasladara ningun remanente entre conceptos."}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pago-monto">
                {paymentKind === "MORA"
                  ? "Monto de mora"
                  : paymentKind === "EXTRAORDINARIO"
                    ? "Monto extraordinario"
                    : "Monto de cuota"}
              </Label>
              <Input
                id="pago-monto"
                type="number"
                min="0"
                max={
                  paymentKind === "MORA"
                    ? moratorySummary.pending
                    : paymentKind === "EXTRAORDINARIO"
                      ? selectedRow?.saldo_capital_pendiente ?? undefined
                      : selectedQuotaSummary.totalPendiente
                }
                step="0.01"
                value={paymentForm.montoTotal}
                onChange={(event) => {
                  setExtraordinarySimulation(null);
                  setExtraordinarySimulationError(null);
                  setPaymentForm((current) => ({
                    ...current,
                    montoTotal: event.target.value,
                  }));
                }}
                disabled={submittingAction === "payment"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pago-fecha">Fecha de pago</Label>
              <Input
                id="pago-fecha"
                type="date"
                value={paymentForm.fechaPago}
                onChange={(event) => {
                  setExtraordinarySimulation(null);
                  setExtraordinarySimulationError(null);
                  setPaymentForm((current) => ({
                    ...current,
                    fechaPago: event.target.value,
                  }));
                }}
                disabled={submittingAction === "payment"}
              />
            </div>
            {paymentKind === "EXTRAORDINARIO" && (
              <div className="space-y-3 md:col-span-2">
                {extraordinarySimulationLoading ? (
                  <div className="flex items-center justify-center rounded-lg border border-border/70 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Calculando el nuevo saldo, plazo e intereses...
                  </div>
                ) : extraordinarySimulationError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">
                          No se pudo generar la vista previa
                        </p>
                        <p className="mt-1">{extraordinarySimulationError}</p>
                      </div>
                    </div>
                  </div>
                ) : extraordinarySimulation &&
                  !extraordinarySimulation.permitido ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">
                          Pago extraordinario no disponible
                        </p>
                        <p className="mt-1">
                          {extraordinarySimulation.motivoBloqueo ||
                            "Primero debe cancelar cualquier cuota vencida o mora pendiente."}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : extraordinarySimulation?.permitido ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-5 w-5 text-emerald-700" />
                        <div>
                          <p className="font-semibold text-emerald-950">
                            Vista previa del nuevo plan
                          </p>
                          <p className="text-xs text-emerald-800">
                            Pago al capital de {formatCurrency(
                              extraordinarySimulation.montoExtraordinario,
                            )}
                          </p>
                        </div>
                      </div>
                      {extraordinarySimulation.liquidacionTotal && (
                        <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">
                          Liquida el capital
                        </Badge>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-emerald-200 bg-white/80 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Saldo de capital
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground line-through">
                          {formatCurrency(
                            extraordinarySimulation.saldoCapitalAntes,
                          )}
                        </p>
                        <p className="text-lg font-semibold text-emerald-800">
                          {formatCurrency(
                            extraordinarySimulation.saldoCapitalDespues,
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-white/80 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Cuotas restantes
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground line-through">
                          {extraordinarySimulation.cuotasRestantesAntes}
                        </p>
                        <p className="text-lg font-semibold text-emerald-800">
                          {extraordinarySimulation.cuotasRestantesDespues}
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-white/80 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Intereses futuros
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground line-through">
                          {formatCurrency(
                            extraordinarySimulation.interesFuturoAntes,
                          )}
                        </p>
                        <p className="text-lg font-semibold text-emerald-800">
                          {formatCurrency(
                            extraordinarySimulation.interesFuturoDespues,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-emerald-700 px-4 py-3 text-white">
                        <p className="text-xs uppercase tracking-wide text-emerald-100">
                          Ahorro estimado de intereses
                        </p>
                        <p className="mt-1 text-xl font-semibold">
                          {formatCurrency(
                            extraordinarySimulation.ahorroIntereses,
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-white/80 px-4 py-3 text-sm text-emerald-950">
                        <p>
                          La cuota mensual se mantiene en{" "}
                          <strong>
                            {formatCurrency(extraordinarySimulation.cuotaBase)}
                          </strong>
                          .
                        </p>
                        {(extraordinarySimulation.fechaFinAntes ||
                          extraordinarySimulation.fechaFinDespues) && (
                          <p className="mt-1 text-xs text-emerald-800">
                            Finalizacion: {formatDate(
                              extraordinarySimulation.fechaFinAntes,
                            )}{" "}
                            → {formatDate(
                              extraordinarySimulation.fechaFinDespues,
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                    Ingresa el monto para consultar en el servidor el efecto
                    sobre capital, cuotas e intereses.
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pago-metodo">Metodo de pago</Label>
              <Select
                value={paymentForm.metodoPago}
                onValueChange={(value) =>
                  setPaymentForm((current) => ({
                    ...current,
                    metodoPago: value,
                  }))
                }
                disabled={submittingAction === "payment"}
              >
                <SelectTrigger id="pago-metodo">
                  <SelectValue placeholder="Seleccione un método" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pago-factura">Numero de factura</Label>
              <Input
                id="pago-factura"
                value={paymentForm.numeroFactura}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    numeroFactura: event.target.value,
                  }))
                }
                disabled={submittingAction === "payment"}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pago-referencia">Referencia</Label>
              <Input
                id="pago-referencia"
                value={paymentForm.referencia}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    referencia: event.target.value,
                  }))
                }
                disabled={submittingAction === "payment"}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pago-observacion">Observacion</Label>
              <Textarea
                id="pago-observacion"
                value={paymentForm.observacion}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    observacion: event.target.value,
                  }))
                }
                rows={4}
                disabled={submittingAction === "payment"}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setPaymentOpen(false)}
              disabled={submittingAction === "payment"}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleRegisterPayment()}
              disabled={
                submittingAction === "payment" ||
                (paymentKind === "EXTRAORDINARIO"
                  ? extraordinarySimulationLoading ||
                    !extraordinarySimulation?.permitido
                  : (paymentKind === "MORA"
                      ? moratorySummary.pending
                      : selectedQuotaSummary.totalPendiente) <= 0.009)
              }
            >
              {submittingAction === "payment" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {paymentKind === "MORA"
                ? "Registrar pago de mora"
                : paymentKind === "EXTRAORDINARIO"
                  ? "Confirmar pago extraordinario"
                  : "Registrar pago de cuota"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={arrangementOpen} onOpenChange={setArrangementOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Crear arreglo de pago</DialogTitle>
            <DialogDescription>
              Esto reemplaza el plan vigente con una nueva version calculada
              desde el saldo de capital pendiente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="arreglo-fecha">Fecha primera cuota</Label>
              <Input
                id="arreglo-fecha"
                type="date"
                value={arrangementForm.fechaPrimeraCuota}
                onChange={(event) =>
                  setArrangementForm((current) => ({
                    ...current,
                    fechaPrimeraCuota: event.target.value,
                  }))
                }
                disabled={submittingAction === "arrangement"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arreglo-plazo">Plazo en meses</Label>
              <Input
                id="arreglo-plazo"
                type="number"
                min="1"
                step="1"
                value={arrangementForm.plazoMeses}
                onChange={(event) =>
                  setArrangementForm((current) => ({
                    ...current,
                    plazoMeses: event.target.value,
                  }))
                }
                disabled={submittingAction === "arrangement"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arreglo-cuota">Cuota base</Label>
              <Input
                id="arreglo-cuota"
                type="number"
                min="0"
                step="0.01"
                value={arrangementForm.cuotaBase}
                onChange={(event) =>
                  setArrangementForm((current) => ({
                    ...current,
                    cuotaBase: event.target.value,
                  }))
                }
                disabled={submittingAction === "arrangement"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arreglo-tasa">Tasa interes anual</Label>
              <Input
                id="arreglo-tasa"
                type="number"
                min="0"
                step="0.01"
                value={arrangementForm.tasaInteresAnual}
                onChange={(event) =>
                  setArrangementForm((current) => ({
                    ...current,
                    tasaInteresAnual: event.target.value,
                  }))
                }
                disabled={submittingAction === "arrangement"}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="arreglo-observaciones">Observaciones</Label>
              <Textarea
                id="arreglo-observaciones"
                rows={4}
                value={arrangementForm.observaciones}
                onChange={(event) =>
                  setArrangementForm((current) => ({
                    ...current,
                    observaciones: event.target.value,
                  }))
                }
                disabled={submittingAction === "arrangement"}
              />
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Usa esta accion solo cuando la administracion apruebe un cambio
                formal del cronograma del contrato.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setArrangementOpen(false)}
              disabled={submittingAction === "arrangement"}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleCreateArrangement()}
              disabled={submittingAction === "arrangement"}
            >
              {submittingAction === "arrangement" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear arreglo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
