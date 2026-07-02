import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownUp,
  ArrowLeft,
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatContractDisplayLabel } from "@/lib/contract-display";
import {
  exportCsvReport,
  exportExcelReport,
  getFormattedCellValue,
  type ReportColumn,
  type ReportFilter,
  type ReportPayload,
} from "@/lib/report-export";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { Tables } from "@/integrations/supabase/types";

type EstadoContratoFilter = "VIGENTE" | "PRECONTRATO" | "FINALIZADO" | "FALLIDO" | "ANULADO" | "TODOS";
type ProductoFilter = "TODOS" | "LOTE" | "CENIZARIO" | "CREMACION" | "PAQUETE_FUNERARIO";
type BooleanFilter = "todos" | "si" | "no";
type SortColumn =
  | "cliente"
  | "fecha_firma"
  | "monto_contratado"
  | "total_pagado_periodo"
  | "saldo_pendiente"
  | "proximo_pago";
type SortDirection = "asc" | "desc";

type FiltersState = {
  fechaDesde: string;
  fechaHasta: string;
  estadoContrato: EstadoContratoFilter;
  cliente: string;
  idVendedor: string;
  tipoProducto: ProductoFilter;
  metodoPago: string;
  soloConVencidas: BooleanFilter;
  soloConSaldo: BooleanFilter;
};

type IngresosResumen = {
  contratos_filtrados: number;
  contratos_con_plan: number;
  contratos_con_vencidas: number;
  contratos_con_saldo: number;
  monto_total_contratado: number;
  total_recaudado_periodo: number;
  total_recaudado_historico: number;
  total_recaudado_contratos_periodo: number;
  mantenimiento_recaudado_periodo: number;
  capital_cobrado_periodo: number;
  interes_cobrado_periodo: number;
  otros_cobrados_periodo: number;
  saldo_pendiente_total: number;
  capital_pendiente: number;
  interes_pendiente: number;
  otros_pendientes: number;
  mantenimiento_pendiente: number;
  monto_vencido_total: number;
  total_pagos_periodo: number;
  promedio_ingreso_por_contrato: number;
  ingreso_mes_actual: number;
  ingreso_anio_actual: number;
};

type IngresosDetalleRow = {
  total_count: number;
  id_contrato: number;
  numero_contrato: string | null;
  numero_formulario: string | null;
  cliente_nombre: string | null;
  id_vendedor: number | null;
  vendedor_nombre: string | null;
  estado_contrato: string | null;
  fecha_firma: string | null;
  fecha_primera_cuota: string | null;
  fecha_finalizacion_plan: string | null;
  tipos_producto: string | null;
  monto_contratado: number | null;
  total_pagado_periodo: number | null;
  total_pagado_historico: number | null;
  total_pagado_contrato_periodo: number | null;
  mantenimiento_cobrado_periodo: number | null;
  capital_cobrado_periodo: number | null;
  interes_cobrado_periodo: number | null;
  otros_cobrados_periodo: number | null;
  saldo_pendiente_total: number | null;
  capital_pendiente: number | null;
  interes_pendiente: number | null;
  otros_pendientes: number | null;
  mantenimiento_pendiente: number | null;
  monto_vencido_total: number | null;
  cuotas_totales: number | null;
  cuotas_pagadas: number | null;
  cuotas_pendientes: number | null;
  cuotas_vencidas: number | null;
  mantenimiento_pendientes: number | null;
  mantenimiento_vencidas: number | null;
  proximo_pago: string | null;
  ultimo_pago: string | null;
  total_pagos_periodo: number | null;
  metodos_pago: string | null;
  tipo_plan: string | null;
};

type SerieMensualRow = {
  periodo: string;
  ingreso_contratos: number | null;
  ingreso_mantenimiento: number | null;
  ingreso_total: number | null;
  capital_cobrado: number | null;
  interes_cobrado: number | null;
  otros_cobrados: number | null;
  pagos_registrados: number | null;
};

