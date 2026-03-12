import { useEffect } from "react";
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

export type BeneficiarioDraft = {
  nombre: string;
  cedula: string;
  contacto: string;
};

const beneficiarioSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  cedula: z.string().optional(),
  contacto: z.string().optional(),
});

type BeneficiarioFormValues = z.infer<typeof beneficiarioSchema>;

interface BeneficiarioFormProps {
  initialValues?: BeneficiarioDraft;
  onSave: (values: BeneficiarioDraft) => void;
  onComplete: () => void;
  onBack: (values: BeneficiarioDraft) => void;
  disabled?: boolean;
}

export function BeneficiarioForm({
  initialValues,
  onSave,
  onComplete,
  onBack,
  disabled = false,
}: BeneficiarioFormProps) {
  const form = useForm<BeneficiarioFormValues>({
    resolver: zodResolver(beneficiarioSchema),
    defaultValues: {
      nombre: "",
      cedula: "",
      contacto: "",
      ...initialValues,
    },
  });

  useEffect(() => {
    form.reset({
      nombre: "",
      cedula: "",
      contacto: "",
      ...initialValues,
    });
  }, [initialValues, form]);

  const onSubmit = (values: BeneficiarioFormValues) => {
    onSave({
      nombre: values.nombre,
      cedula: values.cedula || "",
      contacto: values.contacto || "",
    });
    onComplete();
  };

  const handleGoBack = () => {
    const currentValues = form.getValues();
    onBack({
      nombre: currentValues.nombre || "",
      cedula: currentValues.cedula || "",
      contacto: currentValues.contacto || "",
    });
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
          <Button
            type="button"
            variant="secondary"
            className="border-input bg-background text-foreground hover:bg-muted"
            disabled={disabled}
            onClick={handleGoBack}
          >
            Volver a Pre-Autorizados
          </Button>
          <Button
            type="submit"
            variant="default"
            className="bg-primary text-primary-foreground"
            disabled={disabled}
          >
            {disabled ? "Guardando..." : "Completar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
