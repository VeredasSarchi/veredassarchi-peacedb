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
import { formatContractDisplayLabel } from "@/lib/contract-display";
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

type TipoCremacion = Tables<"tipo_cremacion">;
type ClienteResumen = Pick<Tables<"cliente">, "id_cliente" | "nombre_completo">;
type ContratoResumen = Pick<
  Tables<"contrato">,
  "id_contrato" | "numero_formulario" | "numero_contrato" | "estado_contrato" | "fecha_firma"
> & {
  cliente: ClienteResumen | ClienteResumen[] | null;
};
type ProductoCremacionRaw = Pick<
  Tables<"contrato_producto">,
  "id_contrato_producto" | "id_contrato" | "id_tipo_cremacion" | "tipo_producto"
> & {
  contrato: ContratoResumen | ContratoResumen[] | null;
  tipo_cremacion:
    | Pick<Tables<"tipo_cremacion">, "id_tipo_cremacion" | "descripcion">
    | Pick<Tables<"tipo_cremacion">, "id_tipo_cremacion" | "descripcion">[]
    | null;
};
type ProductoCremacion = Pick<
  Tables<"contrato_producto">,
  "id_contrato_producto" | "id_contrato" | "id_tipo_cremacion" | "tipo_producto"
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
  tipo_cremacion: Pick<Tables<"tipo_cremacion">, "id_tipo_cremacion" | "descripcion"> | null;
};
type ClienteFolder = {
  key: string;
  cremacionId: number;
  contractId: number;
  folderName: string;
  clienteNombre: string;
  referencia: string;
  fechaFirma: string | null;
};

