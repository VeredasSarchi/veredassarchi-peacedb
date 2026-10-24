import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { normalizeRowIdentifier, validateRowDrafts, type GardenRow, type RowDraft } from "@/lib/garden-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type Props = {
  garden?: Tables<"jardin">;
  rows?: GardenRow[];
  onClose: () => void;
  onSaved: (garden: Tables<"jardin">, rows: GardenRow[]) => void;
};

export function GardenRowsDialog({ garden, rows, onClose, onSaved }: Props) {
  const [name, setName] = useState(garden?.nombre ?? "");
  const [drafts, setDrafts] = useState<RowDraft[]>(() => rows
    ? [...rows].sort((a, b) => a.orden - b.orden).map(({ id_jardin_fila, identificador }) => ({ id_jardin_fila, identificador }))
    : Array.from({ length: 8 }, (_, index) => ({ identificador: String(index + 1) })));
  const [count, setCount] = useState(String(drafts.length));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resize() {
    const size = Number(count);
    if (!Number.isInteger(size) || size < 1 || size > 32767) return;
    setDrafts((previous) => Array.from({ length: size }, (_, index) =>
      previous[index] ?? { identificador: String(index + 1) }));
  }

  function move(index: number, direction: number) {
    setDrafts((previous) => {
      const next = [...previous];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }

  async function save() {
    const validation = validateRowDrafts(drafts);
    if (!name.trim() || !Number.isInteger(Number(count)) || Number(count) !== drafts.length || validation) {
      setError(validation ?? "Revisa el nombre y la cantidad de filas.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data, error: saveError } = await supabase.rpc("guardar_jardin_con_filas", {
        p_id_jardin: garden?.id_jardin ?? null,
        p_nombre: name.trim(),
        p_filas: drafts.map((row) => ({ ...row, identificador: normalizeRowIdentifier(row.identificador) })),
      });
      if (saveError) throw saveError;
      const result = data as unknown as { jardin: Tables<"jardin">; filas: GardenRow[] };
      onSaved(result.jardin, result.filas);
      onClose();
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      setError(code === "23503"
        ? "No puedes eliminar una fila que contiene lotes. Cambia los lotes de fila primero."
        : code === "23505"
          ? "Un identificador ya existe. Para cambiar el orden usa Subir y Bajar."
          : (cause as { message?: string }).message ?? "No se pudo guardar el jardin.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{garden ? "Configurar jardin y filas" : "Agregar jardin"}</DialogTitle>
          <DialogDescription>
            Define las filas en el orden en que deben aparecer. Puedes usar numeros y letras.
            {garden && " Al renombrar una fila, sus lotes conservan la asociacion."}
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="garden-name">Nombre del jardin</Label>
        <Input id="garden-name" value={name} onChange={(event) => setName(event.target.value)} disabled={saving} />
        <Label htmlFor="garden-row-count">Cantidad de filas</Label>
        <div className="flex gap-2">
          <Input id="garden-row-count" type="number" min="1" max="32767" step="1" value={count}
            onChange={(event) => setCount(event.target.value)} disabled={saving} />
          <Button variant="outline" onClick={resize} disabled={saving}>Actualizar cantidad</Button>
        </div>
        {Number(count) !== drafts.length && (
          <p className="text-sm text-muted-foreground">Pulsa Actualizar cantidad para configurar las filas indicadas.</p>
        )}
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {drafts.map((row, index) => (
            <div key={row.id_jardin_fila ?? 'new-' + index} className="flex items-center gap-2">
              <Label htmlFor={'garden-row-' + index} className="w-16 shrink-0">Orden {index + 1}</Label>
              <Input id={'garden-row-' + index} maxLength={20} value={row.identificador} disabled={saving}
                onChange={(event) => setDrafts((previous) => previous.map((item, position) =>
                  position === index ? { ...item, identificador: normalizeRowIdentifier(event.target.value) } : item))} />
              <Button size="sm" variant="outline" disabled={saving || index === 0} onClick={() => move(index, -1)}>Subir</Button>
              <Button size="sm" variant="outline" disabled={saving || index === drafts.length - 1} onClick={() => move(index, 1)}>Bajar</Button>
            </div>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar jardin"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
