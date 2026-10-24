import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trees, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { GardenRowsDialog } from "@/components/GardenRowsDialog";
import { DeleteGardenDialog } from "@/components/DeleteGardenDialog";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { calculateGardenAvailability, type GardenStats } from "@/lib/garden-availability";

type Jardin = Tables<"jardin">;


function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}


function getGardenStatsDescription(stats: GardenStats | undefined) {
  if (!stats) return "Disponibilidad no disponible.";
  const lotes = stats.lotesDisponibles;
  const cenizarios = stats.cenizariosDisponibles;
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
  const [gardenToDelete, setGardenToDelete] = useState<Jardin | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGardens() {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await fetchAllPages((from, to) => supabase
        .from("jardin")
        .select("*", { count: "exact" })
        .order("nombre", { ascending: true }).order("id_jardin").range(from, to));

      if (loadError) {
        if (isMounted) {
          setError("No se pudo cargar la lista de jardines.");
          setLoading(false);
        }
        return;
      }

      const gardensData = data ?? [];

      if (isMounted) {
        const gardenIds = gardensData.map((garden) => garden.id_jardin);

        const [lotesRes, espaciosRes, cenizariosRes, productosRes] = await Promise.all([
          fetchAllPages((from, to) => supabase.from("lote")
            .select("id_lote, id_jardin", { count: "exact" }).order("id_lote").range(from, to)),
          fetchAllPages((from, to) => supabase.from("lote_espacio")
            .select("id_lote, estado, nombre_ocupante", { count: "exact" }).order("id_lote_espacio").range(from, to)),
          fetchAllPages((from, to) => supabase.from("tipo_cenizario")
            .select("id_tipo_cenizario, id_jardin", { count: "exact" }).order("id_tipo_cenizario").range(from, to)),
          fetchAllPages((from, to) => supabase.from("contrato_producto")
            .select("tipo_producto, id_lote, id_tipo_cenizario, contrato:contrato(estado_contrato)", { count: "exact" })
            .in("tipo_producto", ["LOTE", "CENIZARIO"]).order("id_contrato_producto").range(from, to)),
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

        const nextStats = calculateGardenAvailability(
          gardenIds, lotesRes.data ?? [], espaciosRes.data ?? [],
          cenizariosRes.data ?? [], productosRes.data ?? [],
        );

        setGardens(gardensData);
        setGardenStats(nextStats);
        setLoading(false);
      }
    }

    loadGardens();

    return () => {
      isMounted = false;
    };
  }, []);


  return (
    <div className="app-page">
      <div className="app-page-content">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
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
                    {isAdmin && (
                      <Button variant="outline"
                        className="mt-2 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setGardenToDelete(garden)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar jardín
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && gardenToDelete && (
        <DeleteGardenDialog key={gardenToDelete.id_jardin} garden={gardenToDelete}
          onClose={() => setGardenToDelete(null)}
          onDeleted={(id) => {
            setGardens((previous) => previous.filter((garden) => garden.id_jardin !== id));
            setGardenStats((previous) => {
              const next = { ...previous };
              delete next[id];
              return next;
            });
          }}
        />
      )}

      {isAdmin && isDialogOpen && (
        <GardenRowsDialog
          onClose={() => setIsDialogOpen(false)}
          onSaved={(newGarden) => {
            setGardens((previous) => [...previous, newGarden].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setGardenStats((previous) => ({
              ...previous,
              [newGarden.id_jardin]: { lotesDisponibles: 0, cenizariosDisponibles: 0 },
            }));
          }}
        />
      )}
    </div>
  );
}