type RpcArgs = {
  p_fecha_desde: string | null;
  p_fecha_hasta: string | null;
  p_estado_contrato: string | null;
  p_cliente: string | null;
  p_id_vendedor: number | null;
  p_tipo_producto: string | null;
  p_metodo_pago: string | null;
  p_solo_con_vencidas: boolean | null;
  p_solo_con_saldo: boolean | null;
};

type VendedorOption = Pick<Tables<"vendedor">, "id_vendedor" | "nombre_completo">;

type FilterOptionsResponse = {
  vendedores?: VendedorOption[];
  metodos_pago?: string[];
};

const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];

const REPORT_COLUMN_SORTS: Partial<Record<string, SortColumn>> = {
  contrato: "cliente",
  cliente: "cliente",
  fecha_firma: "fecha_firma",
  monto_contratado: "monto_contratado",
  pagado_periodo: "total_pagado_periodo",
  saldo_pendiente: "saldo_pendiente",
  proximo_pago: "proximo_pago",
};

const REPORT_COLUMN_WIDTHS: Record<string, string> = {
  contrato: "min-w-[150px]",
  cliente: "min-w-[180px]",
  asesor: "min-w-[150px]",
  fecha_firma: "min-w-[120px]",
  primera_cuota: "min-w-[120px]",
  tipo: "min-w-[140px]",
  monto_contratado: "min-w-[140px]",
  pagado_periodo: "min-w-[140px]",
  historico: "min-w-[130px]",
  saldo_pendiente: "min-w-[140px]",
  monto_vencido: "min-w-[130px]",
  proximo_pago: "min-w-[120px]",
  ultimo_pago: "min-w-[120px]",
};

