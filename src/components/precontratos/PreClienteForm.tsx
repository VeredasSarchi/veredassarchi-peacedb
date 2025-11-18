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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const preClienteSchema = z.object({
  numero_formulario: z.string().optional(),
  nombre_completo: z.string().min(1, "El nombre completo es requerido"),
  estado_civil: z.string().optional(),
  profesion: z.string().optional(),
  identificacion: z.string().optional(),
  direccion: z.string().optional(),
  correo: z.string().email("Correo electrónico inválido").optional().or(z.literal("")),
  telefono1: z.string().optional(),
  telefono2: z.string().optional(),
  lote_numero: z.string().optional(),
  producto: z.string().optional(),
  precio: z.string().optional(),
  total_meses: z.string().optional(),
  cuota_fija: z.string().optional(),
  dia_pago: z.string().optional(),
  prima: z.string().optional(),
  saldo: z.string().optional(),
  fecha: z.string().optional(),
  metodo_pago: z.string().optional(),
  vendedor: z.string().optional(),
});

type PreClienteFormValues = z.infer<typeof preClienteSchema>;

interface PreClienteFormProps {
  onComplete: (id: string) => void;
}

export function PreClienteForm({ onComplete }: PreClienteFormProps) {
  const form = useForm<PreClienteFormValues>({
    resolver: zodResolver(preClienteSchema),
    defaultValues: {
      numero_formulario: "",
      nombre_completo: "",
      estado_civil: "",
      profesion: "",
      identificacion: "",
      direccion: "",
      correo: "",
      telefono1: "",
      telefono2: "",
      lote_numero: "",
      producto: "",
      precio: "",
      total_meses: "",
      cuota_fija: "",
      dia_pago: "",
      prima: "",
      saldo: "",
      fecha: "",
      metodo_pago: "",
      vendedor: "",
    },
  });

  const onSubmit = (values: PreClienteFormValues) => {
    // TODO: Save to Supabase later
    console.log("Pre-cliente form data:", values);
    toast.success("Pre-cliente registrado correctamente");
    onComplete("temp-" + Date.now());
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="numero_formulario"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de Formulario</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: F-001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nombre_completo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre Completo *</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre completo del cliente" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="identificacion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Identificación</FormLabel>
                <FormControl>
                  <Input placeholder="Número de identificación" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estado_civil"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado Civil</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Soltero/a">Soltero/a</SelectItem>
                    <SelectItem value="Casado/a">Casado/a</SelectItem>
                    <SelectItem value="Divorciado/a">Divorciado/a</SelectItem>
                    <SelectItem value="Viudo/a">Viudo/a</SelectItem>
                    <SelectItem value="Unión Libre">Unión Libre</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="profesion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profesión</FormLabel>
                <FormControl>
                  <Input placeholder="Profesión u ocupación" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="correo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Correo Electrónico</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="correo@ejemplo.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="telefono1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono 1</FormLabel>
                <FormControl>
                  <Input placeholder="Número de teléfono" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="telefono2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono 2</FormLabel>
                <FormControl>
                  <Input placeholder="Número de teléfono alternativo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="direccion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dirección</FormLabel>
              <FormControl>
                <Textarea placeholder="Dirección completa" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="border-t border-border pt-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Información del Producto
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="producto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Producto</FormLabel>
                  <FormControl>
                    <Input placeholder="Tipo de producto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lote_numero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Lote</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: L-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="precio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prima"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prima</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="saldo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Saldo</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="total_meses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total de Meses</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cuota_fija"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuota Fija</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dia_pago"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Día de Pago</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="31" placeholder="1-31" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="metodo_pago"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de Pago</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Efectivo">Efectivo</SelectItem>
                      <SelectItem value="Transferencia">Transferencia</SelectItem>
                      <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fecha"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vendedor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendedor</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del vendedor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg">
            Siguiente
          </Button>
        </div>
      </form>
    </Form>
  );
}
