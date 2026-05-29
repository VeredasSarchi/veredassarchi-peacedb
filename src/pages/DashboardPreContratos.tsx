import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ComponentType, ReactNode } from "react";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  Cloud,
  DollarSign,
  FileCheck2,
  FileText,
  FolderClosed,
  Info,
  Mail,
  MapPin,
  Trash2,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PreClienteForm, type PreClienteFormValues, type PreClienteSubmitPayload } from "@/components/precontratos/PreClienteForm";
import type { ProductType } from "@/components/precontratos/PreClienteForm";
import { buildOneDriveFolderPayload } from "@/lib/contract-onedrive";
import { formatContractDisplayLabel } from "@/lib/contract-display";
import { cn } from "@/lib/utils";

type ContratoRow = Tables<"contrato"> & {
  numero_formulario: string | null;
  fecha_inicio_mantenimiento?: string | null;
};
type ClienteRow = Tables<"cliente">;
type VendedorRow = Tables<"vendedor">;
type AutorizadoRow = Tables<"contrato_autorizados">;
type BeneficiarioRow = Tables<"contrato_beneficiarios">;
type JardinMini = Pick<Tables<"jardin">, "id_jardin" | "nombre">;

type ProductoDetalle = Tables<"contrato_producto"> & {
  lote:
    | (Pick<Tables<"lote">, "id_lote" | "numero_lote" | "id_jardin"> & {
        jardin: JardinMini | null;
      })
    | null;
  tipo_cenizario:
    | (Pick<Tables<"tipo_cenizario">, "id_tipo_cenizario" | "numero_cenizario" | "descripcion" | "id_jardin"> & {
        jardin: JardinMini | null;
      })
    | null;
  tipo_cremacion: Pick<Tables<"tipo_cremacion">, "id_tipo_cremacion" | "descripcion"> | null;
  paquete_funerario: Pick<Tables<"paquete_funerario">, "id_paquete" | "descripcion"> | null;
};

type PreContratoDetalle = {
  contrato: ContratoRow;
  cliente: ClienteRow | null;
  vendedor: VendedorRow | null;
  productos: ProductoDetalle[];
  autorizados: AutorizadoRow[];
  beneficiarios: BeneficiarioRow[];
};

type PreContratoSelectRow = Tables<"contrato"> & {
  numero_formulario?: string | null;
  cliente?: ClienteRow | ClienteRow[] | null;
  vendedor?: VendedorRow | VendedorRow[] | null;
};

type ProductoDetalleRawRow = Tables<"contrato_producto"> & {
  lote?:
    | (Pick<Tables<"lote">, "id_lote" | "numero_lote" | "id_jardin"> & {
        jardin?: JardinMini | JardinMini[] | null;
      })
    | null;
  tipo_cenizario?:
    | (Pick<Tables<"tipo_cenizario">, "id_tipo_cenizario" | "numero_cenizario" | "descripcion" | "id_jardin"> & {
        jardin?: JardinMini | JardinMini[] | null;
      })
    | null;
  tipo_cremacion?: Pick<Tables<"tipo_cremacion">, "id_tipo_cremacion" | "descripcion"> | null;
  paquete_funerario?: Pick<Tables<"paquete_funerario">, "id_paquete" | "descripcion"> | null;
};

type OneDriveFolderResult = {
  ok: boolean;
  status: "created";
  folderId: string;
  folderName: string;
  webUrl: string | null;
  subfolders: string[];
};

type FormalizeContractResult = {
  ok: boolean;
  id_contrato: number;
  numero_formulario: string;
  fecha_primera_cuota: string;
  resultado_plan: {
    ok: boolean;
    id_plan_pago: number;
    cuotas_generadas: number;
  };
};

async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response =
    typeof error === "object" && error && "context" in error
      ? (error as { context?: Response }).context
      : undefined;

  if (!response) {
    return fallback;
  }

  try {
    const body = (await response.clone().json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) {
    return "No definido";
  }
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeSearchValue(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toInputNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.split("T")[0];
}

function getMaintenanceStartInputValue(
  fechaInicioMantenimiento: string | null | undefined,
  anioInicioMantenimiento: number | null | undefined,
): string {
  if (fechaInicioMantenimiento) {
    return toDateInput(fechaInicioMantenimiento);
  }

  if (anioInicioMantenimiento) {
    return `${anioInicioMantenimiento}-01-01`;
  }

  return "";
}

function formatMaintenanceStartDisplay(
  fechaInicioMantenimiento: string | null | undefined,
  anioInicioMantenimiento: number | null | undefined,
): string {
  if (fechaInicioMantenimiento) {
    return formatDate(fechaInicioMantenimiento);
  }

  if (anioInicioMantenimiento) {
    return String(anioInicioMantenimiento);
  }

  return "No definido";
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

  const nextMonthStart = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1);
  const lastDay = new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth() + 1, 0).getDate();
  const day = Math.min(diaPagoMensual, lastDay);

  return formatDateParts(nextMonthStart.getFullYear(), nextMonthStart.getMonth() + 1, day);
}

function getPaymentPlanPrecheckError(record: PreContratoDetalle): string | null {
  const plazoMeses =
    record.contrato.total_meses ??
    (record.contrato.plazo_anios !== null && record.contrato.plazo_anios !== undefined
      ? record.contrato.plazo_anios * 12
      : null);

  if (plazoMeses !== null && plazoMeses !== undefined) {
    return plazoMeses >= 0 ? null : "El contrato tiene un plazo inválido para generar el plan de pago";
  }

  const prima = record.contrato.monto_entregado_inicial ?? 0;
  const saldoEstimado = Math.max(
    record.contrato.saldo_pendiente ?? ((record.contrato.monto_arrendamiento_total ?? 0) - prima),
    0,
  );
  const cuotaMensual = record.contrato.cuota_mensual ?? 0;
  const tasaMensual = (record.contrato.tasa_interes_anual ?? 0) / 100 / 12;

  if (saldoEstimado <= 0) {
    return null;
  }

  if (cuotaMensual <= 0) {
    return "El contrato no tiene un plazo registrado y tampoco una cuota mensual válida para generar el plan de pago";
  }

  if (tasaMensual > 0 && cuotaMensual <= saldoEstimado * tasaMensual) {
    return "El contrato no tiene un plazo registrado y la cuota mensual no cubre los intereses para inferirlo";
  }

  return null;
}