function getTodayInputValue(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(today.getDate()).padStart(2, "0")}`;
}

function getYearStartInputValue(): string {
  const today = new Date();
  return `${today.getFullYear()}-01-01`;
}

function getInitialFilters(): FiltersState {
  return {
    fechaDesde: getYearStartInputValue(),
    fechaHasta: getTodayInputValue(),
    estadoContrato: "VIGENTE",
    cliente: "",
    idVendedor: "todos",
    tipoProducto: "TODOS",
    metodoPago: "todos",
    soloConVencidas: "todos",
    soloConSaldo: "todos",
  };
}

function toBooleanFilter(value: BooleanFilter): boolean | null {
  if (value === "si") return true;
  if (value === "no") return false;
  return null;
}

function buildRpcArgs(filters: FiltersState): RpcArgs {
  return {
    p_fecha_desde: filters.fechaDesde || null,
    p_fecha_hasta: filters.fechaHasta || null,
    p_estado_contrato: filters.estadoContrato === "TODOS" ? "TODOS" : filters.estadoContrato,
    p_cliente: filters.cliente.trim() || null,
    p_id_vendedor:
      filters.idVendedor === "todos" ? null : Number(filters.idVendedor),
    p_tipo_producto: filters.tipoProducto === "TODOS" ? null : filters.tipoProducto,
    p_metodo_pago: filters.metodoPago === "todos" ? null : filters.metodoPago,
    p_solo_con_vencidas: toBooleanFilter(filters.soloConVencidas),
    p_solo_con_saldo: toBooleanFilter(filters.soloConSaldo),
  };
}

function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(trimmed);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: string | Date | null | undefined): string {
  const parsed = value instanceof Date ? value : parseCalendarDate(value);
  if (!parsed) return "No definida";
  return parsed.toLocaleDateString("es-CR");
}

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("es-CR").format(Number(value ?? 0));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function getMonthLabel(value: string): string {
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("es-CR", { month: "short", year: "2-digit" });
}

function normalizeProductLabel(value: string | null | undefined): string {
  if (!value) return "Sin producto";
  return value
    .replace(/PAQUETE_FUNERARIO/g, "Paquete funerario")
    .replace(/CREMACION/g, "Cremacion")
    .replace(/CENIZARIO/g, "Cenizario")
    .replace(/LOTE/g, "Lote");
}

function getPlanLabel(value: string | null | undefined): string {
  if (value === "ARREGLO_PAGO") return "Arreglo de pago";
  if (value === "REESTRUCTURACION") return "Reestructuracion";
  if (value === "BACKFILL") return "Plan generado";
  if (value === "ORIGINAL") return "Plan original";
  return "Sin plan";
}

function getEstadoContratoLabel(value: EstadoContratoFilter): string {
  const labels: Record<EstadoContratoFilter, string> = {
    VIGENTE: "Vigentes",
    PRECONTRATO: "Precontratos",
    FINALIZADO: "Finalizados",
    FALLIDO: "Fallidos",
    ANULADO: "Anulados",
    TODOS: "Todos",
  };
  return labels[value];
}

function getProductoFilterLabel(value: ProductoFilter): string {
  return value === "TODOS" ? "Todos" : normalizeProductLabel(value);
}

function getBooleanFilterLabel(value: BooleanFilter): string {
  if (value === "si") return "Si";
  if (value === "no") return "No";
  return "Todos";
}

function buildAppliedFilterSummary(
  filters: FiltersState,
  vendedores: VendedorOption[],
): ReportFilter[] {
  const selectedVendedor = vendedores.find(
    (vendedor) => String(vendedor.id_vendedor) === filters.idVendedor,
  );

  return [
    {
      label: "Periodo",
      value: `${formatDate(filters.fechaDesde)} - ${formatDate(filters.fechaHasta)}`,
    },
    { label: "Estado", value: getEstadoContratoLabel(filters.estadoContrato) },
    { label: "Cliente / contrato", value: filters.cliente.trim() || "Todos" },
    {
      label: "Asesor",
      value:
        filters.idVendedor === "todos"
          ? "Todos"
          : selectedVendedor?.nombre_completo ?? `ID ${filters.idVendedor}`,
    },
    { label: "Tipo de producto", value: getProductoFilterLabel(filters.tipoProducto) },
    {
      label: "Metodo de pago",
      value: filters.metodoPago === "todos" ? "Todos" : filters.metodoPago,
    },
    {
      label: "Con cuotas vencidas",
      value: getBooleanFilterLabel(filters.soloConVencidas),
    },
    {
      label: "Con saldo pendiente",
      value: getBooleanFilterLabel(filters.soloConSaldo),
    },
  ];
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "primary",
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Banknote;
  tone?: "primary" | "emerald" | "amber" | "rose" | "blue";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
    blue: "bg-sky-100 text-sky-800",
  }[tone];

  return (
    <Card className="border-border/70 bg-surface shadow-sm">
      <CardHeader className="space-y-0 pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardDescription>{title}</CardDescription>
          <div className={cn("rounded-md p-2", toneClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function IngresosCampoSanto() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const menuPath = role === "vendedor" ? "/vendedor" : "/";

  const [draftFilters, setDraftFilters] = useState<FiltersState>(() =>
    getInitialFilters(),
  );
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(() =>
    getInitialFilters(),
  );
  const [summary, setSummary] = useState<IngresosResumen | null>(null);
  const [detailRows, setDetailRows] = useState<IngresosDetalleRow[]>([]);
  const [seriesRows, setSeriesRows] = useState<SerieMensualRow[]>([]);
  const [vendedores, setVendedores] = useState<VendedorOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<SortColumn>("fecha_firma");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const totalCount = Number(summary?.contratos_filtrados ?? 0);
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const firstVisible = totalCount === 0 ? 0 : page * pageSize + 1;
  const lastVisible = Math.min((page + 1) * pageSize, totalCount);

  const chartData = useMemo(
    () =>
      seriesRows.map((row) => ({
        ...row,
        label: getMonthLabel(row.periodo),
        ingreso_contratos: Number(row.ingreso_contratos ?? 0),
        ingreso_mantenimiento: Number(row.ingreso_mantenimiento ?? 0),
        ingreso_total: Number(row.ingreso_total ?? 0),
      })),
    [seriesRows],
  );

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        "obtener_ingresos_campo_santo_filtros" as never,
      );

      if (error) throw error;

      const options = ((data as unknown) as FilterOptionsResponse | null) ?? {};
      setVendedores(options.vendedores ?? []);
      setPaymentMethods(options.metodos_pago ?? []);
    } catch (error) {
      console.error("Error cargando filtros de ingresos", error);
      toast.error(getErrorMessage(error, "No se pudieron cargar los filtros"));
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const args = buildRpcArgs(appliedFilters);
      const detailArgs = {
        ...args,
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_orden_columna: sortColumn,
        p_orden_direccion: sortDirection,
      };

      const [summaryRes, detailRes, seriesRes] = await Promise.all([
        supabase.rpc(
          "obtener_ingresos_campo_santo_resumen" as never,
          args as never,
        ),
        supabase.rpc(
          "obtener_ingresos_campo_santo_detalle" as never,
          detailArgs as never,
        ),
        supabase.rpc(
          "obtener_ingresos_campo_santo_series_mensuales" as never,
          args as never,
        ),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      if (detailRes.error) throw detailRes.error;
      if (seriesRes.error) throw seriesRes.error;

      const summaryData =
        ((summaryRes.data as unknown) as IngresosResumen[] | null) ?? [];
      setSummary(summaryData[0] ?? null);
      setDetailRows(
        ((detailRes.data as unknown) as IngresosDetalleRow[] | null) ?? [],
      );
      setSeriesRows(
        ((seriesRes.data as unknown) as SerieMensualRow[] | null) ?? [],
      );
    } catch (error) {
      console.error("Error cargando ingresos de Campo Santo", error);
      toast.error(
        getErrorMessage(
          error,
          "No se pudo cargar el reporte de ingresos Campo Santo",
        ),
      );
      setSummary(null);
      setDetailRows([]);
      setSeriesRows([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, pageSize, sortColumn, sortDirection]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const applyFilters = useCallback(() => {
    if (
      draftFilters.fechaDesde &&
      draftFilters.fechaHasta &&
      draftFilters.fechaHasta < draftFilters.fechaDesde
    ) {
      toast.error("La fecha hasta no puede ser menor que la fecha desde");
      return;
    }

    setPage(0);
    setAppliedFilters(draftFilters);
  }, [draftFilters]);

  const clearFilters = useCallback(() => {
    const next = getInitialFilters();
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(0);
  }, []);

  const updateSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(column);
        setSortDirection(column === "cliente" ? "asc" : "desc");
      }
      setPage(0);
    },
    [sortColumn],
  );

  const fetchAllFilteredRows = useCallback(async () => {
    const args = buildRpcArgs(appliedFilters);
    const rows: IngresosDetalleRow[] = [];
    let offset = 0;
    const chunkSize = 1000;
    let expectedTotal = Number(summary?.contratos_filtrados ?? 0);

    do {
      const { data, error } = await supabase.rpc(
        "obtener_ingresos_campo_santo_detalle" as never,
        {
          ...args,
          p_limit: chunkSize,
          p_offset: offset,
          p_orden_columna: sortColumn,
          p_orden_direccion: sortDirection,
        } as never,
      );

      if (error) throw error;

      const chunk = ((data as unknown) as IngresosDetalleRow[] | null) ?? [];
      if (chunk.length > 0) {
        expectedTotal = Number(chunk[0].total_count ?? expectedTotal);
      }
      rows.push(...chunk);
      offset += chunkSize;

      if (chunk.length < chunkSize) break;
    } while (rows.length < expectedTotal);

    return rows;
  }, [appliedFilters, sortColumn, sortDirection, summary]);

  const exportColumns = useMemo<ReportColumn<IngresosDetalleRow>[]>(
    () => [
      {
        id: "contrato",
        header: "Contrato",
        getValue: (row) =>
          formatContractDisplayLabel(
            {
              numero_formulario: row.numero_formulario,
              numero_contrato: row.numero_contrato,
              id_contrato: row.id_contrato,
            },
            { fallback: "Formulario pendiente" },
          ),
        type: "text",
      },
      {
        id: "cliente",
        header: "Cliente",
        getValue: (row) => row.cliente_nombre ?? "",
        type: "text",
      },
      {
        id: "estado",
        header: "Estado",
        getValue: (row) => row.estado_contrato ?? "",
        type: "text",
      },
      {
        id: "plan",
        header: "Plan",
        getValue: (row) => getPlanLabel(row.tipo_plan),
        type: "text",
      },
      {
        id: "asesor",
        header: "Asesor",
        getValue: (row) => row.vendedor_nombre ?? "No asignado",
        type: "text",
      },
      {
        id: "fecha_firma",
        header: "Fecha firma",
        getValue: (row) => parseCalendarDate(row.fecha_firma),
        formatValue: (_value, row) => formatDate(row.fecha_firma),
        type: "date",
      },
      {
        id: "primera_cuota",
        header: "Primera cuota",
        getValue: (row) => parseCalendarDate(row.fecha_primera_cuota),
        formatValue: (_value, row) => formatDate(row.fecha_primera_cuota),
        type: "date",
      },
      {
        id: "tipo",
        header: "Tipo",
        getValue: (row) => normalizeProductLabel(row.tipos_producto),
        type: "text",
      },
      {
        id: "monto_contratado",
        header: "Monto contratado",
        getValue: (row) => Number(row.monto_contratado ?? 0),
        formatValue: (value) => formatCurrency(Number(value ?? 0)),
        type: "currency",
        align: "right",
        total: "sum",
      },
      {
        id: "pagado_periodo",
        header: "Pagado periodo",
        getValue: (row) => Number(row.total_pagado_periodo ?? 0),
        formatValue: (value) => formatCurrency(Number(value ?? 0)),
        type: "currency",
        align: "right",
        total: "sum",
      },
      {
        id: "pagos_periodo",
        header: "Pagos periodo",
        getValue: (row) => Number(row.total_pagos_periodo ?? 0),
        type: "number",
        align: "right",
        total: "sum",
      },
      {
        id: "historico",
        header: "Historico",
        getValue: (row) => Number(row.total_pagado_historico ?? 0),
        formatValue: (value) => formatCurrency(Number(value ?? 0)),
        type: "currency",
        align: "right",
        total: "sum",
      },
      {
        id: "saldo_pendiente",
        header: "Saldo pendiente",
        getValue: (row) => Number(row.saldo_pendiente_total ?? 0),
        formatValue: (value) => formatCurrency(Number(value ?? 0)),
        type: "currency",
        align: "right",
        total: "sum",
      },
      {
        id: "monto_vencido",
        header: "Monto vencido",
        getValue: (row) => Number(row.monto_vencido_total ?? 0),
        formatValue: (value) => formatCurrency(Number(value ?? 0)),
        type: "currency",
        align: "right",
        total: "sum",
      },
      {
        id: "cuotas",
        header: "Cuotas",
        getValue: (row) => `${row.cuotas_pagadas ?? 0}/${row.cuotas_totales ?? 0}`,
        type: "text",
        align: "center",
      },
      {
        id: "cuotas_pendientes",
        header: "Cuotas pendientes",
        getValue: (row) => Number(row.cuotas_pendientes ?? 0),
        type: "number",
        align: "right",
        total: "sum",
      },
      {
        id: "cuotas_vencidas",
        header: "Cuotas vencidas",
        getValue: (row) => Number(row.cuotas_vencidas ?? 0),
        type: "number",
        align: "right",
        total: "sum",
      },
      {
        id: "proximo_pago",
        header: "Proximo pago",
        getValue: (row) => parseCalendarDate(row.proximo_pago),
        formatValue: (_value, row) => formatDate(row.proximo_pago),
        type: "date",
      },
      {
        id: "ultimo_pago",
        header: "Ultimo pago",
        getValue: (row) => parseCalendarDate(row.ultimo_pago),
        formatValue: (_value, row) => formatDate(row.ultimo_pago),
        type: "date",
      },
    ],
    [],
  );

  const buildExportPayload = useCallback(async (): Promise<
    ReportPayload<IngresosDetalleRow>
  > => {
    const rows = await fetchAllFilteredRows();
    return {
      systemName: "Veredas Sarchi - Poas",
      title: "Ingresos Campo Santo",
      sheetName: "Ingresos Campo Santo",
      fileBaseName: "Ingresos_Campo_Santo",
      generatedAt: new Date(),
      generatedBy: user?.email ?? role ?? "No disponible",
      filters: buildAppliedFilterSummary(appliedFilters, vendedores),
      columns: exportColumns,
      rows,
    };
  }, [appliedFilters, exportColumns, fetchAllFilteredRows, role, user?.email, vendedores]);

  const exportReport = useCallback(
    async (format: "csv" | "excel") => {
      setExporting(format);
      try {
        const payload = await buildExportPayload();
        if (format === "csv") {
          exportCsvReport(payload);
        } else {
          await exportExcelReport(payload);
        }

        toast.success(`Reporte exportado: ${payload.rows.length} registros`);
      } catch (error) {
        console.error("Error exportando ingresos Campo Santo", error);
        toast.error(getErrorMessage(error, "No se pudo exportar el reporte"));
      } finally {
        setExporting(null);
      }
    },
    [buildExportPayload],
  );

  const renderSortButton = (column: SortColumn, label: string) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 px-2 text-xs font-semibold uppercase text-muted-foreground"
      onClick={() => updateSort(column)}
    >
      {label}
      <ArrowDownUp
        className={cn(
          "ml-1 h-3.5 w-3.5",
          sortColumn === column && "text-primary",
        )}
      />
    </Button>
  );

  const getReportColumnClass = (column: ReportColumn<IngresosDetalleRow>) =>
    cn(
      REPORT_COLUMN_WIDTHS[column.id],
      column.align === "right" && "text-right",
      column.align === "center" && "text-center",
    );

  const renderReportHeader = (column: ReportColumn<IngresosDetalleRow>) => {
    const sortableColumn = REPORT_COLUMN_SORTS[column.id];
    return sortableColumn
      ? renderSortButton(sortableColumn, column.header)
      : column.header;
  };

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
                Ingresos Campo Santo
              </h1>
              <p className="text-sm text-muted-foreground">
                Indicadores financieros, pagos, saldos y detalle por contrato.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
              {formatNumber(totalCount)} contratos visibles
            </Badge>
            <Button
              variant="outline"
              onClick={() => void loadReport()}
              disabled={loading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Actualizar
            </Button>
          </div>
        </div>

        <Card className="border-border/70 bg-surface shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Filtros</CardTitle>
            <CardDescription>
              El periodo se aplica a los ingresos registrados por fecha de pago.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="fecha-desde">Desde</Label>
                <Input
                  id="fecha-desde"
                  type="date"
                  value={draftFilters.fechaDesde}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      fechaDesde: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha-hasta">Hasta</Label>
                <Input
                  id="fecha-hasta"
                  type="date"
                  value={draftFilters.fechaHasta}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      fechaHasta: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={draftFilters.estadoContrato}
                  onValueChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      estadoContrato: value as EstadoContratoFilter,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIGENTE">Vigentes</SelectItem>
                    <SelectItem value="PRECONTRATO">Precontratos</SelectItem>
                    <SelectItem value="FINALIZADO">Finalizados</SelectItem>
                    <SelectItem value="FALLIDO">Fallidos</SelectItem>
                    <SelectItem value="ANULADO">Anulados</SelectItem>
                    <SelectItem value="TODOS">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Asesor</Label>
                <Select
                  value={draftFilters.idVendedor}
                  onValueChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      idVendedor: value,
                    }))
                  }
                  disabled={optionsLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Asesor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {vendedores.map((vendedor) => (
                      <SelectItem
                        key={vendedor.id_vendedor}
                        value={String(vendedor.id_vendedor)}
                      >
                        {vendedor.nombre_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cliente">Cliente / contrato</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cliente"
                    value={draftFilters.cliente}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        cliente: event.target.value,
                      }))
                    }
                    placeholder="Nombre, formulario o contrato"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipo de producto</Label>
                <Select
                  value={draftFilters.tipoProducto}
                  onValueChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      tipoProducto: value as ProductoFilter,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="LOTE">Lote</SelectItem>
                    <SelectItem value="CENIZARIO">Cenizario</SelectItem>
                    <SelectItem value="CREMACION">Cremacion</SelectItem>
                    <SelectItem value="PAQUETE_FUNERARIO">Paquete funerario</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Metodo de pago</Label>
                <Select
                  value={draftFilters.metodoPago}
                  onValueChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      metodoPago: value,
                    }))
                  }
                  disabled={optionsLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Metodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condicion</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={draftFilters.soloConVencidas}
                    onValueChange={(value) =>
                      setDraftFilters((current) => ({
                        ...current,
                        soloConVencidas: value as BooleanFilter,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vencidas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      <SelectItem value="si">Con vencidas</SelectItem>
                      <SelectItem value="no">Sin vencidas</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={draftFilters.soloConSaldo}
                    onValueChange={(value) =>
                      setDraftFilters((current) => ({
                        ...current,
                        soloConSaldo: value as BooleanFilter,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Saldo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="si">Con saldo</SelectItem>
                      <SelectItem value="no">Sin saldo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={applyFilters} disabled={loading}>
                Aplicar filtros
              </Button>
              <Button variant="outline" onClick={clearFilters} disabled={loading}>
                Limpiar
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && !summary ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title={
                appliedFilters.estadoContrato === "VIGENTE"
                  ? "Contratos activos"
                  : "Contratos filtrados"
              }
              value={formatNumber(summary?.contratos_filtrados)}
              hint={`${formatNumber(summary?.contratos_con_plan)} con plan financiero`}
              icon={FileText}
              tone="primary"
            />
            <MetricCard
              title="Monto contratado"
              value={formatCurrency(summary?.monto_total_contratado)}
              hint="Suma de contratos filtrados"
              icon={Banknote}
              tone="blue"
            />
            <MetricCard
              title="Recaudado periodo"
              value={formatCurrency(summary?.total_recaudado_periodo)}
              hint={`${formatNumber(summary?.total_pagos_periodo)} pagos registrados`}
              icon={TrendingUp}
              tone="emerald"
            />
            <MetricCard
              title="Saldo pendiente"
              value={formatCurrency(summary?.saldo_pendiente_total)}
              hint={`Vencido: ${formatCurrency(summary?.monto_vencido_total)}`}
              icon={CalendarDays}
              tone={(summary?.monto_vencido_total ?? 0) > 0 ? "rose" : "amber"}
            />
            <MetricCard
              title="Capital cobrado"
              value={formatCurrency(summary?.capital_cobrado_periodo)}
              hint={`Capital pendiente: ${formatCurrency(summary?.capital_pendiente)}`}
              icon={Banknote}
              tone="primary"
            />
            <MetricCard
              title="Intereses cobrados"
              value={formatCurrency(summary?.interes_cobrado_periodo)}
              hint={`Interes pendiente: ${formatCurrency(summary?.interes_pendiente)}`}
              icon={TrendingUp}
              tone="blue"
            />
            <MetricCard
              title="Mantenimiento cobrado"
              value={formatCurrency(summary?.mantenimiento_recaudado_periodo)}
              hint={`Pendiente: ${formatCurrency(summary?.mantenimiento_pendiente)}`}
              icon={CalendarDays}
              tone="emerald"
            />
            <MetricCard
              title="Promedio por contrato"
              value={formatCurrency(summary?.promedio_ingreso_por_contrato)}
              hint={`Mes actual en rango: ${formatCurrency(summary?.ingreso_mes_actual)}`}
              icon={Banknote}
              tone="amber"
            />
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="border-border/70 bg-surface shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Ingresos mensuales</CardTitle>
              <CardDescription>
                Contratos y mantenimiento segun el periodo filtrado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && chartData.length === 0 ? (
                <Skeleton className="h-80 rounded-xl" />
              ) : chartData.length === 0 ? (
                <EmptyPanel
                  title="Sin ingresos en el periodo"
                  description="No hay pagos registrados con los filtros actuales."
                />
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => formatCompactCurrency(Number(value))}
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        labelFormatter={(label) => `Periodo ${label}`}
                      />
                      <Legend />
                      <Bar
                        dataKey="ingreso_contratos"
                        name="Contratos"
                        fill="#2f855a"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="ingreso_mantenimiento"
                        name="Mantenimiento"
                        fill="#2563eb"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-surface shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Composicion</CardTitle>
              <CardDescription>Desglose del periodo filtrado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  label: "Contratos",
                  value: summary?.total_recaudado_contratos_periodo,
                  className: "bg-emerald-500",
                },
                {
                  label: "Mantenimiento",
                  value: summary?.mantenimiento_recaudado_periodo,
                  className: "bg-sky-500",
                },
                {
                  label: "Intereses",
                  value: summary?.interes_cobrado_periodo,
                  className: "bg-amber-500",
                },
                {
                  label: "Otros",
                  value: summary?.otros_cobrados_periodo,
                  className: "bg-slate-500",
                },
              ].map((item) => {
                const total = Number(summary?.total_recaudado_periodo ?? 0);
                const value = Number(item.value ?? 0);
                const percent = total > 0 ? Math.min((value / total) * 100, 100) : 0;
                return (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="text-muted-foreground">{formatCurrency(value)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", item.className)}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                <p className="text-muted-foreground">Ingreso anual actual en rango</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {formatCurrency(summary?.ingreso_anio_actual)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-surface shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-xl">Detalle por contrato</CardTitle>
              <CardDescription>
                {firstVisible}-{lastVisible} de {formatNumber(totalCount)} registros.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportReport("csv")}
                disabled={loading || exporting !== null || totalCount === 0}
              >
                {exporting === "csv" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportReport("excel")}
                disabled={loading || exporting !== null || totalCount === 0}
              >
                {exporting === "excel" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && detailRows.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-md" />
                ))}
              </div>
            ) : detailRows.length === 0 ? (
              <EmptyPanel
                title="Sin contratos para mostrar"
                description="Ajusta los filtros para ampliar el resultado."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {exportColumns.map((column) => (
                        <TableHead
                          key={column.id}
                          className={getReportColumnClass(column)}
                        >
                          {renderReportHeader(column)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.map((row) => (
                      <TableRow key={row.id_contrato}>
                        {exportColumns.map((column) => (
                          <TableCell
                            key={column.id}
                            className={cn(
                              getReportColumnClass(column),
                              column.type === "currency" && "font-medium",
                            )}
                          >
                            {getFormattedCellValue(column, row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Filas por pagina</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(current - 1, 0))}
                  disabled={loading || page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Pagina {page + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((current) => Math.min(current + 1, totalPages - 1))
                  }
                  disabled={loading || page >= totalPages - 1}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
