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

  const onSubmit = (values: PreAutorizadoFormValues) => {
    // TODO: Save to Supabase later
    console.log("Pre-autorizado form data:", { preClienteId, ...values });
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
