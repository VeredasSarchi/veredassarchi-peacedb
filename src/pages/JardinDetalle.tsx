import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/auth/AuthContext";

type Jardin = Tables<"jardin">;
type Lote = Tables<"lote">;
type TipoLote = Tables<"tipo_lote">;
type TipoCenizario = Tables<"tipo_cenizario">;

type LoteEspacio = {
  id_lote_espacio: number;
  id_lote: number;
  numero_espacio: number;
  estado: "DISPONIBLE" | "OCUPADO";
  nombre_ocupante: string | null;
  fecha_ocupacion: Date | null;
  id_contrato_producto: number | null;
};

type LoteStatus = "available" | "precontract" | "contract" | "occupant" | "familiar";
type CenizarioStatus = "available" | "precontract" | "contract";

function isFormalizedContractState(estado: string | null | undefined): boolean {
  return estado === "VIGENTE";
}

type LoteDisplay = {
  key: string;
  label: string;
  status: LoteStatus;
  row: number;
  idLote: number;
  isFamiliar: boolean;
};

type CenizarioDisplay = {
  id: number;
  label: string;
  descripcion: string;
  status: CenizarioStatus;
};

const STATUS_LABELS: Record<LoteStatus, string> = {
  available: "Disponible",
  precontract: "Pre-contrato",
  contract: "Vendido",
  occupant: "Ocupante registrado",
  familiar: "Familiar",
};

const STATUS_STYLES: Record<LoteStatus, string> = {
  available: "bg-success text-success-foreground",
  precontract: "bg-warning text-warning-foreground",
  contract: "bg-destructive text-destructive-foreground",
  occupant: "bg-secondary-soft text-text-primary",
  familiar: "bg-accent text-accent-foreground",
};

const CENIZARIO_STYLES: Record<CenizarioStatus, string> = {
  available: "bg-success text-success-foreground",
  precontract: "bg-warning text-warning-foreground",
  contract: "bg-destructive text-destructive-foreground",
};

function UrnIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4h10" />
      <path d="M8 6h8" />
      <path d="M6 10c0 4 3 8 6 8s6-4 6-8" />
      <path d="M8 18h8" />
      <path d="M9 20h6" />
    </svg>
  );
}

function TombIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3h8" />
      <path d="M9 3v3" />
      <path d="M15 3v3" />
      <path d="M6 10a6 6 0 0 1 12 0v7H6z" />
      <path d="M4 21h16" />
    </svg>
  );
}