function isMissingNumeroFormularioColumn(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  return message.toLowerCase().includes("numero_formulario");
}

function getProductoLabel(producto: ProductoDetalle): string {
  if (producto.tipo_producto === "LOTE") {
    const numeroLote = producto.lote?.numero_lote;
    const jardinNombre = producto.lote?.jardin?.nombre;
    const base = numeroLote ? `Lote ${numeroLote}` : "Lote";
    return jardinNombre ? `${base} (${jardinNombre})` : base;
  }
  if (producto.tipo_producto === "CENIZARIO") {
    const numeroCenizario = producto.tipo_cenizario?.numero_cenizario;
    const jardinNombre = producto.tipo_cenizario?.jardin?.nombre;
    const base = numeroCenizario ? `Cenizario ${numeroCenizario}` : "Cenizario";
    return jardinNombre ? `${base} (${jardinNombre})` : base;
  }
  if (producto.tipo_producto === "CREMACION") {
    return producto.tipo_cremacion?.descripcion || "Cremación";
  }
  if (producto.tipo_producto === "PAQUETE_FUNERARIO") {
    return producto.paquete_funerario?.descripcion
      ? `Paquete ${producto.paquete_funerario.descripcion}`
      : "Paquete funerario";
  }
  return "Paquete funerario";
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-CR");
}

function displayValue(value: string | number | null | undefined, fallback = "No definido"): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function getCategoryLabel(expected: ReturnType<typeof buildOneDriveFolderPayload> | null) {
  if (!expected) return "Sin ruta";
  if (expected.categoryType === "funeral_package") {
    return `PAQUETES FUNERARIOS / ${expected.categoryName}`;
  }
  if (expected.categoryType === "cremation") {
    return `CREMACIONES / ${expected.categoryName}`;
  }
  return expected.categoryName;
}

function PrecontractStatusBadge() {
  return (
    <Badge className="rounded-full bg-warning px-3 py-1 text-xs text-warning-foreground shadow-sm hover:bg-warning">
      Pendiente
    </Badge>
  );
}

function OneDrivePendingBadge() {
  return (
    <Badge className="rounded-full bg-secondary-soft px-3 py-1 text-xs text-text-primary shadow-sm hover:bg-secondary-soft">
      <Cloud className="mr-1 h-3 w-3" />
      Por crear
    </Badge>
  );
}

function SectionPanel({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border/70 bg-surface p-4 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md",
        className,
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md bg-primary-soft p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description && <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  tooltip?: string;
}) {
  const labelContent = (
    <span className="inline-flex items-center gap-1">
      {label}
      {tooltip && <Info className="h-3 w-3 text-text-secondary" />}
    </span>
  );

  return (
    <div className="min-w-0 rounded-md bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">{labelContent}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          labelContent
        )}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-text-primary">{value}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-center text-sm text-text-secondary">
      {message}
    </div>
  );
}

function PrecontractLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1].map((item) => (
        <div key={item} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-9 w-40" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPreContratos() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const menuPath = role === "vendedor" ? "/vendedor" : "/";
  const isAdmin = role === "admin";

  const [precontratos, setPrecontratos] = useState<PreContratoDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [supportsNumeroFormulario, setSupportsNumeroFormulario] = useState(true);
  const [searchCliente, setSearchCliente] = useState("");
  const [openFolders, setOpenFolders] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<PreContratoDetalle | null>(null);
  const [formalizeTarget, setFormalizeTarget] = useState<PreContratoDetalle | null>(null);
  const [formalizeNumeroFormulario, setFormalizeNumeroFormulario] = useState("");
  const [formalizeNumeroFormularioError, setFormalizeNumeroFormularioError] = useState<string | null>(null);
  const [formalizeFechaPrimeraCuota, setFormalizeFechaPrimeraCuota] = useState("");
  const [formalizeFechaPrimeraCuotaError, setFormalizeFechaPrimeraCuotaError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PreContratoDetalle | null>(null);
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false);
  const [ignoreEditCloseConfirmation, setIgnoreEditCloseConfirmation] = useState(false);
  const toPreClienteNumber = useCallback((value: number | null | undefined) => {
    return value === null || value === undefined ? "" : String(value);
  }, []);

  const ignoredLoteIds = useMemo(
    () =>
      editingRecord
        ? editingRecord.productos
            .filter((producto) => producto.tipo_producto === "LOTE")
            .map((producto) => String(producto.id_lote ?? ""))
            .filter((id) => id !== "")
        : [],
    [editingRecord]
  );

  const ignoredCenizarioIds = useMemo(
    () =>
      editingRecord
        ? editingRecord.productos
            .filter((producto) => producto.tipo_producto === "CENIZARIO")
            .map((producto) => String(producto.id_tipo_cenizario ?? ""))
            .filter((id) => id !== "")
        : [],
    [editingRecord]
  );

  const buildEditInitialValues = useCallback((record: PreContratoDetalle): PreClienteFormValues => {
    const lotes = record.productos.filter((producto) => producto.tipo_producto === "LOTE");
    const cenizarios = record.productos.filter((producto) => producto.tipo_producto === "CENIZARIO");
    const cremaciones = record.productos.filter((producto) => producto.tipo_producto === "CREMACION");
    const paquetes = record.productos.filter((producto) => producto.tipo_producto === "PAQUETE_FUNERARIO");

    const tipos: ProductType[] = [];
    if (lotes.length > 0) tipos.push("LOTE");
    if (cenizarios.length > 0) tipos.push("CENIZARIO");
    if (cremaciones.length > 0) tipos.push("CREMACION");
    if (paquetes.length > 0) tipos.push("PAQUETE_FUNERARIO");

    const firstJardinFromLote =
      lotes[0]?.lote?.id_jardin ?? cenizarios[0]?.tipo_cenizario?.id_jardin ?? "";
    const plazoMeses =
      record.contrato.total_meses ??
      (record.contrato.plazo_anios !== null && record.contrato.plazo_anios !== undefined
        ? record.contrato.plazo_anios * 12
        : null);

    return {
      numero_formulario: record.contrato.numero_formulario || "",
      numero_contrato: record.contrato.numero_contrato || "",
      nombre_completo: record.cliente?.nombre_completo || "",
      estado_civil: record.cliente?.estado_civil || "",
      profesion: record.cliente?.profesion || "",
      identificacion: record.cliente?.cedula || "",
      direccion: record.cliente?.direccion || "",
      correo: record.cliente?.email || "",
      telefono1: record.cliente?.telefono1 || "",
      telefono2: record.cliente?.telefono2 || "",
      id_jardin: firstJardinFromLote ? String(firstJardinFromLote) : "",
      tipos_paquete_funerario: tipos,
      cantidad_lotes: toPreClienteNumber(record.contrato.cantidad_lotes),
      lote_numeros: lotes.map((producto) => toInputNumber(producto.id_lote)),
      tipo_lote: "",
      cenizario_numeros: cenizarios.map((producto) => toInputNumber(producto.id_tipo_cenizario)),
      id_paquete_funerario: paquetes[0]?.id_paquete ? String(paquetes[0].id_paquete) : "",
      tipo_cremacion: cremaciones[0]?.id_tipo_cremacion ? String(cremaciones[0].id_tipo_cremacion) : "",
      precio: toPreClienteNumber(record.contrato.monto_arrendamiento_total),
      plazo_anios: toPreClienteNumber(plazoMeses),
      total_meses: toPreClienteNumber(plazoMeses),
      cuota_fija: toPreClienteNumber(record.contrato.cuota_mensual),
      dia_pago: toPreClienteNumber(record.contrato.dia_pago_mensual),
      tasa_interes_anual: toPreClienteNumber(record.contrato.tasa_interes_anual),
      prima: toPreClienteNumber(record.contrato.monto_entregado_inicial),
      saldo: toPreClienteNumber(record.contrato.saldo_pendiente),
      monto_mantenimiento_anual: toPreClienteNumber(record.contrato.monto_mantenimiento_anual),
      fecha_inicio_mantenimiento: getMaintenanceStartInputValue(
        record.contrato.fecha_inicio_mantenimiento,
        record.contrato.anio_inicio_mantenimiento,
      ),
      anio_inicio_mantenimiento: toPreClienteNumber(record.contrato.anio_inicio_mantenimiento),
      observaciones: record.contrato.observaciones_contrato || "",
      fecha: toDateInput(record.contrato.fecha_firma),
      metodo_pago: "",
      vendedor: String(record.contrato.id_vendedor || ""),
    };
  }, [toPreClienteNumber]);

  const loadPrecontratos = useCallback(async () => {
    setLoading(true);
    try {
      const contratoSelectBase = `
          id_contrato,
          numero_contrato,
          fecha_firma,
          id_cliente,
          id_vendedor,
          monto_arrendamiento_total,
          plazo_anios,
          cuota_mensual,
          dia_pago_mensual,
          total_meses,
          tasa_interes_anual,
          monto_entregado_inicial,
          saldo_pendiente,
          cantidad_lotes,
          monto_mantenimiento_anual,
          fecha_inicio_mantenimiento,
          anio_inicio_mantenimiento,
          monto_apertura,
          observaciones_contrato,
          estado_contrato,
          cliente:cliente(
            id_cliente,
            nombre_completo,
            cedula,
            email,
            direccion,
            estado_civil,
            profesion,
            telefono1,
            telefono2,
            observaciones
          ),
          vendedor:vendedor(
            id_vendedor,
            nombre_completo
          )
        `;

      const fetchContratos = async (
        includeNumeroFormulario: boolean,
      ): Promise<{
        data: PreContratoSelectRow[] | null;
        error: unknown | null;
      }> => {
        const selectedColumns: string = includeNumeroFormulario
          ? `numero_formulario,${contratoSelectBase}`
          : contratoSelectBase;

        const result = await supabase
          .from("contrato")
          .select(selectedColumns)
          .eq("estado_contrato", "PRECONTRATO")
          .order("id_contrato", { ascending: false });

        return {
          data: ((result.data ?? null) as unknown) as PreContratoSelectRow[] | null,
          error: result.error,
        };
      };

      const firstAttempt = await fetchContratos(true);
      let contratosData = firstAttempt.data;
      let contratosError = firstAttempt.error;
      let hasNumeroFormulario = true;

      if (contratosError && isMissingNumeroFormularioColumn(contratosError)) {
        const fallbackAttempt = await fetchContratos(false);
        contratosData = fallbackAttempt.data;
        contratosError = fallbackAttempt.error;
        hasNumeroFormulario = false;
      }

      if (contratosError) {
        throw contratosError;
      }
      setSupportsNumeroFormulario(hasNumeroFormulario);

      const contratoRows = contratosData ?? [];
      const contratosBase: PreContratoDetalle[] = contratoRows.map((row) => ({
        contrato: {
          ...(row as Tables<"contrato">),
          numero_formulario: row.numero_formulario ?? null,
        } as ContratoRow,
        cliente: asSingle(row.cliente),
        vendedor: asSingle(row.vendedor),
        productos: [],
        autorizados: [],
        beneficiarios: [],
      }));

      const contractIds = contratosBase.map((item) => item.contrato.id_contrato);
      if (contractIds.length === 0) {
        setPrecontratos([]);
        return;
      }

      const [productosRes, autorizadosRes, beneficiariosRes] = await Promise.all([
        supabase
          .from("contrato_producto")
          .select(`
            id_contrato_producto,
            id_contrato,
            tipo_producto,
            id_lote,
            id_tipo_cenizario,
            id_tipo_cremacion,
            id_paquete,
            precio,
            cantidad,
            lote:lote(
              id_lote,
              numero_lote,
              id_jardin,
              jardin:jardin(
                id_jardin,
                nombre
              )
            ),
            tipo_cenizario:tipo_cenizario(
              id_tipo_cenizario,
              numero_cenizario,
              descripcion,
              id_jardin,
              jardin:jardin(
                id_jardin,
                nombre
              )
            ),
            tipo_cremacion:tipo_cremacion(
              id_tipo_cremacion,
              descripcion
            ),
            paquete_funerario:paquete_funerario(
              id_paquete,
              descripcion
            )
          `)
          .in("id_contrato", contractIds),
        supabase
          .from("contrato_autorizados")
          .select("*")
          .in("id_contrato", contractIds),
        supabase
          .from("contrato_beneficiarios")
          .select("*")
          .in("id_contrato", contractIds),
      ]);

      if (productosRes.error) throw productosRes.error;
      if (autorizadosRes.error) throw autorizadosRes.error;
      if (beneficiariosRes.error) throw beneficiariosRes.error;

      const productoRows = ((productosRes.data ?? []) as unknown) as ProductoDetalleRawRow[];
      const productosByContrato = new Map<number, ProductoDetalle[]>();
      productoRows.forEach((raw) => {
        const loteRaw = asSingle(raw.lote);
        const tipoCenizarioRaw = asSingle(raw.tipo_cenizario);
        const item: ProductoDetalle = {
          ...(raw as Tables<"contrato_producto">),
          lote: loteRaw
            ? {
                ...(loteRaw as Pick<Tables<"lote">, "id_lote" | "numero_lote" | "id_jardin">),
                jardin: asSingle((loteRaw as { jardin?: JardinMini | JardinMini[] | null }).jardin),
              }
            : null,
          tipo_cenizario: tipoCenizarioRaw
            ? {
                ...(tipoCenizarioRaw as Pick<
                  Tables<"tipo_cenizario">,
                  "id_tipo_cenizario" | "numero_cenizario" | "descripcion" | "id_jardin"
                >),
                jardin: asSingle(
                  (tipoCenizarioRaw as { jardin?: JardinMini | JardinMini[] | null }).jardin
                ),
              }
            : null,
          tipo_cremacion: asSingle(raw.tipo_cremacion),
          paquete_funerario: asSingle(raw.paquete_funerario),
        };
        const current = productosByContrato.get(item.id_contrato) ?? [];
        current.push(item);
        productosByContrato.set(item.id_contrato, current);
      });

      const autorizadosByContrato = new Map<number, AutorizadoRow[]>();
      (autorizadosRes.data ?? []).forEach((item) => {
        const current = autorizadosByContrato.get(item.id_contrato) ?? [];
        current.push(item);
        autorizadosByContrato.set(item.id_contrato, current);
      });

      const beneficiariosByContrato = new Map<number, BeneficiarioRow[]>();
      (beneficiariosRes.data ?? []).forEach((item) => {
        const current = beneficiariosByContrato.get(item.id_contrato) ?? [];
        current.push(item);
        beneficiariosByContrato.set(item.id_contrato, current);
      });

      const detallados = contratosBase.map((item) => {
        const idContrato = item.contrato.id_contrato;
        return {
          ...item,
          productos: productosByContrato.get(idContrato) ?? [],
          autorizados: autorizadosByContrato.get(idContrato) ?? [],
          beneficiarios: beneficiariosByContrato.get(idContrato) ?? [],
        };
      });

      setPrecontratos(detallados);
    } catch (error) {
      console.error("Error cargando precontratos:", error);
      toast.error("No se pudieron cargar los precontratos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrecontratos();
  }, [loadPrecontratos]);

  const agrupadosPorCliente = useMemo(() => {
    const map = new Map<
      string,
      { key: string; clienteNombre: string; items: PreContratoDetalle[] }
    >();

    precontratos.forEach((item) => {
      const nombre = item.cliente?.nombre_completo?.trim() || "Cliente sin nombre";
      const key = item.cliente?.id_cliente
        ? `cliente-${item.cliente.id_cliente}`
        : `sin-cliente-${item.contrato.id_contrato}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          clienteNombre: nombre,
          items: [],
        });
      }
      map.get(key)?.items.push(item);
    });

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => b.contrato.id_contrato - a.contrato.id_contrato),
      }))
      .sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre, "es", { sensitivity: "base" }));
  }, [precontratos]);

  const agrupadosFiltrados = useMemo(() => {
    const term = normalizeSearchValue(searchCliente);
    if (!term) return agrupadosPorCliente;
    return agrupadosPorCliente.filter((grupo) =>
      normalizeSearchValue(grupo.clienteNombre).includes(term)
    );
  }, [agrupadosPorCliente, searchCliente]);

  useEffect(() => {
    const validKeys = new Set(agrupadosPorCliente.map((grupo) => grupo.key));
    setOpenFolders((prev) => prev.filter((key) => validKeys.has(key)));
  }, [agrupadosPorCliente]);

  const openEdit = (record: PreContratoDetalle) => {
    if (!isAdmin) {
      toast.error("Esta vista es solo lectura para vendedor");
      return;
    }
    setShowEditCancelConfirm(false);
    setIgnoreEditCloseConfirmation(false);
    setEditingRecord(record);
    setEditOpen(true);
  };

  const openFormalize = (record: PreContratoDetalle) => {
    if (!isAdmin) {
      toast.error("Esta acción solo está disponible para administrador");
      return;
    }
    setFormalizeTarget(record);
    setFormalizeNumeroFormulario("");
    setFormalizeNumeroFormularioError(null);
    setFormalizeFechaPrimeraCuota(
      getSuggestedFirstPaymentDate(record.contrato.fecha_firma, record.contrato.dia_pago_mensual),
    );
    setFormalizeFechaPrimeraCuotaError(null);
  };

  const handleSaveEdit = async ({ payload }: PreClienteSubmitPayload) => {
    if (!isAdmin) {
      toast.error("Esta acción solo está disponible para administrador");
      return;
    }
    if (!editingRecord) return;
    if (!editingRecord.cliente?.id_cliente) {
      toast.error("No se pudo identificar el cliente para editar");
      return;
    }
    const idContrato = editingRecord.contrato.id_contrato;
    const idCliente = editingRecord.cliente.id_cliente;

    setProcessingId(idContrato);
    try {
      const { error: clienteError } = await supabase
        .from("cliente")
        .update(payload.cliente)
        .eq("id_cliente", idCliente);

      if (clienteError) throw clienteError;

      const contratoPayload = { ...payload.contrato } as Record<string, unknown>;
      if (!supportsNumeroFormulario) {
        delete contratoPayload.numero_formulario;
      }

      const { error: contratoError } = await supabase
        .from("contrato")
        .update(contratoPayload)
        .eq("id_contrato", idContrato);

      if (contratoError) throw contratoError;

      const { error: deleteProductoError } = await supabase
        .from("contrato_producto")
        .delete()
        .eq("id_contrato", idContrato);

      if (deleteProductoError) {
        throw deleteProductoError;
      }

      if (payload.productos.length > 0) {
        const productosParaActualizar = payload.productos.map((producto) => ({
          ...producto,
          id_contrato: idContrato,
        }));

        const { error: insertProductoError } = await supabase
          .from("contrato_producto")
          .insert(productosParaActualizar);
      if (insertProductoError) {
          throw insertProductoError;
        }
      }

      toast.success("Precontrato actualizado correctamente");
      setIgnoreEditCloseConfirmation(true);
      setEditOpen(false);
      setEditingRecord(null);
      await loadPrecontratos();
    } catch (error) {
      console.error("Error actualizando precontrato:", error);
      toast.error("No se pudo actualizar el precontrato");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeletePrecontrato = async () => {
    if (!isAdmin) {
      toast.error("Esta acción solo está disponible para administrador");
      return;
    }
    if (!deleteTarget) return;
    const target = deleteTarget;
    const idContrato = target.contrato.id_contrato;
    const idCliente = target.cliente?.id_cliente ?? null;

    setProcessingId(idContrato);
    try {
      const { error: productosError } = await supabase
        .from("contrato_producto")
        .delete()
        .eq("id_contrato", idContrato);
      if (productosError) throw productosError;

      const { error: contratoError } = await supabase
        .from("contrato")
        .delete()
        .eq("id_contrato", idContrato);
      if (contratoError) throw contratoError;

      if (idCliente) {
        const { data: contratosRestantes, error: restantesError } = await supabase
          .from("contrato")
          .select("id_contrato")
          .eq("id_cliente", idCliente)
          .limit(1);

        if (!restantesError && (contratosRestantes ?? []).length === 0) {
          const { error: clienteDeleteError } = await supabase
            .from("cliente")
            .delete()
            .eq("id_cliente", idCliente);
          if (clienteDeleteError) {
            console.error("No se pudo limpiar cliente sin contratos:", clienteDeleteError);
          }
        }
      }

      toast.success("Precontrato eliminado");
      setDeleteTarget(null);
      await loadPrecontratos();
    } catch (error) {
      console.error("Error eliminando precontrato:", error);
      toast.error("No se pudo eliminar el precontrato");
    } finally {
      setProcessingId(null);
    }
  };

  const handleFormalizePrecontrato = async () => {
    if (!isAdmin) {
      toast.error("Esta acción solo está disponible para administrador");
      return;
    }
    if (!formalizeTarget) return;
    const idContrato = formalizeTarget.contrato.id_contrato;
    if (!supportsNumeroFormulario) {
      toast.error("Debe aplicar la migración de numero_formulario antes de formalizar");
      return;
    }

    const numeroFormularioFinal = formalizeNumeroFormulario.trim();
    const numeroFormularioActual = formalizeTarget.contrato.numero_formulario?.trim() || "";
    const fechaPrimeraCuota = formalizeFechaPrimeraCuota.trim();
    const paymentPlanPrecheckError = getPaymentPlanPrecheckError(formalizeTarget);
    if (!numeroFormularioFinal) {
      setFormalizeNumeroFormularioError("El número de formulario oficial es obligatorio");
      toast.error("Debe indicar el número de formulario oficial");
      return;
    }
    if (numeroFormularioActual && numeroFormularioFinal === numeroFormularioActual) {
      setFormalizeNumeroFormularioError("Debe ingresar un número oficial diferente al consecutivo automático");
      toast.error("Debe editar el número de formulario antes de formalizar");
      return;
    }
    if (!fechaPrimeraCuota) {
      setFormalizeFechaPrimeraCuotaError("La fecha de primera cuota es obligatoria");
      toast.error("Debe indicar la fecha de primera cuota");
      return;
    }
    if (paymentPlanPrecheckError) {
      toast.error(paymentPlanPrecheckError);
      return;
    }

    setProcessingId(idContrato);
    try {
      const duplicateCheck = await supabase
        .from("contrato")
        .select("id_contrato")
        .eq("numero_formulario", numeroFormularioFinal)
        .neq("id_contrato", idContrato)
        .limit(1);

      if (duplicateCheck.error) throw duplicateCheck.error;
      if ((duplicateCheck.data ?? []).length > 0) {
        setFormalizeNumeroFormularioError("Ya existe otro contrato con ese número de formulario");
        toast.error("Ya existe otro contrato con ese número de formulario");
        return;
      }

      const formalizeRecord: PreContratoDetalle = {
        ...formalizeTarget,
        contrato: {
          ...formalizeTarget.contrato,
          numero_formulario: numeroFormularioFinal,
        },
      };
      const { clientName, categoryName, categoryType, folderName } = buildOneDriveFolderPayload(formalizeRecord);

      // Primero se asegura la estructura en OneDrive; si esta parte falla, el contrato no se formaliza.
      const { data, error: oneDriveError } = await supabase.functions.invoke<OneDriveFolderResult>(
        "onedrive-create-client-folder",
        {
          body: {
            clientName,
            categoryName,
            categoryType,
            folderName,
          },
        }
      );

      if (oneDriveError) {
        console.error("Error creando carpeta de cliente en OneDrive:", oneDriveError);
        const detailedMessage = await getFunctionErrorMessage(
          oneDriveError,
          "No se pudo crear la estructura del cliente en OneDrive"
        );
        throw new Error(detailedMessage);
      }

      if (!data?.ok || !data.folderId) {
        throw new Error("OneDrive no devolvio una respuesta valida para la carpeta del cliente");
      }

      const { data: formalizeData, error } = await supabase.rpc("formalizar_contrato_y_generar_plan_pago", {
        p_id_contrato: idContrato,
        p_numero_formulario: numeroFormularioFinal,
        p_fecha_primera_cuota: fechaPrimeraCuota,
        p_usuario: user?.email ?? role ?? "usuario",
      });

      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setFormalizeNumeroFormularioError("Ya existe otro contrato con ese número de formulario");
          toast.error("Ya existe otro contrato con ese número de formulario");
          return;
        }
        throw error;
      }

      const formalizeResult = asSingle(
        formalizeData as FormalizeContractResult | FormalizeContractResult[] | null,
      );
      const cuotasGeneradas = formalizeResult?.resultado_plan?.cuotas_generadas ?? 0;

      toast.success(
        cuotasGeneradas > 0
          ? `Precontrato formalizado, carpeta creada en ${categoryName} y plan de pago generado (${cuotasGeneradas} cuotas).`
          : `Precontrato formalizado y carpeta creada en ${categoryName}.`,
      );
      setFormalizeTarget(null);
      setFormalizeNumeroFormulario("");
      setFormalizeNumeroFormularioError(null);
      setFormalizeFechaPrimeraCuota("");
      setFormalizeFechaPrimeraCuotaError(null);
      await loadPrecontratos();
    } catch (error) {
      console.error("Error formalizando precontrato:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo formalizar el precontrato");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <TooltipProvider delayDuration={180}>
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2">
              {isAdmin ? "Formalizar Pre-Contratos" : "Listado de Pre-Contratos"}
            </h1>
            <p className="text-lg text-muted-foreground">
              {isAdmin
                ? "Carpeta por persona con opciones para editar, eliminar o formalizar."
                : "Carpeta por persona para consulta general de precontratos (solo lectura)."}
            </p>
            {!supportsNumeroFormulario && (
              <p className="mt-1 text-xs text-warning">
                Modo compatibilidad activo: aplica la migración de número_formulario para mostrar
                ese dato en todos los registros.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(menuPath)}>
              Volver al Menu
            </Button>
            <Button variant="secondary" onClick={() => void loadPrecontratos()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchCliente}
              onChange={(e) => setSearchCliente(e.target.value)}
              placeholder="Buscar precontratos por nombre..."
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {agrupadosFiltrados.length} carpeta(s) encontrada(s)
          </p>
        </div>

        {loading && <PrecontractLoadingSkeleton />}

        {!loading && agrupadosPorCliente.length === 0 && (
          <Card className="rounded-lg border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>No hay precontratos pendientes</CardTitle>
              <CardDescription>
                Cuando existan registros en estado PRECONTRATO aparecerán en esta sección.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && agrupadosPorCliente.length > 0 && agrupadosFiltrados.length === 0 && (
          <Card className="rounded-lg border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>No se encontraron resultados</CardTitle>
              <CardDescription>
                Intenta buscar con otro nombre o limpia el texto de búsqueda.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && agrupadosFiltrados.length > 0 && (
          <Accordion
            type="multiple"
            value={openFolders}
            onValueChange={setOpenFolders}
            className="space-y-3"
          >
            {agrupadosFiltrados.map((grupo) => (
              <AccordionItem
                key={grupo.key}
                value={grupo.key}
                className="rounded-lg border border-border bg-card px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <FolderClosed className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-base font-semibold text-card-foreground">
                        {grupo.clienteNombre}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {grupo.items.length} precontrato(s)
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {grupo.items.map((item) => {
                      const processing = processingId === item.contrato.id_contrato;
                      const expected = (() => {
                        try {
                          return buildOneDriveFolderPayload(item);
                        } catch {
                          return null;
                        }
                      })();
                      const precontractTitle = formatContractDisplayLabel(item.contrato, {
                        fallback: "Formulario pendiente",
                      });
                      const plazoContrato =
                        item.contrato.total_meses !== null && item.contrato.total_meses !== undefined
                          ? `${item.contrato.total_meses} meses`
                          : item.contrato.plazo_anios !== null && item.contrato.plazo_anios !== undefined
                            ? `${item.contrato.plazo_anios * 12} meses`
                            : "No definido";
                      const diaPago =
                        item.contrato.dia_pago_mensual !== null && item.contrato.dia_pago_mensual !== undefined
                          ? String(item.contrato.dia_pago_mensual)
                          : "No definido";
                      const tasaInteres =
                        item.contrato.tasa_interes_anual !== null && item.contrato.tasa_interes_anual !== undefined
                          ? `${item.contrato.tasa_interes_anual}%`
                          : "No definido";
                      const cantidadLotes =
                        item.contrato.cantidad_lotes !== null && item.contrato.cantidad_lotes !== undefined
                          ? String(item.contrato.cantidad_lotes)
                          : "No definido";
                      const anioMantenimiento = formatMaintenanceStartDisplay(
                        item.contrato.fecha_inicio_mantenimiento,
                        item.contrato.anio_inicio_mantenimiento,
                      );

                      return (
                        <article
                          key={item.contrato.id_contrato}
                          className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm transition-all duration-200 hover:shadow-md"
                        >
                          <div className="border-b border-border/70 bg-surface p-5">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="flex min-w-0 gap-4">
                                <div className="mt-1 rounded-lg bg-warning/30 p-3 text-warning-foreground">
                                  <FileText className="h-6 w-6" />
                                </div>
                                <div className="min-w-0">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <PrecontractStatusBadge />
                                    <OneDrivePendingBadge />
                                  </div>
                                  <h2 className="break-words text-2xl font-bold text-text-primary">{precontractTitle}</h2>
                                  <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                                    {displayValue(item.cliente?.nombre_completo, "Cliente no registrado")} - Firma:{" "}
                                    {formatDate(item.contrato.fecha_firma)}
                                  </p>
                                </div>
                              </div>
                              {isAdmin ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => openEdit(item)}
                                    disabled={processing}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    Editar
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => openFormalize(item)}
                                    disabled={processing}
                                  >
                                    <FileCheck2 className="h-4 w-4" />
                                    Formalizar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setDeleteTarget(item)}
                                    disabled={processing}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Eliminar
                                  </Button>
                                </div>
                              ) : (
                                <span className="rounded-md border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                                  Solo lectura
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="space-y-4 p-5">
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                              <SectionPanel
                                icon={User}
                                title="Cliente"
                                description="Datos principales del titular antes de formalizar."
                              >
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <InfoLine label="Nombre" value={displayValue(item.cliente?.nombre_completo, "Sin nombre")} />
                                  <InfoLine label="Cedula" value={displayValue(item.cliente?.cedula, "No registrada")} />
                                  <InfoLine label="Estado civil" value={displayValue(item.cliente?.estado_civil, "No registrado")} />
                                  <InfoLine label="Profesion" value={displayValue(item.cliente?.profesion, "No registrada")} />
                                  <InfoLine icon={Mail} label="Correo" value={displayValue(item.cliente?.email, "No registrado")} />
                                  <InfoLine icon={Phone} label="Telefono 1" value={displayValue(item.cliente?.telefono1, "No registrado")} />
                                  <InfoLine icon={Phone} label="Telefono 2" value={displayValue(item.cliente?.telefono2, "No registrado")} />
                                  <InfoLine icon={MapPin} label="Direccion" value={displayValue(item.cliente?.direccion, "No registrada")} />
                                </div>
                              </SectionPanel>

                              <SectionPanel
                                icon={FileText}
                                title="Precontrato"
                                description="Condiciones operativas que se convertirán en contrato vigente."
                              >
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <InfoLine icon={Calendar} label="Fecha de firma" value={formatDate(item.contrato.fecha_firma)} />
                                  <InfoLine label="Plazo" value={plazoContrato} />
                                  <InfoLine label="Dia de pago" value={diaPago} />
                                  <InfoLine
                                    label="Tasa interes"
                                    value={tasaInteres}
                                    tooltip="Tasa anual registrada para el calculo financiero."
                                  />
                                  <InfoLine label="Cantidad lotes" value={cantidadLotes} />
                                  <InfoLine label="Inicio mantenimiento" value={anioMantenimiento} />
                                  <InfoLine label="Vendedor" value={displayValue(item.vendedor?.nombre_completo, "No asignado")} />
                                  <InfoLine
                                    label="ID interno"
                                    value={item.contrato.id_contrato}
                                    tooltip="Identificador tecnico del precontrato en base de datos."
                                  />
                                  <div className="sm:col-span-2">
                                    <InfoLine
                                      label="Observaciones"
                                      value={displayValue(item.contrato.observaciones_contrato, "Sin observaciones")}
                                    />
                                  </div>
                                </div>
                              </SectionPanel>
                            </div>

                            <SectionPanel
                              icon={DollarSign}
                              title="Informacion financiera"
                              description="Montos complementarios para validar antes de formalizar."
                            >
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <InfoLine label="Prima" value={formatCurrency(item.contrato.monto_entregado_inicial)} />
                                <InfoLine label="Mantenimiento anual" value={formatCurrency(item.contrato.monto_mantenimiento_anual)} />
                                <InfoLine label="Monto apertura" value={formatCurrency(item.contrato.monto_apertura)} />
                                <InfoLine label="Saldo pendiente" value={formatCurrency(item.contrato.saldo_pendiente)} />
                              </div>
                            </SectionPanel>

                            <SectionPanel
                              icon={Cloud}
                              title="OneDrive"
                              description="Carpeta que se creará al formalizar el precontrato."
                              className="bg-primary-soft/30"
                            >
                              {expected ? (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                  <InfoLine
                                    label="Categoria"
                                    value={getCategoryLabel(expected)}
                                    tooltip="Ruta esperada segun el producto principal del precontrato."
                                  />
                                  <InfoLine
                                    label="Carpeta contrato"
                                    value={expected.folderName}
                                    tooltip="Nombre exacto que se usara al crear la carpeta en OneDrive."
                                  />
                                </div>
                              ) : (
                                <EmptyState message="No se pudo calcular la ruta esperada con los productos del precontrato." />
                              )}
                            </SectionPanel>

                            <SectionPanel
                              icon={FolderClosed}
                              title="Productos"
                              description="Lotes, cenizarios o servicios incluidos en el precontrato."
                            >
                              {item.productos.length === 0 ? (
                                <EmptyState message="Sin productos vinculados." />
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {item.productos.map((producto) => (
                                    <span
                                      key={producto.id_contrato_producto}
                                      className="rounded-full border border-primary/20 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary"
                                    >
                                      {getProductoLabel(producto)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </SectionPanel>

                            <SectionPanel
                              icon={Users}
                              title="Autorizados y beneficiario"
                              description="Personas relacionadas que pasarán al contrato vigente."
                            >
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                    Pre-autorizados
                                  </p>
                                  {item.autorizados.length === 0 ? (
                                    <EmptyState message="Sin pre-autorizados registrados." />
                                  ) : (
                                    <div className="space-y-2">
                                      {item.autorizados.map((autorizado) => (
                                        <div
                                          key={autorizado.id_contrato_autorizado}
                                          className="flex items-center gap-3 rounded-md bg-surface px-3 py-2"
                                        >
                                          <User className="h-4 w-4 text-primary" />
                                          <div>
                                            <p className="text-sm font-medium text-text-primary">{autorizado.nombre}</p>
                                            <p className="text-xs text-text-secondary">
                                              {displayValue(autorizado.cedula, "Cedula no registrada")}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                    Beneficiario
                                  </p>
                                  {item.beneficiarios.length === 0 ? (
                                    <EmptyState message="Sin beneficiario registrado." />
                                  ) : (
                                    <div className="space-y-2">
                                      {item.beneficiarios.slice(0, 1).map((beneficiario) => (
                                        <div
                                          key={beneficiario.id_contrato_beneficiario}
                                          className="flex items-center gap-3 rounded-md bg-surface px-3 py-2"
                                        >
                                          <Users className="h-4 w-4 text-primary" />
                                          <div>
                                            <p className="text-sm font-medium text-text-primary">{beneficiario.nombre}</p>
                                            <p className="text-xs text-text-secondary">
                                              {displayValue(beneficiario.cedula, "Cedula no registrada")}
                                              {beneficiario.contacto ? ` - ${beneficiario.contacto}` : ""}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </SectionPanel>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      {isAdmin && (
        <Dialog
          open={editOpen}
          onOpenChange={(open) => {
            if (!open) {
              if (ignoreEditCloseConfirmation) {
                setIgnoreEditCloseConfirmation(false);
                setEditOpen(false);
                setEditingRecord(null);
                return;
              }
              setShowEditCancelConfirm(true);
              return;
            }
            setEditOpen(open);
            setShowEditCancelConfirm(false);
            setIgnoreEditCloseConfirmation(false);
          }}
        >
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar precontrato</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Puedes editar toda la información del precontrato y ajustar sus productos.
              </DialogDescription>
            </DialogHeader>
            <PreClienteForm
              key={editingRecord ? `precontrato-editar-${editingRecord.contrato.id_contrato}` : "precontrato-editar"}
              initialValues={editingRecord ? buildEditInitialValues(editingRecord) : undefined}
              onComplete={handleSaveEdit}
              submitButtonLabel="Guardar cambios"
              showConfirmation={false}
              confirmOnSubmit={true}
              saveConfirmationTitle="Guardar cambios del precontrato"
              saveConfirmationDescription="¿Estás seguro de guardar los cambios realizados?"
              saveConfirmationActionLabel="Guardar cambios"
              useWhiteGraphBackground={true}
              useDarkGraphText={true}
              skipNumeroFormularioUniquenessCheck={true}
              hideNumeroFormulario={true}
              ignoredLoteIds={ignoredLoteIds}
              ignoredCenizarioIds={ignoredCenizarioIds}
            />
          </DialogContent>
        </Dialog>
      )}

      {isAdmin && (
        <AlertDialog
          open={showEditCancelConfirm}
          onOpenChange={(open) => {
            if (!open) {
              setShowEditCancelConfirm(false);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar edición</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Seguro deseas salir sin guardar? Los cambios no se conservarán.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Seguir editando</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowEditCancelConfirm(false);
                  setIgnoreEditCloseConfirmation(true);
                  setEditOpen(false);
                }}
              >
                Sí, salir sin guardar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isAdmin && (
        <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar precontrato</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el precontrato seleccionado. Úsalo solo para casos descartados
              que no se formalizarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDeletePrecontrato()}
            >
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {isAdmin && (
        <AlertDialog
        open={Boolean(formalizeTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setFormalizeTarget(null);
            setFormalizeNumeroFormulario("");
            setFormalizeNumeroFormularioError(null);
            setFormalizeFechaPrimeraCuota("");
            setFormalizeFechaPrimeraCuotaError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Formalizar precontrato</AlertDialogTitle>
            <AlertDialogDescription>
              Ingresa el número de formulario oficial antes de formalizar. Mientras el contrato siga como
              precontrato se mostrará como Formulario pendiente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="numero-formulario-formalizacion">
              Número de formulario oficial *
            </label>
            <Input
              id="numero-formulario-formalizacion"
              value={formalizeNumeroFormulario}
              onChange={(event) => {
                setFormalizeNumeroFormulario(event.target.value);
                setFormalizeNumeroFormularioError(null);
              }}
              placeholder="Ej: F-001"
              disabled={processingId !== null}
            />
            {formalizeNumeroFormularioError && (
              <p className="text-xs text-destructive">{formalizeNumeroFormularioError}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="fecha-primera-cuota-formalizacion">
              Fecha de primera cuota *
            </label>
            <Input
              id="fecha-primera-cuota-formalizacion"
              type="date"
              value={formalizeFechaPrimeraCuota}
              onChange={(event) => {
                setFormalizeFechaPrimeraCuota(event.target.value);
                setFormalizeFechaPrimeraCuotaError(null);
              }}
              disabled={processingId !== null}
            />
            {formalizeFechaPrimeraCuotaError && (
              <p className="text-xs text-destructive">{formalizeFechaPrimeraCuotaError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processingId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleFormalizePrecontrato();
              }}
              disabled={processingId !== null}
            >
              <CheckCircle2 className="h-4 w-4" />
              {processingId !== null ? "Formalizando..." : "Confirmar formalización"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </div>
    </TooltipProvider>
  );
}








