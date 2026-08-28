import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatContractDisplayLabel, getContractSearchTokens } from "@/lib/contract-display";
import {
  exportExcelReport,
  type ReportColumn,
  type ReportPayload,
} from "@/lib/report-export";
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
import { PAYMENT_METHOD_OPTIONS } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

type ControlMantenimientoResumenRow = {
  id_contrato: number | null;
  numero_contrato: string | null;
  numero_formulario: string | null;
  estado_contrato: string | null;
  fecha_firma: string | null;
  id_cliente: number | null;
  cliente_nombre: string | null;
  monto_mantenimiento_anual: number | null;
  fecha_inicio_mantenimiento: string | null;
  configuracion_completa: boolean | null;
  cuotas_totales: number | null;
  cuotas_pagadas: number | null;
  cuotas_parciales: number | null;
  cuotas_vencidas: number | null;
  monto_vencido: number | null;
  total_pendiente: number | null;
  proxima_fecha_vencimiento: string | null;
  ultimo_periodo_cubierto_hasta: string | null;
  mora_pendiente: number | null;
  mora_generada: number | null;
  mora_pagada: number | null;
  ultima_fecha_calculo_mora: string | null;
  ultima_base_moratoria: number | null;
  ultimo_interes_moratorio_generado: number | null;
  proxima_fecha_calculo_mora: string | null;
  total_pendiente_con_mora: number | null;
};

type ControlMantenimientoCuotaRow = {
  id_contrato: number | null;
  numero_contrato: string | null;
  numero_formulario: string | null;
  estado_contrato: string | null;
  cliente_nombre: string | null;
  fecha_inicio_mantenimiento: string | null;
  monto_mantenimiento_anual: number | null;
  id_cuota_mantenimiento: number | null;
  numero_periodo: number | null;
  fecha_inicio_periodo: string | null;
  fecha_fin_periodo: string | null;
  fecha_vencimiento: string | null;
  monto_programado: number | null;
  monto_pagado: number | null;
  estado: string | null;
  fecha_ultimo_pago: string | null;
  notas: string | null;
};

type MantenimientoPagoRow = {
  id_pago_mantenimiento: number;
  id_contrato: number;
  fecha_pago: string;
  monto_total: number;
  metodo_pago: string | null;
  referencia: string | null;
  observacion: string | null;
  estado: string;
  registrado_por: string | null;
  created_at: string;
  tipo_pago: "CUOTA" | "MORA";
  idempotency_key: string | null;
};

type MantenimientoPagoAplicacionRow = {
  id_aplicacion_mantenimiento: number;
  id_pago_mantenimiento: number;
  id_cuota_mantenimiento: number | null;
  id_cargo_mantenimiento: number | null;
  monto_aplicado: number;
  notas: string | null;
};

type MantenimientoCargoRow = {
  id_cargo_mantenimiento: number;
  id_contrato: number;
  id_cuota_mantenimiento: number;
  tipo_cargo: string;
  descripcion: string;
  fecha_corte: string;
  fecha_vencimiento: string;
  monto_original: number;
  monto_pagado: number;
  estado: string;
  notas: string | null;
  created_at: string;
};

type MantenimientoMoraCalculoRow = {
  id_calculo_mora_mantenimiento: number;
  id_contrato: number;
  id_cuota_mantenimiento: number;
  id_cargo_mantenimiento: number | null;
  periodo_mora: string;
  fecha_corte: string;
  base_principal_pendiente: number;
  tasa_mensual: number;
  monto_generado: number;
  estado: string;
  detalle_principal: unknown;
  usuario_creacion: string | null;
  anulado_at: string | null;
  anulado_por: string | null;
  motivo_anulacion: string | null;
  created_at: string;
};

type PaymentFormState = {
  montoTotal: string;
  fechaPago: string;
  metodoPago: string;
  referencia: string;
  observacion: string;
  idempotencyKey: string;
};

type MaintenanceAlertCategory = "1m" | "2m" | "3m";
type MaintenanceDetailTab = "cuotas" | "pagos" | "mora";
type MaintenancePaymentKind = "CUOTA" | "MORA";