export default function JardinDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const gardenId = Number(id);
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [garden, setGarden] = useState<Jardin | null>(null);
  const [lots, setLots] = useState<Lote[]>([]);
  const [lotTypes, setLotTypes] = useState<TipoLote[]>([]);
  const [spaces, setSpaces] = useState<LoteEspacio[]>([]);
  const [cenizarios, setCenizarios] = useState<TipoCenizario[]>([]);
  const [contractStatusByLot, setContractStatusByLot] = useState<
    Record<number, "contract" | "precontract">
  >({});
  const [contractStatusByCenizario, setContractStatusByCenizario] = useState<
    Record<number, "contract" | "precontract">
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formRow, setFormRow] = useState<string>("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [isCenizarioDialogOpen, setIsCenizarioDialogOpen] = useState(false);
  const [cenizarioNumero, setCenizarioNumero] = useState("");
  const [cenizarioDescripcion, setCenizarioDescripcion] = useState("");
  const [savingCenizario, setSavingCenizario] = useState(false);
  const [selectedCenizario, setSelectedCenizario] = useState<TipoCenizario | null>(null);
  const [selectedLot, setSelectedLot] = useState<Lote | null>(null);
  const [isOccupantDialogOpen, setIsOccupantDialogOpen] = useState(false);
  const [occupantDrafts, setOccupantDrafts] = useState<
    Array<{ id: number; numero: number; occupied: boolean; nombre: string }>
  >([]);
  const [savingOccupants, setSavingOccupants] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadGarden() {
      if (!Number.isFinite(gardenId)) {
        setError("Id de jardin invalido.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: gardenData, error: gardenError } = await supabase
        .from("jardin")
        .select("*")
        .eq("id_jardin", gardenId)
        .single();

      if (gardenError) {
        if (isMounted) {
          setError("No se pudo cargar el jardin.");
          setLoading(false);
        }
        return;
      }

      const { data: tiposData, error: tiposError } = await supabase
        .from("tipo_lote")
        .select("*")
        .order("descripcion", { ascending: true });

      if (tiposError) {
        if (isMounted) {
          setError("No se pudieron cargar los tipos de lote.");
          setLoading(false);
        }
        return;
      }

      const { data: lotesData, error: lotesError } = await supabase
        .from("lote")
        .select("*")
        .eq("id_jardin", gardenId)
        .order("numero_lote", { ascending: true });

      if (lotesError) {
        if (isMounted) {
          setError("No se pudieron cargar los lotes.");
          setLoading(false);
        }
        return;
      }

      let espaciosData: LoteEspacio[] = [];
      const contractMap: Record<number, "contract" | "precontract"> = {};
      let cenizariosData: TipoCenizario[] = [];
      const cenizarioContractMap: Record<number, "contract" | "precontract"> = {};
      if (lotesData && lotesData.length > 0) {
        const loteIds = lotesData.map((lote) => lote.id_lote);

        const { data: contratosData, error: contratosError } = await supabase
          .from("contrato_producto")
          .select("id_lote, contrato:contrato(estado_contrato)")
          .eq("tipo_producto", "LOTE")
          .in("id_lote", loteIds);

        if (contratosError) {
          if (isMounted) {
            setError("No se pudieron cargar los contratos del lote.");
            setLoading(false);
          }
          return;
        }

        (contratosData ?? []).forEach((item) => {
          const idLote = (item as { id_lote: number | null }).id_lote;
          const contrato = (item as { contrato: { estado_contrato: string } | null }).contrato;
          if (!idLote || !contrato?.estado_contrato) {
            return;
          }
          if (contrato.estado_contrato === "PRECONTRATO") {
            if (!contractMap[idLote]) {
              contractMap[idLote] = "precontract";
            }
            return;
          }
          if (isFormalizedContractState(contrato.estado_contrato)) {
            contractMap[idLote] = "contract";
          }
        });

        const { data: espacios, error: espaciosError } = await supabase
          .from("lote_espacio")
          .select("*")
          .in("id_lote", loteIds)
          .order("numero_espacio", { ascending: true });

        if (espaciosError) {
          if (isMounted) {
            setError("No se pudieron cargar los espacios del lote.");
            setLoading(false);
          }
          return;
        }

        espaciosData = (espacios ?? []) as LoteEspacio[];
      }

      const { data: cenizariosRaw, error: cenizariosError } = await supabase
        .from("tipo_cenizario")
        .select("*")
        .eq("id_jardin", gardenId)
        .order("numero_cenizario", { ascending: true });

      if (cenizariosError) {
        if (isMounted) {
          setError("No se pudieron cargar los cenizarios.");
          setLoading(false);
        }
        return;
      }

      cenizariosData = cenizariosRaw ?? [];

      if (cenizariosData.length > 0) {
        const cenizarioIds = cenizariosData.map((cenizario) => cenizario.id_tipo_cenizario);
        const { data: cenizarioContratos, error: cenizarioContratosError } = await supabase
          .from("contrato_producto")
          .select("id_tipo_cenizario, contrato:contrato(estado_contrato)")
          .eq("tipo_producto", "CENIZARIO")
          .in("id_tipo_cenizario", cenizarioIds);

        if (cenizarioContratosError) {
          if (isMounted) {
            setError("No se pudieron cargar los contratos de cenizarios.");
            setLoading(false);
          }
          return;
        }

        (cenizarioContratos ?? []).forEach((item) => {
          const idTipo = (item as { id_tipo_cenizario: number | null }).id_tipo_cenizario;
          const contrato = (item as { contrato: { estado_contrato: string } | null }).contrato;
          if (!idTipo || !contrato?.estado_contrato) {
            return;
          }
          if (contrato.estado_contrato === "PRECONTRATO") {
            if (!cenizarioContractMap[idTipo]) {
              cenizarioContractMap[idTipo] = "precontract";
            }
            return;
          }
          if (isFormalizedContractState(contrato.estado_contrato)) {
            cenizarioContractMap[idTipo] = "contract";
          }
        });
      }

      if (isMounted) {
        setGarden(gardenData ?? null);
        setLots(lotesData ?? []);
        setLotTypes(tiposData ?? []);
        setSpaces(espaciosData);
        setCenizarios(cenizariosData);
        setContractStatusByLot(contractMap);
        setContractStatusByCenizario(cenizarioContractMap);
        setIsSimulated((lotesData ?? []).length === 0);
        setLoading(false);
      }
    }

    loadGarden();

    return () => {
      isMounted = false;
    };
  }, [gardenId]);

  const configuredRows = garden?.filas_lote ?? 8;
  const maxRowFromLots = useMemo(() => {
    if (lots.length === 0) {
      return 0;
    }
    return lots.reduce((max, lote) => {
      const match = (lote.numero_lote || "").match(/^F(\d+)-/i);
      const row = match ? Number(match[1]) : 1;
      return Math.max(max, row || 1);
    }, 0);
  }, [lots]);
  const displayRowCount = Math.max(configuredRows, maxRowFromLots || 0);
  const displayRows = useMemo(
    () => Array.from({ length: displayRowCount }, (_, index) => index + 1),
    [displayRowCount]
  );
  const selectableRows = useMemo(
    () => Array.from({ length: configuredRows }, (_, index) => index + 1),
    [configuredRows]
  );

  const lotesDisplay: LoteDisplay[] = useMemo(() => {
    if (lots.length === 0) {
      const rows = displayRowCount || 8;
      const cols = 8;
      const demoStatuses: LoteStatus[] = [
        "available",
        "precontract",
        "contract",
        "occupant",
        "familiar",
      ];
      return Array.from({ length: rows * cols }, (_, index) => {
        const row = Math.floor(index / cols) + 1;
        const col = (index % cols) + 1;
        const status = demoStatuses[index % demoStatuses.length];
        return {
          key: `sim-${index + 1}`,
          label: `F${row}-L${String(col).padStart(2, "0")}`,
          status,
          row,
          idLote: 0,
          isFamiliar: status === "familiar",
        };
      });
    }

    return lots.map((lote, index) => {
      const match = (lote.numero_lote || "").match(/^F(\d+)-/i);
      const row = match ? Number(match[1]) : 1;
      const tipoLote = lotTypes.find((tipo) => tipo.id_tipo_lote === lote.id_tipo_lote);
      const isFamiliar =
        (tipoLote?.descripcion || "").toLowerCase().trim() === "familiar";
      const lotSpaces = spaces.filter((space) => space.id_lote === lote.id_lote);
      const hasOccupant = lotSpaces.some(
        (space) => space.estado === "OCUPADO" || (space.nombre_ocupante || "").trim().length > 0
      );
      const contractStatus = contractStatusByLot[lote.id_lote];

      let status: LoteStatus = "available";
      if (contractStatus === "contract") {
        status = "contract";
      } else if (contractStatus === "precontract") {
        status = "precontract";
      } else if (hasOccupant) {
        status = "occupant";
      } else if (isFamiliar) {
        status = "familiar";
      }

      return {
        key: String(lote.id_lote),
        label: lote.numero_lote || `L-${String(index + 1).padStart(3, "0")}`,
        status,
        row,
        idLote: lote.id_lote,
        isFamiliar,
      };
    });
  }, [lots, spaces, lotTypes, contractStatusByLot, displayRowCount]);

  const cenizariosDisplay: CenizarioDisplay[] = useMemo(() => {
    return cenizarios.map((cenizario) => {
      const status = contractStatusByCenizario[cenizario.id_tipo_cenizario];
      if (status === "contract") {
        return {
          id: cenizario.id_tipo_cenizario,
          label: cenizario.numero_cenizario,
          descripcion: cenizario.descripcion,
          status: "contract",
        };
      }
      if (status === "precontract") {
        return {
          id: cenizario.id_tipo_cenizario,
          label: cenizario.numero_cenizario,
          descripcion: cenizario.descripcion,
          status: "precontract",
        };
      }
      return {
        id: cenizario.id_tipo_cenizario,
        label: cenizario.numero_cenizario,
        descripcion: cenizario.descripcion,
        status: "available",
      };
    });
  }, [cenizarios, contractStatusByCenizario]);

  const counts = useMemo(() => {
    return lotesDisplay.reduce(
      (acc, lote) => {
        acc[lote.status] += 1;
        return acc;
      },
      { available: 0, precontract: 0, contract: 0, occupant: 0, familiar: 0 }
    );
  }, [lotesDisplay]);


  async function handleCreateLote() {
    if (!isAdmin) {
      return;
    }
    if (!garden || !Number.isFinite(gardenId)) {
      setError("No se pudo identificar el jardin.");
      return;
    }

    if (!formRow || !formName.trim() || !formType) {
      setError("Completa todos los campos antes de guardar.");
      return;
    }

    const rowNumber = Number(formRow);
    const capacity = 2;

    if (!Number.isFinite(rowNumber) || rowNumber < 1 || rowNumber > configuredRows) {
      setError(`La fila debe estar entre 1 y ${configuredRows}.`);
      return;
    }

    setSaving(true);
    setError(null);

    const normalizedName = formName.trim();
    const numeroLote = `F${rowNumber}-${normalizedName}`;

    let tipo = lotTypes.find(
      (item) => item.descripcion === formType && item.cantidad_espacios === capacity
    );

    if (!tipo) {
      const { data: newTipo, error: tipoError } = await supabase
        .from("tipo_lote")
        .insert({
          descripcion: formType,
          cantidad_espacios: capacity,
        })
        .select("*")
        .single();

      if (tipoError) {
        setError("No se pudo crear el tipo de lote.");
        setSaving(false);
        return;
      }

      tipo = newTipo ?? null;
      if (tipo) {
        setLotTypes((prev) => [...prev, tipo!]);
      }
    }

    if (!tipo) {
      setError("No se pudo determinar el tipo de lote.");
      setSaving(false);
      return;
    }

    const { data: newLote, error: loteError } = await supabase
      .from("lote")
      .insert({
        id_jardin: gardenId,
        id_tipo_lote: tipo.id_tipo_lote,
        numero_lote: numeroLote,
      })
      .select("*")
      .single();

    if (loteError) {
      setError("No se pudo crear el lote.");
      setSaving(false);
      return;
    }

    if (newLote) {
      const newSpacesPayload = Array.from({ length: capacity }, (_, index) => ({
        id_lote: newLote.id_lote,
        numero_espacio: index + 1,
        estado: "DISPONIBLE",
        nombre_ocupante: null,
        fecha_ocupacion: null,
        id_contrato_producto: null,
      }));

      const { data: newSpaces, error: spacesError } = await supabase
        .from("lote_espacio")
        .insert(newSpacesPayload)
        .select("*");

      if (spacesError) {
        setError("El lote se creo, pero no se pudieron crear los espacios.");
      } else {
        setSpaces((prev) => [...prev, ...((newSpaces ?? []) as LoteEspacio[])]);
      }

      setLots((prev) => [...prev, newLote]);
      setIsSimulated(false);
    }

    setFormRow("");
    setFormName("");
    setFormType("");
    setIsDialogOpen(false);
    setSaving(false);
  }

  function openOccupantDialog(lote: Lote) {
    const lotSpaces = spaces
      .filter((space) => space.id_lote === lote.id_lote)
      .sort((a, b) => a.numero_espacio - b.numero_espacio);

    const drafts = lotSpaces.map((space) => ({
      id: space.id_lote_espacio,
      numero: space.numero_espacio,
      occupied: space.estado === "OCUPADO",
      nombre: space.nombre_ocupante ?? "",
    }));

    setSelectedLot(lote);
    setOccupantDrafts(drafts);
    setIsOccupantDialogOpen(true);
  }

  async function handleSaveOccupants() {
    if (!isAdmin) {
      return;
    }
    if (!selectedLot) {
      return;
    }

    setSavingOccupants(true);
    setError(null);

    const spaceById = new Map(spaces.map((space) => [space.id_lote_espacio, space]));
    const updates: TablesInsert<"lote_espacio">[] = occupantDrafts.reduce(
      (acc, draft) => {
        const space = spaceById.get(draft.id);
        if (!space) {
          return acc;
        }
        const occupied = draft.occupied && draft.nombre.trim().length > 0;
        acc.push({
          id_lote_espacio: draft.id,
          id_lote: space.id_lote,
          numero_espacio: space.numero_espacio,
          estado: occupied ? "OCUPADO" : "DISPONIBLE",
          nombre_ocupante: occupied ? draft.nombre.trim() : null,
          fecha_ocupacion: occupied ? new Date() : null,
          id_contrato_producto: space.id_contrato_producto ?? null,
        });
        return acc;
      },
      []
    );
    if (updates.length === 0) {
      setSavingOccupants(false);
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("lote_espacio")
      .upsert(updates, { onConflict: "id_lote_espacio" })
      .select("*");

    if (updateError) {
      setError("No se pudieron guardar los ocupantes.");
      setSavingOccupants(false);
      return;
    }

    if (updated) {
      setSpaces((prev) => {
        const map = new Map(prev.map((space) => [space.id_lote_espacio, space]));
        (updated as LoteEspacio[]).forEach((space) => {
          map.set(space.id_lote_espacio, space);
        });
        return Array.from(map.values());
      });
    }

    setIsOccupantDialogOpen(false);
    setSavingOccupants(false);
  }

  async function handleSaveCenizario() {
    if (!isAdmin) {
      return;
    }
    if (!garden || !Number.isFinite(gardenId)) {
      setError("No se pudo identificar el jardin.");
      return;
    }

    if (!cenizarioNumero.trim() || !cenizarioDescripcion.trim()) {
      setError("Completa el numero y la descripcion del cenizario.");
      return;
    }

    setSavingCenizario(true);
    setError(null);

    if (selectedCenizario) {
      const { data: updated, error: updateError } = await supabase
        .from("tipo_cenizario")
        .update({
          numero_cenizario: cenizarioNumero.trim(),
          descripcion: cenizarioDescripcion.trim(),
        })
        .eq("id_tipo_cenizario", selectedCenizario.id_tipo_cenizario)
        .select("*")
        .single();

      if (updateError) {
        setError("No se pudo actualizar el cenizario.");
        setSavingCenizario(false);
        return;
      }

      if (updated) {
        setCenizarios((prev) =>
          prev
            .map((item) =>
              item.id_tipo_cenizario === updated.id_tipo_cenizario ? updated : item
            )
            .sort((a, b) => a.numero_cenizario.localeCompare(b.numero_cenizario))
        );
      }
    } else {
      const { data: newCenizario, error: cenizarioError } = await supabase
        .from("tipo_cenizario")
        .insert({
          id_jardin: gardenId,
          numero_cenizario: cenizarioNumero.trim(),
          descripcion: cenizarioDescripcion.trim(),
        })
        .select("*")
        .single();

      if (cenizarioError) {
        setError("No se pudo crear el cenizario.");
        setSavingCenizario(false);
        return;
      }

      if (newCenizario) {
        setCenizarios((prev) =>
          [...prev, newCenizario].sort((a, b) =>
            a.numero_cenizario.localeCompare(b.numero_cenizario)
          )
        );
      }
    }

    setCenizarioNumero("");
    setCenizarioDescripcion("");
    setSelectedCenizario(null);
    setIsCenizarioDialogOpen(false);
    setSavingCenizario(false);
  }

  function openCenizarioDialog(cenizario?: TipoCenizario) {
    if (!isAdmin) {
      return;
    }
    if (cenizario) {
      setSelectedCenizario(cenizario);
      setCenizarioNumero(cenizario.numero_cenizario);
      setCenizarioDescripcion(cenizario.descripcion);
    } else {
      setSelectedCenizario(null);
      setCenizarioNumero("");
      setCenizarioDescripcion("");
    }
    setIsCenizarioDialogOpen(true);
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {garden?.nombre || "Jardin"}
            </h1>
            <p className="text-muted-foreground">
              Visualizacion del jardin para manejo de lotes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/jardines")}>
              Volver a jardines
            </Button>
            {isAdmin && (
              <>
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                >
                  <TombIcon className="mr-2 h-4 w-4" />
                  Agregar lote
                </Button>
                <Button
                  onClick={() => openCenizarioDialog()}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <UrnIcon className="mr-2 h-4 w-4" />
                  Agregar Cenizario
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Mapa de Lotes</CardTitle>
              <CardDescription>
                {isSimulated
                  ? "No hay lotes en la base de datos. Mostrando simulacion."
                  : "Estados calculados por contrato, pre-contrato y ocupantes."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && <div className="text-sm text-muted-foreground">Cargando...</div>}
              {error && <div className="text-sm text-destructive">{error}</div>}

              {!loading && !error && (
                <>
                  <div className="flex flex-wrap gap-4 mb-6 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-success" />
                      Disponible ({counts.available})
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-warning" />
                      Pre-contrato ({counts.precontract})
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-destructive" />
                      Vendido ({counts.contract})
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-secondary-soft" />
                      Ocupante registrado ({counts.occupant})
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-accent" />
                      Familiar ({counts.familiar})
                    </div>
                  </div>

                  <div className="space-y-3">
                  {displayRows.map((rowNumber) => {
                      const rowItems = lotesDisplay.filter((lote) => lote.row === rowNumber);
                      return (
                        <div key={`row-${rowNumber}`} className="flex items-start gap-3">
                          <div className="w-8 text-xs font-semibold text-muted-foreground pt-2">
                            F{rowNumber}
                          </div>
                          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 flex-1">
                            {rowItems.length === 0 ? (
                              <div className="text-xs text-muted-foreground py-2">
                                Sin lotes en esta fila.
                              </div>
                            ) : (
                            rowItems.map((lote) =>
                              isAdmin ? (
                                <button
                                  key={lote.key}
                                  type="button"
                                  onClick={() => {
                                    const selected = lots.find((item) => item.id_lote === lote.idLote);
                                    if (selected) {
                                      openOccupantDialog(selected);
                                    }
                                  }}
                                  className={`relative rounded text-xs font-semibold text-center py-2 ${STATUS_STYLES[lote.status]}`}
                                  title={`${lote.label} - ${STATUS_LABELS[lote.status]}`}
                                >
                                  {lote.label}
                                  {lote.isFamiliar && lote.status !== "familiar" && (
                                    <span className="absolute top-1 right-1 rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                                      F
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <div
                                  key={lote.key}
                                  className={`relative rounded text-xs font-semibold text-center py-2 ${STATUS_STYLES[lote.status]}`}
                                  title={`${lote.label} - ${STATUS_LABELS[lote.status]}`}
                                >
                                  {lote.label}
                                  {lote.isFamiliar && lote.status !== "familiar" && (
                                    <span className="absolute top-1 right-1 rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                                      F
                                    </span>
                                  )}
                                </div>
                              )
                            )
                          )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cenizarios</CardTitle>
              <CardDescription>
                Estados por venta: disponible, pre-contrato o vendido.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && <div className="text-sm text-muted-foreground">Cargando...</div>}
              {error && <div className="text-sm text-destructive">{error}</div>}

              {!loading && !error && (
                <>
                  <div className="flex flex-wrap gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-success" />
                      Disponible
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-warning" />
                      Pre-contrato
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-destructive" />
                      Vendido
                    </div>
                  </div>

                  {cenizariosDisplay.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No hay cenizarios registrados.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cenizariosDisplay.map((cenizario) => {
                        const fullCenizario = cenizarios.find(
                          (item) => item.id_tipo_cenizario === cenizario.id
                        );
                        return isAdmin ? (
                          <button
                            key={cenizario.id}
                            type="button"
                            onClick={() => {
                              if (fullCenizario) {
                                openCenizarioDialog(fullCenizario);
                              }
                            }}
                            className={`text-left rounded border border-border p-3 ${CENIZARIO_STYLES[cenizario.status]}`}
                          >
                            <div className="text-sm font-semibold">
                              Cenizario {cenizario.label}
                            </div>
                            <div className="text-xs opacity-90">{cenizario.descripcion}</div>
                          </button>
                        ) : (
                          <div
                            key={cenizario.id}
                            className={`text-left rounded border border-border p-3 ${CENIZARIO_STYLES[cenizario.status]}`}
                          >
                            <div className="text-sm font-semibold">
                              Cenizario {cenizario.label}
                            </div>
                            <div className="text-xs opacity-90">{cenizario.descripcion}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar lote</DialogTitle>
            <DialogDescription>
              Selecciona fila, nombre, capacidad y tipo de lote.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fila</Label>
              <Select value={formRow} onValueChange={setFormRow}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una fila" />
                </SelectTrigger>
                <SelectContent>
                  {selectableRows.map((rowNumber) => (
                    <SelectItem key={`row-${rowNumber}`} value={String(rowNumber)}>
                      Fila {rowNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nombre del lote</Label>
              <Input
                placeholder="LP01A"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Se guardara como F{formRow || "?"}-{formName || "NOMBRE"}.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tipo de lote</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Familiar">Familiar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreateLote} disabled={saving}>
              {saving ? "Guardando..." : "Guardar lote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {isAdmin && (
        <Dialog open={isCenizarioDialogOpen} onOpenChange={setIsCenizarioDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedCenizario ? "Editar Cenizario" : "Agregar Cenizario"}
            </DialogTitle>
            <DialogDescription>
              {selectedCenizario
                ? "Actualiza el numero y la descripcion del cenizario."
                : "Ingresa el numero y la descripcion del cenizario."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Numero de cenizario</Label>
              <Input
                placeholder="CNZ-001"
                value={cenizarioNumero}
                onChange={(event) => setCenizarioNumero(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Descripcion</Label>
              <Input
                placeholder="Descripcion breve del cenizario"
                value={cenizarioDescripcion}
                onChange={(event) => setCenizarioDescripcion(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCenizarioDialogOpen(false)}
              disabled={savingCenizario}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveCenizario} disabled={savingCenizario}>
              {savingCenizario
                ? "Guardando..."
                : selectedCenizario
                ? "Guardar cambios"
                : "Guardar cenizario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {isAdmin && (
        <Dialog open={isOccupantDialogOpen} onOpenChange={setIsOccupantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Espacios del lote</DialogTitle>
            <DialogDescription>
              {selectedLot?.numero_lote || "Lote"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {occupantDrafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este lote no tiene espacios creados.
              </p>
            ) : (
              occupantDrafts.map((draft, index) => (
                <div key={draft.id} className="rounded border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Espacio {draft.numero}</span>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={draft.occupied}
                        onCheckedChange={(checked) => {
                          const value = Boolean(checked);
                          setOccupantDrafts((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, occupied: value } : item
                            )
                          );
                        }}
                      />
                      <span className="text-xs text-muted-foreground">Ocupado</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre del ocupante</Label>
                    <Input
                      placeholder="Nombre completo"
                      value={draft.nombre}
                      onChange={(event) => {
                        const value = event.target.value;
                        setOccupantDrafts((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, nombre: value } : item
                          )
                        );
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsOccupantDialogOpen(false)}
              disabled={savingOccupants}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveOccupants} disabled={savingOccupants}>
              {savingOccupants ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
