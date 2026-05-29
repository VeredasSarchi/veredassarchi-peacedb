import { type ComponentType, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Cloud,
  DollarSign,
  ExternalLink,
  File,
  FileText,
  FileUp,
  FolderClosed,
  FolderOpen,
  Info,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Ban,
  History,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatContractDisplayLabel } from "@/lib/contract-display";
import { buildOneDriveFolderPayload, type OneDriveFolderPayload } from "@/lib/contract-onedrive";
import { renameContractFolderAsCancelled } from "@/lib/onedrive-service";
import { cn } from "@/lib/utils";

type ContratoRow = Tables<"contrato"> & {
  numero_formulario: string | null;
  fecha_inicio_mantenimiento?: string | null;
};
type ClienteRow = Tables<"cliente">;
type VendedorRow = Tables<"vendedor">;
type AutorizadoRow = Tables<"contrato_autorizados">;
type BeneficiarioRow = Tables<"contrato_beneficiarios">;
type EditLogRow = Tables<"contrato_edicion_log">;
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

type ContratoDetalle = {
  contrato: ContratoRow;
  cliente: ClienteRow | null;
  vendedor: VendedorRow | null;
  productos: ProductoDetalle[];
  autorizados: AutorizadoRow[];
  beneficiarios: BeneficiarioRow[];
  editLogs: EditLogRow[];
};

