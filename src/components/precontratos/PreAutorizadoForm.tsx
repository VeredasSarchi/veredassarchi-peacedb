import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const preAutorizadoSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  cedula: z.string().optional(),
});

type PreAutorizadoFormValues = z.infer<typeof preAutorizadoSchema>;

interface PreAutorizadoFormProps {
  preClienteId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function PreAutorizadoForm({ preClienteId, onComplete, onSkip }: PreAutorizadoFormProps) {
  const form = useForm<PreAutorizadoFormValues>({
    resolver: zodResolver(preAutorizadoSchema),
    defaultValues: {
      nombre: "",
      cedula: "",
    },
  });

  const onSubmit = async (values: PreAutorizadoFormValues) => {
    const idContrato = Number(preClienteId);
    if (!Number.isFinite(idContrato)) {
      toast.error("No se pudo identificar el contrato");
      return;
    }

    const { error } = await supabase.from("contrato_autorizados").insert({
      id_contrato: idContrato,
      nombre: values.nombre,
      cedula: values.cedula || null,
    });

    if (error) {
      console.error("Error guardando pre-autorizado:", error);
      toast.error("No se pudo registrar el pre-autorizado");
      return;
    }

    toast.success("Pre-autorizado registrado correctamente");
    onComplete();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre Completo *</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre completo del autorizado" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cedula"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cédula</FormLabel>
                <FormControl>
                  <Input placeholder="Número de cédula" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-between">
          <Button type="button" onClick={onSkip}> 
            Omitir
          </Button>
          <Button type="submit">Siguiente</Button>
        </div>
      </form>
    </Form>
  );
}
