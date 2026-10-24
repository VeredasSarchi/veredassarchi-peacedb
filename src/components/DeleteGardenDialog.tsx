import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  garden: Tables<"jardin">;
  onClose: () => void;
  onDeleted: (id: number) => void;
};

export function DeleteGardenDialog({ garden, onClose, onDeleted }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const nameMatches = confirmation.length > 0 && confirmation === garden.nombre;

  async function remove() {
    if (!nameMatches || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setError(null);
    try {
      const { data, error: deleteError } = await supabase.rpc("eliminar_jardin_con_filas", {
        p_id_jardin: garden.id_jardin,
        p_nombre_confirmacion: confirmation,
      });
      if (deleteError) throw deleteError;
      if (data !== garden.id_jardin) throw new Error("No se pudo confirmar la eliminacion.");
      onDeleted(data);
      onClose();
    } catch (cause) {
      setError((cause as { message?: string }).message ?? "No se pudo eliminar el jardin.");
    } finally {
      inFlight.current = false;
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar jardín</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará permanentemente el jardín <strong>{garden.nombre}</strong> y todas sus filas.
            Esta acción no se puede deshacer. Si tiene lotes o cenizarios asociados, la eliminación se bloqueará.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void remove(); }}>
          <div className="space-y-2">
            <Label htmlFor="delete-garden-name">Introduce el nombre del jardín que deseas eliminar.</Label>
            <Input id="delete-garden-name" value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={deleting} autoComplete="off" spellCheck={false}
              aria-describedby="delete-garden-name-help" />
            <p id="delete-garden-name-help" className="text-sm text-muted-foreground">
              Escribe exactamente: <strong className="break-words">{garden.nombre}</strong>.
              Respeta mayúsculas, acentos y espacios.
            </p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!nameMatches || deleting}>
              {deleting ? "Eliminando..." : "Eliminar jardín y sus filas"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