type MaintenanceAlert = {
  idContrato: number;
  clienteNombre: string;
  numeroFormulario: string | null;
  numeroContrato: string | null;
  proximaFecha: string;
  dias: number;
  monthsUntil: number;
  monto: number;
};

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatFractionAsPercent(value: number | null | undefined): string {
  return new Intl.NumberFormat("es-CR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  const calendarDateMatch = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(trimmed);
  if (calendarDateMatch) {
    const [, year, month, day] = calendarDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: string | null | undefined): string {
  const parsed = parseCalendarDate(value);
  if (!parsed) return "No definida";
  return parsed.toLocaleDateString("es-CR");
}

function toPaymentTimestamp(value: string): string {
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  parsed.setHours(12, 0, 0, 0);
  return parsed.toISOString();
}

function getTodayInputValue(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(today.getDate()).padStart(2, "0")}`;
}

function getDaysUntilDate(value: string | null | undefined): number | null {
  const parsed = parseCalendarDate(value);
  if (!parsed) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return Math.round((parsed.getTime() - today.getTime()) / 86400000);
}

function getMonthsUntilDate(value: string | null | undefined): number | null {
  const parsed = parseCalendarDate(value);
  if (!parsed) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  if (parsed < today) return null;

  return (
    (parsed.getFullYear() - today.getFullYear()) * 12 +
    (parsed.getMonth() - today.getMonth())
  );
}

function normalizeSearchValue(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function getStatusBadgeClass(status: string): string {
  if (status === "PAGADA") {
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  }
  if (status === "PARCIAL") {
    return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  }
  if (status === "VENCIDA") {
    return "bg-rose-100 text-rose-800 hover:bg-rose-100";
  }
  if (status === "PENDIENTE") {
    return "bg-slate-100 text-slate-800 hover:bg-slate-100";
  }
  return "bg-primary/10 text-primary hover:bg-primary/10";
}

function createPaymentIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mantenimiento-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getInitialPaymentForm(): PaymentFormState {
  return {
    montoTotal: "",
    fechaPago: getTodayInputValue(),
    metodoPago: "",
    referencia: "",
    observacion: "",
    idempotencyKey: createPaymentIdempotencyKey(),
  };
}

async function synchronizeMaintenanceMoratoryInterest(
  contractId: number,
  untilDate: string,
  userName: string,
): Promise<void> {
  const { error } = await supabase.rpc(
    "sincronizar_interes_moratorio_mantenimiento_contrato",
    {
      p_id_contrato: contractId,
      p_fecha_hasta: untilDate,
      p_usuario: userName,
    },
  );

  if (error) throw error;
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

export default function ControlMantenimiento() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const menuPath = role === "vendedor" ? "/vendedor" : "/";

  const [rows, setRows] = useState<ControlMantenimientoResumenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const selectedContractIdRef = useRef<number | null>(null);
  selectedContractIdRef.current = selectedContractId;
  const [detailCuotas, setDetailCuotas] = useState<ControlMantenimientoCuotaRow[]>([]);
  const [detailPagos, setDetailPagos] = useState<MantenimientoPagoRow[]>([]);
  const [detailAplicaciones, setDetailAplicaciones] = useState<
    MantenimientoPagoAplicacionRow[]
  >([]);
  const [detailCargos, setDetailCargos] = useState<MantenimientoCargoRow[]>([]);
  const [detailCalculosMora, setDetailCalculosMora] = useState<
    MantenimientoMoraCalculoRow[]
  >([]);
  const [detailContractId, setDetailContractId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestIdRef = useRef(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAlertTab, setSelectedAlertTab] =
    useState<MaintenanceAlertCategory>("1m");
  const [selectedDetailTab, setSelectedDetailTab] =
    useState<MaintenanceDetailTab>("cuotas");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [moratoryInfoOpen, setMoratoryInfoOpen] = useState(false);
  const [paymentContractId, setPaymentContractId] = useState<number | null>(null);
  const [paymentKind, setPaymentKind] =
    useState<MaintenancePaymentKind>("CUOTA");
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(
    getInitialPaymentForm(),
  );
  const [syncing, setSyncing] = useState(false);
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const syncMaintenance = useCallback(async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.rpc(
        "sincronizar_cuotas_mantenimiento_vigentes" as never,
        {
          p_usuario: user?.email ?? role ?? "usuario",
        } as never,
      );

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Error sincronizando cobros de mantenimiento", error);
      toast.error(
        getErrorMessage(
          error,
          "No se pudieron sincronizar los cobros de mantenimiento",
        ),
      );
    } finally {
      setSyncing(false);
    }
  }, [role, user]);

  const loadResumen = useCallback(async () => {
    setLoading(true);
    try {
      await syncMaintenance();

      const { data, error } = await supabase
        .from("vw_control_mantenimiento_resumen" as never)
        .select("*")
        .order("proxima_fecha_vencimiento", {
          ascending: true,
          nullsFirst: false,
        })
        .order("id_contrato", { ascending: false });

      if (error) {
        throw error;
      }

      setRows((data as ControlMantenimientoResumenRow[] | null) ?? []);
    } catch (error) {
      console.error("Error cargando mantenimiento", error);
      toast.error(
        getErrorMessage(
          error,
          "No se pudo cargar el resumen de mantenimiento",
        ),
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [syncMaintenance]);

  const loadDetail = useCallback(
    async (contractId: number) => {
      const requestId = ++detailRequestIdRef.current;
      setDetailContractId(null);
      setDetailCuotas([]);
      setDetailPagos([]);
      setDetailAplicaciones([]);
      setDetailCargos([]);
      setDetailCalculosMora([]);
      setDetailLoading(true);

      try {
        try {
          await synchronizeMaintenanceMoratoryInterest(
            contractId,
            getTodayInputValue(),
            user?.email ?? role ?? "usuario",
          );
        } catch (syncError) {
          console.error(
            "Error sincronizando mora de mantenimiento",
            syncError,
          );
          if (requestId === detailRequestIdRef.current) {
            toast.warning(
              "No se pudo actualizar la mora; se muestran los ultimos datos disponibles.",
            );
          }
        }

        if (requestId !== detailRequestIdRef.current) return;

        const [cuotasRes, pagosRes, cargosRes, calculosMoraRes, resumenRes] =
          await Promise.all([
            supabase
              .from("vw_control_mantenimiento_cuotas" as never)
              .select("*")
              .eq("id_contrato", contractId)
              .order("numero_periodo", { ascending: true }),
            supabase
              .from("contrato_mantenimiento_pago" as never)
              .select("*")
              .eq("id_contrato", contractId)
              .order("fecha_pago", { ascending: false }),
            supabase
              .from("contrato_mantenimiento_cargo" as never)
              .select("*")
              .eq("id_contrato", contractId)
              .order("fecha_vencimiento", { ascending: true }),
            supabase
              .from(
                "contrato_mantenimiento_interes_moratorio_calculo" as never,
              )
              .select("*")
              .eq("id_contrato", contractId)
              .order("fecha_corte", { ascending: false }),
            supabase
              .from("vw_control_mantenimiento_resumen" as never)
              .select("*")
              .eq("id_contrato", contractId)
              .maybeSingle(),
          ]);

        if (cuotasRes.error) throw cuotasRes.error;
        if (pagosRes.error) throw pagosRes.error;
        if (cargosRes.error) throw cargosRes.error;
        if (calculosMoraRes.error) throw calculosMoraRes.error;
        if (resumenRes.error) throw resumenRes.error;

        const pagos = (pagosRes.data as MantenimientoPagoRow[] | null) ?? [];
        const paymentIds = pagos.map((pago) => pago.id_pago_mantenimiento);

        let aplicaciones: MantenimientoPagoAplicacionRow[] = [];
        if (paymentIds.length > 0) {
          const aplicacionesRes = await supabase
            .from("contrato_mantenimiento_pago_aplicacion" as never)
            .select("*")
            .in("id_pago_mantenimiento", paymentIds)
            .order("id_aplicacion_mantenimiento", { ascending: true });

          if (aplicacionesRes.error) throw aplicacionesRes.error;
          aplicaciones =
            (aplicacionesRes.data as MantenimientoPagoAplicacionRow[] | null) ??
            [];
        }

        if (requestId !== detailRequestIdRef.current) return;

        setDetailCuotas(
          (cuotasRes.data as ControlMantenimientoCuotaRow[] | null) ?? [],
        );
        setDetailPagos(pagos);
        setDetailAplicaciones(aplicaciones);
        setDetailCargos(
          (cargosRes.data as MantenimientoCargoRow[] | null) ?? [],
        );
        setDetailCalculosMora(
          (calculosMoraRes.data as MantenimientoMoraCalculoRow[] | null) ?? [],
        );
        setDetailContractId(contractId);

        const refreshedSummary = resumenRes.data as
          | ControlMantenimientoResumenRow
          | null;
        if (refreshedSummary) {
          setRows((current) =>
            current.map((row) =>
              row.id_contrato === contractId ? refreshedSummary : row,
            ),
          );
        }
      } catch (error) {
        console.error("Error cargando detalle de mantenimiento", error);
        if (requestId === detailRequestIdRef.current) {
          toast.error(
            getErrorMessage(
              error,
              "No se pudo cargar el detalle de mantenimiento",
            ),
          );
          setDetailCuotas([]);
          setDetailPagos([]);
          setDetailAplicaciones([]);
          setDetailCargos([]);
          setDetailCalculosMora([]);
          setDetailContractId(null);
        }
      } finally {
        if (requestId === detailRequestIdRef.current) {
          setDetailLoading(false);
        }
      }
    },
    [role, user?.email],
  );

  useEffect(() => {
    void loadResumen();
  }, [loadResumen]);

  const filteredRows = useMemo(() => {
    const normalizedTerm = normalizeSearchValue(searchTerm);

    return rows
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
            (b.cuotas_vencidas ?? 0) > 0 || (b.mora_pendiente ?? 0) > 0,
          ) -
          Number(
            (a.cuotas_vencidas ?? 0) > 0 || (a.mora_pendiente ?? 0) > 0,
          );
        if (overdueDelta !== 0) return overdueDelta;

        const aTime =
          parseCalendarDate(a.proxima_fecha_vencimiento)?.getTime() ??
          Number.MAX_SAFE_INTEGER;
        const bTime =
          parseCalendarDate(b.proxima_fecha_vencimiento)?.getTime() ??
          Number.MAX_SAFE_INTEGER;
        return aTime - bTime || (b.id_contrato ?? 0) - (a.id_contrato ?? 0);
      });
  }, [rows, searchTerm]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      detailRequestIdRef.current += 1;
      setSelectedContractId(null);
      setDetailCuotas([]);
      setDetailPagos([]);
      setDetailAplicaciones([]);
      setDetailCargos([]);
      setDetailCalculosMora([]);
      setDetailContractId(null);
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
      setDetailContractId(null);
      return;
    }
    void loadDetail(selectedContractId);
    return () => {
      detailRequestIdRef.current += 1;
    };
  }, [loadDetail, selectedContractId]);

  useEffect(() => {
    if (paymentOpen && paymentContractId !== selectedContractId) {
      setPaymentOpen(false);
      setPaymentContractId(null);
      setPaymentForm(getInitialPaymentForm());
    }
  }, [paymentContractId, paymentOpen, selectedContractId]);

  const selectedRow = useMemo(
    () =>
      rows.find((row) => row.id_contrato === selectedContractId) ??
      filteredRows.find((row) => row.id_contrato === selectedContractId) ??
      null,
    [filteredRows, rows, selectedContractId],
  );

  const alertBuckets = useMemo(() => {
    const base = rows
      .filter(
        (row) =>
          row.id_contrato !== null &&
          row.proxima_fecha_vencimiento &&
          row.configuracion_completa,
      )
      .map((row) => {
        const nextMaintenanceDate = row.proxima_fecha_vencimiento;
        const dias = getDaysUntilDate(nextMaintenanceDate);
        const monthsUntil = getMonthsUntilDate(nextMaintenanceDate);
        if (
          dias === null ||
          monthsUntil === null ||
          row.id_contrato === null ||
          !nextMaintenanceDate
        ) {
          return null;
        }

        return {
          idContrato: row.id_contrato,
          clienteNombre: row.cliente_nombre || "Cliente sin nombre",
          numeroFormulario: row.numero_formulario,
          numeroContrato: row.numero_contrato,
          proximaFecha: nextMaintenanceDate,
          dias,
          monthsUntil,
          monto: row.total_pendiente ?? row.monto_mantenimiento_anual ?? 0,
        } satisfies MaintenanceAlert;
      })
      .filter((row): row is MaintenanceAlert => row !== null);

    return {
      "1m": base
        .filter((row) => row.monthsUntil === 1)
        .sort((a, b) => a.dias - b.dias),
      "2m": base
        .filter((row) => row.monthsUntil === 2)
        .sort((a, b) => a.dias - b.dias),
      "3m": base
        .filter((row) => row.monthsUntil === 3)
        .sort((a, b) => a.dias - b.dias),
    };
  }, [rows]);

  const dashboardSummary = useMemo(() => {
    return {
      totalContratos: filteredRows.length,
      configurados: filteredRows.filter((row) => row.configuracion_completa).length,
      conVencidas: filteredRows.filter(
        (row) =>
          (row.cuotas_vencidas ?? 0) > 0 || (row.mora_pendiente ?? 0) > 0,
      ).length,
      montoVencido: filteredRows.reduce(
        (acc, row) => acc + (row.monto_vencido ?? 0),
        0,
      ),
      totalPendiente: filteredRows.reduce(
        (acc, row) => acc + (row.total_pendiente ?? 0),
        0,
      ),
      moraPendiente: filteredRows.reduce(
        (acc, row) => acc + (row.mora_pendiente ?? 0),
        0,
      ),
      totalPendienteConMora: filteredRows.reduce(
        (acc, row) =>
          acc +
          (row.total_pendiente_con_mora ??
            (row.total_pendiente ?? 0) + (row.mora_pendiente ?? 0)),
        0,
      ),
    };
  }, [filteredRows]);

  const paymentApplicationsById = useMemo(() => {
    const map = new Map<number, MantenimientoPagoAplicacionRow[]>();
    detailAplicaciones.forEach((application) => {
      const current = map.get(application.id_pago_mantenimiento) ?? [];
      current.push(application);
      map.set(application.id_pago_mantenimiento, current);
    });
    return map;
  }, [detailAplicaciones]);

  const paymentDisplayNumberById = useMemo(() => {
    const map = new Map<number, number>();
    [...detailPagos]
      .sort((a, b) => {
        const aTime = new Date(a.fecha_pago).getTime();
        const bTime = new Date(b.fecha_pago).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return a.id_pago_mantenimiento - b.id_pago_mantenimiento;
      })
      .forEach((pago, index) => {
        map.set(pago.id_pago_mantenimiento, index + 1);
      });
    return map;
  }, [detailPagos]);

  const cuotasById = useMemo(() => {
    const map = new Map<number, ControlMantenimientoCuotaRow>();
    detailCuotas.forEach((cuota) => {
      if (cuota.id_cuota_mantenimiento !== null) {
        map.set(cuota.id_cuota_mantenimiento, cuota);
      }
    });
    return map;
  }, [detailCuotas]);

  const cargosById = useMemo(() => {
    const map = new Map<number, MantenimientoCargoRow>();
    detailCargos.forEach((cargo) => {
      map.set(cargo.id_cargo_mantenimiento, cargo);
    });
    return map;
  }, [detailCargos]);

  const calculosByCargoId = useMemo(() => {
    const map = new Map<number, MantenimientoMoraCalculoRow>();
    detailCalculosMora.forEach((calculo) => {
      if (calculo.id_cargo_mantenimiento !== null) {
        map.set(calculo.id_cargo_mantenimiento, calculo);
      }
    });
    return map;
  }, [detailCalculosMora]);

  const moratorySummary = useMemo(() => {
    const generated = detailCargos.reduce(
      (acc, cargo) =>
        cargo.estado === "ANULADO" ? acc : acc + (cargo.monto_original ?? 0),
      0,
    );
    const paid = detailCargos.reduce(
      (acc, cargo) =>
        cargo.estado === "ANULADO" ? acc : acc + (cargo.monto_pagado ?? 0),
      0,
    );
    const pending = detailCargos.reduce(
      (acc, cargo) =>
        cargo.estado === "ANULADO"
          ? acc
          : acc +
            Math.max((cargo.monto_original ?? 0) - (cargo.monto_pagado ?? 0), 0),
      0,
    );

    return {
      generated,
      paid,
      pending,
      nextCalculationDate: selectedRow?.proxima_fecha_calculo_mora ?? null,
    };
  }, [detailCargos, selectedRow?.proxima_fecha_calculo_mora]);

  const currentMaintenanceCharges = useMemo(
    () =>
      detailCuotas
        .filter(
          (cuota) =>
            cuota.estado !== "PAGADA" &&
            cuota.estado !== "ANULADA" &&
            (cuota.monto_programado ?? 0) - (cuota.monto_pagado ?? 0) > 0.009,
        )
        .sort((a, b) => {
          const aTime =
            parseCalendarDate(a.fecha_vencimiento)?.getTime() ??
            Number.MAX_SAFE_INTEGER;
          const bTime =
            parseCalendarDate(b.fecha_vencimiento)?.getTime() ??
            Number.MAX_SAFE_INTEGER;
          return (
            aTime - bTime ||
            Number(a.numero_periodo ?? 0) - Number(b.numero_periodo ?? 0)
          );
        })
        .slice(0, 1),
    [detailCuotas],
  );

  const selectedPendingMaintenance = useMemo(() => {
    return currentMaintenanceCharges.reduce(
      (acc, cuota) => {
        const pendiente = Math.max(
          (cuota.monto_programado ?? 0) - (cuota.monto_pagado ?? 0),
          0,
        );
        acc.total += pendiente;
        return acc;
      },
      { total: 0 },
    );
  }, [currentMaintenanceCharges]);

  const hasPendingMaintenance = selectedPendingMaintenance.total > 0.009;
  const hasPendingMora = moratorySummary.pending > 0.009;
  const detailMatchesSelection =
    detailContractId !== null && detailContractId === selectedRow?.id_contrato;

  const refreshSelected = useCallback(async () => {
    const contractIdToRefresh = selectedContractId;
    await loadResumen();
    if (
      contractIdToRefresh !== null &&
      selectedContractIdRef.current === contractIdToRefresh
    ) {
      await loadDetail(contractIdToRefresh);
    }
  }, [loadDetail, loadResumen, selectedContractId]);

  const exportSelectedMaintenanceDetail = useCallback(async () => {
    if (!selectedRow || !detailMatchesSelection) return;

    const activeRowCount =
      selectedDetailTab === "cuotas"
        ? currentMaintenanceCharges.length
        : selectedDetailTab === "pagos"
          ? detailPagos.length
          : detailCalculosMora.length;
    if (activeRowCount === 0) {
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
        { label: "Busqueda", value: searchTerm.trim() || "Sin busqueda" },
      ];

      if (selectedDetailTab === "cuotas") {
        const columns: ReportColumn<ControlMantenimientoCuotaRow>[] = [
          {
            id: "periodo",
            header: "Periodo",
            getValue: (row) => Number(row.numero_periodo ?? 0),
            type: "number",
            align: "right",
          },
          {
            id: "inicio",
            header: "Inicio",
            getValue: (row) => parseCalendarDate(row.fecha_inicio_periodo),
            formatValue: (_value, row) => formatDate(row.fecha_inicio_periodo),
            type: "date",
          },
          {
            id: "fin",
            header: "Fin",
            getValue: (row) => parseCalendarDate(row.fecha_fin_periodo),
            formatValue: (_value, row) => formatDate(row.fecha_fin_periodo),
            type: "date",
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
            getValue: (row) => row.estado || "PENDIENTE",
            type: "text",
          },
          {
            id: "monto",
            header: "Monto",
            getValue: (row) => Number(row.monto_programado ?? 0),
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
                Number(row.monto_programado ?? 0) - Number(row.monto_pagado ?? 0),
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
          title: `Proximo cobro de mantenimiento - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Proximo cobro",
          fileBaseName: "Control_Mantenimiento_Proximo_Cobro",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: currentMaintenanceCharges,
        } satisfies ReportPayload<ControlMantenimientoCuotaRow>);
      } else if (selectedDetailTab === "pagos") {
        type PaymentExportRow = MantenimientoPagoRow & {
          displayNumber: number;
          aplicacionesTexto: string;
          principalAplicado: number;
          moraAplicada: number;
        };

        const paymentRows: PaymentExportRow[] = detailPagos.map((pago) => {
          const aplicaciones =
            paymentApplicationsById.get(pago.id_pago_mantenimiento) ?? [];
          const principalAplicado = aplicaciones.reduce(
            (total, application) =>
              application.id_cuota_mantenimiento !== null
                ? total + application.monto_aplicado
                : total,
            0,
          );
          const moraAplicada = aplicaciones.reduce(
            (total, application) =>
              application.id_cargo_mantenimiento !== null
                ? total + application.monto_aplicado
                : total,
            0,
          );
          return {
            ...pago,
            principalAplicado,
            moraAplicada,
            displayNumber:
              paymentDisplayNumberById.get(pago.id_pago_mantenimiento) ??
              pago.id_pago_mantenimiento,
            aplicacionesTexto:
              aplicaciones
                .map((application) => {
                  if (application.id_cuota_mantenimiento !== null) {
                    const cuota = cuotasById.get(
                      application.id_cuota_mantenimiento,
                    );
                    return `Periodo ${cuota?.numero_periodo ?? "-"}: ${formatCurrency(
                      application.monto_aplicado,
                    )}`;
                  }

                  if (application.id_cargo_mantenimiento !== null) {
                    const cargo = cargosById.get(
                      application.id_cargo_mantenimiento,
                    );
                    const calculo = calculosByCargoId.get(
                      application.id_cargo_mantenimiento,
                    );
                    return `Mora ${formatDate(
                      calculo?.periodo_mora ?? cargo?.fecha_vencimiento,
                    )}: ${formatCurrency(application.monto_aplicado)}`;
                  }

                  return `Aplicacion: ${formatCurrency(application.monto_aplicado)}`;
                })
                .join(" | ") || "Sin detalle de aplicaciones",
          };
        });

        const columns: ReportColumn<PaymentExportRow>[] = [
          {
            id: "pago",
            header: "Pago",
            getValue: (row) => `Pago #${row.displayNumber}`,
            type: "text",
          },
          {
            id: "tipo",
            header: "Tipo",
            getValue: (row) =>
              row.tipo_pago === "MORA" ? "Pago de mora" : "Mantenimiento",
            type: "text",
          },
          {
            id: "estado",
            header: "Estado",
            getValue: (row) => row.estado,
            type: "text",
          },
          {
            id: "fecha",
            header: "Fecha",
            getValue: (row) => parseCalendarDate(row.fecha_pago),
            formatValue: (_value, row) => formatDate(row.fecha_pago),
            type: "date",
          },
          {
            id: "metodo",
            header: "Metodo",
            getValue: (row) => row.metodo_pago || "",
            type: "text",
          },
          {
            id: "principal_aplicado",
            header: "Principal aplicado",
            getValue: (row) => row.principalAplicado,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "mora_aplicada",
            header: "Mora aplicada",
            getValue: (row) => row.moraAplicada,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
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
          title: `Pagos de mantenimiento - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Pagos mantenimiento",
          fileBaseName: "Control_Mantenimiento_Pagos",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: paymentRows,
        } satisfies ReportPayload<PaymentExportRow>);
      } else {
        type MoraExportRow = MantenimientoMoraCalculoRow & {
          montoPagado: number;
          montoPendiente: number;
          estadoVisible: string;
        };

        const moraRows: MoraExportRow[] = detailCalculosMora.map((calculo) => {
          const cargo =
            calculo.id_cargo_mantenimiento !== null
              ? cargosById.get(calculo.id_cargo_mantenimiento)
              : undefined;
          const isAnnulled =
            calculo.estado === "ANULADO" || cargo?.estado === "ANULADO";
          const montoPagado = cargo?.monto_pagado ?? 0;
          return {
            ...calculo,
            montoPagado,
            montoPendiente: isAnnulled
              ? 0
              : Math.max((cargo?.monto_original ?? calculo.monto_generado) - montoPagado, 0),
            estadoVisible: isAnnulled
              ? "ANULADO"
              : cargo?.estado ?? calculo.estado,
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
            id: "corte",
            header: "Fecha de corte",
            getValue: (row) => parseCalendarDate(row.fecha_corte),
            formatValue: (_value, row) => formatDate(row.fecha_corte),
            type: "date",
          },
          {
            id: "base",
            header: "Principal pendiente usado como base",
            getValue: (row) => Number(row.base_principal_pendiente ?? 0),
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
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
            header: "Mora pagada",
            getValue: (row) => row.montoPagado,
            formatValue: (value) => formatCurrency(Number(value ?? 0)),
            type: "currency",
            align: "right",
            total: "sum",
          },
          {
            id: "pendiente",
            header: "Mora pendiente",
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
          title: `Mora de mantenimiento - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Mora mantenimiento",
          fileBaseName: "Control_Mantenimiento_Mora",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: moraRows,
        } satisfies ReportPayload<MoraExportRow>);
      }

      toast.success("Excel generado correctamente");
    } catch (error) {
      console.error("Error exportando mantenimiento a Excel", error);
      toast.error(getErrorMessage(error, "No se pudo generar el Excel"));
    } finally {
      setExportingExcel(false);
    }
  }, [
    calculosByCargoId,
    cargosById,
    cuotasById,
    currentMaintenanceCharges,
    detailCalculosMora,
    detailMatchesSelection,
    detailPagos,
    paymentApplicationsById,
    paymentDisplayNumberById,
    role,
    searchTerm,
    selectedDetailTab,
    selectedRow,
    user?.email,
  ]);

  const openPaymentDialog = useCallback(
    (kind: MaintenancePaymentKind) => {
      if (!selectedRow?.id_contrato || !detailMatchesSelection) return;
      const amount =
        kind === "MORA"
          ? moratorySummary.pending
          : selectedPendingMaintenance.total;
      setPaymentKind(kind);
      setPaymentContractId(selectedRow.id_contrato);
      setPaymentForm({
        ...getInitialPaymentForm(),
        montoTotal: amount > 0 ? String(amount) : "",
      });
      setPaymentOpen(true);
    },
    [
      detailMatchesSelection,
      moratorySummary.pending,
      selectedPendingMaintenance.total,
      selectedRow?.id_contrato,
    ],
  );

  const paymentContextMatchesSelection =
    paymentContractId !== null &&
    paymentContractId === selectedRow?.id_contrato &&
    detailMatchesSelection;

  const handleRegisterPayment = useCallback(async () => {
    if (!selectedRow?.id_contrato || !paymentContextMatchesSelection) return;

    const montoTotal = Number(paymentForm.montoTotal);
    if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
      toast.error("Ingresa un monto valido para el pago");
      return;
    }

    if (!paymentForm.fechaPago) {
      toast.error("Debes indicar la fecha del pago");
      return;
    }

    const saldoAplicable =
      paymentKind === "MORA"
        ? moratorySummary.pending
        : selectedPendingMaintenance.total;
    if (montoTotal - saldoAplicable > 0.009) {
      toast.error(
        paymentKind === "MORA"
          ? "El pago no puede superar la mora de mantenimiento pendiente"
          : "El pago no puede superar el principal de mantenimiento pendiente",
      );
      return;
    }

    setRegisteringPayment(true);
    try {
      const rpcName =
        paymentKind === "MORA"
          ? "registrar_pago_mora_mantenimiento"
          : "registrar_pago_mantenimiento";
      const { error } = await supabase.rpc(
        rpcName,
        {
          p_id_contrato: selectedRow.id_contrato,
          p_monto_total: montoTotal,
          p_fecha_pago: toPaymentTimestamp(paymentForm.fechaPago),
          p_metodo_pago: paymentForm.metodoPago || null,
          p_referencia: paymentForm.referencia || null,
          p_observacion: paymentForm.observacion || null,
          p_usuario: user?.email ?? role ?? "usuario",
          p_idempotency_key: paymentForm.idempotencyKey,
        },
      );

      if (error) {
        throw error;
      }

      toast.success(
        paymentKind === "MORA"
          ? "Pago de mora de mantenimiento registrado correctamente"
          : "Pago de mantenimiento registrado correctamente",
      );
      setPaymentOpen(false);
      setPaymentContractId(null);
      setPaymentForm(getInitialPaymentForm());
      await refreshSelected();
    } catch (error) {
      console.error(
        `Error registrando pago de ${paymentKind.toLowerCase()} de mantenimiento`,
        error,
      );
      toast.error(
        getErrorMessage(
          error,
          paymentKind === "MORA"
            ? "No se pudo registrar el pago de mora de mantenimiento"
            : "No se pudo registrar el pago de mantenimiento",
        ),
      );
    } finally {
      setRegisteringPayment(false);
    }
  }, [
    moratorySummary.pending,
    paymentForm,
    paymentKind,
    paymentContextMatchesSelection,
    refreshSelected,
    role,
    selectedPendingMaintenance.total,
    selectedRow,
    user?.email,
  ]);

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
                Control de mantenimiento
              </h1>
              <p className="text-sm text-muted-foreground">
                Un cobro anual vigente por contrato, renovado al completar cada pago.
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
              disabled={loading || detailLoading || syncing}
            >
              <RefreshCw
                className={cn(
                  "mr-2 h-4 w-4",
                  (loading || detailLoading || syncing) && "animate-spin",
                )}
              />
              Actualizar
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            title="Contratos elegibles"
            value={String(dashboardSummary.totalContratos)}
            hint="Contratos activos con lote o cenizario."
          />
          <SummaryMetricCard
            title="Configurados"
            value={String(dashboardSummary.configurados)}
            hint="Con monto anual y fecha del primer cobro."
          />
          <SummaryMetricCard
            title="Con deuda vencida"
            value={String(dashboardSummary.conVencidas)}
            hint="Con principal vencido o mora pendiente."
          />
          <SummaryMetricCard
            title="Monto vencido"
            value={formatCurrency(dashboardSummary.montoVencido)}
            hint="Pendiente del cobro anual vencido."
          />
          <SummaryMetricCard
            title="Principal pendiente"
            value={formatCurrency(dashboardSummary.totalPendiente)}
            hint="Una anualidad abierta por contrato."
          />
          <SummaryMetricCard
            title="Mora pendiente"
            value={formatCurrency(dashboardSummary.moraPendiente)}
            hint="Interes moratorio de mantenimiento sin pagar."
          />
          <SummaryMetricCard
            title="Total con mora"
            value={formatCurrency(dashboardSummary.totalPendienteConMora)}
            hint="Principal de mantenimiento mas mora pendiente."
          />
        </div>

        <Card className="border-border/70 bg-surface shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Alertas de mantenimiento</CardTitle>
            <CardDescription>
              Contratos cuyo proximo cobro anual vence en los proximos 1, 2 o 3 meses calendario.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={selectedAlertTab}
              onValueChange={(value) =>
                setSelectedAlertTab(value as MaintenanceAlertCategory)
              }
              className="w-full"
            >
              <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
                <TabsTrigger value="1m">
                  Vence en 1 mes ({alertBuckets["1m"].length})
                </TabsTrigger>
                <TabsTrigger value="2m">
                  Vence en 2 meses ({alertBuckets["2m"].length})
                </TabsTrigger>
                <TabsTrigger value="3m">
                  Vence en 3 meses ({alertBuckets["3m"].length})
                </TabsTrigger>
              </TabsList>

              {(["1m", "2m", "3m"] as MaintenanceAlertCategory[]).map(
                (category) => (
                  <TabsContent key={category} value={category}>
                    {alertBuckets[category].length === 0 ? (
                      <EmptyPanel
                        title="Sin alertas en este rango"
                        description="No hay contratos con un cobro anual dentro de este periodo."
                      />
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {alertBuckets[category].map((alert) => (
                          <button
                            key={`${category}-${alert.idContrato}`}
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
                                Proximo cobro: {formatDate(alert.proximaFecha)}
                              </p>
                              <p className="text-muted-foreground">
                                Pendiente anual: {formatCurrency(alert.monto)}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                ),
              )}
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="border-border/70 bg-surface shadow-sm">
            <CardHeader className="space-y-4">
              <div>
                <CardTitle className="text-xl">Contratos</CardTitle>
                <CardDescription>
                  Selecciona un contrato para revisar su proximo cobro anual.
                </CardDescription>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por cliente o formulario"
                  className="pl-9"
                />
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
                  description="No se encontraron contratos con los filtros actuales."
                />
              ) : (
                <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                  {filteredRows.map((row) => (
                    <button
                      key={row.id_contrato ?? `m-${row.numero_contrato}`}
                      type="button"
                      onClick={() => setSelectedContractId(row.id_contrato)}
                      className={cn(
                        "w-full rounded-xl border px-4 py-4 text-left transition-all",
                        row.id_contrato === selectedContractId
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
                            className={
                              row.configuracion_completa
                                ? "bg-primary/10 text-primary hover:bg-primary/10"
                                : "bg-slate-100 text-slate-800 hover:bg-slate-100"
                            }
                          >
                            {row.configuracion_completa
                              ? "Configurado"
                              : "Config pendiente"}
                          </Badge>
                          {(row.cuotas_vencidas ?? 0) > 0 && (
                            <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                              {(row.cuotas_vencidas ?? 0)} vencida
                              {(row.cuotas_vencidas ?? 0) === 1 ? "" : "s"}
                            </Badge>
                          )}
                          {(row.mora_pendiente ?? 0) > 0 && (
                            <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                              Mora {formatCurrency(row.mora_pendiente)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Proximo cobro
                          </p>
                          <p className="font-medium text-foreground">
                            {formatDate(row.proxima_fecha_vencimiento)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Monto anual
                          </p>
                          <p className="font-medium text-foreground">
                            {formatCurrency(row.monto_mantenimiento_anual)}
                          </p>
                        </div>
                        <div className="col-span-2 border-t border-border/60 pt-2">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Total pendiente con mora
                          </p>
                          <p className="font-medium text-foreground">
                            {formatCurrency(
                              row.total_pendiente_con_mora ??
                                (row.total_pendiente ?? 0) +
                                  (row.mora_pendiente ?? 0),
                            )}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
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
                    description="Aqui veras el proximo cobro y los pagos de mantenimiento."
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
                          className={
                            selectedRow.configuracion_completa
                              ? "bg-primary/10 text-primary hover:bg-primary/10"
                              : "bg-slate-100 text-slate-800 hover:bg-slate-100"
                          }
                        >
                          {selectedRow.configuracion_completa
                            ? "Configurado"
                            : "Config pendiente"}
                        </Badge>
                        {(selectedRow.mora_pendiente ?? 0) > 0 && (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                            Mora pendiente
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm">
                        {formatContractDisplayLabel(selectedRow, {
                          fallback: "Formulario pendiente",
                        })}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void refreshSelected()}
                        disabled={syncing || detailLoading}
                      >
                        <RefreshCw
                          className={cn(
                            "mr-2 h-4 w-4",
                            (syncing || detailLoading) && "animate-spin",
                          )}
                        />
                        Sincronizar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openPaymentDialog("CUOTA")}
                        disabled={
                          detailLoading ||
                          !detailMatchesSelection ||
                          !selectedRow.configuracion_completa ||
                          !hasPendingMaintenance
                        }
                      >
                        <DollarSign className="mr-2 h-4 w-4" />
                        Pago de mantenimiento
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openPaymentDialog("MORA")}
                        disabled={
                          detailLoading ||
                          !detailMatchesSelection ||
                          !selectedRow.configuracion_completa ||
                          !hasPendingMora
                        }
                        title={
                          !hasPendingMora
                            ? "El contrato no tiene mora de mantenimiento pendiente"
                            : undefined
                        }
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        Pago de mora
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Primer cobro registrado
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatDate(selectedRow.fecha_inicio_mantenimiento)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Monto anual
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedRow.monto_mantenimiento_anual)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Proximo cobro
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatDate(selectedRow.proxima_fecha_vencimiento)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Principal pendiente
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedPendingMaintenance.total)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                        <p className="text-xs uppercase tracking-wide text-rose-800">
                          Mora pendiente
                        </p>
                        <p className="mt-1 text-xl font-semibold text-rose-900">
                          {formatCurrency(moratorySummary.pending)}
                        </p>
                        <p className="mt-1 text-xs text-rose-800/80">
                          Proximo corte: {formatDate(
                            moratorySummary.nextCalculationDate,
                          )}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Total pendiente con mora
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(
                            selectedPendingMaintenance.total +
                              moratorySummary.pending,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Info className="h-4 w-4 shrink-0" />
                          <p className="font-medium">Regla de interés moratorio</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-sky-800 hover:bg-sky-100 hover:text-sky-950"
                          onClick={() => setMoratoryInfoOpen(true)}
                        >
                          Ver detalles
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-sky-800/80">
                        El cálculo completo y sus ejemplos están disponibles en la
                        ventana de información.
                      </p>
                    </div>

                    {!selectedRow.configuracion_completa && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <p>
                            Este contrato necesita monto anual y fecha del primer
                            cobro de mantenimiento.
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-surface shadow-sm">
                  <CardHeader className="gap-3 pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">Detalle de mantenimiento</CardTitle>
                      <CardDescription>
                        Exporta la pestaña activa del contrato seleccionado.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void exportSelectedMaintenanceDetail()}
                      disabled={
                        detailLoading ||
                        exportingExcel ||
                        !detailMatchesSelection ||
                        !selectedRow.configuracion_completa ||
                        (selectedDetailTab === "cuotas"
                          ? currentMaintenanceCharges.length === 0
                          : selectedDetailTab === "pagos"
                            ? detailPagos.length === 0
                            : detailCalculosMora.length === 0)
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
                    ) : !detailMatchesSelection ? (
                      <EmptyPanel
                        title="Detalle no disponible"
                        description="Actualiza el contrato seleccionado para volver a cargar su informacion financiera."
                      />
                    ) : !selectedRow.configuracion_completa ? (
                      <EmptyPanel
                        title="Configuracion pendiente"
                        description="Completa la fecha del primer cobro y el monto anual para habilitar este modulo."
                      />
                    ) : (
                      <Tabs
                        value={selectedDetailTab}
                        onValueChange={(value) =>
                          setSelectedDetailTab(value as MaintenanceDetailTab)
                        }
                        className="w-full"
                      >
                        <TabsList className="grid h-auto w-full grid-cols-3">
                          <TabsTrigger value="cuotas">Proximo cobro</TabsTrigger>
                          <TabsTrigger value="pagos">Pagos</TabsTrigger>
                          <TabsTrigger value="mora">Mora</TabsTrigger>
                        </TabsList>

                        <TabsContent value="cuotas">
                          {currentMaintenanceCharges.length === 0 ? (
                            <EmptyPanel
                              title="Sin cobro pendiente"
                              description="Usa el boton Sincronizar si acabas de configurar el mantenimiento."
                            />
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Periodo</TableHead>
                                  <TableHead>Inicio</TableHead>
                                  <TableHead>Fin</TableHead>
                                  <TableHead>Vencimiento</TableHead>
                                  <TableHead>Estado</TableHead>
                                  <TableHead>Monto</TableHead>
                                  <TableHead>Pagado</TableHead>
                                  <TableHead>Pendiente</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {currentMaintenanceCharges.map((cuota) => {
                                  const pendiente = Math.max(
                                    (cuota.monto_programado ?? 0) -
                                      (cuota.monto_pagado ?? 0),
                                    0,
                                  );
                                  return (
                                    <TableRow
                                      key={cuota.id_cuota_mantenimiento ?? cuota.numero_periodo}
                                    >
                                      <TableCell className="font-medium">
                                        {cuota.numero_periodo ?? "-"}
                                      </TableCell>
                                      <TableCell>
                                        {formatDate(cuota.fecha_inicio_periodo)}
                                      </TableCell>
                                      <TableCell>
                                        {formatDate(cuota.fecha_fin_periodo)}
                                      </TableCell>
                                      <TableCell>
                                        {formatDate(cuota.fecha_vencimiento)}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          className={getStatusBadgeClass(
                                            cuota.estado || "PENDIENTE",
                                          )}
                                        >
                                          {cuota.estado || "PENDIENTE"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(cuota.monto_programado)}
                                      </TableCell>
                                      <TableCell>
                                        {formatCurrency(cuota.monto_pagado)}
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

                        <TabsContent value="pagos">
                          {detailPagos.length === 0 ? (
                            <EmptyPanel
                              title="Sin pagos registrados"
                              description="Aqui apareceran los pagos de principal y mora de mantenimiento."
                            />
                          ) : (
                            <div className="space-y-4">
                              {detailPagos.map((pago) => {
                                const aplicaciones =
                                  paymentApplicationsById.get(
                                    pago.id_pago_mantenimiento,
                                  ) ?? [];
                                const displayNumber =
                                  paymentDisplayNumberById.get(
                                    pago.id_pago_mantenimiento,
                                  ) ?? pago.id_pago_mantenimiento;

                                return (
                                  <div
                                    key={pago.id_pago_mantenimiento}
                                    className="rounded-xl border border-border/70 bg-background p-4"
                                  >
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="font-semibold text-foreground">
                                            Pago #{displayNumber}
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
                                              pago.tipo_pago === "MORA"
                                                ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
                                                : "bg-sky-100 text-sky-800 hover:bg-sky-100"
                                            }
                                          >
                                            {pago.tipo_pago === "MORA"
                                              ? "Mora"
                                              : "Mantenimiento"}
                                          </Badge>
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                          {formatDate(pago.fecha_pago)}
                                          {pago.metodo_pago
                                            ? ` - ${pago.metodo_pago}`
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
                                              application.id_cuota_mantenimiento !==
                                              null
                                                ? cuotasById.get(
                                                    application.id_cuota_mantenimiento,
                                                  )
                                                : undefined;
                                            const cargo =
                                              application.id_cargo_mantenimiento !==
                                              null
                                                ? cargosById.get(
                                                    application.id_cargo_mantenimiento,
                                                  )
                                                : undefined;
                                            const calculo =
                                              application.id_cargo_mantenimiento !==
                                              null
                                                ? calculosByCargoId.get(
                                                    application.id_cargo_mantenimiento,
                                                  )
                                                : undefined;
                                            const isMora = Boolean(cargo || calculo);
                                            return (
                                              <div
                                                key={
                                                  application.id_aplicacion_mantenimiento
                                                }
                                                className={cn(
                                                  "rounded-full border px-3 py-1 text-xs",
                                                  isMora
                                                    ? "border-rose-200 bg-rose-50 text-rose-800"
                                                    : "border-primary/20 bg-primary/5 text-primary",
                                                )}
                                              >
                                                {isMora
                                                  ? `Mora ${formatDate(
                                                      calculo?.periodo_mora ??
                                                        cargo?.fecha_vencimiento,
                                                    )}`
                                                  : `Periodo ${cuota?.numero_periodo ?? "-"}`}
                                                :{" "}
                                                {formatCurrency(
                                                  application.monto_aplicado,
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
                          <div className="mb-4 space-y-4">
                            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-900">
                              <p className="font-medium">
                                Interes moratorio de mantenimiento sin capitalizacion
                              </p>
                              <p className="mt-1 text-rose-800/80">
                                El cliente dispone de todo el mes de vencimiento para
                                pagar. Cada primer dia de mes posterior se genera un 2 %
                                solamente sobre el principal que continue pendiente; la
                                mora acumulada nunca forma parte de la base.
                              </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Mora generada
                                </p>
                                <p className="mt-1 font-semibold">
                                  {formatCurrency(moratorySummary.generated)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Mora pagada
                                </p>
                                <p className="mt-1 font-semibold">
                                  {formatCurrency(moratorySummary.paid)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                                <p className="text-xs uppercase tracking-wide text-rose-800">
                                  Mora pendiente
                                </p>
                                <p className="mt-1 font-semibold text-rose-900">
                                  {formatCurrency(moratorySummary.pending)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {detailCalculosMora.length === 0 ? (
                            <EmptyPanel
                              title="No hay calculos moratorios"
                              description="El mantenimiento no ha alcanzado un corte mensual con principal pendiente sujeto a mora."
                            />
                          ) : (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Periodo</TableHead>
                                    <TableHead>Corte</TableHead>
                                    <TableHead>Principal base</TableHead>
                                    <TableHead>Tasa</TableHead>
                                    <TableHead>Generado</TableHead>
                                    <TableHead>Pagado</TableHead>
                                    <TableHead>Pendiente</TableHead>
                                    <TableHead>Estado</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {detailCalculosMora.map((calculo) => {
                                    const cargo =
                                      calculo.id_cargo_mantenimiento !== null
                                        ? cargosById.get(
                                            calculo.id_cargo_mantenimiento,
                                          )
                                        : undefined;
                                    const isAnnulled =
                                      calculo.estado === "ANULADO" ||
                                      cargo?.estado === "ANULADO";
                                    const pagado = cargo?.monto_pagado ?? 0;
                                    const pendiente = isAnnulled
                                      ? 0
                                      : Math.max(
                                          (cargo?.monto_original ??
                                            calculo.monto_generado) - pagado,
                                          0,
                                        );
                                    const estado = isAnnulled
                                      ? "ANULADO"
                                      : cargo?.estado ?? calculo.estado;

                                    return (
                                      <TableRow
                                        key={calculo.id_calculo_mora_mantenimiento}
                                      >
                                        <TableCell className="font-medium">
                                          {formatDate(calculo.periodo_mora)}
                                        </TableCell>
                                        <TableCell>
                                          {formatDate(calculo.fecha_corte)}
                                        </TableCell>
                                        <TableCell>
                                          {formatCurrency(
                                            calculo.base_principal_pendiente,
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {formatFractionAsPercent(
                                            calculo.tasa_mensual,
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {formatCurrency(calculo.monto_generado)}
                                        </TableCell>
                                        <TableCell>{formatCurrency(pagado)}</TableCell>
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
                      </Tabs>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={moratoryInfoOpen} onOpenChange={setMoratoryInfoOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-sky-700" />
              Regla de interés moratorio
            </DialogTitle>
            <DialogDescription>
              La mora de mantenimiento se calcula por mes calendario y se registra
              separada del principal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm text-foreground">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sky-950">
              <p className="font-medium">¿Cuándo se genera?</p>
              <p className="mt-1 text-sky-900/80">
                El cliente puede pagar durante todo el mes de vencimiento sin recargo.
                Si el principal continúa pendiente, el primer cargo se genera el día
                1 del mes siguiente.
              </p>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="font-medium">¿Sobre qué monto se calcula?</p>
              <p className="mt-1 text-muted-foreground">
                Se aplica el 2 % mensual únicamente sobre el principal pendiente de la
                anualidad. Los intereses moratorios acumulados nunca forman parte de
                la base y no generan nuevos intereses.
              </p>
            </div>

            <div className="rounded-lg border border-border/70 p-3">
              <p className="font-medium">Ejemplo</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Anualidad pendiente: ₡40.000.</li>
                <li>Primer día del mes siguiente: mora de ₡800 (2 %).</li>
                <li>Si no paga el mes siguiente, se generan otros ₡800 sobre los ₡40.000.</li>
                <li>La mora acumulada sería ₡1.600, sin capitalización.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => setMoratoryInfoOpen(false)}>
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open && !registeringPayment) {
            setPaymentContractId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {paymentKind === "MORA"
                ? "Registrar pago de mora de mantenimiento"
                : "Registrar pago de mantenimiento"}
            </DialogTitle>
            <DialogDescription>
              {paymentKind === "MORA"
                ? "Este ingreso se aplicara exclusivamente a la mora de mantenimiento pendiente."
                : "Este ingreso se aplicara exclusivamente al principal del cobro anual pendiente."}
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              paymentKind === "MORA"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-sky-200 bg-sky-50 text-sky-900",
            )}
          >
            <p className="text-xs uppercase tracking-wide opacity-80">
              Saldo disponible para este concepto
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatCurrency(
                paymentKind === "MORA"
                  ? moratorySummary.pending
                  : selectedPendingMaintenance.total,
              )}
            </p>
            <p className="mt-1 text-xs opacity-80">
              No se trasladara ningun remanente entre principal y mora.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mantenimiento-pago-monto">
                {paymentKind === "MORA"
                  ? "Monto de mora"
                  : "Monto de mantenimiento"}
              </Label>
              <Input
                id="mantenimiento-pago-monto"
                type="number"
                min="0"
                max={
                  paymentKind === "MORA"
                    ? moratorySummary.pending
                    : selectedPendingMaintenance.total
                }
                step="0.01"
                value={paymentForm.montoTotal}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    montoTotal: event.target.value,
                  }))
                }
                disabled={registeringPayment}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mantenimiento-pago-fecha">Fecha de pago</Label>
              <Input
                id="mantenimiento-pago-fecha"
                type="date"
                value={paymentForm.fechaPago}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    fechaPago: event.target.value,
                  }))
                }
                disabled={registeringPayment}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mantenimiento-pago-metodo">Metodo de pago</Label>
              <Select
                value={paymentForm.metodoPago}
                onValueChange={(value) =>
                  setPaymentForm((current) => ({
                    ...current,
                    metodoPago: value,
                  }))
                }
                disabled={registeringPayment}
              >
                <SelectTrigger id="mantenimiento-pago-metodo">
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
              <Label htmlFor="mantenimiento-pago-referencia">Referencia</Label>
              <Input
                id="mantenimiento-pago-referencia"
                value={paymentForm.referencia}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    referencia: event.target.value,
                  }))
                }
                disabled={registeringPayment}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="mantenimiento-pago-observacion">Observacion</Label>
              <Textarea
                id="mantenimiento-pago-observacion"
                rows={4}
                value={paymentForm.observacion}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    observacion: event.target.value,
                  }))
                }
                disabled={registeringPayment}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPaymentOpen(false);
                setPaymentContractId(null);
              }}
              disabled={registeringPayment}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleRegisterPayment()}
              disabled={
                registeringPayment ||
                !paymentContextMatchesSelection ||
                (paymentKind === "MORA"
                  ? moratorySummary.pending
                  : selectedPendingMaintenance.total) <= 0.009
              }
            >
              {registeringPayment && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {paymentKind === "MORA"
                ? "Registrar pago de mora"
                : "Registrar pago de mantenimiento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
