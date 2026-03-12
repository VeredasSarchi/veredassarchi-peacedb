import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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

export type PreAutorizadoDraft = {
  nombre: string;
  cedula: string;
};

const preAutorizadoItemSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  cedula: z.string().optional(),
});

const preAutorizadoSchema = z.object({
  autorizados: z.array(preAutorizadoItemSchema).max(4, "Máximo de 4 pre-autorizados"),
});

type PreAutorizadoFormValues = z.infer<typeof preAutorizadoSchema>;

interface PreAutorizadoFormProps {
  preAutorizados: PreAutorizadoDraft[];
  onSave: (autorizados: PreAutorizadoDraft[]) => void;
  onComplete: () => void;
  onSkip: () => void;
  onBack: (autorizados: PreAutorizadoDraft[]) => void;
}

function sanitizeAutorizados(values?: PreAutorizadoDraft[]) {
  const normalized = values?.filter((item) => item.nombre.trim().length > 0) ?? [];
  return normalized.length > 0 ? normalized : [{ nombre: "", cedula: "" }];
}

export function PreAutorizadoForm({
  preAutorizados,
  onSave,
  onComplete,
  onSkip,
  onBack,
}: PreAutorizadoFormProps) {
  const form = useForm<PreAutorizadoFormValues>({
    resolver: zodResolver(preAutorizadoSchema),
    defaultValues: {
      autorizados: sanitizeAutorizados(preAutorizados),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "autorizados",
  });

  useEffect(() => {
    form.reset({ autorizados: sanitizeAutorizados(preAutorizados) });
  }, [preAutorizados, form]);

  const onSubmit = (values: PreAutorizadoFormValues) => {
    onSave(values.autorizados);
    onComplete();
  };

  const handleGoBack = () => {
    onBack(form.getValues("autorizados"));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Puede registrar de 1 a 4 pre-autorizados. Si no desea agregar ninguno, presione Omitir.
        </p>

        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:gap-4"
          >
            <FormField
              control={form.control}
              name={`autorizados.${index}.nombre` as const}
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
              name={`autorizados.${index}.cedula` as const}
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

            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="border-input bg-background text-foreground hover:bg-muted"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
              >
                Quitar
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            className="border-input bg-background text-foreground hover:bg-muted"
            onClick={handleGoBack}
          >
            Volver a Pre-Cliente
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="border-input bg-background text-foreground hover:bg-muted"
            onClick={() => append({ nombre: "", cedula: "" })}
            disabled={fields.length >= 4}
          >
            Agregar otro pre-autorizado ({fields.length}/4)
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="border-input bg-background text-foreground hover:bg-muted"
              onClick={onSkip}
            >
              Omitir
            </Button>
            <Button
              type="submit"
              variant="default"
              className="bg-primary text-primary-foreground"
            >
              Siguiente
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
