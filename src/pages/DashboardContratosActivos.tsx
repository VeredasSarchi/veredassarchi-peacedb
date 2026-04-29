import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  File,
  FileUp,
  FolderClosed,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buildOneDriveFolderPayload, type OneDriveFolderPayload } from "@/lib/contract-onedrive";

type ContratoRow = Tables<"contrato"> & { numero_formulario: string | null };
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

type ContratoDetalle = {
  contrato: ContratoRow;
  cliente: ClienteRow | null;
  vendedor: VendedorRow | null;
  productos: ProductoDetalle[];
  autorizados: AutorizadoRow[];
  beneficiarios: BeneficiarioRow[];
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

function estadoContratoLabel(estado: string | null | undefined): string {
  if (!estado) return "No definido";
  return estado;
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

function formatFileSize(value: number | null) {
  if (value === null || value === undefined) return "Sin tamano";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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

export default function DashboardContratosActivos() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const menuPath = role === "vendedor" ? "/vendedor" : "/";

  const [contratos, setContratos] = useState<ContratoDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [supportsNumeroFormulario, setSupportsNumeroFormulario] = useState(true);
  const [searchCliente, setSearchCliente] = useState("");
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [driveByContract, setDriveByContract] = useState<Record<number, DriveFolderState>>({});

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

      const fetchContratos = (includeNumeroFormulario: boolean) =>
        supabase
          .from("contrato")
          .select(
            includeNumeroFormulario ? `numero_formulario,${contratoSelectBase}` : contratoSelectBase,
          )
          .in("estado_contrato", ["CONTRATO", "VIGENTE"])
          .order("id_contrato", { ascending: false });

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

      const contratosBase: ContratoDetalle[] = (contratosData ?? []).map((row: any) => ({
        contrato: {
          ...(row as Tables<"contrato">),
          numero_formulario: row.numero_formulario ?? row.numero_contrato ?? null,
        } as ContratoRow,
        cliente: asSingle(row.cliente),
        vendedor: asSingle(row.vendedor),
        productos: [],
        autorizados: [],
        beneficiarios: [],
      }));

      const contractIds = contratosBase.map((item) => item.contrato.id_contrato);
      if (contractIds.length === 0) {
        setContratos([]);
        setDriveByContract({});
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
        supabase.from("contrato_autorizados").select("*").in("id_contrato", contractIds),
        supabase.from("contrato_beneficiarios").select("*").in("id_contrato", contractIds),
      ]);

      if (productosRes.error) throw productosRes.error;
      if (autorizadosRes.error) throw autorizadosRes.error;
      if (beneficiariosRes.error) throw beneficiariosRes.error;

      const productosByContrato = new Map<number, ProductoDetalle[]>();
      (productosRes.data ?? []).forEach((raw: any) => {
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

      const detallados = contratosBase.map((item) => {
        const idContrato = item.contrato.id_contrato;
        return {
          ...item,
          productos: productosByContrato.get(idContrato) ?? [],
          autorizados: autorizadosByContrato.get(idContrato) ?? [],
          beneficiarios: beneficiariosByContrato.get(idContrato) ?? [],
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
    async (contract: ContratoDetalle, folderId: string, folderName: string, files: FileList | null) => {
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
        await loadSubfolderItems(contractId, folderId, folderName);
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

  return (
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

        {loading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">Cargando contratos activos...</CardContent>
          </Card>
        )}

        {!loading && agrupadosPorCliente.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No hay contratos activos</CardTitle>
              <CardDescription>
                Cuando existan registros en estado CONTRATO o VIGENTE apareceran en esta seccion.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && agrupadosPorCliente.length > 0 && agrupadosFiltrados.length === 0 && (
          <Card>
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

                      return (
                        <Card key={item.contrato.id_contrato} className="border border-border/70">
                          <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <CardTitle className="text-base">
                                  {item.contrato.numero_formulario || "Sin numero de formulario"}
                                </CardTitle>
                                <CardDescription>
                                  Estado: {estadoContratoLabel(item.contrato.estado_contrato)} - Fecha:{" "}
                                  {item.contrato.fecha_firma || "Sin fecha"}
                                </CardDescription>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {driveState.exists ? (
                                  <Badge className="bg-success text-success-foreground hover:bg-success">
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    Existe en OneDrive
                                  </Badge>
                                ) : driveState.error ? (
                                  <Badge variant="destructive">
                                    <AlertCircle className="mr-1 h-3 w-3" />
                                    Error OneDrive
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Pendiente de validar</Badge>
                                )}
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => void inspectContractFolder(item)}
                                  disabled={driveState.loading}
                                >
                                  {driveState.loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
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
                                    Abrir carpeta real
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="rounded-md border border-border/70 p-3">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Cliente</p>
                                <p className="text-sm text-card-foreground">{item.cliente?.nombre_completo || "Sin nombre"}</p>
                                <p className="text-xs text-muted-foreground">Cedula: {item.cliente?.cedula || "No registrada"}</p>
                                <p className="text-xs text-muted-foreground">Correo: {item.cliente?.email || "No registrado"}</p>
                                <p className="text-xs text-muted-foreground">Telefono 1: {item.cliente?.telefono1 || "No registrado"}</p>
                                <p className="text-xs text-muted-foreground">Direccion: {item.cliente?.direccion || "No registrada"}</p>
                              </div>
                              <div className="rounded-md border border-border/70 p-3">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Ruta esperada en OneDrive</p>
                                {expected ? (
                                  <div className="space-y-1 text-xs text-card-foreground">
                                    <p>Categoria: <span className="font-medium">{getCategoryLabel(expected)}</span></p>
                                    <p>Carpeta contrato: <span className="font-medium break-all">{expected.folderName}</span></p>
                                    {driveState.categoryPath && (
                                      <p>Ruta validada: <span className="font-medium break-all">{driveState.categoryPath}</span></p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    No se pudo calcular la ruta esperada con los productos del contrato.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-2">Productos del contrato</p>
                              {item.productos.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin productos vinculados.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {item.productos.map((producto) => (
                                    <span
                                      key={producto.id_contrato_producto}
                                      className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                                    >
                                      {getProductoLabel(producto)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="rounded-md border border-border/70 p-4">
                              <div className="mb-3">
                                <p className="text-sm font-semibold text-card-foreground">Resumen financiero y operativo</p>
                                <p className="text-xs text-muted-foreground">
                                  Los montos y datos clave del contrato se resaltan para lectura rapida.
                                </p>
                              </div>
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
                                    item.contrato.plazo_anios !== null && item.contrato.plazo_anios !== undefined
                                      ? `${item.contrato.plazo_anios} años`
                                      : "No definido"
                                  }
                                />
                                <DetailRow
                                  label="Total meses"
                                  value={
                                    item.contrato.total_meses !== null && item.contrato.total_meses !== undefined
                                      ? String(item.contrato.total_meses)
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
                                  label="Año inicio mantenimiento"
                                  value={
                                    item.contrato.anio_inicio_mantenimiento !== null &&
                                    item.contrato.anio_inicio_mantenimiento !== undefined
                                      ? String(item.contrato.anio_inicio_mantenimiento)
                                      : "No definido"
                                  }
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
                            </div>

                            <div className="rounded-md border border-border/70 p-4">
                              <div className="mb-3">
                                <p className="text-sm font-semibold text-card-foreground">Expediente OneDrive</p>
                                <p className="text-xs text-muted-foreground">
                                  Este bloque refleja la carpeta real del contrato y permite subir archivos a COMPROBANTES y FACTURAS.
                                </p>
                              </div>

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
                                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-card-foreground hover:bg-muted/50">
                                              <FileUp className="h-4 w-4" />
                                              {driveState.uploadingFolderId === folder.id ? "Subiendo..." : "Adjuntar archivo"}
                                              <input
                                                type="file"
                                                multiple
                                                className="hidden"
                                                disabled={driveState.uploadingFolderId === folder.id}
                                                onChange={(event) => {
                                                  void handleFileUpload(item, folder.id!, folder.name || "Carpeta", event.target.files);
                                                  event.currentTarget.value = "";
                                                }}
                                              />
                                            </label>
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
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Pre-autorizados</p>
                                {item.autorizados.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Sin registros.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {item.autorizados.map((autorizado) => (
                                      <p key={autorizado.id_contrato_autorizado} className="text-xs text-card-foreground">
                                        {autorizado.nombre}
                                        {autorizado.cedula ? ` - ${autorizado.cedula}` : ""}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Beneficiarios</p>
                                {item.beneficiarios.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Sin registros.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {item.beneficiarios.map((beneficiario) => (
                                      <p key={beneficiario.id_contrato_beneficiario} className="text-xs text-card-foreground">
                                        {beneficiario.nombre}
                                        {beneficiario.cedula ? ` - ${beneficiario.cedula}` : ""}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
