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

const beneficiarioSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  cedula: z.string().optional(),
  contacto: z.string().optional(),
});

type BeneficiarioFormValues = z.infer<typeof beneficiarioSchema>;

interface BeneficiarioFormProps {
  preClienteId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function BeneficiarioForm({ preClienteId, onComplete, onSkip }: BeneficiarioFormProps) {
  const form = useForm<BeneficiarioFormValues>({
    resolver: zodResolver(beneficiarioSchema),
    defaultValues: {
      nombre: "",
      cedula: "",
      contacto: "",
    },
  });

  const onSubmit = (values: BeneficiarioFormValues) => {
    // TODO: Save to Supabase later
    console.log("Beneficiario form data:", { preClienteId, ...values });
    toast.success("Beneficiario registrado correctamente");
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
                  <Input placeholder="Nombre completo del beneficiario" {...field} />
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

          <FormField
            control={form.control}
            name="contacto"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contacto</FormLabel>
                <FormControl>
                  <Input placeholder="Teléfono o correo de contacto" {...field} />
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
          <Button type="submit">Completar</Button>
        </div>
      </form>
    </Form>
  );
}