const DOCUMENT_FOLDERS = ["COMPROBANTES", "FACTURAS"] as const;
const FORMALIZED_STATES: ReadonlyArray<Tables<"contrato">["estado_contrato"]> = [
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

function dedupeCremacionesByDescripcion(items: TipoCremacion[]): TipoCremacion[] {
  const uniqueByName = new Map<string, TipoCremacion>();

  items.forEach((item) => {
    const key = normalizeText(item.descripcion);
    const current = uniqueByName.get(key);
    if (!current || item.id_tipo_cremacion < current.id_tipo_cremacion) {
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

export default function Cremaciones() {
  const navigate = useNavigate();

  const [cremaciones, setCremaciones] = useState<TipoCremacion[]>([]);
  const [cremacionContratos, setCremacionContratos] = useState<ProductoCremacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  const [selectedCremacionId, setSelectedCremacionId] = useState<number | null>(null);
  const [selectedClienteKey, setSelectedClienteKey] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCremacion, setEditingCremacion] = useState<TipoCremacion | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TipoCremacion | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCremaciones = useCallback(async () => {
    setLoading(true);
    try {
      const [cremacionesRes, contratosCremacionesRes] = await Promise.all([
        supabase.from("tipo_cremacion").select("*").order("descripcion", { ascending: true }),
        supabase
          .from("contrato_producto")
          .select(
            `
              id_contrato_producto,
              id_contrato,
              id_tipo_cremacion,
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
              tipo_cremacion:tipo_cremacion(
                id_tipo_cremacion,
                descripcion
              )
            `
          )
          .eq("tipo_producto", "CREMACION")
          .not("id_tipo_cremacion", "is", null),
      ]);

      if (cremacionesRes.error) throw cremacionesRes.error;
      if (contratosCremacionesRes.error) throw contratosCremacionesRes.error;

      setCremaciones(dedupeCremacionesByDescripcion(cremacionesRes.data ?? []));

      const rawRows = (contratosCremacionesRes.data ?? []) as unknown as ProductoCremacionRaw[];
      const mappedRows: ProductoCremacion[] = rawRows.map((raw) => {
        const contratoRaw = asSingle(raw.contrato);
        const clienteRaw = contratoRaw ? asSingle(contratoRaw.cliente) : null;

        return {
          id_contrato_producto: raw.id_contrato_producto,
          id_contrato: raw.id_contrato,
          id_tipo_cremacion: raw.id_tipo_cremacion,
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
          tipo_cremacion: asSingle(raw.tipo_cremacion),
        };
      });

      const uniqueContracts = new Map<string, ProductoCremacion>();
      mappedRows.forEach((item) => {
        if (!item.id_tipo_cremacion || !item.contrato) return;
        if (!isFormalizedState(item.contrato.estado_contrato)) return;
        const key = `${item.id_contrato}-${item.id_tipo_cremacion}`;
        if (!uniqueContracts.has(key)) {
          uniqueContracts.set(key, item);
        }
      });

      setCremacionContratos(Array.from(uniqueContracts.values()));
    } catch (error) {
      console.error("Error cargando cremaciones:", error);
      toast.error("No se pudieron cargar las cremaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCremaciones();
  }, [loadCremaciones]);

  useEffect(() => {
    if (
      selectedCremacionId &&
      !cremaciones.some((item) => item.id_tipo_cremacion === selectedCremacionId)
    ) {
      setSelectedCremacionId(null);
      setSelectedClienteKey(null);
      setSearchText("");
    }
  }, [cremaciones, selectedCremacionId]);

  const foldersByCremacion = useMemo(() => {
    const grouped = new Map<number, ClienteFolder[]>();

    cremacionContratos.forEach((item) => {
      if (!item.id_tipo_cremacion || !item.contrato) return;

      const clienteNombre = item.contrato.cliente?.nombre_completo?.trim() || "Cliente sin nombre";
      const referencia = formatContractDisplayLabel(item.contrato, {
        prefix: false,
        fallback: String(item.contrato.id_contrato),
      });
      const folderName = `${clienteNombre} - ${referencia}`;
      const key = `${item.id_tipo_cremacion}-${item.contrato.id_contrato}`;
      const folder: ClienteFolder = {
        key,
        cremacionId: item.id_tipo_cremacion,
        contractId: item.contrato.id_contrato,
        folderName,
        clienteNombre,
        referencia,
        fechaFirma: item.contrato.fecha_firma,
      };

      const list = grouped.get(item.id_tipo_cremacion) ?? [];
      list.push(folder);
      grouped.set(item.id_tipo_cremacion, list);
    });

    grouped.forEach((list, cremacionId) => {
      grouped.set(
        cremacionId,
        list.sort((a, b) => a.folderName.localeCompare(b.folderName, "es"))
      );
    });

    return grouped;
  }, [cremacionContratos]);

  const cremacionSeleccionada = useMemo(
    () => cremaciones.find((item) => item.id_tipo_cremacion === selectedCremacionId) ?? null,
    [cremaciones, selectedCremacionId]
  );

  const clientesDeCremacion = useMemo(() => {
    if (!selectedCremacionId) return [];
    return foldersByCremacion.get(selectedCremacionId) ?? [];
  }, [foldersByCremacion, selectedCremacionId]);

  const clienteSeleccionado = useMemo(
    () => clientesDeCremacion.find((item) => item.key === selectedClienteKey) ?? null,
    [clientesDeCremacion, selectedClienteKey]
  );

  const isRootLevel = !selectedCremacionId;
  const isCremacionLevel = Boolean(selectedCremacionId) && !selectedClienteKey;
  const isClientLevel = Boolean(selectedCremacionId) && Boolean(selectedClienteKey);

  const cremacionesFiltradas = useMemo(() => {
    const term = normalizeText(searchText);
    if (!term) return cremaciones;
    return cremaciones.filter((item) => normalizeText(item.descripcion).includes(term));
  }, [cremaciones, searchText]);

  const clientesFiltrados = useMemo(() => {
    if (!isCremacionLevel) return clientesDeCremacion;
    const term = normalizeText(searchText);
    if (!term) return clientesDeCremacion;
    return clientesDeCremacion.filter((item) => {
      return (
        normalizeText(item.folderName).includes(term) ||
        normalizeText(item.clienteNombre).includes(term) ||
        normalizeText(item.referencia).includes(term)
      );
    });
  }, [clientesDeCremacion, isCremacionLevel, searchText]);

  const searchPlaceholder = isRootLevel
    ? "Buscar cremacion por nombre..."
    : "Buscar cliente por nombre o numero...";

  const resultCount = isRootLevel ? cremacionesFiltradas.length : clientesFiltrados.length;

  const openCreate = () => {
    setEditingCremacion(null);
    setDescripcion("");
    setDialogOpen(true);
  };

  const openEdit = (cremacion: TipoCremacion) => {
    setEditingCremacion(cremacion);
    setDescripcion(cremacion.descripcion);
    setDialogOpen(true);
  };

  const openCremacionFolder = (cremacionId: number) => {
    setSelectedCremacionId(cremacionId);
    setSelectedClienteKey(null);
    setSearchText("");
  };

  const openClientFolder = (clienteKey: string) => {
    setSelectedClienteKey(clienteKey);
    setSearchText("");
  };

  const goRoot = () => {
    setSelectedCremacionId(null);
    setSelectedClienteKey(null);
    setSearchText("");
  };

  const goCremacionLevel = () => {
    setSelectedClienteKey(null);
    setSearchText("");
  };

  const handleSave = async () => {
    const descripcionLimpia = descripcion.trim();
    if (!descripcionLimpia) {
      toast.error("La descripcion es obligatoria");
      return;
    }

    const duplicated = cremaciones.find(
      (item) =>
        normalizeText(item.descripcion) === normalizeText(descripcionLimpia) &&
        item.id_tipo_cremacion !== editingCremacion?.id_tipo_cremacion
    );
    if (duplicated) {
      toast.error("Ya existe una cremacion con ese nombre");
      return;
    }

    setSaving(true);
    try {
      if (editingCremacion) {
        const { error } = await supabase
          .from("tipo_cremacion")
          .update({ descripcion: descripcionLimpia })
          .eq("id_tipo_cremacion", editingCremacion.id_tipo_cremacion);
        if (error) throw error;
        toast.success("Cremacion actualizada");
      } else {
        const { error } = await supabase
          .from("tipo_cremacion")
          .insert({ descripcion: descripcionLimpia });
        if (error) throw error;
        toast.success("Cremacion creada");
      }

      setDialogOpen(false);
      setEditingCremacion(null);
      setDescripcion("");
      await loadCremaciones();
    } catch (error) {
      console.error("Error guardando cremacion:", error);
      toast.error("No se pudo guardar la cremacion");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const deletingCremacionId = deleteTarget.id_tipo_cremacion;
      const { data: linkedProducts, error: linkedError } = await supabase
        .from("contrato_producto")
        .select("id_contrato_producto")
        .eq("id_tipo_cremacion", deletingCremacionId)
        .limit(1);
      if (linkedError) throw linkedError;

      if ((linkedProducts ?? []).length > 0) {
        toast.error("No se puede eliminar: esta cremacion ya esta vinculada a contratos");
        return;
      }

      const { error } = await supabase
        .from("tipo_cremacion")
        .delete()
        .eq("id_tipo_cremacion", deletingCremacionId);
      if (error) throw error;

      toast.success("Cremacion eliminada");
      setDeleteTarget(null);

      if (selectedCremacionId === deletingCremacionId) {
        goRoot();
      }

      await loadCremaciones();
    } catch (error) {
      console.error("Error eliminando cremacion:", error);
      toast.error("No se pudo eliminar la cremacion");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-primary">Cremaciones</h1>
            <p className="text-lg text-muted-foreground">
              Estructura de carpetas: cremacion, cliente y subcarpetas de Comprobantes/Facturas.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              Volver al Menu
            </Button>
            <Button variant="secondary" onClick={() => void loadCremaciones()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nueva cremacion
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {!isRootLevel && (
            <Button variant="outline" size="sm" onClick={isClientLevel ? goCremacionLevel : goRoot}>
              <ArrowUpLeft className="h-4 w-4" />
              Subir nivel
            </Button>
          )}

          <button className="font-medium hover:text-foreground" onClick={goRoot}>
            CREMACIONES
          </button>

          {cremacionSeleccionada && (
            <>
              <ChevronRight className="h-4 w-4" />
              <button className="font-medium hover:text-foreground" onClick={goCremacionLevel}>
                {cremacionSeleccionada.descripcion}
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
              Cargando estructura de cremaciones...
            </CardContent>
          </Card>
        )}

        {!loading && isRootLevel && cremaciones.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No hay cremaciones</CardTitle>
              <CardDescription>Crea la primera cremacion para comenzar.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && isRootLevel && cremaciones.length > 0 && cremacionesFiltradas.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No se encontraron resultados</CardTitle>
              <CardDescription>Intenta buscar con otro nombre o limpia la busqueda.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && isCremacionLevel && clientesFiltrados.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No hay contratos formalizados en esta cremacion</CardTitle>
              <CardDescription>
                Solo se listan clientes con estado de contrato formalizado.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && isRootLevel && cremacionesFiltradas.length > 0 && (
          <Card className="border border-border/70">
            <CardHeader>
              <CardTitle>Carpetas de cremaciones</CardTitle>
              <CardDescription>
                Cada carpeta muestra clientes con contrato formalizado para ese tipo de cremacion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {cremacionesFiltradas.map((cremacion) => {
                const totalClientes = foldersByCremacion.get(cremacion.id_tipo_cremacion)?.length ?? 0;

                return (
                  <div
                    key={cremacion.id_tipo_cremacion}
                    className="flex items-center justify-between rounded-md border border-border/70 px-3 py-3"
                  >
                    <button
                      className="flex flex-1 items-center gap-3 text-left"
                      onClick={() => openCremacionFolder(cremacion.id_tipo_cremacion)}
                    >
                      <FolderClosed className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-card-foreground">{cremacion.descripcion}</p>
                        <p className="text-xs text-muted-foreground">
                          {totalClientes} contrato(s) formalizado(s)
                        </p>
                      </div>
                    </button>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(cremacion)}>
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget(cremacion)}
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

        {!loading && isCremacionLevel && clientesFiltrados.length > 0 && (
          <Card className="border border-border/70">
            <CardHeader>
              <CardTitle>Carpetas de clientes</CardTitle>
              <CardDescription>
                Contratos formalizados ({cremacionSeleccionada?.descripcion ?? "Cremacion"}).
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
            <DialogTitle>{editingCremacion ? "Editar cremacion" : "Nueva cremacion"}</DialogTitle>
            <DialogDescription>
              Define el nombre de la cremacion tal como lo usaras en los contratos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Nombre de la cremacion</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: RENACER"
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
            <AlertDialogTitle>Eliminar cremacion</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion eliminara la cremacion seleccionada. Si ya esta vinculada a contratos, no
              se podra eliminar.
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
