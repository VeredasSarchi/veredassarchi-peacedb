import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
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
import { cn } from "@/lib/utils";

type ControlCuotasResumenRow =
  Database["public"]["Views"]["vw_control_cuotas_resumen"]["Row"];
type ControlCuotasPlanRow =
  Database["public"]["Views"]["vw_control_cuotas_plan_vigente"]["Row"];
type PagoRow = Tables<"contrato_pago">;
type PagoAplicacionRow = Tables<"contrato_pago_aplicacion">;
type CargoRow = Tables<"contrato_cargo">;
type EventoFinancieroRow = Tables<"contrato_evento_financiero">;

type FilterMode =
  | "vigentes"
  | "con-vencidas"
  | "con-plan"
  | "sin-plan"
  | "todos";

type PaymentFormState = {
  montoTotal: string;
  fechaPago: string;
  metodoPago: string;
  referencia: string;
  numeroFactura: string;
  observacion: string;
};

type ArrangementFormState = {
  fechaPrimeraCuota: string;
  plazoMeses: string;
  cuotaBase: string;
  tasaInteresAnual: string;
  observaciones: string;
};

type DetailState = {
  cuotas: ControlCuotasPlanRow[];
  pagos: PagoRow[];
  aplicaciones: PagoAplicacionRow[];
  cargos: CargoRow[];
  eventos: EventoFinancieroRow[];
};

