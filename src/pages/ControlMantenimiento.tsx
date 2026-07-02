import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  DollarSign,
  FileSpreadsheet,
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
};

type MantenimientoPagoAplicacionRow = {
  id_aplicacion_mantenimiento: number;
  id_pago_mantenimiento: number;
  id_cuota_mantenimiento: number;
  monto_aplicado: number;
  notas: string | null;
};

type PaymentFormState = {
  montoTotal: string;
  fechaPago: string;
  metodoPago: string;
  referencia: string;
  observacion: string;
};

type MaintenanceAlertCategory = "1m" | "2m" | "3m";
type MaintenanceDetailTab = "cuotas" | "pagos";

type MaintenanceAlert = {
  idContrato: number;
  clienteNombre: string;
  numeroFormulario: string | null;
  numeroContrato: string | null;
  proximaFecha: string;
  dias: number;
  monto: number;
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

function getInitialPaymentForm(): PaymentFormState {
  return {
    montoTotal: "",
    fechaPago: getTodayInputValue(),
    metodoPago: "",
    referencia: "",
    observacion: "",
  };
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
  const [detailCuotas, setDetailCuotas] = useState<ControlMantenimientoCuotaRow[]>([]);
  const [detailPagos, setDetailPagos] = useState<MantenimientoPagoRow[]>([]);
  const [detailAplicaciones, setDetailAplicaciones] = useState<
    MantenimientoPagoAplicacionRow[]
  >([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAlertTab, setSelectedAlertTab] =
    useState<MaintenanceAlertCategory>("1m");
  const [selectedDetailTab, setSelectedDetailTab] =
    useState<MaintenanceDetailTab>("cuotas");
  const [paymentOpen, setPaymentOpen] = useState(false);
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
      console.error("Error sincronizando cuotas de mantenimiento", error);
      toast.error(
        getErrorMessage(
          error,
          "No se pudieron sincronizar las cuotas de mantenimiento",
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

  const loadDetail = useCallback(async (contractId: number) => {
    setDetailLoading(true);
    try {
      const [cuotasRes, pagosRes] = await Promise.all([
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
      ]);

      if (cuotasRes.error) throw cuotasRes.error;
      if (pagosRes.error) throw pagosRes.error;

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
          (aplicacionesRes.data as MantenimientoPagoAplicacionRow[] | null) ?? [];
      }

      setDetailCuotas(
        (cuotasRes.data as ControlMantenimientoCuotaRow[] | null) ?? [],
      );
      setDetailPagos(pagos);
      setDetailAplicaciones(aplicaciones);
    } catch (error) {
      console.error("Error cargando detalle de mantenimiento", error);
      toast.error(
        getErrorMessage(
          error,
          "No se pudo cargar el detalle de mantenimiento",
        ),
      );
      setDetailCuotas([]);
      setDetailPagos([]);
      setDetailAplicaciones([]);
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
          Number((b.cuotas_vencidas ?? 0) > 0) -
          Number((a.cuotas_vencidas ?? 0) > 0);
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
      setSelectedContractId(null);
      setDetailCuotas([]);
      setDetailPagos([]);
      setDetailAplicaciones([]);
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
    if (!selectedContractId) return;
    void loadDetail(selectedContractId);
  }, [loadDetail, selectedContractId]);

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
        const dias = getDaysUntilDate(row.proxima_fecha_vencimiento);
        if (
          dias === null ||
          row.id_contrato === null ||
          !row.proxima_fecha_vencimiento
        ) {
          return null;
        }

        return {
          idContrato: row.id_contrato,
          clienteNombre: row.cliente_nombre || "Cliente sin nombre",
          numeroFormulario: row.numero_formulario,
          numeroContrato: row.numero_contrato,
          proximaFecha: row.proxima_fecha_vencimiento,
          dias,
          monto: row.monto_mantenimiento_anual ?? 0,
        } satisfies MaintenanceAlert;
      })
      .filter((row): row is MaintenanceAlert => row !== null);

    return {
      "1m": base
        .filter((row) => row.dias >= 1 && row.dias <= 30)
        .sort((a, b) => a.dias - b.dias),
      "2m": base
        .filter((row) => row.dias >= 31 && row.dias <= 60)
        .sort((a, b) => a.dias - b.dias),
      "3m": base
        .filter((row) => row.dias >= 61 && row.dias <= 90)
        .sort((a, b) => a.dias - b.dias),
    };
  }, [rows]);

  const dashboardSummary = useMemo(() => {
    return {
      totalContratos: filteredRows.length,
      configurados: filteredRows.filter((row) => row.configuracion_completa).length,
      conVencidas: filteredRows.filter((row) => (row.cuotas_vencidas ?? 0) > 0).length,
      montoVencido: filteredRows.reduce(
        (acc, row) => acc + (row.monto_vencido ?? 0),
        0,
      ),
      totalPendiente: filteredRows.reduce(
        (acc, row) => acc + (row.total_pendiente ?? 0),
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

  const selectedPendingMaintenance = useMemo(() => {
    return detailCuotas.reduce(
      (acc, cuota) => {
        if (cuota.estado === "PAGADA" || cuota.estado === "ANULADA") {
          return acc;
        }

        const pendiente = Math.max(
          (cuota.monto_programado ?? 0) - (cuota.monto_pagado ?? 0),
          0,
        );
        acc.total += pendiente;
        return acc;
      },
      { total: 0 },
    );
  }, [detailCuotas]);

  const refreshSelected = useCallback(async () => {
    await loadResumen();
    if (selectedContractId) {
      await loadDetail(selectedContractId);
    }
  }, [loadDetail, loadResumen, selectedContractId]);

  const exportSelectedMaintenanceDetail = useCallback(async () => {
    if (!selectedRow) return;

    const rowsToExport =
      selectedDetailTab === "cuotas" ? detailCuotas : detailPagos;
    if (rowsToExport.length === 0) {
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
          title: `Cuotas de mantenimiento - ${selectedRow.cliente_nombre || "Cliente"}`,
          sheetName: "Cuotas mantenimiento",
          fileBaseName: "Control_Mantenimiento_Cuotas",
          generatedAt: new Date(),
          generatedBy: user?.email ?? role ?? "No disponible",
          filters: baseFilters,
          columns,
          rows: detailCuotas,
        } satisfies ReportPayload<ControlMantenimientoCuotaRow>);
      } else {
        type PaymentExportRow = MantenimientoPagoRow & {
          displayNumber: number;
          aplicacionesTexto: string;
        };

        const paymentRows: PaymentExportRow[] = detailPagos.map((pago) => {
          const aplicaciones =
            paymentApplicationsById.get(pago.id_pago_mantenimiento) ?? [];
          return {
            ...pago,
            displayNumber:
              paymentDisplayNumberById.get(pago.id_pago_mantenimiento) ??
              pago.id_pago_mantenimiento,
            aplicacionesTexto:
              aplicaciones
                .map((application) => {
                  const cuota = cuotasById.get(application.id_cuota_mantenimiento);
                  return `Periodo ${cuota?.numero_periodo ?? "-"}: ${formatCurrency(
                    application.monto_aplicado,
                  )}`;
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
      }

      toast.success("Excel generado correctamente");
    } catch (error) {
      console.error("Error exportando mantenimiento a Excel", error);
      toast.error(getErrorMessage(error, "No se pudo generar el Excel"));
    } finally {
      setExportingExcel(false);
    }
  }, [
    cuotasById,
    detailCuotas,
    detailPagos,
    paymentApplicationsById,
    paymentDisplayNumberById,
    role,
    searchTerm,
    selectedDetailTab,
    selectedRow,
    user?.email,
  ]);

  const handleRegisterPayment = useCallback(async () => {
    if (!selectedRow?.id_contrato) return;

    const montoTotal = Number(paymentForm.montoTotal);
    if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
      toast.error("Ingresa un monto valido para el pago");
      return;
    }

    if (!paymentForm.fechaPago) {
      toast.error("Debes indicar la fecha del pago");
      return;
    }

    setRegisteringPayment(true);
    try {
      const { error } = await supabase.rpc(
        "registrar_pago_mantenimiento" as never,
        {
          p_id_contrato: selectedRow.id_contrato,
          p_monto_total: montoTotal,
          p_fecha_pago: toPaymentTimestamp(paymentForm.fechaPago),
          p_metodo_pago: paymentForm.metodoPago || null,
          p_referencia: paymentForm.referencia || null,
          p_observacion: paymentForm.observacion || null,
          p_usuario: user?.email ?? role ?? "usuario",
        } as never,
      );

      if (error) {
        throw error;
      }

      toast.success("Pago de mantenimiento registrado correctamente");
      setPaymentOpen(false);
      setPaymentForm(getInitialPaymentForm());
      await refreshSelected();
    } catch (error) {
      console.error("Error registrando pago de mantenimiento", error);
      toast.error(
        getErrorMessage(
          error,
          "No se pudo registrar el pago de mantenimiento",
        ),
      );
    } finally {
      setRegisteringPayment(false);
    }
  }, [paymentForm, refreshSelected, role, selectedRow, user]);

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
                Cuotas de mantenimiento
              </h1>
              <p className="text-sm text-muted-foreground">
                Control anual de mantenimiento para contratos activos con lotes y
                cenizarios.
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryMetricCard
            title="Contratos elegibles"
            value={String(dashboardSummary.totalContratos)}
            hint="Contratos activos con lote o cenizario."
          />
          <SummaryMetricCard
            title="Configurados"
            value={String(dashboardSummary.configurados)}
            hint="Con monto anual y fecha de inicio listos."
          />
          <SummaryMetricCard
            title="Con vencidas"
            value={String(dashboardSummary.conVencidas)}
            hint="Cuotas anuales con atraso."
          />
          <SummaryMetricCard
            title="Monto vencido"
            value={formatCurrency(dashboardSummary.montoVencido)}
            hint="Pendiente solo de cuotas vencidas."
          />
          <SummaryMetricCard
            title="Pendiente total"
            value={formatCurrency(dashboardSummary.totalPendiente)}
            hint="Suma de cuotas anuales aun no cubiertas."
          />
        </div>

        <Card className="border-border/70 bg-surface shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Alertas de mantenimiento</CardTitle>
            <CardDescription>
              Contratos cuya proxima cuota anual vence dentro de 1, 2 o 3 meses.
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
              <TabsList className="grid w-full grid-cols-3">
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
                        description="No hay contratos con proxima cuota anual dentro de este periodo."
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
                                Proxima cuota: {formatDate(alert.proximaFecha)}
                              </p>
                              <p className="text-muted-foreground">
                                Monto anual: {formatCurrency(alert.monto)}
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
                  Selecciona un contrato para revisar sus cuotas de mantenimiento.
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
                            Monto anual
                          </p>
                          <p className="font-medium text-foreground">
                            {formatCurrency(row.monto_mantenimiento_anual)}
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
                    description="Aqui veras las cuotas y pagos de mantenimiento."
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
                        onClick={() => {
                          setPaymentForm(getInitialPaymentForm());
                          setPaymentOpen(true);
                        }}
                        disabled={!selectedRow.configuracion_completa}
                      >
                        <DollarSign className="mr-2 h-4 w-4" />
                        Registrar pago
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Inicio mantenimiento
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
                          Proxima cuota
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatDate(selectedRow.proxima_fecha_vencimiento)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Pendiente total
                        </p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {formatCurrency(selectedPendingMaintenance.total)}
                        </p>
                      </div>
                    </div>

                    {!selectedRow.configuracion_completa && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <p>
                            Este contrato necesita monto anual y fecha de inicio
                            de mantenimiento para generar sus cuotas.
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
                        !selectedRow.configuracion_completa ||
                        (selectedDetailTab === "cuotas"
                          ? detailCuotas.length === 0
                          : detailPagos.length === 0)
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
                    ) : !selectedRow.configuracion_completa ? (
                      <EmptyPanel
                        title="Configuracion pendiente"
                        description="Completa fecha de inicio y monto anual para habilitar este modulo."
                      />
                    ) : (
                      <Tabs
                        value={selectedDetailTab}
                        onValueChange={(value) =>
                          setSelectedDetailTab(value as MaintenanceDetailTab)
                        }
                        className="w-full"
                      >
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="cuotas">Cuotas</TabsTrigger>
                          <TabsTrigger value="pagos">Pagos</TabsTrigger>
                        </TabsList>

                        <TabsContent value="cuotas">
                          {detailCuotas.length === 0 ? (
                            <EmptyPanel
                              title="Sin cuotas generadas"
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
                                {detailCuotas.map((cuota) => {
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
                              description="Aqui apareceran los pagos anuales de mantenimiento."
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
                                            const cuota = cuotasById.get(
                                              application.id_cuota_mantenimiento,
                                            );
                                            return (
                                              <div
                                                key={
                                                  application.id_aplicacion_mantenimiento
                                                }
                                                className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary"
                                              >
                                                Periodo {cuota?.numero_periodo ?? "-"}:{" "}
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
                      </Tabs>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar pago de mantenimiento</DialogTitle>
            <DialogDescription>
              El pago se aplicará a las cuotas anuales pendientes en orden
              cronologico.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mantenimiento-pago-monto">Monto total</Label>
              <Input
                id="mantenimiento-pago-monto"
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
              <Input
                id="mantenimiento-pago-metodo"
                value={paymentForm.metodoPago}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    metodoPago: event.target.value,
                  }))
                }
                placeholder="Transferencia, efectivo, deposito"
                disabled={registeringPayment}
              />
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
              onClick={() => setPaymentOpen(false)}
              disabled={registeringPayment}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleRegisterPayment()}
              disabled={registeringPayment}
            >
              {registeringPayment && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Registrar pago
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
