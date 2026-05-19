import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileX2,
  FolderClosed,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildOneDriveFolderPayload } from "@/lib/contract-onedrive";
import { renameContractFolderAsCancelled } from "@/lib/onedrive-service";

type ContratoRow = Tables<"contrato"> & { numero_formulario: string | null };
type ClienteRow = Tables<"cliente">;
type VendedorRow = Tables<"vendedor">;
type AnulacionLogRow = Tables<"contrato_anulacion_log">;
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

type ContratoAnuladoDetalle = {
  contrato: ContratoRow;
  cliente: ClienteRow | null;
  vendedor: VendedorRow | null;
  productos: ProductoDetalle[];
  logs: AnulacionLogRow[];
};

type ContratoAnuladoQueryRow = ContratoRow & {
  cliente?: ClienteRow | ClienteRow[] | null;
  vendedor?: VendedorRow | VendedorRow[] | null;
};

type ProductoQueryRow = Tables<"contrato_producto"> & {
  lote?:
    | (Pick<Tables<"lote">, "id_lote" | "numero_lote" | "id_jardin"> & {
        jardin?: JardinMini | JardinMini[] | null;
      })
    | Array<
        Pick<Tables<"lote">, "id_lote" | "numero_lote" | "id_jardin"> & {
          jardin?: JardinMini | JardinMini[] | null;
        }
      >
    | null;
  tipo_cenizario?:
    | (Pick<Tables<"tipo_cenizario">, "id_tipo_cenizario" | "numero_cenizario" | "descripcion" | "id_jardin"> & {
        jardin?: JardinMini | JardinMini[] | null;
      })
    | Array<
        Pick<Tables<"tipo_cenizario">, "id_tipo_cenizario" | "numero_cenizario" | "descripcion" | "id_jardin"> & {
          jardin?: JardinMini | JardinMini[] | null;
        }
      >
    | null;
  tipo_cremacion?: Pick<Tables<"tipo_cremacion">, "id_tipo_cremacion" | "descripcion"> | Array<Pick<Tables<"tipo_cremacion">, "id_tipo_cremacion" | "descripcion">> | null;
  paquete_funerario?: Pick<Tables<"paquete_funerario">, "id_paquete" | "descripcion"> | Array<Pick<Tables<"paquete_funerario">, "id_paquete" | "descripcion">> | null;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function normalizeSearchValue(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-CR");
}

function getProductoLabel(producto: ProductoDetalle): string {
  if (producto.tipo_producto === "LOTE") {
    const base = producto.lote?.numero_lote ? `Lote ${producto.lote.numero_lote}` : "Lote";
    return producto.lote?.jardin?.nombre ? `${base} (${producto.lote.jardin.nombre})` : base;
  }
  if (producto.tipo_producto === "CENIZARIO") {
    const base = producto.tipo_cenizario?.numero_cenizario
      ? `Cenizario ${producto.tipo_cenizario.numero_cenizario}`
      : "Cenizario";
    return producto.tipo_cenizario?.jardin?.nombre
      ? `${base} (${producto.tipo_cenizario.jardin.nombre})`
      : base;
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

function getSyncBadge(status: string | null) {
  if (status === "COMPLETADO") {
    return (
      <Badge className="bg-success text-success-foreground hover:bg-success">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        OneDrive completado
      </Badge>
    );
  }
  if (status === "ERROR") {
    return (
      <Badge variant="destructive">
        <AlertCircle className="mr-1 h-3 w-3" />
        OneDrive con error
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <Clock3 className="mr-1 h-3 w-3" />
      OneDrive pendiente
    </Badge>
  );
}

export default function DashboardContratosAnulados() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const menuPath = role === "vendedor" ? "/vendedor" : "/";

  const [contratos, setContratos] = useState<ContratoAnuladoDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchCliente, setSearchCliente] = useState("");
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [retryingContractId, setRetryingContractId] = useState<number | null>(null);

  const loadContratosAnulados = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contrato")
        .select(`
          id_contrato,
          numero_contrato,
          numero_formulario,
          fecha_firma,
          fecha_anulacion,
          usuario_anulacion,
          id_cliente,
          id_vendedor,
          monto_arrendamiento_total,
          cuota_mensual,
          saldo_pendiente,
          estado_contrato,
          onedrive_anulacion_estado,
          onedrive_anulacion_error,
          onedrive_anulacion_actualizado_en,
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
        `)
        .eq("estado_contrato", "ANULADO")
        .order("fecha_anulacion", { ascending: false, nullsFirst: false });

      if (error) throw error;

      const contratosBase: ContratoAnuladoDetalle[] = (data ?? []).map((row) => {
        const typedRow = row as unknown as ContratoAnuladoQueryRow;
        return {
          contrato: typedRow,
          cliente: asSingle(typedRow.cliente),
          vendedor: asSingle(typedRow.vendedor),
          productos: [],
          logs: [],
        };
      });

      const contractIds = contratosBase.map((item) => item.contrato.id_contrato);
      if (contractIds.length === 0) {
        setContratos([]);
        return;
      }

      const [productosRes, logsRes] = await Promise.all([
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
          .from("contrato_anulacion_log")
          .select("*")
          .in("id_contrato", contractIds)
          .order("fecha", { ascending: false }),
      ]);

      if (productosRes.error) throw productosRes.error;
      if (logsRes.error) throw logsRes.error;

      const productosByContrato = new Map<number, ProductoDetalle[]>();
      (productosRes.data ?? []).forEach((raw) => {
        const typedRaw = raw as unknown as ProductoQueryRow;
        const loteRaw = asSingle(typedRaw.lote);
        const tipoCenizarioRaw = asSingle(typedRaw.tipo_cenizario);
        const item: ProductoDetalle = {
          ...(typedRaw as Tables<"contrato_producto">),
          lote: loteRaw
            ? {
                ...(loteRaw as Pick<Tables<"lote">, "id_lote" | "numero_lote" | "id_jardin">),
                jardin: asSingle(loteRaw.jardin),
              }
            : null,
          tipo_cenizario: tipoCenizarioRaw
            ? {
                ...(tipoCenizarioRaw as Pick<
                  Tables<"tipo_cenizario">,
                  "id_tipo_cenizario" | "numero_cenizario" | "descripcion" | "id_jardin"
                >),
                jardin: asSingle(tipoCenizarioRaw.jardin),
              }
            : null,
          tipo_cremacion: asSingle(typedRaw.tipo_cremacion),
          paquete_funerario: asSingle(typedRaw.paquete_funerario),
        };
        const current = productosByContrato.get(item.id_contrato) ?? [];
        current.push(item);
        productosByContrato.set(item.id_contrato, current);
      });

      const logsByContrato = new Map<number, AnulacionLogRow[]>();
      (logsRes.data ?? []).forEach((item) => {
        const current = logsByContrato.get(item.id_contrato) ?? [];
        current.push(item);
        logsByContrato.set(item.id_contrato, current);
      });

      setContratos(
        contratosBase.map((item) => ({
          ...item,
          productos: productosByContrato.get(item.contrato.id_contrato) ?? [],
          logs: logsByContrato.get(item.contrato.id_contrato) ?? [],
        })),
      );
    } catch (error) {
      console.error("Error cargando contratos anulados:", error);
      toast.error("No se pudieron cargar los contratos anulados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContratosAnulados();
  }, [loadContratosAnulados]);

  const agrupadosPorCliente = useMemo(() => {
    const map = new Map<string, { key: string; clienteNombre: string; items: ContratoAnuladoDetalle[] }>();

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

  const handleRetryOneDrive = useCallback(
    async (item: ContratoAnuladoDetalle) => {
      const contractId = item.contrato.id_contrato;
      setRetryingContractId(contractId);

      try {
        const expectedFolder = buildOneDriveFolderPayload(item);
        await renameContractFolderAsCancelled(expectedFolder);
        await registerOneDriveCancellationSync(contractId, "COMPLETADO", null);
        toast.success("Carpeta de OneDrive renombrada correctamente");
        await loadContratosAnulados();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo reintentar la sincronizacion con OneDrive";
        try {
          await registerOneDriveCancellationSync(contractId, "ERROR", message);
        } catch (syncError) {
          console.error("Error registrando el reintento fallido de OneDrive:", syncError);
        }
        toast.error(message);
        await loadContratosAnulados();
      } finally {
        setRetryingContractId(null);
      }
    },
    [loadContratosAnulados, registerOneDriveCancellationSync],
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2">Contratos Anulados</h1>
            <p className="text-lg text-muted-foreground">
              Consulta de anulaciones y estado de sincronizacion con OneDrive.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(menuPath)}>
              Volver al Menu
            </Button>
            <Button variant="secondary" onClick={() => void loadContratosAnulados()} disabled={loading}>
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
              onChange={(event) => setSearchCliente(event.target.value)}
              placeholder="Buscar anulados por nombre..."
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">{agrupadosFiltrados.length} carpeta(s) encontrada(s)</p>
        </div>

        {loading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">Cargando contratos anulados...</CardContent>
          </Card>
        )}

        {!loading && agrupadosPorCliente.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No hay contratos anulados</CardTitle>
              <CardDescription>
                Cuando existan registros en estado ANULADO apareceran en esta seccion.
              </CardDescription>
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
                      <p className="text-xs text-muted-foreground">{grupo.items.length} contrato(s) anulado(s)</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {grupo.items.map((item) => (
                      <Card key={item.contrato.id_contrato} className="border border-border/70">
                        <CardHeader className="pb-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <FileX2 className="mt-1 h-5 w-5 text-destructive" />
                              <div>
                                <CardTitle className="text-base">
                                  {item.contrato.numero_formulario || item.contrato.numero_contrato}
                                </CardTitle>
                                <CardDescription>
                                  Anulado: {formatDate(item.contrato.fecha_anulacion)} - Usuario:{" "}
                                  {item.contrato.usuario_anulacion || "No registrado"}
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {getSyncBadge(item.contrato.onedrive_anulacion_estado)}
                              {item.contrato.onedrive_anulacion_estado !== "COMPLETADO" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => void handleRetryOneDrive(item)}
                                  disabled={retryingContractId === item.contrato.id_contrato}
                                >
                                  {retryingContractId === item.contrato.id_contrato ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                  Reintentar OneDrive
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <div className="rounded-md border border-border/70 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Cliente</p>
                              <p className="text-sm text-card-foreground">{item.cliente?.nombre_completo || "Sin nombre"}</p>
                              <p className="text-xs text-muted-foreground">Cedula: {item.cliente?.cedula || "No registrada"}</p>
                              <p className="text-xs text-muted-foreground">Correo: {item.cliente?.email || "No registrado"}</p>
                            </div>
                            <div className="rounded-md border border-border/70 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Resumen financiero</p>
                              <p className="text-xs text-card-foreground">Monto: {formatCurrency(item.contrato.monto_arrendamiento_total)}</p>
                              <p className="text-xs text-card-foreground">Cuota: {formatCurrency(item.contrato.cuota_mensual)}</p>
                              <p className="text-xs text-card-foreground">Saldo: {formatCurrency(item.contrato.saldo_pendiente)}</p>
                            </div>
                            <div className="rounded-md border border-border/70 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">OneDrive</p>
                              <p className="text-xs text-card-foreground">
                                Estado: {item.contrato.onedrive_anulacion_estado || "PENDIENTE"}
                              </p>
                              <p className="text-xs text-card-foreground">
                                Actualizado: {formatDate(item.contrato.onedrive_anulacion_actualizado_en)}
                              </p>
                              {item.contrato.onedrive_anulacion_error && (
                                <p className="mt-1 text-xs text-destructive">
                                  {item.contrato.onedrive_anulacion_error}
                                </p>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Productos liberados</p>
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

                          <div className="rounded-md border border-border/70 p-3">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Log de anulacion</p>
                            {item.logs.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Sin eventos registrados.</p>
                            ) : (
                              <div className="space-y-2">
                                {item.logs.map((log) => (
                                  <div key={log.id_log} className="rounded-md bg-muted/30 px-3 py-2">
                                    <p className="text-xs font-semibold text-card-foreground">
                                      {log.resultado} - {formatDate(log.fecha)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Usuario: {log.usuario || "No registrado"} - OneDrive:{" "}
                                      {log.onedrive_estado || "No definido"}
                                    </p>
                                    {(log.detalle || log.onedrive_error) && (
                                      <p className="text-xs text-card-foreground">
                                        {log.detalle || log.onedrive_error}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
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
