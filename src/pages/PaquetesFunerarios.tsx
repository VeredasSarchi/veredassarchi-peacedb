import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowUpLeft,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type PaqueteFunerario = Tables<"paquete_funerario">;
type ClienteResumen = Pick<Tables<"cliente">, "id_cliente" | "nombre_completo">;
type ContratoResumen = Pick<
  Tables<"contrato">,
  "id_contrato" | "numero_formulario" | "numero_contrato" | "estado_contrato" | "fecha_firma"
> & {
  cliente: ClienteResumen | ClienteResumen[] | null;
};
type ProductoPaqueteRaw = Pick<
  Tables<"contrato_producto">,
  "id_contrato_producto" | "id_contrato" | "id_paquete" | "tipo_producto"
> & {
  contrato: ContratoResumen | ContratoResumen[] | null;
  paquete_funerario:
    | Pick<Tables<"paquete_funerario">, "id_paquete" | "descripcion">
    | Pick<Tables<"paquete_funerario">, "id_paquete" | "descripcion">[]
    | null;
};
type ProductoPaquete = Pick<
  Tables<"contrato_producto">,
  "id_contrato_producto" | "id_contrato" | "id_paquete" | "tipo_producto"
> & {
  contrato:
    | (Pick<
        Tables<"contrato">,
        | "id_contrato"
        | "numero_formulario"
        | "numero_contrato"
        | "estado_contrato"
        | "fecha_firma"
      > & {
        cliente: ClienteResumen | null;
      })
    | null;
  paquete_funerario: Pick<Tables<"paquete_funerario">, "id_paquete" | "descripcion"> | null;
};
type ClienteFolder = {
  key: string;
  packageId: number;
  contractId: number;
  folderName: string;
  clienteNombre: string;
  referencia: string;
  fechaFirma: string | null;
};

