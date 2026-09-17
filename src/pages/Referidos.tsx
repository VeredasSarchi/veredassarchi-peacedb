import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CircleDollarSign,
  Gift,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
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
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type ReferidoEstado =
  | "REGISTRADO"
  | "EN_GESTION"
  | "VINCULADO"
  | "CONVERTIDO"
  | "DESCARTADO"
  | "INUTILIZABLE";

type ReferidoRow = {
  id_referido: number;
  nombre: string;
  telefono: string;
  email: string | null;
  estado: ReferidoEstado;
  observaciones: string | null;
  motivo_inutilizacion: string | null;
  created_at: string;
  fecha_conversion: string | null;
  id_cliente_referente: number;
  cliente_referente_nombre: string;
  id_contrato_origen: number;
  contrato_origen_formulario: string | null;
  id_vendedor_captador: number;
  vendedor_captador_nombre: string;
  id_vendedor_responsable: number;
  vendedor_responsable_nombre: string;
  id_contrato_vinculado: number | null;
  contrato_vinculado_formulario: string | null;
  contrato_vinculado_estado: string | null;
  cliente_vinculado_nombre: string | null;
  id_cliente_convertido: number | null;
  id_contrato_convertido: number | null;
  id_beneficio: number | null;
  monto_original: number | null;
  monto_disponible: number | null;
  monto_anulado: number | null;
  beneficio_estado: string | null;
  monto_aplicado: number;
  cantidad_aplicaciones: number;
  duplicados_activos: number;
};

type ContratoOrigen = {
  id_contrato: number;
  numero_formulario: string | null;
  id_cliente: number;
  cliente_nombre: string;
  id_vendedor: number;
  vendedor_nombre: string;
};

type PrecontratoOption = {
  id_contrato: number;
  numero_formulario: string | null;
  id_cliente: number;
  cliente_nombre: string;
  telefono1: string | null;
  telefono2: string | null;
  email: string | null;
  id_referido_actual: number | null;
};

type ContratoDestino = {
  id_contrato: number;
  numero_formulario: string | null;
  id_cliente: number;
  cliente_nombre: string;
  total_pendiente: number;
  proxima_fecha_vencimiento: string | null;
};

type VendedorOption = {
  id_vendedor: number;
  nombre_completo: string;
};

type PlacaCliente = {
  id_cliente: number;
  unidades_intactas: number;
  elegible: boolean;
};

type ReferidosPanel = {
  resumen: {
    total: number;
    en_gestion: number;
    convertidos: number;
    beneficios_disponibles: number;
    clientes_elegibles_placa: number;
  };
  referidos: ReferidoRow[];
  clientes_placa: PlacaCliente[];
  contratos_origen: ContratoOrigen[];
  precontratos: PrecontratoOption[];
  contratos_destino: ContratoDestino[];
  vendedores: VendedorOption[];
};

type RpcError = { message?: string; details?: string; hint?: string };

const emptyPanel: ReferidosPanel = {
  resumen: {
    total: 0,
    en_gestion: 0,
    convertidos: 0,
    beneficios_disponibles: 0,
    clientes_elegibles_placa: 0,
  },
  referidos: [],
  clientes_placa: [],
  contratos_origen: [],
  precontratos: [],
  contratos_destino: [],
  vendedores: [],
};

const statusLabels: Record<ReferidoEstado, string> = {
  REGISTRADO: "Registrado",
  EN_GESTION: "En gestión",
  VINCULADO: "Vinculado",
  CONVERTIDO: "Convertido",
  DESCARTADO: "Descartado",
  INUTILIZABLE: "Inutilizable",
};

const statusClasses: Record<ReferidoEstado, string> = {
  REGISTRADO: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  EN_GESTION: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  VINCULADO: "bg-violet-100 text-violet-800 hover:bg-violet-100",
  CONVERTIDO: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  DESCARTADO: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  INUTILIZABLE: "bg-rose-100 text-rose-800 hover:bg-rose-100",
};

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(date);
}