const FILTER_LABELS: Record<FilterMode, string> = {
  vigentes: "Solo vigentes",
  "con-vencidas": "Con cuotas vencidas",
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "No definida";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-CR");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "No definido";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-CR");
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0 %";
  }
  return `${Number(value).toFixed(2)} %`;
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

  const parsed = new Date(fechaFirma);
  if (Number.isNaN(parsed.getTime())) {
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
  if (tipoPlan === "BACKFILL") return "Plan generado";
  if (tipoPlan === "REESTRUCTURACION") return "Reestructuracion";
  return tipoPlan;
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

function getInitialPaymentForm(): PaymentFormState {
  return {
    montoTotal: "",
    fechaPago: getTodayInputValue(),
    metodoPago: "",
    referencia: "",
    numeroFactura: "",
    observacion: "",
  };
}

function formatPayload(payload: Json): string {
  return JSON.stringify(payload, null, 2);
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
  const [detail, setDetail] = useState<DetailState>({
    cuotas: [],
    pagos: [],
    aplicaciones: [],
    cargos: [],
    eventos: [],
  });
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("vigentes");
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillDate, setBackfillDate] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(
    getInitialPaymentForm(),
  );
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
    setDetailLoading(true);
    try {
      const [cuotasRes, pagosRes, cargosRes, eventosRes] = await Promise.all([
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
          .from("contrato_evento_financiero")
          .select("*")
          .eq("id_contrato", contractId)
          .order("fecha_evento", { ascending: false }),
      ]);

      if (cuotasRes.error) throw cuotasRes.error;
      if (pagosRes.error) throw pagosRes.error;
      if (cargosRes.error) throw cargosRes.error;
      if (eventosRes.error) throw eventosRes.error;

      const pagos = pagosRes.data ?? [];
      const paymentIds = pagos.map((pago) => pago.id_pago);

      let aplicaciones: PagoAplicacionRow[] = [];
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
      }

      setDetail({
        cuotas: cuotasRes.data ?? [],
        pagos,
        aplicaciones,
        cargos: cargosRes.data ?? [],
        eventos: eventosRes.data ?? [],
      });
    } catch (error) {
      console.error("Error cargando detalle financiero", error);
      toast.error(
        getErrorMessage(error, "No se pudo cargar el detalle del contrato"),
      );
      setDetail({
        cuotas: [],
        pagos: [],
        aplicaciones: [],
        cargos: [],
        eventos: [],
      });
    } finally {
      setDetailLoading(false);
    }
  }, []);

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
          return (row.cuotas_vencidas ?? 0) > 0;
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
            row.numero_contrato,
            row.numero_formulario,
            String(row.id_contrato ?? ""),
          ].join(" "),
        );
        return haystack.includes(normalizedTerm);
      })
      .sort((a, b) => {
        const overdueDelta =
          Number((b.cuotas_vencidas ?? 0) > 0) -
          Number((a.cuotas_vencidas ?? 0) > 0);
        if (overdueDelta !== 0) return overdueDelta;

        const aTime = a.proxima_fecha_vencimiento
          ? new Date(a.proxima_fecha_vencimiento).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bTime = b.proxima_fecha_vencimiento
          ? new Date(b.proxima_fecha_vencimiento).getTime()
          : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return (b.id_contrato ?? 0) - (a.id_contrato ?? 0);
      });
  }, [filterMode, rows, searchTerm]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedContractId(null);
      setDetail({
        cuotas: [],
        pagos: [],
        aplicaciones: [],
        cargos: [],
        eventos: [],
      });
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
    const map = new Map<number, ControlCuotasPlanRow>();
    detail.cuotas.forEach((cuota) => {
      if (cuota.id_cuota !== null) {
        map.set(cuota.id_cuota, cuota);
      }
    });
    return map;
  }, [detail.cuotas]);

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
      (row) => (row.cuotas_vencidas ?? 0) > 0,
    ).length;
    const montoVencido = filteredRows.reduce(
      (acc, row) => acc + (row.monto_vencido ?? 0),
      0,
    );
    const saldoCapital = filteredRows.reduce(
      (acc, row) => acc + (row.saldo_capital_pendiente ?? 0),
      0,
    );

    return {
      totalContratos,
      conPlan,
      sinPlan,
      conVencidas,
      montoVencido,
      saldoCapital,
    };
  }, [filteredRows]);

  const refreshSelected = useCallback(async () => {
    await loadResumen();
    if (selectedContractId) {
      await loadDetail(selectedContractId);
    }
  }, [loadDetail, loadResumen, selectedContractId]);

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

  const openPaymentDialog = useCallback(() => {
    setPaymentForm(getInitialPaymentForm());
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

    if (!paymentForm.fechaPago) {
      toast.error("Debes indicar la fecha del pago");
      return;
    }

    setSubmittingAction("payment");
    try {
      const { error } = await supabase.rpc("registrar_pago_contrato", {
        p_id_contrato: selectedRow.id_contrato,
        p_monto_total: montoTotal,
        p_fecha_pago: paymentForm.fechaPago,
        p_metodo_pago: paymentForm.metodoPago || null,
        p_referencia: paymentForm.referencia || null,
        p_numero_factura: paymentForm.numeroFactura || null,
        p_observacion: paymentForm.observacion || null,
        p_usuario: user?.email ?? role ?? "usuario",
      });

      if (error) {
        throw error;
      }

      toast.success("Pago registrado y aplicado correctamente");
      setPaymentOpen(false);
      setPaymentForm(getInitialPaymentForm());
      await refreshSelected();
    } catch (error) {
      console.error("Error registrando pago", error);
      toast.error(
        getErrorMessage(error, "No se pudo registrar el pago del contrato"),
      );
    } finally {
      setSubmittingAction(null);
    }
  }, [paymentForm, refreshSelected, role, selectedRow, user]);

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
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full space-y-6 px-2 sm:px-4 lg:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-surface p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
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
              <h1 className="text-3xl font-bold text-primary">
                Control de cuotas
              </h1>
              <p className="text-sm text-muted-foreground">
                Resumen financiero por contrato, detalle de cuotas, pagos
                aplicados y reestructuraciones.
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
            title="Con vencidas"
            value={String(dashboardSummary.conVencidas)}
            hint="Contratos con atraso al dia de hoy."
          />
          <SummaryMetricCard
            title="Monto vencido"
            value={formatCurrency(dashboardSummary.montoVencido)}
            hint={`Saldo capital visible: ${formatCurrency(
              dashboardSummary.saldoCapital,
            )}`}
          />
        </div>

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
                              Contrato {row.numero_contrato || "sin numero"}
                              {row.numero_formulario
                                ? ` - Formulario ${row.numero_formulario}`
                                : ""}
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
                        Contrato {selectedRow.numero_contrato || "sin numero"}
                        {selectedRow.numero_formulario
                          ? ` - Formulario ${selectedRow.numero_formulario}`
                          : " - Sin formulario oficial"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && !selectedRow.id_plan_pago && selectedRow.estado_contrato === "VIGENTE" && (
                        <Button onClick={openBackfillDialog}>
                          <FileText className="mr-2 h-4 w-4" />
                          Generar plan base
                        </Button>
                      )}
                      {isAdmin && selectedRow.id_plan_pago && (
                        <>
                          <Button variant="outline" onClick={openPaymentDialog}>
                            <DollarSign className="mr-2 h-4 w-4" />
                            Registrar pago
                          </Button>
                          <Button variant="outline" onClick={openArrangementDialog}>
                            <Calendar className="mr-2 h-4 w-4" />
                            Arreglo de pago
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Saldo capital
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedRow.saldo_capital_pendiente)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Monto vencido
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedRow.monto_vencido)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Avance del plan
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {selectedRow.cuotas_pagadas ?? 0}/{selectedRow.cuotas_totales ?? 0}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Proxima cuota
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatDate(selectedRow.proxima_fecha_vencimiento)}
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
                      <Tabs defaultValue="cuotas" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                          <TabsTrigger value="cuotas">Cuotas</TabsTrigger>
                          <TabsTrigger value="pagos">Pagos</TabsTrigger>
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
                                  <TableHead>Interes</TableHead>
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
                              description="Usa el boton de registrar pago para empezar el control operativo."
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
                                const totalOtros = aplicaciones.reduce(
                                  (acc, app) => acc + (app.monto_otros ?? 0),
                                  0,
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

                                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Interes aplicado
                                        </p>
                                        <p className="font-medium text-foreground">
                                          {formatCurrency(totalInteres)}
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
                                            const label = cuota
                                              ? `Cuota ${cuota.numero_cuota}`
                                              : cargo
                                                ? cargo.descripcion ||
                                                  cargo.tipo_cargo
                                                : "Aplicacion";
                                            return (
                                              <div
                                                key={application.id_aplicacion}
                                                className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary"
                                              >
                                                {label}: Int.{" "}
                                                {formatCurrency(
                                                  application.monto_interes,
                                                )}{" "}
                                                | Cap.{" "}
                                                {formatCurrency(
                                                  application.monto_capital,
                                                )}{" "}
                                                | Otros{" "}
                                                {formatCurrency(
                                                  application.monto_otros,
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

                        <TabsContent value="cargos">
                          {detail.cargos.length === 0 ? (
                            <EmptyPanel
                              title="No hay cargos adicionales"
                              description="Aqui apareceran mantenimiento, apertura u otros cargos operativos."
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
                                    <TableRow key={cargo.id_cargo}>
                                      <TableCell className="font-medium">
                                        {cargo.tipo_cargo}
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
                              description="El historial mostrara formalizaciones, pagos, backfills y arreglos de pago."
                            />
                          ) : (
                            <div className="space-y-4">
                              {detail.eventos.map((event) => (
                                <div
                                  key={event.id_evento}
                                  className="rounded-xl border border-border/70 bg-background p-4"
                                >
                                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                                          {event.tipo_evento}
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
                                    <div className="text-xs text-muted-foreground">
                                      <p>Plan origen: {event.id_plan_origen ?? "-"}</p>
                                      <p>
                                        Plan resultante: {event.id_plan_resultante ?? "-"}
                                      </p>
                                    </div>
                                  </div>
                                  <pre className="mt-4 overflow-x-auto rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                                    {formatPayload(event.payload)}
                                  </pre>
                                </div>
                              ))}
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>
              El sistema aplicará el pago automaticamente a cuotas y cargos
              pendientes en orden cronologico.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pago-monto">Monto total</Label>
              <Input
                id="pago-monto"
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.montoTotal}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    montoTotal: event.target.value,
                  }))
                }
                disabled={submittingAction === "payment"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pago-fecha">Fecha de pago</Label>
              <Input
                id="pago-fecha"
                type="date"
                value={paymentForm.fechaPago}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    fechaPago: event.target.value,
                  }))
                }
                disabled={submittingAction === "payment"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pago-metodo">Metodo de pago</Label>
              <Input
                id="pago-metodo"
                value={paymentForm.metodoPago}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    metodoPago: event.target.value,
                  }))
                }
                placeholder="Transferencia, efectivo, deposito"
                disabled={submittingAction === "payment"}
              />
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
              disabled={submittingAction === "payment"}
            >
              {submittingAction === "payment" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Registrar pago
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
