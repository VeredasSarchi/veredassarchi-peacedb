import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trees } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
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

type Jardin = Tables<"jardin">;

type GardenStats = {
  lotesDisponibles: number;
  cenizariosDisponibles: number;
};

type ProductStatus = "contract" | "precontract";

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isFormalizedContractState(estado: string | null | undefined): boolean {
  return estado === "VIGENTE";
}

function getGardenStatsDescription(stats: GardenStats | undefined) {
  const lotes = stats?.lotesDisponibles ?? 0;
  const cenizarios = stats?.cenizariosDisponibles ?? 0;
  return `Disponibles: ${pluralize(lotes, "lote", "lotes")} / ${pluralize(cenizarios, "cenizario", "cenizarios")}`;
}

export default function Jardines() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [gardens, setGardens] = useState<Jardin[]>([]);
  const [gardenStats, setGardenStats] = useState<Record<number, GardenStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [gardenName, setGardenName] = useState("");
  const [gardenRows, setGardenRows] = useState("8");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadGardens() {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("jardin")
        .select("*")
        .order("nombre", { ascending: true });

      if (loadError) {
        if (isMounted) {
          setError("No se pudo cargar la lista de jardines.");
          setLoading(false);
        }
        return;
      }

      let gardensData = data ?? [];

      if (gardensData.length === 0 && isAdmin) {
        const { data: inserted, error: insertError } = await supabase
          .from("jardin")
          .insert({ nombre: "La Paz", filas_lote: 8 })
          .select("*");

        if (insertError) {
          if (isMounted) {
            setError("No se pudo crear el jardin inicial.");
            setLoading(false);
          }
          return;
        }

        gardensData = inserted ?? [];
      }

      if (isMounted) {
        const gardenIds = new Set(gardensData.map((garden) => garden.id_jardin));

        const [lotesRes, espaciosRes, cenizariosRes, productosRes] = await Promise.all([
          supabase.from("lote").select("id_lote, id_jardin"),
          supabase.from("lote_espacio").select("id_lote, estado, nombre_ocupante"),
          supabase.from("tipo_cenizario").select("id_tipo_cenizario, id_jardin"),
          supabase
            .from("contrato_producto")
            .select("tipo_producto, id_lote, id_tipo_cenizario, contrato:contrato(estado_contrato)")
            .in("tipo_producto", ["LOTE", "CENIZARIO"]),
        ]);

        if (!isMounted) return;

        if (
          lotesRes.error ||
          espaciosRes.error ||
          cenizariosRes.error ||
          productosRes.error
        ) {
          setError("No se pudo cargar la disponibilidad de los jardines.");
          setLoading(false);
          return;
        }

        const nextStats: Record<number, GardenStats> = {};
        gardenIds.forEach((id) => {
          nextStats[id] = { lotesDisponibles: 0, cenizariosDisponibles: 0 };
        });

        const occupiedLotIds = new Set<number>();
        (espaciosRes.data ?? []).forEach((space) => {
          if (space.estado === "OCUPADO" || (space.nombre_ocupante || "").trim().length > 0) {
            occupiedLotIds.add(space.id_lote);
          }
        });

        const lotStatusById: Record<number, ProductStatus> = {};
        const cenizarioStatusById: Record<number, ProductStatus> = {};
        (productosRes.data ?? []).forEach((producto) => {
          const contrato = (producto as { contrato: { estado_contrato: string } | null }).contrato;
          if (!contrato?.estado_contrato) return;

          const status: ProductStatus | null =
            contrato.estado_contrato === "PRECONTRATO"
              ? "precontract"
              : isFormalizedContractState(contrato.estado_contrato)
                ? "contract"
                : null;

          if (!status) return;

          if (producto.tipo_producto === "LOTE" && producto.id_lote) {
            if (status === "contract" || !lotStatusById[producto.id_lote]) {
              lotStatusById[producto.id_lote] = status;
            }
          }

          if (producto.tipo_producto === "CENIZARIO" && producto.id_tipo_cenizario) {
            if (status === "contract" || !cenizarioStatusById[producto.id_tipo_cenizario]) {
              cenizarioStatusById[producto.id_tipo_cenizario] = status;
            }
          }
        });

        (lotesRes.data ?? []).forEach((lote) => {
          if (!gardenIds.has(lote.id_jardin)) return;
          const isAvailable =
            !lotStatusById[lote.id_lote] &&
            !occupiedLotIds.has(lote.id_lote);

          if (isAvailable) {
            nextStats[lote.id_jardin].lotesDisponibles += 1;
          }
        });

        (cenizariosRes.data ?? []).forEach((cenizario) => {
          if (!gardenIds.has(cenizario.id_jardin)) return;
          if (!cenizarioStatusById[cenizario.id_tipo_cenizario]) {
            nextStats[cenizario.id_jardin].cenizariosDisponibles += 1;
          }
        });

        setGardens(gardensData);
        setGardenStats(nextStats);
        setLoading(false);
      }
    }

    loadGardens();

    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  async function handleCreateGarden() {
    if (!gardenName.trim()) {
      setError("Ingresa un nombre de jardin.");
      return;
    }

    const rowsValue = Number(gardenRows);
    if (!Number.isFinite(rowsValue) || rowsValue < 1) {
      setError("Ingresa una cantidad de filas valida.");
      return;
    }

    setSaving(true);
    setError(null);

    const { data: newGarden, error: insertError } = await supabase
      .from("jardin")
      .insert({ nombre: gardenName.trim(), filas_lote: rowsValue })
      .select("*")
      .single();

    if (insertError) {
      setError("No se pudo crear el jardin.");
      setSaving(false);
      return;
    }

    if (newGarden) {
      setGardens((prev) =>
        [...prev, newGarden].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setGardenStats((prev) => ({
        ...prev,
        [newGarden.id_jardin]: { lotesDisponibles: 0, cenizariosDisponibles: 0 },
      }));
    }

    setGardenName("");
    setGardenRows("8");
    setIsDialogOpen(false);
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Jardines
            </h1>
            <p className="text-muted-foreground">
              Selecciona un jardin para ver lotes y cenizarios.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(isAdmin ? "/" : "/vendedor")}
            >
              Volver al menu
            </Button>
            {isAdmin && (
              <Button onClick={() => setIsDialogOpen(true)}>
                <Trees className="mr-2 h-4 w-4" />
                Agregar jardin
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Listado de Jardines</CardTitle>
            <CardDescription>
              Gestion y visualizacion de espacios disponibles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && <div className="text-sm text-muted-foreground">Cargando...</div>}
            {error && <div className="text-sm text-destructive">{error}</div>}
            {!loading && !error && gardens.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No hay jardines registrados.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gardens.map((garden) => (
                <Card key={garden.id_jardin} className="border border-border">
                  <CardHeader>
                    <CardTitle className="text-lg">{garden.nombre}</CardTitle>
                    <CardDescription>
                      {getGardenStatsDescription(gardenStats[garden.id_jardin])}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      onClick={() => navigate(`/jardines/${garden.id_jardin}`)}
                    >
                      Ver lotes
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar jardin</DialogTitle>
              <DialogDescription>
                Ingresa el nombre del nuevo jardin.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label>Nombre del jardin</Label>
              <Input
                placeholder="Ej: La Esperanza"
                value={gardenName}
                onChange={(event) => setGardenName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cantidad de filas de lotes</Label>
              <Input
                type="number"
                min="1"
                placeholder="Ej: 8"
                value={gardenRows}
                onChange={(event) => setGardenRows(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleCreateGarden} disabled={saving}>
                {saving ? "Guardando..." : "Guardar jardin"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