const DOCUMENT_FOLDERS = ["COMPROBANTES", "FACTURAS"] as const;
const FORMALIZED_STATES: ReadonlyArray<Tables<"contrato">["estado_contrato"]> = [
  "CONTRATO",
  "VIGENTE",
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function asSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function dedupePaquetesByDescripcion(items: PaqueteFunerario[]): PaqueteFunerario[] {
  const uniqueByName = new Map<string, PaqueteFunerario>();

  items.forEach((item) => {
    const key = normalizeText(item.descripcion);
    const current = uniqueByName.get(key);
    if (!current || item.id_paquete < current.id_paquete) {
      uniqueByName.set(key, item);
    }
  });

  return Array.from(uniqueByName.values()).sort((a, b) =>
    a.descripcion.localeCompare(b.descripcion, "es")
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-CR");
}

function isFormalizedState(value: Tables<"contrato">["estado_contrato"] | null | undefined): boolean {
  if (!value) return false;
  return FORMALIZED_STATES.includes(value);
}

export default function PaquetesFunerarios() {
  const navigate = useNavigate();

  const [paquetes, setPaquetes] = useState<PaqueteFunerario[]>([]);
  const [paqueteContratos, setPaqueteContratos] = useState<ProductoPaquete[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  const [selectedPaqueteId, setSelectedPaqueteId] = useState<number | null>(null);
  const [selectedClienteKey, setSelectedClienteKey] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPaquete, setEditingPaquete] = useState<PaqueteFunerario | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PaqueteFunerario | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPaquetes = useCallback(async () => {
    setLoading(true);
    try {
      const [paquetesRes, contratosPaquetesRes] = await Promise.all([
        supabase.from("paquete_funerario").select("*").order("descripcion", { ascending: true }),
        supabase
          .from("contrato_producto")
          .select(
            `
              id_contrato_producto,
              id_contrato,
              id_paquete,
              tipo_producto,
              contrato:contrato(
                id_contrato,
                numero_formulario,
                numero_contrato,
                estado_contrato,
                fecha_firma,
                cliente:cliente(
                  id_cliente,
                  nombre_completo
                )
              ),
              paquete_funerario:paquete_funerario(
                id_paquete,
                descripcion
              )
            `
          )
          .eq("tipo_producto", "PAQUETE_FUNERARIO")
          .not("id_paquete", "is", null),
      ]);

      if (paquetesRes.error) throw paquetesRes.error;
      if (contratosPaquetesRes.error) throw contratosPaquetesRes.error;

      setPaquetes(dedupePaquetesByDescripcion(paquetesRes.data ?? []));

      const rawRows = (contratosPaquetesRes.data ?? []) as unknown as ProductoPaqueteRaw[];
      const mappedRows: ProductoPaquete[] = rawRows.map((raw) => {
        const contratoRaw = asSingle(raw.contrato);
        const clienteRaw = contratoRaw ? asSingle(contratoRaw.cliente) : null;

        return {
          id_contrato_producto: raw.id_contrato_producto,
          id_contrato: raw.id_contrato,
          id_paquete: raw.id_paquete,
          tipo_producto: raw.tipo_producto,
          contrato: contratoRaw
            ? {
                id_contrato: contratoRaw.id_contrato,
                numero_formulario: contratoRaw.numero_formulario,
                numero_contrato: contratoRaw.numero_contrato,
                estado_contrato: contratoRaw.estado_contrato,
                fecha_firma: contratoRaw.fecha_firma,
                cliente: clienteRaw
                  ? {
                      id_cliente: clienteRaw.id_cliente,
                      nombre_completo: clienteRaw.nombre_completo,
                    }
                  : null,
              }
            : null,
          paquete_funerario: asSingle(raw.paquete_funerario),
        };
      });

      const uniqueContracts = new Map<string, ProductoPaquete>();
      mappedRows.forEach((item) => {
        if (!item.id_paquete || !item.contrato) return;
        if (!isFormalizedState(item.contrato.estado_contrato)) return;
        const key = `${item.id_contrato}-${item.id_paquete}`;
        if (!uniqueContracts.has(key)) {
          uniqueContracts.set(key, item);
        }
      });

      setPaqueteContratos(Array.from(uniqueContracts.values()));
    } catch (error) {
      console.error("Error cargando paquetes funerarios:", error);
      toast.error("No se pudieron cargar los paquetes funerarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPaquetes();
  }, [loadPaquetes]);

  useEffect(() => {
    if (selectedPaqueteId && !paquetes.some((item) => item.id_paquete === selectedPaqueteId)) {
      setSelectedPaqueteId(null);
      setSelectedClienteKey(null);
      setSearchText("");
    }
  }, [paquetes, selectedPaqueteId]);

  const foldersByPackage = useMemo(() => {
    const grouped = new Map<number, ClienteFolder[]>();

    paqueteContratos.forEach((item) => {
      if (!item.id_paquete || !item.contrato) return;

      const clienteNombre = item.contrato.cliente?.nombre_completo?.trim() || "Cliente sin nombre";
      const referencia =
        item.contrato.numero_formulario?.trim() ||
        item.contrato.numero_contrato?.trim() ||
        String(item.contrato.id_contrato);
      const folderName = `${clienteNombre} - ${referencia}`;
      const key = `${item.id_paquete}-${item.contrato.id_contrato}`;
      const folder: ClienteFolder = {
        key,
        packageId: item.id_paquete,
        contractId: item.contrato.id_contrato,
        folderName,
        clienteNombre,
        referencia,
        fechaFirma: item.contrato.fecha_firma,
      };

      const list = grouped.get(item.id_paquete) ?? [];
      list.push(folder);
      grouped.set(item.id_paquete, list);
    });

    grouped.forEach((list, packageId) => {
      grouped.set(
        packageId,
        list.sort((a, b) => a.folderName.localeCompare(b.folderName, "es"))
      );
    });

    return grouped;
  }, [paqueteContratos]);

  const paqueteSeleccionado = useMemo(
    () => paquetes.find((item) => item.id_paquete === selectedPaqueteId) ?? null,
    [paquetes, selectedPaqueteId]
  );

  const clientesDelPaquete = useMemo(() => {
    if (!selectedPaqueteId) return [];
    return foldersByPackage.get(selectedPaqueteId) ?? [];
  }, [foldersByPackage, selectedPaqueteId]);

  const clienteSeleccionado = useMemo(
    () => clientesDelPaquete.find((item) => item.key === selectedClienteKey) ?? null,
    [clientesDelPaquete, selectedClienteKey]
  );

  const isRootLevel = !selectedPaqueteId;
  const isPackageLevel = Boolean(selectedPaqueteId) && !selectedClienteKey;
  const isClientLevel = Boolean(selectedPaqueteId) && Boolean(selectedClienteKey);

  const paquetesFiltrados = useMemo(() => {
    const term = normalizeText(searchText);
    if (!term) return paquetes;
    return paquetes.filter((item) => normalizeText(item.descripcion).includes(term));
  }, [paquetes, searchText]);

  const clientesFiltrados = useMemo(() => {
    if (!isPackageLevel) return clientesDelPaquete;
    const term = normalizeText(searchText);
    if (!term) return clientesDelPaquete;
    return clientesDelPaquete.filter((item) => {
      return (
        normalizeText(item.folderName).includes(term) ||
        normalizeText(item.clienteNombre).includes(term) ||
        normalizeText(item.referencia).includes(term)
      );
    });
  }, [clientesDelPaquete, isPackageLevel, searchText]);

  const searchPlaceholder = isRootLevel
    ? "Buscar paquete por nombre..."
    : "Buscar cliente por nombre o numero...";

  const resultCount = isRootLevel ? paquetesFiltrados.length : clientesFiltrados.length;

  const openCreate = () => {
    setEditingPaquete(null);
    setDescripcion("");
    setDialogOpen(true);
  };

  const openEdit = (paquete: PaqueteFunerario) => {
    setEditingPaquete(paquete);
    setDescripcion(paquete.descripcion);
    setDialogOpen(true);
  };

  const openPackageFolder = (packageId: number) => {
    setSelectedPaqueteId(packageId);
    setSelectedClienteKey(null);
    setSearchText("");
  };

  const openClientFolder = (clienteKey: string) => {
    setSelectedClienteKey(clienteKey);
    setSearchText("");
  };

  const goRoot = () => {
    setSelectedPaqueteId(null);
    setSelectedClienteKey(null);
    setSearchText("");
  };

  const goPackageLevel = () => {
    setSelectedClienteKey(null);
    setSearchText("");
  };

  const handleSave = async () => {
    const descripcionLimpia = descripcion.trim();
    if (!descripcionLimpia) {
      toast.error("La descripcion es obligatoria");
      return;
    }

    const duplicated = paquetes.find(
      (item) =>
        normalizeText(item.descripcion) === normalizeText(descripcionLimpia) &&
        item.id_paquete !== editingPaquete?.id_paquete
    );
    if (duplicated) {
      toast.error("Ya existe un paquete funerario con ese nombre");
      return;
    }

    setSaving(true);
    try {
      if (editingPaquete) {
        const { error } = await supabase
          .from("paquete_funerario")
          .update({ descripcion: descripcionLimpia })
          .eq("id_paquete", editingPaquete.id_paquete);
        if (error) throw error;
        toast.success("Paquete funerario actualizado");
      } else {
        const { error } = await supabase
          .from("paquete_funerario")
          .insert({ descripcion: descripcionLimpia });
        if (error) throw error;
        toast.success("Paquete funerario creado");
      }

      setDialogOpen(false);
      setEditingPaquete(null);
      setDescripcion("");
      await loadPaquetes();
    } catch (error) {
      console.error("Error guardando paquete funerario:", error);
      toast.error("No se pudo guardar el paquete funerario");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const deletingPackageId = deleteTarget.id_paquete;
      const { data: linkedProducts, error: linkedError } = await supabase
        .from("contrato_producto")
        .select("id_contrato_producto")
        .eq("id_paquete", deletingPackageId)
        .limit(1);
      if (linkedError) throw linkedError;

      if ((linkedProducts ?? []).length > 0) {
        toast.error("No se puede eliminar: este paquete ya esta vinculado a contratos");
        return;
      }

      const { error } = await supabase
        .from("paquete_funerario")
        .delete()
        .eq("id_paquete", deletingPackageId);
      if (error) throw error;

      toast.success("Paquete funerario eliminado");
      setDeleteTarget(null);

      if (selectedPaqueteId === deletingPackageId) {
        goRoot();
      }

      await loadPaquetes();
    } catch (error) {
      console.error("Error eliminando paquete funerario:", error);
      toast.error("No se pudo eliminar el paquete funerario");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-primary">Paquetes Funerarios</h1>
            <p className="text-lg text-muted-foreground">
              Estructura de carpetas: paquete, cliente y subcarpetas de Comprobantes/Facturas.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              Volver al Menu
            </Button>
            <Button variant="secondary" onClick={() => void loadPaquetes()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo paquete
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {!isRootLevel && (
            <Button variant="outline" size="sm" onClick={isClientLevel ? goPackageLevel : goRoot}>
              <ArrowUpLeft className="h-4 w-4" />
              Subir nivel
            </Button>
          )}

          <button className="font-medium hover:text-foreground" onClick={goRoot}>
            PAQUETES FUNERARIOS
          </button>

          {paqueteSeleccionado && (
            <>
              <ChevronRight className="h-4 w-4" />
              <button className="font-medium hover:text-foreground" onClick={goPackageLevel}>
                {paqueteSeleccionado.descripcion}
              </button>
            </>
          )}

          {clienteSeleccionado && (
            <>
              <ChevronRight className="h-4 w-4" />
              <span className="font-semibold text-foreground">{clienteSeleccionado.folderName}</span>
            </>
          )}
        </div>

        {!isClientLevel && (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">{resultCount} carpeta(s) encontrada(s)</p>
          </div>
        )}

        {loading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Cargando estructura de paquetes...
            </CardContent>
          </Card>
        )}

        {!loading && isRootLevel && paquetes.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No hay paquetes funerarios</CardTitle>
              <CardDescription>Crea el primer paquete funerario para comenzar.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && isRootLevel && paquetes.length > 0 && paquetesFiltrados.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No se encontraron resultados</CardTitle>
              <CardDescription>Intenta buscar con otro nombre o limpia la busqueda.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && isPackageLevel && clientesFiltrados.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No hay contratos formalizados en este paquete</CardTitle>
              <CardDescription>
                Solo se listan clientes con estado de contrato formalizado.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && isRootLevel && paquetesFiltrados.length > 0 && (
          <Card className="border border-border/70">
            <CardHeader>
              <CardTitle>Carpetas de paquetes funerarios</CardTitle>
              <CardDescription>
                Cada carpeta muestra clientes con contrato formalizado para ese paquete.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {paquetesFiltrados.map((paquete) => {
                const totalClientes = foldersByPackage.get(paquete.id_paquete)?.length ?? 0;

                return (
                  <div
                    key={paquete.id_paquete}
                    className="flex items-center justify-between rounded-md border border-border/70 px-3 py-3"
                  >
                    <button
                      className="flex flex-1 items-center gap-3 text-left"
                      onClick={() => openPackageFolder(paquete.id_paquete)}
                    >
                      <FolderClosed className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-card-foreground">{paquete.descripcion}</p>
                        <p className="text-xs text-muted-foreground">
                          {totalClientes} contrato(s) formalizado(s)
                        </p>
                      </div>
                    </button>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-white"
                        onClick={() => openEdit(paquete)}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget(paquete)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {!loading && isPackageLevel && clientesFiltrados.length > 0 && (
          <Card className="border border-border/70">
            <CardHeader>
              <CardTitle>Carpetas de clientes</CardTitle>
              <CardDescription>
                Contratos formalizados ({paqueteSeleccionado?.descripcion ?? "Paquete"}).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {clientesFiltrados.map((clienteFolder) => (
                <button
                  key={clienteFolder.key}
                  className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-3 text-left hover:bg-muted/30"
                  onClick={() => openClientFolder(clienteFolder.key)}
                >
                  <div className="flex items-center gap-3">
                    <FolderClosed className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{clienteFolder.folderName}</p>
                      <p className="text-xs text-muted-foreground">
                        Contrato #{clienteFolder.contractId} - Fecha: {formatDate(clienteFolder.fechaFirma)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {!loading && isClientLevel && clienteSeleccionado && (
          <Card className="border border-border/70">
            <CardHeader>
              <CardTitle>{clienteSeleccionado.folderName}</CardTitle>
              <CardDescription>
                Estructura lista para carga futura de archivos a OneDrive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {DOCUMENT_FOLDERS.map((folderName) => (
                <div
                  key={folderName}
                  className="flex items-center justify-between rounded-md border border-border/70 px-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{folderName}</p>
                      <p className="text-xs text-muted-foreground">
                        Carpeta reservada para documentos del contrato.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Proximamente</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPaquete ? "Editar paquete funerario" : "Nuevo paquete funerario"}
            </DialogTitle>
            <DialogDescription>
              Define el nombre del paquete tal como lo usaras en los precontratos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Nombre del paquete</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: PLUS APERTURA"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar paquete funerario</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion eliminara el paquete seleccionado. Si ya esta vinculado a contratos, no se
              podra eliminar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
