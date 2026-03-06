import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FolderClosed, RefreshCw, Search } from "lucide-react";
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
  return "Paquete funerario";
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
            includeNumeroFormulario
              ? `numero_formulario,${contratoSelectBase}`
              : contratoSelectBase
          )
          .eq("estado_contrato", "CONTRATO")
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

      setContratos(detallados);
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
    const map = new Map<
      string,
      { key: string; clienteNombre: string; items: ContratoDetalle[] }
    >();

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
      normalizeSearchValue(grupo.clienteNombre).includes(term)
    );
  }, [agrupadosPorCliente, searchCliente]);

  useEffect(() => {
    const validKeys = new Set(agrupadosPorCliente.map((grupo) => grupo.key));
    setOpenFolders((prev) => prev.filter((key) => validKeys.has(key)));
  }, [agrupadosPorCliente]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2">Contratos Activos</h1>
            <p className="text-lg text-muted-foreground">
              Carpeta por persona con todos los contratos formalizados.
            </p>
            {!supportsNumeroFormulario && (
              <p className="text-xs text-amber-300 mt-1">
                Modo compatibilidad activo: aplica la migracion de numero_formulario para mostrar
                ese dato en todos los registros.
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
          <p className="text-xs text-muted-foreground">
            {agrupadosFiltrados.length} carpeta(s) encontrada(s)
          </p>
        </div>

        {loading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Cargando contratos activos...
            </CardContent>
          </Card>
        )}

        {!loading && agrupadosPorCliente.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No hay contratos activos</CardTitle>
              <CardDescription>
                Cuando existan registros en estado CONTRATO apareceran en esta seccion.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && agrupadosPorCliente.length > 0 && agrupadosFiltrados.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No se encontraron resultados</CardTitle>
              <CardDescription>
                Intenta buscar con otro nombre o limpia el texto de busqueda.
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
                        {grupo.items.length} contrato(s)
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {grupo.items.map((item) => (
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
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-md border border-border/70 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">
                                Cliente
                              </p>
                              <p className="text-sm text-card-foreground">
                                {item.cliente?.nombre_completo || "Sin nombre"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Cedula: {item.cliente?.cedula || "No registrada"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Estado civil: {item.cliente?.estado_civil || "No registrado"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Profesion: {item.cliente?.profesion || "No registrada"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Correo: {item.cliente?.email || "No registrado"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Telefono 1: {item.cliente?.telefono1 || "No registrado"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Telefono 2: {item.cliente?.telefono2 || "No registrado"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Direccion: {item.cliente?.direccion || "No registrada"}
                              </p>
                            </div>
                            <div className="rounded-md border border-border/70 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">
                                Resumen financiero (solo vista)
                              </p>
                              <div className="grid grid-cols-1 gap-1 text-xs text-card-foreground">
                                <p>
                                  Monto total:{" "}
                                  <span className="font-medium">
                                    {formatCurrency(item.contrato.monto_arrendamiento_total)}
                                  </span>
                                </p>
                                <p>Plazo (anios): {item.contrato.plazo_anios ?? "No definido"}</p>
                                <p>
                                  Cuota mensual: {formatCurrency(item.contrato.cuota_mensual)}
                                </p>
                                <p>
                                  Dia pago mensual:{" "}
                                  {item.contrato.dia_pago_mensual ?? "No definido"}
                                </p>
                                <p>Total meses: {item.contrato.total_meses ?? "No definido"}</p>
                                <p>
                                  Tasa interes anual:{" "}
                                  {item.contrato.tasa_interes_anual ?? "No definido"}
                                </p>
                                <p>
                                  Prima:{" "}
                                  {formatCurrency(item.contrato.monto_entregado_inicial)}
                                </p>
                                <p>
                                  Saldo pendiente:{" "}
                                  {formatCurrency(item.contrato.saldo_pendiente)}
                                </p>
                                <p>
                                  Cantidad lotes: {item.contrato.cantidad_lotes ?? "No definido"}
                                </p>
                                <p>
                                  Mantenimiento anual:{" "}
                                  {formatCurrency(item.contrato.monto_mantenimiento_anual)}
                                </p>
                                <p>
                                  Anio inicio mantenimiento:{" "}
                                  {item.contrato.anio_inicio_mantenimiento ?? "No definido"}
                                </p>
                                <p>
                                  Monto apertura: {formatCurrency(item.contrato.monto_apertura)}
                                </p>
                                <p>
                                  Observaciones:{" "}
                                  {item.contrato.observaciones_contrato || "Sin observaciones"}
                                </p>
                                <p>
                                  Vendedor: {item.vendedor?.nombre_completo || "No asignado"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">
                              Productos del contrato
                            </p>
                            {item.productos.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Sin productos vinculados.
                              </p>
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

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">
                                Pre-autorizados
                              </p>
                              {item.autorizados.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin registros.</p>
                              ) : (
                                <div className="space-y-1">
                                  {item.autorizados.map((autorizado) => (
                                    <p
                                      key={autorizado.id_contrato_autorizado}
                                      className="text-xs text-card-foreground"
                                    >
                                      {autorizado.nombre}
                                      {autorizado.cedula ? ` - ${autorizado.cedula}` : ""}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">
                                Beneficiarios
                              </p>
                              {item.beneficiarios.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin registros.</p>
                              ) : (
                                <div className="space-y-1">
                                  {item.beneficiarios.map((beneficiario) => (
                                    <p
                                      key={beneficiario.id_contrato_beneficiario}
                                      className="text-xs text-card-foreground"
                                    >
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