function contractLabel(number: string | null, id: number): string {
  const value = number?.trim();
  return value && !/^PRE-\d+$/i.test(value) ? `Formulario ${value}` : `Contrato #${id}`;
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function errorMessage(error: RpcError | null, fallback: string): string {
  return error?.message?.trim() || fallback;
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  return (await supabase.rpc(name as never, args as never)) as unknown as {
    data: unknown;
    error: RpcError | null;
  };
}

export default function Referidos() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [panel, setPanel] = useState<ReferidosPanel>(emptyPanel);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [sellerFilter, setSellerFilter] = useState("TODOS");

  const [createOpen, setCreateOpen] = useState(false);
  const [sourceContractId, setSourceContractId] = useState("");
  const [responsibleSellerId, setResponsibleSellerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [linkTarget, setLinkTarget] = useState<ReferidoRow | null>(null);
  const [precontractId, setPrecontractId] = useState("");

  const [benefitTarget, setBenefitTarget] = useState<ReferidoRow | null>(null);
  const [destinationContractId, setDestinationContractId] = useState("");
  const [benefitAmount, setBenefitAmount] = useState("");

  const loadPanel = useCallback(async () => {
    setLoading(true);
    setPanelError(null);
    try {
      const { data, error } = await rpc("obtener_panel_referidos");
      if (error) throw error;
      setPanel((data as ReferidosPanel | null) ?? emptyPanel);
    } catch (error) {
      console.error("Error cargando referidos:", error);
      const message = errorMessage(error as RpcError, "No se pudo cargar el módulo de referidos");
      setPanel(emptyPanel);
      setPanelError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  useEffect(() => {
    const contractId = searchParams.get("contrato");
    if (!contractId || panel.contratos_origen.length === 0) return;
    const contract = panel.contratos_origen.find(
      (item) => String(item.id_contrato) === contractId,
    );
    if (!contract) return;
    setSourceContractId(contractId);
    setResponsibleSellerId(String(contract.id_vendedor));
    setCreateOpen(true);
    setSearchParams({}, { replace: true });
  }, [panel.contratos_origen, searchParams, setSearchParams]);

  const plateByClient = useMemo(
    () => new Map(panel.clientes_placa.map((item) => [item.id_cliente, item])),
    [panel.clientes_placa],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return panel.referidos.filter((item) => {
      const matchesSearch =
        !query ||
        item.nombre.toLowerCase().includes(query) ||
        item.telefono.toLowerCase().includes(query) ||
        (item.email ?? "").toLowerCase().includes(query) ||
        item.cliente_referente_nombre.toLowerCase().includes(query) ||
        item.vendedor_responsable_nombre.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "TODOS" || item.estado === statusFilter;
      const matchesSeller =
        sellerFilter === "TODOS" || String(item.id_vendedor_responsable) === sellerFilter;
      return matchesSearch && matchesStatus && matchesSeller;
    });
  }, [panel.referidos, search, sellerFilter, statusFilter]);

  const matchingPrecontracts = useMemo(() => {
    if (!linkTarget) return [];
    const targetPhone = normalizePhone(linkTarget.telefono);
    const targetEmail = normalizeEmail(linkTarget.email);
    return panel.precontratos.filter((item) => {
      const phoneMatches =
        normalizePhone(item.telefono1) === targetPhone ||
        normalizePhone(item.telefono2) === targetPhone;
      const emailMatches = Boolean(targetEmail) && normalizeEmail(item.email) === targetEmail;
      return phoneMatches || emailMatches || item.id_referido_actual === linkTarget.id_referido;
    });
  }, [linkTarget, panel.precontratos]);

  const destinationContracts = useMemo(() => {
    if (!benefitTarget) return [];
    return panel.contratos_destino.filter(
      (item) =>
        item.id_cliente === benefitTarget.id_cliente_referente && Number(item.total_pendiente) > 0,
    );
  }, [benefitTarget, panel.contratos_destino]);

  const resetCreateForm = () => {
    setSourceContractId("");
    setResponsibleSellerId("");
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
  };

  const handleSourceChange = (value: string) => {
    setSourceContractId(value);
    const contract = panel.contratos_origen.find((item) => String(item.id_contrato) === value);
    if (contract) setResponsibleSellerId(String(contract.id_vendedor));
  };

  const handleCreate = async () => {
    if (!sourceContractId || !name.trim() || !phone.trim()) {
      toast.error("Selecciona el contrato e indica nombre y teléfono");
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await rpc("registrar_referido", {
        p_id_contrato_origen: Number(sourceContractId),
        p_nombre: name.trim(),
        p_telefono: phone.trim(),
        p_email: email.trim() || null,
        p_id_vendedor_responsable: isAdmin && responsibleSellerId
          ? Number(responsibleSellerId)
          : null,
        p_observaciones: notes.trim() || null,
        p_usuario: user?.email ?? role ?? "usuario",
      });
      if (error) throw error;
      const result = data as { duplicados_detectados?: number } | null;
      if (Number(result?.duplicados_detectados ?? 0) > 0) {
        toast.warning(
          "Referido registrado. Hay otras atribuciones con el mismo teléfono o correo; administración decidirá cuál utilizar.",
        );
      } else {
        toast.success("Referido registrado correctamente");
      }
      setCreateOpen(false);
      resetCreateForm();
      await loadPanel();
    } catch (error) {
      console.error("Error registrando referido:", error);
      toast.error(errorMessage(error as RpcError, "No se pudo registrar el referido"));
    } finally {
      setProcessing(false);
    }
  };

  const handleLink = async () => {
    if (!linkTarget || !precontractId) {
      toast.error("Selecciona el precontrato que corresponde al referido");
      return;
    }
    setProcessing(true);
    try {
      const { error } = await rpc("vincular_referido_precontrato", {
        p_id_referido: linkTarget.id_referido,
        p_id_contrato: Number(precontractId),
        p_usuario: user?.email ?? "administracion",
      });
      if (error) throw error;
      toast.success("Atribución vinculada. El beneficio se generará al formalizar la venta.");
      setLinkTarget(null);
      setPrecontractId("");
      await loadPanel();
    } catch (error) {
      console.error("Error vinculando referido:", error);
      toast.error(errorMessage(error as RpcError, "No se pudo vincular el referido"));
    } finally {
      setProcessing(false);
    }
  };

  const handleUnlink = async (item: ReferidoRow) => {
    if (!item.id_contrato_vinculado || item.contrato_vinculado_estado !== "PRECONTRATO") return;
    setProcessing(true);
    try {
      const { error } = await rpc("desvincular_referido_precontrato", {
        p_id_contrato: item.id_contrato_vinculado,
        p_usuario: user?.email ?? "administracion",
      });
      if (error) throw error;
      toast.success("Referido desvinculado del precontrato");
      await loadPanel();
    } catch (error) {
      console.error("Error desvinculando referido:", error);
      toast.error(errorMessage(error as RpcError, "No se pudo desvincular el referido"));
    } finally {
      setProcessing(false);
    }
  };

  const openBenefitDialog = (item: ReferidoRow) => {
    setBenefitTarget(item);
    setDestinationContractId("");
    setBenefitAmount(String(Number(item.monto_disponible ?? 0)));
  };

  const handleApplyBenefit = async () => {
    if (!benefitTarget?.id_beneficio || !destinationContractId) {
      toast.error("Selecciona el contrato que recibirá el beneficio");
      return;
    }
    const amount = Number(benefitAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Indica un monto válido para aplicar");
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await rpc("aplicar_beneficio_referido_mantenimiento", {
        p_id_beneficio: benefitTarget.id_beneficio,
        p_id_contrato_destino: Number(destinationContractId),
        p_monto: amount,
        p_usuario: user?.email ?? "administracion",
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      const result = data as { monto_aplicado?: number; monto_disponible?: number } | null;
      toast.success(
        `${formatCurrency(result?.monto_aplicado)} aplicados al mantenimiento. Saldo del beneficio: ${formatCurrency(result?.monto_disponible)}.`,
      );
      setBenefitTarget(null);
      setDestinationContractId("");
      setBenefitAmount("");
      await loadPanel();
    } catch (error) {
      console.error("Error aplicando beneficio:", error);
      toast.error(errorMessage(error as RpcError, "No se pudo aplicar el beneficio"));
    } finally {
      setProcessing(false);
    }
  };

  const handleStatus = async (item: ReferidoRow, nextStatus: "EN_GESTION" | "DESCARTADO") => {
    setProcessing(true);
    try {
      const { error } = await rpc("actualizar_estado_referido", {
        p_id_referido: item.id_referido,
        p_estado: nextStatus,
        p_observacion: null,
        p_usuario: user?.email ?? "administracion",
      });
      if (error) throw error;
      toast.success(nextStatus === "DESCARTADO" ? "Referido descartado" : "Referido en gestión");
      await loadPanel();
    } catch (error) {
      console.error("Error actualizando referido:", error);
      toast.error(errorMessage(error as RpcError, "No se pudo actualizar el referido"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="app-page">
      <div className="app-page-content">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-primary sm:text-3xl">Referidos</h1>
            <p className="max-w-3xl text-muted-foreground">
              Prospectos recomendados por clientes, ventas convertidas y beneficios aplicables a mantenimiento.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" onClick={() => navigate(role === "vendedor" ? "/vendedor" : "/")}>
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
            <Button variant="secondary" onClick={() => void loadPanel()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={loading || Boolean(panelError) || (!isAdmin && panel.contratos_origen.length === 0)}
            >
              <Plus className="h-4 w-4" /> Nuevo referido
            </Button>
          </div>
        </div>

        {panelError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {panelError}
          </div>
        )}
        {!loading && !panelError && !isAdmin && panel.contratos_origen.length === 0 && (
          <div className="mb-6 rounded-lg border p-4 text-sm text-muted-foreground">
            No tienes contratos vigentes a tu nombre desde los cuales registrar referidos.
          </div>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Referidos", value: panel.resumen.total, icon: UsersRound },
            { label: "En seguimiento", value: panel.resumen.en_gestion, icon: UserRoundPlus },
            { label: "Ventas logradas", value: panel.resumen.convertidos, icon: BadgeCheck },
            { label: "Beneficios con saldo", value: panel.resumen.beneficios_disponibles, icon: CircleDollarSign },
            { label: "Elegibles para placa", value: panel.resumen.clientes_elegibles_placa, icon: Gift },
          ].map((metric) => (
            <Card key={metric.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <metric.icon className="h-7 w-7 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="text-2xl font-bold">{metric.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Seguimiento de referidos</CardTitle>
            <CardDescription>
              Los registros duplicados permanecen disponibles hasta que administración atribuya y formalice una venta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`mb-4 grid gap-3 ${isAdmin ? "lg:grid-cols-[minmax(0,1fr)_14rem_14rem]" : "lg:grid-cols-[minmax(0,1fr)_14rem]"}`}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar referido, cliente, teléfono o vendedor..."
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos los estados</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && (
                <Select value={sellerFilter} onValueChange={setSellerFilter}>
                  <SelectTrigger aria-label="Filtrar por vendedor"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos los vendedores</SelectItem>
                    {panel.vendedores.map((seller) => (
                      <SelectItem key={seller.id_vendedor} value={String(seller.id_vendedor)}>
                        {seller.nombre_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {loading ? (
              <div className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Cargando referidos...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                No hay referidos que coincidan con los filtros.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referido</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Seguimiento</TableHead>
                      <TableHead>Venta / beneficio</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((item) => {
                      const plate = plateByClient.get(item.id_cliente_referente);
                      const canLink = ["REGISTRADO", "EN_GESTION", "VINCULADO"].includes(item.estado);
                      const canApply =
                        Boolean(item.id_beneficio) &&
                        Number(item.monto_disponible ?? 0) > 0 &&
                        ["DISPONIBLE", "PARCIAL"].includes(item.beneficio_estado ?? "");
                      return (
                        <TableRow key={item.id_referido} className="align-top">
                          <TableCell className="min-w-64">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{item.nombre}</p>
                              <Badge className={statusClasses[item.estado]}>{statusLabels[item.estado]}</Badge>
                              {item.duplicados_activos > 0 && (
                                <Badge variant="destructive">{item.duplicados_activos} duplicado(s)</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{item.telefono}</p>
                            {item.email && <p className="text-sm text-muted-foreground">{item.email}</p>}
                            {item.motivo_inutilizacion && (
                              <p className="mt-2 text-xs text-destructive">{item.motivo_inutilizacion}</p>
                            )}
                          </TableCell>
                          <TableCell className="min-w-64">
                            <p className="font-medium">{item.cliente_referente_nombre}</p>
                            <p className="text-sm text-muted-foreground">
                              {contractLabel(item.contrato_origen_formulario, item.id_contrato_origen)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Captó: {item.vendedor_captador_nombre}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <Gift className="h-4 w-4 text-primary" />
                              <span className="text-xs font-medium">
                                Placa: {Math.min(plate?.unidades_intactas ?? 0, 3)}/3
                                {plate?.elegible ? " · Elegible" : ""}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="min-w-52">
                            <p className="text-sm">Responsable: {item.vendedor_responsable_nombre}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Registrado {formatDate(item.created_at)}</p>
                            {item.observaciones && <p className="mt-2 text-xs">{item.observaciones}</p>}
                          </TableCell>
                          <TableCell className="min-w-64">
                            {item.id_contrato_vinculado ? (
                              <>
                                <p className="font-medium">{item.cliente_vinculado_nombre}</p>
                                <p className="text-sm text-muted-foreground">
                                  {contractLabel(item.contrato_vinculado_formulario, item.id_contrato_vinculado)} · {item.contrato_vinculado_estado}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">Sin precontrato vinculado</p>
                            )}
                            {item.id_beneficio && (
                              <div className="mt-2 rounded-md bg-primary/5 p-2 text-xs">
                                <p className="font-semibold">Beneficio {item.beneficio_estado}</p>
                                <p>Disponible: {formatCurrency(item.monto_disponible)}</p>
                                <p>Aplicado: {formatCurrency(item.monto_aplicado)}</p>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="min-w-48">
                            <div className="flex flex-col items-stretch gap-2">
                              {isAdmin && canLink && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setLinkTarget(item);
                                    setPrecontractId(item.id_contrato_vinculado ? String(item.id_contrato_vinculado) : "");
                                  }}
                                >
                                  <Link2 className="h-4 w-4" /> Atribuir venta
                                </Button>
                              )}
                              {isAdmin && canApply && (
                                <Button size="sm" onClick={() => openBenefitDialog(item)}>
                                  <CircleDollarSign className="h-4 w-4" /> Aplicar beneficio
                                </Button>
                              )}
                              {isAdmin &&
                                item.id_contrato_vinculado &&
                                item.contrato_vinculado_estado === "PRECONTRATO" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void handleUnlink(item)}
                                    disabled={processing}
                                  >
                                    Desvincular
                                  </Button>
                                )}
                              {isAdmin && item.estado === "REGISTRADO" && (
                                <Button size="sm" variant="secondary" onClick={() => void handleStatus(item, "EN_GESTION")} disabled={processing}>
                                  Iniciar gestión
                                </Button>
                              )}
                              {isAdmin && ["REGISTRADO", "EN_GESTION"].includes(item.estado) && (
                                <Button size="sm" variant="ghost" onClick={() => void handleStatus(item, "DESCARTADO")} disabled={processing}>
                                  Descartar
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => !processing && setCreateOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar referido</DialogTitle>
            <DialogDescription>
              Solo se aceptan personas que todavía no coincidan con un cliente activo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Cliente y contrato que entrega el referido</Label>
              <Select value={sourceContractId} onValueChange={handleSourceChange}>
                <SelectTrigger><SelectValue placeholder="Seleccionar contrato vigente" /></SelectTrigger>
                <SelectContent>
                  {panel.contratos_origen.map((contract) => (
                    <SelectItem key={contract.id_contrato} value={String(contract.id_contrato)}>
                      {contract.cliente_nombre} · {contractLabel(contract.numero_formulario, contract.id_contrato)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="referido-name">Nombre completo</Label>
              <Input id="referido-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={150} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referido-phone">Teléfono</Label>
              <Input id="referido-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referido-email">Correo opcional</Label>
              <Input id="referido-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} />
            </div>
            {isAdmin ? (
              <div className="space-y-2">
                <Label>Vendedor responsable</Label>
                <Select value={responsibleSellerId} onValueChange={setResponsibleSellerId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar vendedor" /></SelectTrigger>
                  <SelectContent>
                    {panel.vendedores.map((seller) => (
                      <SelectItem key={seller.id_vendedor} value={String(seller.id_vendedor)}>
                        {seller.nombre_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Vendedor responsable</Label>
                <Input value={panel.vendedores[0]?.nombre_completo ?? "Tu cuenta de vendedor"} disabled />
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="referido-notes">Observaciones</Label>
              <Textarea id="referido-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={processing}>Cancelar</Button>
            <Button onClick={() => void handleCreate()} disabled={processing}>
              {processing && <Loader2 className="h-4 w-4 animate-spin" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkTarget)} onOpenChange={(open) => !open && !processing && setLinkTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Atribuir venta referida</DialogTitle>
            <DialogDescription>
              Administración decide cuál recomendación recibirá el beneficio. Solo se muestran precontratos con teléfono o correo coincidente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-semibold">{linkTarget?.nombre}</p>
              <p>{linkTarget?.telefono}{linkTarget?.email ? ` · ${linkTarget.email}` : ""}</p>
              {(linkTarget?.duplicados_activos ?? 0) > 0 && (
                <p className="mt-2 text-amber-700">Hay atribuciones duplicadas. Las demás quedarán inutilizables al formalizar esta venta.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Precontrato correspondiente</Label>
              <Select value={precontractId} onValueChange={setPrecontractId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar precontrato" /></SelectTrigger>
                <SelectContent>
                  {matchingPrecontracts.map((contract) => (
                    <SelectItem key={contract.id_contrato} value={String(contract.id_contrato)}>
                      {contract.cliente_nombre} · {contractLabel(contract.numero_formulario, contract.id_contrato)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {matchingPrecontracts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Primero crea el precontrato usando el mismo teléfono o correo registrado en el referido.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkTarget(null)} disabled={processing}>Cancelar</Button>
            <Button onClick={() => void handleLink()} disabled={processing || !precontractId}>
              {processing && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar atribución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(benefitTarget)} onOpenChange={(open) => !open && !processing && setBenefitTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Aplicar beneficio a mantenimiento</DialogTitle>
            <DialogDescription>
              El crédito no se registra como ingreso de caja y solo cubre principal de mantenimiento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-primary/5 p-3 text-sm">
              <p className="font-semibold">Cliente: {benefitTarget?.cliente_referente_nombre}</p>
              <p>Saldo disponible: {formatCurrency(benefitTarget?.monto_disponible)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Una aplicación, incluso parcial, excluye esta unidad del futuro canje por placa.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Contrato que recibirá el crédito</Label>
              <Select value={destinationContractId} onValueChange={setDestinationContractId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar contrato vigente" /></SelectTrigger>
                <SelectContent>
                  {destinationContracts.map((contract) => (
                    <SelectItem key={contract.id_contrato} value={String(contract.id_contrato)}>
                      {contractLabel(contract.numero_formulario, contract.id_contrato)} · Pendiente {formatCurrency(contract.total_pendiente)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {destinationContracts.length === 0 && (
                <p className="text-sm text-muted-foreground">El cliente no tiene mantenimiento pendiente en contratos vigentes.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="benefit-amount">Monto a aplicar</Label>
              <Input
                id="benefit-amount"
                type="number"
                min="1"
                max={Number(benefitTarget?.monto_disponible ?? 0)}
                step="0.01"
                value={benefitAmount}
                onChange={(event) => setBenefitAmount(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Si supera la anualidad pendiente, se aplicará solo el saldo necesario y se conservará el remanente.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBenefitTarget(null)} disabled={processing}>Cancelar</Button>
            <Button onClick={() => void handleApplyBenefit()} disabled={processing || !destinationContractId}>
              {processing && <Loader2 className="h-4 w-4 animate-spin" />} Aplicar crédito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