type ContratoSelectRow = Tables<"contrato"> & {
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

type AutorizadoDraft = {
  nombre: string;
  cedula: string;
};

type BeneficiarioDraft = {
  nombre: string;
  cedula: string;
  contacto: string;
};

type ContractEditDraft = {
  cliente: {
    cedula: string;
    email: string;
    direccion: string;
    estado_civil: string;
    profesion: string;
    telefono1: string;
    telefono2: string;
    observaciones: string;
  };
  contrato: {
    fecha_firma: string;
    observaciones_contrato: string;
  };
  autorizados: AutorizadoDraft[];
  beneficiarios: BeneficiarioDraft[];
};

type OneDriveItem = {
  id: string | null;
  name: string | null;
  webUrl: string | null;
  isFolder: boolean;
  mimeType: string | null;
  size: number | null;
  lastModifiedDateTime: string | null;
};

type InspectContractResponse = {
  ok: boolean;
  exists: boolean;
  categoryName: string;
  categoryType: OneDriveFolderPayload["categoryType"];
  categoryPath: string;
  folder?: {
    id: string;
    name: string;
    webUrl: string | null;
  };
  items?: OneDriveItem[];
};

type ListFolderChildrenResponse = {
  ok: boolean;
  items: OneDriveItem[];
};

type UploadFileResponse = {
  ok: boolean;
  item: OneDriveItem;
};

type FileUploadButtonProps = {
  uploading: boolean;
  onFilesSelected: (files: FileList | null) => void;
};

type DriveFolderState = {
  loading: boolean;
  error: string | null;
  exists: boolean;
  expected: OneDriveFolderPayload | null;
  categoryPath: string | null;
  rootFolder: {
    id: string;
    name: string;
    webUrl: string | null;
  } | null;
  items: OneDriveItem[];
  selectedFolderId: string | null;
  selectedFolderName: string | null;
  selectedFolderItems: OneDriveItem[];
  selectedFolderLoading: boolean;
  selectedFolderError: string | null;
  uploadingFolderId: string | null;
};

function createEmptyDriveState(expected: OneDriveFolderPayload | null): DriveFolderState {
  return {
    loading: false,
    error: null,
    exists: false,
    expected,
    categoryPath: null,
    rootFolder: null,
    items: [],
    selectedFolderId: null,
    selectedFolderName: null,
    selectedFolderItems: [],
    selectedFolderLoading: false,
    selectedFolderError: null,
    uploadingFolderId: null,
  };
}

function FileUploadButton({ uploading, onFilesSelected }: FileUploadButtonProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-card-foreground hover:bg-muted/50">
      <FileUp className="h-4 w-4" />
      {uploading ? "Subiendo..." : "Adjuntar archivo"}
      <input
        type="file"
        multiple
        className="hidden"
        disabled={uploading}
        onChange={(event) => {
          onFilesSelected(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

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

function isMissingNumeroFormularioColumn(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  return message.toLowerCase().includes("numero_formulario");
}

function isMissingEditHistoryTable(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  return message.toLowerCase().includes("contrato_edicion_log");
}

function estadoContratoLabel(estado: string | null | undefined): string {
  if (!estado) return "No definido";
  if (estado === "VIGENTE") return "Vigente";
  if (estado === "ANULADO") return "Anulado";
  return estado;
}

function isActiveContractState(estado: string | null | undefined): boolean {
  return estado === "VIGENTE";
}

function toInputValue(value: string | null | undefined): string {
  return value ?? "";
}

function toNullableTrimmed(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAutorizados(values: AutorizadoDraft[]): AutorizadoDraft[] {
  return values
    .map((item) => ({
      nombre: item.nombre.trim(),
      cedula: item.cedula.trim(),
    }))
    .filter((item) => item.nombre.length > 0);
}

function normalizeBeneficiarios(values: BeneficiarioDraft[]): BeneficiarioDraft[] {
  return values
    .map((item) => ({
      nombre: item.nombre.trim(),
      cedula: item.cedula.trim(),
      contacto: item.contacto.trim(),
    }))
    .filter((item) => item.nombre.length > 0)
    .slice(0, 1);
}

function createEditDraft(record: ContratoDetalle): ContractEditDraft {
  return {
    cliente: {
      cedula: toInputValue(record.cliente?.cedula),
      email: toInputValue(record.cliente?.email),
      direccion: toInputValue(record.cliente?.direccion),
      estado_civil: toInputValue(record.cliente?.estado_civil),
      profesion: toInputValue(record.cliente?.profesion),
      telefono1: toInputValue(record.cliente?.telefono1),
      telefono2: toInputValue(record.cliente?.telefono2),
      observaciones: toInputValue(record.cliente?.observaciones),
    },
    contrato: {
      fecha_firma: toInputValue(record.contrato.fecha_firma),
      observaciones_contrato: toInputValue(record.contrato.observaciones_contrato),
    },
    autorizados:
      record.autorizados.length > 0
        ? record.autorizados.map((item) => ({
            nombre: toInputValue(item.nombre),
            cedula: toInputValue(item.cedula),
          }))
        : [],
    beneficiarios:
      record.beneficiarios.length > 0
        ? record.beneficiarios.slice(0, 1).map((item) => ({
            nombre: toInputValue(item.nombre),
            cedula: toInputValue(item.cedula),
            contacto: toInputValue(item.contacto),
          }))
        : [],
  };
}

function normalizeEditDraft(draft: ContractEditDraft): ContractEditDraft {
  return {
    cliente: {
      cedula: draft.cliente.cedula.trim(),
      email: draft.cliente.email.trim(),
      direccion: draft.cliente.direccion.trim(),
      estado_civil: draft.cliente.estado_civil.trim(),
      profesion: draft.cliente.profesion.trim(),
      telefono1: draft.cliente.telefono1.trim(),
      telefono2: draft.cliente.telefono2.trim(),
      observaciones: draft.cliente.observaciones.trim(),
    },
    contrato: {
      fecha_firma: draft.contrato.fecha_firma.trim(),
      observaciones_contrato: draft.contrato.observaciones_contrato.trim(),
    },
    autorizados: normalizeAutorizados(draft.autorizados),
    beneficiarios: normalizeBeneficiarios(draft.beneficiarios),
  };
}

function buildEditChangeLog(before: ContractEditDraft, after: ContractEditDraft) {
  const cambios: Record<string, { antes: Json; despues: Json }> = {};
  const resumen: string[] = [];
  const addScalarChange = (key: string, label: string, oldValue: string, newValue: string) => {
    if (oldValue === newValue) return;
    cambios[key] = {
      antes: oldValue || null,
      despues: newValue || null,
    };
    resumen.push(label);
  };

  const beforeNormalized = normalizeEditDraft(before);
  const afterNormalized = normalizeEditDraft(after);

  addScalarChange("cliente.cedula", "Cedula", beforeNormalized.cliente.cedula, afterNormalized.cliente.cedula);
  addScalarChange("cliente.email", "Correo", beforeNormalized.cliente.email, afterNormalized.cliente.email);
  addScalarChange("cliente.telefono1", "Telefono 1", beforeNormalized.cliente.telefono1, afterNormalized.cliente.telefono1);
  addScalarChange("cliente.telefono2", "Telefono 2", beforeNormalized.cliente.telefono2, afterNormalized.cliente.telefono2);
  addScalarChange("cliente.direccion", "Direccion", beforeNormalized.cliente.direccion, afterNormalized.cliente.direccion);
  addScalarChange("cliente.estado_civil", "Estado civil", beforeNormalized.cliente.estado_civil, afterNormalized.cliente.estado_civil);
  addScalarChange("cliente.profesion", "Profesion", beforeNormalized.cliente.profesion, afterNormalized.cliente.profesion);
  addScalarChange("cliente.observaciones", "Observaciones del cliente", beforeNormalized.cliente.observaciones, afterNormalized.cliente.observaciones);
  addScalarChange("contrato.fecha_firma", "Fecha de firma", beforeNormalized.contrato.fecha_firma, afterNormalized.contrato.fecha_firma);
  addScalarChange(
    "contrato.observaciones_contrato",
    "Observaciones del contrato",
    beforeNormalized.contrato.observaciones_contrato,
    afterNormalized.contrato.observaciones_contrato,
  );

  if (JSON.stringify(beforeNormalized.autorizados) !== JSON.stringify(afterNormalized.autorizados)) {
    cambios.autorizados = {
      antes: beforeNormalized.autorizados as unknown as Json,
      despues: afterNormalized.autorizados as unknown as Json,
    };
    resumen.push("Pre-autorizados");
  }

  if (JSON.stringify(beforeNormalized.beneficiarios) !== JSON.stringify(afterNormalized.beneficiarios)) {
    cambios.beneficiarios = {
      antes: beforeNormalized.beneficiarios as unknown as Json,
      despues: afterNormalized.beneficiarios as unknown as Json,
    };
    resumen.push("Beneficiarios");
  }

  return {
    cambios,
    resumen,
    normalized: afterNormalized,
  };
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
    return producto.tipo_cremacion?.descripcion || "Cremacion";
  }
  if (producto.tipo_producto === "PAQUETE_FUNERARIO") {
    return producto.paquete_funerario?.descripcion
      ? `Paquete ${producto.paquete_funerario.descripcion}`
      : "Paquete funerario";
  }
  return "Producto";
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-CR");
}

function formatMaintenanceStartDisplay(
  fechaInicioMantenimiento: string | null | undefined,
  anioInicioMantenimiento: number | null | undefined,
): string {
  if (fechaInicioMantenimiento) {
    const parsed = new Date(`${fechaInicioMantenimiento}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("es-CR");
    }
    return fechaInicioMantenimiento;
  }

  if (anioInicioMantenimiento) {
    return String(anioInicioMantenimiento);
  }

  return "No definido";
}

function formatFileSize(value: number | null) {
  if (value === null || value === undefined) return "Sin tamano";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const EDIT_CHANGE_LABELS: Record<string, string> = {
  "cliente.cedula": "Cedula",
  "cliente.email": "Correo",
  "cliente.telefono1": "Telefono 1",
  "cliente.telefono2": "Telefono 2",
  "cliente.direccion": "Direccion",
  "cliente.estado_civil": "Estado civil",
  "cliente.profesion": "Profesion",
  "cliente.observaciones": "Observaciones del cliente",
  "contrato.fecha_firma": "Fecha de firma",
  "contrato.observaciones_contrato": "Observaciones del contrato",
  autorizados: "Pre-autorizados",
  beneficiarios: "Beneficiarios",
};

const ESTADO_CIVIL_OPTIONS = ["Soltero/a", "Casado/a", "Divorciado/a", "Viudo/a", "Union Libre"];

function formatAuditValue(value: Json | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Sin valor";
  }
  if (Array.isArray(value)) {
    const names = value
      .map((item) =>
        typeof item === "object" && item && "nombre" in item
          ? String((item as { nombre?: unknown }).nombre ?? "")
          : "",
      )
      .filter(Boolean);
    return names.length > 0 ? names.join(", ") : JSON.stringify(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function getEditLogDetails(cambios: Json) {
  if (!cambios || typeof cambios !== "object" || Array.isArray(cambios)) {
    return [];
  }

  return Object.entries(cambios).flatMap(([key, rawValue]) => {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      return [];
    }
    const change = rawValue as { antes?: Json; despues?: Json };
    return [
      {
        key,
        label: EDIT_CHANGE_LABELS[key] ?? key,
        before: formatAuditValue(change.antes),
        after: formatAuditValue(change.despues),
      },
    ];
  });
}

function getCategoryLabel(expected: OneDriveFolderPayload | null) {
  if (!expected) return "Sin ruta";
  if (expected.categoryType === "funeral_package") {
    return `PAQUETES FUNERARIOS / ${expected.categoryName}`;
  }
  if (expected.categoryType === "cremation") {
    return `CREMACIONES / ${expected.categoryName}`;
  }
  return expected.categoryName;
}

function openExternalUrl(url: string | null | undefined) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function DetailRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={highlight ? "mt-1 text-sm font-bold text-primary" : "mt-1 text-sm font-semibold text-text-primary"}>
        {value}
      </p>
    </div>
  );
}

function displayValue(value: string | number | null | undefined, fallback = "No definido"): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function getEstadoBadgeClass(estado: string | null | undefined): string {
  if (estado === "VIGENTE") return "bg-success text-success-foreground hover:bg-success";
  if (estado === "ANULADO") return "bg-destructive text-destructive-foreground hover:bg-destructive";
  return "bg-warning text-warning-foreground hover:bg-warning";
}

function getEstadoVisualLabel(estado: string | null | undefined): string {
  if (estado === "VIGENTE") return "Vigente";
  if (estado === "ANULADO") return "Anulado";
  return "Pendiente";
}

function ContractStatusBadge({ estado }: { estado: string | null | undefined }) {
  return (
    <Badge className={cn("rounded-full px-3 py-1 text-xs shadow-sm", getEstadoBadgeClass(estado))}>
      {getEstadoVisualLabel(estado)}
    </Badge>
  );
}

function DriveStatusBadge({ driveState }: { driveState: DriveFolderState }) {
  if (driveState.exists) {
    return (
      <Badge className="rounded-full bg-success text-success-foreground shadow-sm hover:bg-success">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Conectado
      </Badge>
    );
  }
  if (driveState.error) {
    return (
      <Badge variant="destructive" className="rounded-full shadow-sm">
        <AlertCircle className="mr-1 h-3 w-3" />
        Error
      </Badge>
    );
  }
  return (
    <Badge className="rounded-full bg-warning text-warning-foreground shadow-sm hover:bg-warning">
      <Info className="mr-1 h-3 w-3" />
      No validado
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

function ContractLoadingSkeleton() {
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

export default function DashboardContratosActivos() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const menuPath = role === "vendedor" ? "/vendedor" : "/";

  const [contratos, setContratos] = useState<ContratoDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [supportsNumeroFormulario, setSupportsNumeroFormulario] = useState(true);
  const [searchCliente, setSearchCliente] = useState("");
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [driveByContract, setDriveByContract] = useState<Record<number, DriveFolderState>>({});
  const [cancelTarget, setCancelTarget] = useState<ContratoDetalle | null>(null);
  const [cancellingContractId, setCancellingContractId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ContratoDetalle | null>(null);
  const [editDraft, setEditDraft] = useState<ContractEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<ContratoDetalle | null>(null);

  const loadContratosActivos = useCallback(async () => {
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
        data: ContratoSelectRow[] | null;
        error: unknown | null;
      }> => {
        const selectedColumns: string = includeNumeroFormulario
          ? `numero_formulario,${contratoSelectBase}`
          : contratoSelectBase;

        const result = await supabase
          .from("contrato")
          .select(selectedColumns)
          .eq("estado_contrato", "VIGENTE")
          .order("id_contrato", { ascending: false });

        return {
          data: ((result.data ?? null) as unknown) as ContratoSelectRow[] | null,
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
      const contratosBase: ContratoDetalle[] = contratoRows.map((row) => ({
        contrato: {
          ...(row as Tables<"contrato">),
          numero_formulario: row.numero_formulario ?? null,
        } as ContratoRow,
        cliente: asSingle(row.cliente),
        vendedor: asSingle(row.vendedor),
        productos: [],
        autorizados: [],
        beneficiarios: [],
        editLogs: [],
      }));

      const contractIds = contratosBase.map((item) => item.contrato.id_contrato);
      if (contractIds.length === 0) {
        setContratos([]);
        setDriveByContract({});
        return;
      }

      const [productosRes, autorizadosRes, beneficiariosRes, editLogsRes] = await Promise.all([
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
        supabase.from("contrato_autorizados").select("*").in("id_contrato", contractIds),
        supabase.from("contrato_beneficiarios").select("*").in("id_contrato", contractIds),
        supabase
          .from("contrato_edicion_log")
          .select("*")
          .in("id_contrato", contractIds)
          .order("fecha", { ascending: false }),
      ]);

      if (productosRes.error) throw productosRes.error;
      if (autorizadosRes.error) throw autorizadosRes.error;
      if (beneficiariosRes.error) throw beneficiariosRes.error;
      if (editLogsRes.error && !isMissingEditHistoryTable(editLogsRes.error)) {
        throw editLogsRes.error;
      }

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
                  (tipoCenizarioRaw as { jardin?: JardinMini | JardinMini[] | null }).jardin,
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

      const editLogsByContrato = new Map<number, EditLogRow[]>();
      if (!editLogsRes.error) {
        (editLogsRes.data ?? []).forEach((item) => {
          const current = editLogsByContrato.get(item.id_contrato) ?? [];
          current.push(item);
          editLogsByContrato.set(item.id_contrato, current);
        });
      }

      const detallados = contratosBase.map((item) => {
        const idContrato = item.contrato.id_contrato;
        return {
          ...item,
          productos: productosByContrato.get(idContrato) ?? [],
          autorizados: autorizadosByContrato.get(idContrato) ?? [],
          beneficiarios: beneficiariosByContrato.get(idContrato) ?? [],
          editLogs: editLogsByContrato.get(idContrato) ?? [],
        };
      });

      setContratos(detallados);
      setDriveByContract((prev) => {
        const next: Record<number, DriveFolderState> = {};
        detallados.forEach((item) => {
          next[item.contrato.id_contrato] = prev[item.contrato.id_contrato] ?? createEmptyDriveState(null);
        });
        return next;
      });
    } catch (error) {
      console.error("Error cargando contratos activos:", error);
      toast.error("No se pudieron cargar los contratos activos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContratosActivos();
  }, [loadContratosActivos]);

  const agrupadosPorCliente = useMemo(() => {
    const map = new Map<string, { key: string; clienteNombre: string; items: ContratoDetalle[] }>();

    contratos.forEach((item) => {
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
  }, [contratos]);

  const agrupadosFiltrados = useMemo(() => {
    const term = normalizeSearchValue(searchCliente);
    if (!term) return agrupadosPorCliente;
    return agrupadosPorCliente.filter((grupo) =>
      normalizeSearchValue(grupo.clienteNombre).includes(term),
    );
  }, [agrupadosPorCliente, searchCliente]);

  useEffect(() => {
    const validKeys = new Set(agrupadosPorCliente.map((grupo) => grupo.key));
    setOpenFolders((prev) => prev.filter((key) => validKeys.has(key)));
  }, [agrupadosPorCliente]);

  const openEditContract = useCallback((record: ContratoDetalle) => {
    setEditTarget(record);
    setEditDraft(createEditDraft(record));
    setEditOpen(true);
  }, []);

  const closeEditContract = useCallback(() => {
    if (savingEdit) return;
    setEditOpen(false);
    setEditTarget(null);
    setEditDraft(null);
  }, [savingEdit]);

  const updateClienteDraft = useCallback(
    (field: keyof ContractEditDraft["cliente"], value: string) => {
      setEditDraft((prev) =>
        prev
          ? {
              ...prev,
              cliente: {
                ...prev.cliente,
                [field]: value,
              },
            }
          : prev,
      );
    },
    [],
  );

  const updateContratoDraft = useCallback(
    (field: keyof ContractEditDraft["contrato"], value: string) => {
      setEditDraft((prev) =>
        prev
          ? {
              ...prev,
              contrato: {
                ...prev.contrato,
                [field]: value,
              },
            }
          : prev,
      );
    },
    [],
  );

  const updateAutorizadoDraft = useCallback((index: number, field: keyof AutorizadoDraft, value: string) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      const autorizados = [...prev.autorizados];
      autorizados[index] = {
        ...(autorizados[index] ?? { nombre: "", cedula: "" }),
        [field]: value,
      };
      return { ...prev, autorizados };
    });
  }, []);

  const updateBeneficiarioDraft = useCallback((index: number, field: keyof BeneficiarioDraft, value: string) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      const beneficiarios = [...prev.beneficiarios];
      beneficiarios[index] = {
        ...(beneficiarios[index] ?? { nombre: "", cedula: "", contacto: "" }),
        [field]: value,
      };
      return { ...prev, beneficiarios };
    });
  }, []);

  const addAutorizadoDraft = useCallback(() => {
    setEditDraft((prev) =>
      prev
        ? {
            ...prev,
            autorizados: [...prev.autorizados, { nombre: "", cedula: "" }],
          }
        : prev,
    );
  }, []);

  const addBeneficiarioDraft = useCallback(() => {
    setEditDraft((prev) =>
      prev
        ? {
            ...prev,
            beneficiarios:
              prev.beneficiarios.length === 0
                ? [{ nombre: "", cedula: "", contacto: "" }]
                : prev.beneficiarios.slice(0, 1),
          }
        : prev,
    );
  }, []);

  const removeAutorizadoDraft = useCallback((index: number) => {
    setEditDraft((prev) =>
      prev
        ? {
            ...prev,
            autorizados: prev.autorizados.filter((_, currentIndex) => currentIndex !== index),
          }
        : prev,
    );
  }, []);

  const removeBeneficiarioDraft = useCallback((index: number) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      const nextBeneficiarios = prev.beneficiarios.filter((_, currentIndex) => currentIndex !== index);
      return {
        ...prev,
        beneficiarios: nextBeneficiarios.slice(0, 1),
      };
    });
  }, []);

  const handleSaveContractEdit = useCallback(async () => {
    if (!editTarget || !editDraft) return;
    if (!editTarget.cliente?.id_cliente) {
      toast.error("No se pudo identificar el cliente para editar");
      return;
    }

    const beforeDraft = createEditDraft(editTarget);
    const { cambios, resumen, normalized } = buildEditChangeLog(beforeDraft, editDraft);

    if (normalized.cliente.telefono1.length === 0 || normalized.cliente.telefono2.length === 0) {
      toast.error("Telefono 1 y Telefono 2 son obligatorios");
      return;
    }

    if (normalized.beneficiarios.length === 0) {
      toast.error("Debe existir un beneficiario");
      return;
    }

    if (resumen.length === 0) {
      toast.info("No hay cambios para guardar");
      closeEditContract();
      return;
    }

    const idContrato = editTarget.contrato.id_contrato;
    const idCliente = editTarget.cliente.id_cliente;
    setSavingEdit(true);

    try {
      const { error: clienteError } = await supabase
        .from("cliente")
        .update({
          cedula: toNullableTrimmed(normalized.cliente.cedula),
          email: toNullableTrimmed(normalized.cliente.email),
          direccion: toNullableTrimmed(normalized.cliente.direccion),
          estado_civil: toNullableTrimmed(normalized.cliente.estado_civil),
          profesion: toNullableTrimmed(normalized.cliente.profesion),
          telefono1: normalized.cliente.telefono1,
          telefono2: normalized.cliente.telefono2,
          observaciones: toNullableTrimmed(normalized.cliente.observaciones),
        })
        .eq("id_cliente", idCliente);

      if (clienteError) throw clienteError;

      const { error: contratoError } = await supabase
        .from("contrato")
        .update({
          fecha_firma: toNullableTrimmed(normalized.contrato.fecha_firma),
          observaciones_contrato: toNullableTrimmed(normalized.contrato.observaciones_contrato),
        })
        .eq("id_contrato", idContrato);

      if (contratoError) throw contratoError;

      const { error: deleteAutorizadosError } = await supabase
        .from("contrato_autorizados")
        .delete()
        .eq("id_contrato", idContrato);
      if (deleteAutorizadosError) throw deleteAutorizadosError;

      if (normalized.autorizados.length > 0) {
        const { error: insertAutorizadosError } = await supabase.from("contrato_autorizados").insert(
          normalized.autorizados.map((item) => ({
            id_contrato: idContrato,
            nombre: item.nombre,
            cedula: toNullableTrimmed(item.cedula),
          })),
        );
        if (insertAutorizadosError) throw insertAutorizadosError;
      }

      const { error: deleteBeneficiariosError } = await supabase
        .from("contrato_beneficiarios")
        .delete()
        .eq("id_contrato", idContrato);
      if (deleteBeneficiariosError) throw deleteBeneficiariosError;

      const { error: insertBeneficiariosError } = await supabase.from("contrato_beneficiarios").insert(
        normalized.beneficiarios.map((item) => ({
          id_contrato: idContrato,
          nombre: item.nombre,
          cedula: toNullableTrimmed(item.cedula),
          contacto: toNullableTrimmed(item.contacto),
        })),
      );
      if (insertBeneficiariosError) throw insertBeneficiariosError;

      const { error: logError } = await supabase.from("contrato_edicion_log").insert({
        id_contrato: idContrato,
        usuario: user?.email ?? role ?? "usuario",
        resumen: resumen.join(", "),
        cambios,
      });

      if (logError) {
        if (isMissingEditHistoryTable(logError)) {
          toast.warning("Contrato actualizado. Aplica la migracion de historial para registrar futuros cambios");
        } else {
          throw logError;
        }
      } else {
        toast.success("Contrato actualizado e historial registrado");
      }

      setEditOpen(false);
      setEditTarget(null);
      setEditDraft(null);
      await loadContratosActivos();
    } catch (error) {
      console.error("Error actualizando contrato:", error);
      toast.error("No se pudo actualizar el contrato");
    } finally {
      setSavingEdit(false);
    }
  }, [closeEditContract, editDraft, editTarget, loadContratosActivos, role, user?.email]);

  const inspectContractFolder = useCallback(async (item: ContratoDetalle) => {
    const contractId = item.contrato.id_contrato;
    let expected: OneDriveFolderPayload;

    try {
      expected = buildOneDriveFolderPayload(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo construir la ruta esperada en OneDrive";
      setDriveByContract((prev) => ({
        ...prev,
        [contractId]: {
          ...(prev[contractId] ?? createEmptyDriveState(null)),
          expected: null,
          loading: false,
          error: message,
        },
      }));
      toast.error(message);
      return;
    }

    setDriveByContract((prev) => ({
      ...prev,
      [contractId]: {
        ...(prev[contractId] ?? createEmptyDriveState(expected)),
        expected,
        loading: true,
        error: null,
        selectedFolderError: null,
      },
    }));

    try {
      const { data, error } = await supabase.functions.invoke<InspectContractResponse>(
        "onedrive-contract-browser",
        {
          body: {
            action: "inspect_contract",
            categoryName: expected.categoryName,
            categoryType: expected.categoryType,
            folderName: expected.folderName,
          },
        },
      );

      if (error) {
        throw new Error(
          await getFunctionErrorMessage(error, "No se pudo consultar la carpeta del contrato en OneDrive"),
        );
      }

      if (!data?.ok) {
        throw new Error("OneDrive no devolvio una respuesta valida para este contrato");
      }

      setDriveByContract((prev) => ({
        ...prev,
        [contractId]: {
          ...(prev[contractId] ?? createEmptyDriveState(expected)),
          expected,
          loading: false,
          error: null,
          exists: data.exists,
          categoryPath: data.categoryPath ?? null,
          rootFolder: data.folder
            ? {
                id: data.folder.id,
                name: data.folder.name,
                webUrl: data.folder.webUrl,
              }
            : null,
          items: data.items ?? [],
          selectedFolderId: null,
          selectedFolderName: null,
          selectedFolderItems: [],
          selectedFolderLoading: false,
          selectedFolderError: null,
          uploadingFolderId: null,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo consultar OneDrive";
      setDriveByContract((prev) => ({
        ...prev,
        [contractId]: {
          ...(prev[contractId] ?? createEmptyDriveState(expected)),
          expected,
          loading: false,
          error: message,
        },
      }));
      toast.error(message);
    }
  }, []);

  const loadSubfolderItems = useCallback(async (contractId: number, folderId: string, folderName: string) => {
    setDriveByContract((prev) => ({
      ...prev,
      [contractId]: {
        ...(prev[contractId] ?? createEmptyDriveState(null)),
        selectedFolderId: folderId,
        selectedFolderName: folderName,
        selectedFolderLoading: true,
        selectedFolderError: null,
      },
    }));

    try {
      const { data, error } = await supabase.functions.invoke<ListFolderChildrenResponse>(
        "onedrive-contract-browser",
        {
          body: {
            action: "list_folder_children",
            folderId,
          },
        },
      );

      if (error) {
        throw new Error(await getFunctionErrorMessage(error, "No se pudo listar el contenido de la carpeta"));
      }

      if (!data?.ok) {
        throw new Error("OneDrive no devolvio el contenido de la carpeta");
      }

      setDriveByContract((prev) => ({
        ...prev,
        [contractId]: {
          ...(prev[contractId] ?? createEmptyDriveState(null)),
          selectedFolderId: folderId,
          selectedFolderName: folderName,
          selectedFolderItems: data.items,
          selectedFolderLoading: false,
          selectedFolderError: null,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo listar el contenido de la carpeta";
      setDriveByContract((prev) => ({
        ...prev,
        [contractId]: {
          ...(prev[contractId] ?? createEmptyDriveState(null)),
          selectedFolderId: folderId,
          selectedFolderName: folderName,
          selectedFolderLoading: false,
          selectedFolderError: message,
        },
      }));
      toast.error(message);
    }
  }, []);

  const handleFileUpload = useCallback(
    async (
      contract: ContratoDetalle,
      folderId: string,
      folderName: string,
      files: FileList | null,
      refreshSelectedFolder = true,
    ) => {
      if (!files || files.length === 0) return;

      const contractId = contract.contrato.id_contrato;
      setDriveByContract((prev) => ({
        ...prev,
        [contractId]: {
          ...(prev[contractId] ?? createEmptyDriveState(null)),
          uploadingFolderId: folderId,
        },
      }));

      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("folderId", folderId);
          formData.append("file", file);

          const { error } = await supabase.functions.invoke<UploadFileResponse>("onedrive-upload-file", {
            body: formData,
          });

          if (error) {
            throw new Error(await getFunctionErrorMessage(error, `No se pudo subir ${file.name}`));
          }
        }

        toast.success("Archivo(s) subido(s) correctamente a OneDrive");
        if (refreshSelectedFolder) {
          await loadSubfolderItems(contractId, folderId, folderName);
        }
        await inspectContractFolder(contract);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo subir el archivo";
        toast.error(message);
      } finally {
        setDriveByContract((prev) => ({
          ...prev,
          [contractId]: {
            ...(prev[contractId] ?? createEmptyDriveState(null)),
            uploadingFolderId: null,
          },
        }));
      }
    },
    [inspectContractFolder, loadSubfolderItems],
  );

  const registerOneDriveCancellationSync = useCallback(
    async (contractId: number, status: "COMPLETADO" | "ERROR" | "PENDIENTE", errorMessage: string | null) => {
      const { error } = await supabase.rpc("registrar_sync_anulacion_onedrive", {
        p_id_contrato: contractId,
        p_estado: status,
        p_error: errorMessage,
        p_usuario: user?.email ?? role ?? "usuario",
      });

      if (error) {
        throw error;
      }
    },
    [role, user?.email],
  );

  const handleCancelContract = useCallback(async () => {
    if (!cancelTarget) return;

    const contractId = cancelTarget.contrato.id_contrato;
    if (!isActiveContractState(cancelTarget.contrato.estado_contrato)) {
      toast.error("No se puede anular un contrato que no esta vigente");
      setCancelTarget(null);
      return;
    }

    let expectedFolder: OneDriveFolderPayload | null = null;
    let expectedFolderError: string | null = null;
    try {
      expectedFolder = buildOneDriveFolderPayload(cancelTarget);
    } catch (error) {
      expectedFolderError =
        error instanceof Error ? error.message : "No se pudo construir la ruta esperada en OneDrive";
    }

    setCancellingContractId(contractId);

    try {
      const { error: cancellationError } = await supabase.rpc("anular_contrato", {
        p_id_contrato: contractId,
        p_usuario: user?.email ?? role ?? "usuario",
      });

      if (cancellationError) {
        throw cancellationError;
      }

      if (!expectedFolder) {
        const message = expectedFolderError ?? "No se pudo identificar la carpeta del contrato en OneDrive";
        try {
          await registerOneDriveCancellationSync(contractId, "ERROR", message);
        } catch (syncError) {
          console.error("Error registrando el fallo de OneDrive:", syncError);
        }
        toast.warning(`Contrato anulado. OneDrive queda pendiente de reintento: ${message}`);
        return;
      }

      try {
        await renameContractFolderAsCancelled(expectedFolder);
        try {
          await registerOneDriveCancellationSync(contractId, "COMPLETADO", null);
          toast.success("Contrato anulado y carpeta de OneDrive renombrada correctamente");
        } catch (syncError) {
          console.error("Error registrando la sincronizacion completada de OneDrive:", syncError);
          toast.warning("Contrato anulado y carpeta renombrada, pero no se pudo registrar el estado de OneDrive");
        }
      } catch (oneDriveError) {
        const message =
          oneDriveError instanceof Error
            ? oneDriveError.message
            : "No se pudo renombrar la carpeta en OneDrive";
        try {
          await registerOneDriveCancellationSync(contractId, "ERROR", message);
        } catch (syncError) {
          console.error("Error registrando el fallo de OneDrive:", syncError);
        }
        toast.warning(`Contrato anulado. OneDrive queda pendiente de reintento: ${message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo anular el contrato";
      toast.error(message);
    } finally {
      setCancellingContractId(null);
      setCancelTarget(null);
      await loadContratosActivos();
    }
  }, [cancelTarget, loadContratosActivos, registerOneDriveCancellationSync, role, user?.email]);

  return (
    <TooltipProvider delayDuration={180}>
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2">Contratos Activos</h1>
            <p className="text-lg text-muted-foreground">
              Vista administrativa alineada con la estructura real de expedientes en OneDrive.
            </p>
            {!supportsNumeroFormulario && (
              <p className="mt-1 text-xs text-warning">
                Modo compatibilidad activo: aplica la migracion de numero_formulario para mostrar ese dato en todos los
                registros.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(menuPath)}>
              Volver al Menu
            </Button>
            <Button variant="secondary" onClick={() => void loadContratosActivos()} disabled={loading}>
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
              placeholder="Buscar contratos por nombre..."
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">{agrupadosFiltrados.length} carpeta(s) encontrada(s)</p>
        </div>

        {loading && <ContractLoadingSkeleton />}

        {!loading && agrupadosPorCliente.length === 0 && (
          <Card className="rounded-lg border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>No hay contratos activos</CardTitle>
              <CardDescription>
                Cuando existan registros en estado vigente apareceran en esta seccion.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && agrupadosPorCliente.length > 0 && agrupadosFiltrados.length === 0 && (
          <Card className="rounded-lg border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>No se encontraron resultados</CardTitle>
              <CardDescription>Intenta buscar con otro nombre o limpia el texto de busqueda.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && agrupadosFiltrados.length > 0 && (
          <Accordion type="multiple" value={openFolders} onValueChange={setOpenFolders} className="space-y-3">
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
                      <p className="text-base font-semibold text-card-foreground">{grupo.clienteNombre}</p>
                      <p className="text-xs text-muted-foreground">{grupo.items.length} contrato(s)</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {grupo.items.map((item) => {
                      const driveState = driveByContract[item.contrato.id_contrato] ?? createEmptyDriveState(null);
                      const expected = (() => {
                        try {
                          return buildOneDriveFolderPayload(item);
                        } catch {
                          return null;
                        }
                      })();
                      const contractFolders = driveState.items.filter((driveItem) => driveItem.isFolder);
                      const contractFiles = driveState.items.filter((driveItem) => !driveItem.isFolder);
                      const contractTitle = formatContractDisplayLabel(item.contrato);
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
                                <div className="mt-1 rounded-lg bg-primary-soft p-3 text-primary">
                                  <FileText className="h-6 w-6" />
                                </div>
                                <div className="min-w-0">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <ContractStatusBadge estado={item.contrato.estado_contrato} />
                                    <DriveStatusBadge driveState={driveState} />
                                  </div>
                                  <h2 className="break-words text-2xl font-bold text-text-primary">{contractTitle}</h2>
                                  <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                                    {displayValue(item.cliente?.nombre_completo, "Cliente no registrado")} - Firma:{" "}
                                    {formatDate(item.contrato.fecha_firma)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => void inspectContractFolder(item)}
                                  disabled={driveState.loading}
                                >
                                  {driveState.loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Cloud className="h-4 w-4" />
                                  )}
                                  Validar OneDrive
                                </Button>
                                {driveState.rootFolder?.webUrl && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openExternalUrl(driveState.rootFolder?.webUrl)}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    Abrir carpeta
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openEditContract(item)}
                                  disabled={savingEdit}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Editar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setHistoryTarget(item)}>
                                  <History className="h-4 w-4" />
                                  Historial
                                </Button>
                                {isActiveContractState(item.contrato.estado_contrato) && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setCancelTarget(item)}
                                    disabled={cancellingContractId === item.contrato.id_contrato}
                                  >
                                    {cancellingContractId === item.contrato.id_contrato ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Ban className="h-4 w-4" />
                                    )}
                                    Anular
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-4 p-5">
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                              <SectionPanel
                                icon={User}
                                title="Cliente"
                                description="Datos principales del titular del contrato."
                              >
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <InfoLine label="Nombre" value={displayValue(item.cliente?.nombre_completo, "Sin nombre")} />
                                  <InfoLine label="Cedula" value={displayValue(item.cliente?.cedula, "No registrada")} />
                                  <InfoLine icon={Mail} label="Correo" value={displayValue(item.cliente?.email, "No registrado")} />
                                  <InfoLine icon={Phone} label="Telefono 1" value={displayValue(item.cliente?.telefono1, "No registrado")} />
                                  <InfoLine icon={Phone} label="Telefono 2" value={displayValue(item.cliente?.telefono2, "No registrado")} />
                                  <InfoLine label="Estado civil" value={displayValue(item.cliente?.estado_civil)} />
                                  <InfoLine label="Profesion" value={displayValue(item.cliente?.profesion)} />
                                  <InfoLine
                                    icon={MapPin}
                                    label="Direccion"
                                    value={displayValue(item.cliente?.direccion, "No registrada")}
                                  />
                                </div>
                              </SectionPanel>

                              <SectionPanel
                                icon={FileText}
                                title="Contrato"
                                description="Condiciones operativas y datos de seguimiento."
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
                                  <InfoLine
                                    label="Vendedor"
                                    value={displayValue(item.vendedor?.nombre_completo, "No asignado")}
                                  />
                                  <InfoLine
                                    label="ID interno"
                                    value={item.contrato.id_contrato}
                                    tooltip="Identificador tecnico del contrato en base de datos."
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
                              description="Montos complementarios usados para seguimiento administrativo."
                            >
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <DetailRow
                                  label="Monto total"
                                  value={formatCurrency(item.contrato.monto_arrendamiento_total)}
                                  highlight
                                />
                                <DetailRow
                                  label="Cuota mensual"
                                  value={formatCurrency(item.contrato.cuota_mensual)}
                                  highlight
                                />
                                <DetailRow
                                  label="Prima"
                                  value={formatCurrency(item.contrato.monto_entregado_inicial)}
                                  highlight
                                />
                                <DetailRow
                                  label="Saldo pendiente"
                                  value={formatCurrency(item.contrato.saldo_pendiente)}
                                  highlight
                                />
                                <DetailRow
                                  label="Mantenimiento anual"
                                  value={formatCurrency(item.contrato.monto_mantenimiento_anual)}
                                  highlight
                                />
                                <DetailRow
                                  label="Monto apertura"
                                  value={formatCurrency(item.contrato.monto_apertura)}
                                  highlight
                                />
                                <DetailRow
                                  label="Plazo"
                                  value={
                                    item.contrato.total_meses !== null && item.contrato.total_meses !== undefined
                                      ? `${item.contrato.total_meses} meses`
                                      : item.contrato.plazo_anios !== null && item.contrato.plazo_anios !== undefined
                                        ? `${item.contrato.plazo_anios * 12} meses`
                                        : "No definido"
                                  }
                                />
                                <DetailRow
                                  label="Día de pago"
                                  value={
                                    item.contrato.dia_pago_mensual !== null && item.contrato.dia_pago_mensual !== undefined
                                      ? String(item.contrato.dia_pago_mensual)
                                      : "No definido"
                                  }
                                />
                                <DetailRow
                                  label="Tasa interés anual"
                                  value={
                                    item.contrato.tasa_interes_anual !== null && item.contrato.tasa_interes_anual !== undefined
                                      ? `${item.contrato.tasa_interes_anual}%`
                                      : "No definido"
                                  }
                                />
                                <DetailRow
                                  label="Cantidad lotes"
                                  value={
                                    item.contrato.cantidad_lotes !== null && item.contrato.cantidad_lotes !== undefined
                                      ? String(item.contrato.cantidad_lotes)
                                      : "No definido"
                                  }
                                />
                                <DetailRow
                                  label="Inicio mantenimiento"
                                  value={anioMantenimiento}
                                />
                                <div className="rounded-md border border-border/60 bg-accent/10 px-3 py-2 md:col-span-2 xl:col-span-2">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                                    Observaciones
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-text-primary">
                                    {item.contrato.observaciones_contrato || "Sin observaciones"}
                                  </p>
                                </div>
                                <DetailRow
                                  label="Vendedor"
                                  value={item.vendedor?.nombre_completo || "No asignado"}
                                />
                              </div>
                            </SectionPanel>

                            <SectionPanel
                              icon={FolderClosed}
                              title="Productos"
                              description="Lotes, cenizarios o servicios vinculados."
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
                              icon={Cloud}
                              title="OneDrive"
                              description="Expediente digital y carpetas asociadas al contrato."
                              className="bg-primary-soft/30"
                            >
                              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-md bg-secondary-soft p-2 text-text-primary">
                                    <FolderOpen className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-text-primary">
                                      {driveState.exists ? "Carpeta conectada" : "Carpeta no validada"}
                                    </p>
                                    <p className="line-clamp-2 text-xs text-text-secondary">
                                      {driveState.exists
                                        ? displayValue(driveState.rootFolder?.name, "Expediente OneDrive")
                                        : "Valida OneDrive para confirmar el expediente."}
                                    </p>
                                  </div>
                                </div>
                                <DriveStatusBadge driveState={driveState} />
                              </div>

                              {expected ? (
                                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                  <InfoLine
                                    label="Categoria"
                                    value={getCategoryLabel(expected)}
                                    tooltip="Ruta esperada segun el producto principal del contrato."
                                  />
                                  <InfoLine
                                    label="Carpeta contrato"
                                    value={expected.folderName}
                                    tooltip="Nombre exacto esperado para la carpeta del contrato."
                                  />
                                  {driveState.categoryPath && (
                                    <div className="md:col-span-2">
                                      <InfoLine
                                        label="Ruta validada"
                                        value={driveState.categoryPath}
                                        tooltip="Ruta devuelta por Microsoft Graph durante la validacion."
                                      />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="mb-4">
                                  <EmptyState message="No se pudo calcular la ruta esperada con los productos del contrato." />
                                </div>
                              )}

                              {driveState.loading && (
                                <div className="space-y-3">
                                  <Skeleton className="h-16" />
                                  <Skeleton className="h-16" />
                                </div>
                              )}

                              {driveState.error && (
                                <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                  {driveState.error}
                                </div>
                              )}

                              {!driveState.loading && !driveState.exists && !driveState.error && (
                                <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                                  Aun no se ha validado la carpeta en OneDrive o no existe fisicamente.
                                </div>
                              )}

                              {driveState.exists && (
                                <div className="space-y-4">
                                  {driveState.rootFolder?.id && (
                                    <div className="rounded-md border border-border/70 bg-surface px-3 py-3">
                                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="flex items-center gap-3">
                                          <FolderOpen className="h-5 w-5 text-primary" />
                                          <div>
                                            <p className="text-sm font-medium text-card-foreground">
                                              {driveState.rootFolder.name || "Carpeta principal"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Aqui puedes adjuntar el contrato del cliente
                                            </p>
                                          </div>
                                        </div>
                                        <FileUploadButton
                                          uploading={driveState.uploadingFolderId === driveState.rootFolder.id}
                                          onFilesSelected={(files) => {
                                            void handleFileUpload(
                                              item,
                                              driveState.rootFolder!.id,
                                              driveState.rootFolder!.name || "Carpeta principal",
                                              files,
                                              false,
                                            );
                                          }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  <div className="grid gap-3 md:grid-cols-2">
                                    {contractFolders.length > 0 ? contractFolders.map((folder) => (
                                      <div
                                        key={folder.id ?? folder.name ?? "folder"}
                                        className="rounded-md border border-border/70 bg-surface px-3 py-3"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex items-center gap-3">
                                            <FolderOpen className="h-5 w-5 text-primary" />
                                            <div>
                                              <p className="text-sm font-medium text-card-foreground">{folder.name || "Carpeta"}</p>
                                              <p className="text-xs text-muted-foreground">Subcarpeta real en OneDrive</p>
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            {folder.webUrl && (
                                              <Button size="sm" variant="outline" onClick={() => openExternalUrl(folder.webUrl)}>
                                                <ExternalLink className="h-4 w-4" />
                                                Abrir
                                              </Button>
                                            )}
                                            {folder.id && (
                                              <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => void loadSubfolderItems(item.contrato.id_contrato, folder.id!, folder.name || "Carpeta")}
                                                disabled={driveState.selectedFolderLoading}
                                              >
                                                Ver contenido
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                        {folder.id && (
                                          <div className="mt-3">
                                            <FileUploadButton
                                              uploading={driveState.uploadingFolderId === folder.id}
                                              onFilesSelected={(files) => {
                                                void handleFileUpload(item, folder.id!, folder.name || "Carpeta", files);
                                              }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )) : (
                                      <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-3 text-xs text-muted-foreground md:col-span-2">
                                        La carpeta principal existe, pero no devolvio subcarpetas.
                                      </div>
                                    )}
                                  </div>

                                  {contractFiles.length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-muted-foreground">Archivos sueltos en la carpeta principal</p>
                                      {contractFiles.map((fileItem) => (
                                        <div
                                          key={fileItem.id ?? fileItem.name ?? "file"}
                                          className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2"
                                        >
                                          <div className="flex items-center gap-3">
                                            <File className="h-4 w-4 text-secondary" />
                                            <div>
                                              <p className="text-sm text-card-foreground">{fileItem.name || "Archivo"}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {formatFileSize(fileItem.size)} - {formatDate(fileItem.lastModifiedDateTime)}
                                              </p>
                                            </div>
                                          </div>
                                          {fileItem.webUrl && (
                                            <Button size="sm" variant="outline" onClick={() => openExternalUrl(fileItem.webUrl)}>
                                              <ExternalLink className="h-4 w-4" />
                                              Abrir
                                            </Button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {driveState.selectedFolderId && (
                                    <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 px-3 py-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-semibold text-card-foreground">{driveState.selectedFolderName}</p>
                                          <p className="text-xs text-muted-foreground">Contenido actual dentro de la subcarpeta seleccionada.</p>
                                        </div>
                                        {driveState.selectedFolderLoading && (
                                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        )}
                                      </div>

                                      {driveState.selectedFolderError && (
                                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                          {driveState.selectedFolderError}
                                        </div>
                                      )}

                                      {!driveState.selectedFolderLoading && driveState.selectedFolderItems.length === 0 && (
                                        <p className="text-xs text-muted-foreground">No hay archivos en esta subcarpeta.</p>
                                      )}

                                      {driveState.selectedFolderItems.map((folderItem) => (
                                        <div
                                          key={folderItem.id ?? folderItem.name ?? "selected-item"}
                                          className="flex items-center justify-between rounded-md border border-border/70 bg-surface px-3 py-2"
                                        >
                                          <div className="flex items-center gap-3">
                                            {folderItem.isFolder ? (
                                              <FolderOpen className="h-4 w-4 text-primary" />
                                            ) : (
                                              <File className="h-4 w-4 text-secondary" />
                                            )}
                                            <div>
                                              <p className="text-sm text-card-foreground">{folderItem.name || "Elemento"}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {folderItem.isFolder
                                                  ? "Carpeta"
                                                  : `${formatFileSize(folderItem.size)} - ${formatDate(folderItem.lastModifiedDateTime)}`}
                                              </p>
                                            </div>
                                          </div>
                                          {folderItem.webUrl && (
                                            <Button size="sm" variant="outline" onClick={() => openExternalUrl(folderItem.webUrl)}>
                                              <ExternalLink className="h-4 w-4" />
                                              Abrir
                                            </Button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </SectionPanel>

                            <SectionPanel
                              icon={Users}
                              title="Autorizados y beneficiario"
                              description="Personas relacionadas al contrato para gestiones futuras."
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
      <Dialog open={editOpen} onOpenChange={(open) => (!open ? closeEditContract() : setEditOpen(true))}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar contrato</DialogTitle>
            <DialogDescription>
              {formatContractDisplayLabel(editTarget?.contrato, { fallback: "Formulario pendiente" })}
            </DialogDescription>
          </DialogHeader>

          {editDraft && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-md border border-border/70 p-4">
                  <p className="text-sm font-semibold text-card-foreground">Datos del cliente</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Identificación
                      <Input
                        placeholder="Número de identificación"
                        value={editDraft.cliente.cedula}
                        onChange={(event) => updateClienteDraft("cedula", event.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Correo Electrónico
                      <Input
                        type="email"
                        placeholder="correo@ejemplo.com"
                        value={editDraft.cliente.email}
                        onChange={(event) => updateClienteDraft("email", event.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Teléfono 1 *
                      <Input
                        placeholder="Número de teléfono"
                        value={editDraft.cliente.telefono1}
                        onChange={(event) => updateClienteDraft("telefono1", event.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Teléfono 2 *
                      <Input
                        placeholder="Número de teléfono alternativo"
                        value={editDraft.cliente.telefono2}
                        onChange={(event) => updateClienteDraft("telefono2", event.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Estado Civil
                      <Select
                        value={editDraft.cliente.estado_civil}
                        onValueChange={(value) => updateClienteDraft("estado_civil", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione" />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADO_CIVIL_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Profesión
                      <Input
                        placeholder="Profesión u ocupación"
                        value={editDraft.cliente.profesion}
                        onChange={(event) => updateClienteDraft("profesion", event.target.value)}
                      />
                    </label>
                  </div>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Dirección
                    <Textarea
                      placeholder="Dirección completa"
                      value={editDraft.cliente.direccion}
                      onChange={(event) => updateClienteDraft("direccion", event.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Observaciones del cliente
                    <Textarea
                      placeholder="Notas relevantes del cliente"
                      value={editDraft.cliente.observaciones}
                      onChange={(event) => updateClienteDraft("observaciones", event.target.value)}
                    />
                  </label>
                </div>

                <div className="space-y-3 rounded-md border border-border/70 p-4">
                  <p className="text-sm font-semibold text-card-foreground">Datos del contrato</p>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Fecha de firma
                    <Input
                      type="date"
                      value={editDraft.contrato.fecha_firma}
                      onChange={(event) => updateContratoDraft("fecha_firma", event.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Observaciones del contrato
                    <Textarea
                      placeholder="Notas relevantes del pre-contrato"
                      className="min-h-28"
                      value={editDraft.contrato.observaciones_contrato}
                      onChange={(event) => updateContratoDraft("observaciones_contrato", event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-md border border-border/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-card-foreground">Pre-autorizados</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={addAutorizadoDraft}
                      disabled={editDraft.autorizados.length >= 4}
                    >
                      <Plus className="h-4 w-4" />
                      Agregar
                    </Button>
                  </div>

                  {editDraft.autorizados.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin pre-autorizados registrados.</p>
                  )}

                  {editDraft.autorizados.map((autorizado, index) => (
                    <div key={index} className="grid grid-cols-1 gap-3 rounded-md bg-muted/30 p-3 md:grid-cols-[1fr_1fr_auto]">
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Nombre Completo *
                        <Input
                          placeholder="Nombre completo del autorizado"
                          value={autorizado.nombre}
                          onChange={(event) => updateAutorizadoDraft(index, "nombre", event.target.value)}
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Cédula
                        <Input
                          placeholder="Número de cédula"
                          value={autorizado.cedula}
                          onChange={(event) => updateAutorizadoDraft(index, "cedula", event.target.value)}
                        />
                      </label>
                      <div className="flex items-end">
                        <Button type="button" size="icon" variant="outline" onClick={() => removeAutorizadoDraft(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 rounded-md border border-border/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-card-foreground">Beneficiario</p>
                    {editDraft.beneficiarios.length === 0 && (
                      <Button type="button" size="sm" variant="secondary" onClick={addBeneficiarioDraft}>
                        <Plus className="h-4 w-4" />
                        Agregar beneficiario
                      </Button>
                    )}
                  </div>

                  {editDraft.beneficiarios.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin beneficiario registrado.</p>
                  )}

                  {editDraft.beneficiarios.map((beneficiario, index) => (
                    <div key={index} className="grid grid-cols-1 gap-3 rounded-md bg-muted/30 p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Nombre Completo *
                        <Input
                          placeholder="Nombre completo del beneficiario"
                          value={beneficiario.nombre}
                          onChange={(event) => updateBeneficiarioDraft(index, "nombre", event.target.value)}
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Cédula
                        <Input
                          placeholder="Número de cédula"
                          value={beneficiario.cedula}
                          onChange={(event) => updateBeneficiarioDraft(index, "cedula", event.target.value)}
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Contacto
                        <Input
                          placeholder="Teléfono o correo de contacto"
                          value={beneficiario.contacto}
                          onChange={(event) => updateBeneficiarioDraft(index, "contacto", event.target.value)}
                        />
                      </label>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => removeBeneficiarioDraft(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeEditContract} disabled={savingEdit}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void handleSaveContractEdit()} disabled={savingEdit}>
                  {savingEdit ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(historyTarget)} onOpenChange={(open) => !open && setHistoryTarget(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de cambios</DialogTitle>
            <DialogDescription>
              {formatContractDisplayLabel(historyTarget?.contrato, { fallback: "Formulario pendiente" })}
            </DialogDescription>
          </DialogHeader>

          {!historyTarget || historyTarget.editLogs.length === 0 ? (
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              Sin cambios registrados para este contrato.
            </div>
          ) : (
            <div className="space-y-3">
              {historyTarget.editLogs.map((log) => {
                const details = getEditLogDetails(log.cambios);

                return (
                  <div key={log.id_log} className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
                    <p className="text-sm font-semibold text-card-foreground">
                      {formatDate(log.fecha)} - {log.usuario || "Usuario no registrado"}
                    </p>
                    <p className="text-xs text-muted-foreground">{log.resumen}</p>
                    {details.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {details.map((detail) => (
                          <div key={detail.key} className="rounded-md bg-background px-3 py-2">
                            <p className="text-xs font-semibold text-card-foreground">{detail.label}</p>
                            <p className="text-xs text-muted-foreground">Antes: {detail.before}</p>
                            <p className="text-xs text-card-foreground">Despues: {detail.after}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular contrato</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas anular este contrato?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingContractId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleCancelContract();
              }}
              disabled={cancellingContractId !== null}
            >
              {cancellingContractId !== null ? "Anulando..." : "Anular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
