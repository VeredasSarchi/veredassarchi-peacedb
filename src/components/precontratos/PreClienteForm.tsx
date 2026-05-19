import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";

const preClienteSchema = z.object({
  numero_formulario: z.string().min(1, "El número de formulario es requerido"),
  numero_contrato: z.string().max(50, "El número de contrato no puede superar 50 caracteres").optional(),
  nombre_completo: z.string().min(1, "El nombre completo es requerido"),
  estado_civil: z.string().optional(),
  profesion: z.string().optional(),
  identificacion: z.string().max(30, "La identificación no puede superar 30 caracteres").optional(),
  direccion: z.string().optional(),
  correo: z
    .string()
    .email("Correo electrónico inválido")
    .max(120, "El correo no puede superar 120 caracteres")
    .optional()
    .or(z.literal("")),
  telefono1: z.string().min(1, "El teléfono 1 es requerido"),
  telefono2: z.string().min(1, "El teléfono 2 es requerido"),
  id_jardin: z.string().optional(),
  tipos_paquete_funerario: z
    .array(z.enum(["LOTE", "CENIZARIO", "CREMACION", "PAQUETE_FUNERARIO"]))
    .min(1, "Seleccione al menos un producto del paquete"),
  cantidad_lotes: z.string().optional(),
  lote_numeros: z.array(z.string()).optional(),
  tipo_lote: z.string().optional(),
  cenizario_numeros: z.array(z.string()).optional(),
  id_paquete_funerario: z.string().optional(),
  tipo_cremacion: z.string().optional(),
  precio: z.string().optional(),
  plazo_anios: z.string().optional(),
  total_meses: z.string().optional(),
  cuota_fija: z.string().optional(),
  monto_mantenimiento_mensual: z.string().optional(),
  dia_pago: z.string().optional(),
  tasa_interes_anual: z.string().optional(),
  prima: z.string().optional(),
  saldo: z.string().optional(),
  monto_mantenimiento_anual: z.string().optional(),
  anio_inicio_mantenimiento: z.string().optional(),
  observaciones: z.string().optional(),
  fecha: z.string().optional(),
  metodo_pago: z.string().optional(),
  vendedor: z.string().min(1, "Seleccione un vendedor"),
});

export type PreClienteFormValues = z.infer<typeof preClienteSchema>;
type Jardin = Tables<"jardin">;
type Lote = Tables<"lote">;
type TipoLote = Tables<"tipo_lote">;
type TipoCenizario = Tables<"tipo_cenizario">;
type TipoCremacion = Tables<"tipo_cremacion">;
type PaqueteFunerario = Tables<"paquete_funerario">;
type Vendedor = Tables<"vendedor">;
type LoteStatus = "available" | "familiar" | "precontract" | "contract";
type CenizarioStatus = "available" | "precontract" | "contract";
export type ProductType = "LOTE" | "CENIZARIO" | "CREMACION" | "PAQUETE_FUNERARIO";

const REQUIRED_CREMATION_TYPES = ["ESPERANZA", "LA LUZ", "MASCOTAS", "RENACER"] as const;
const DEFAULT_VENDOR_NAME = "sarchiveredas@gmail.com";

export type PreClienteProductoDraft = Omit<TablesInsert<"contrato_producto">, "id_contrato">;
export type PreClienteContratoDraft = Omit<TablesInsert<"contrato">, "id_contrato" | "id_cliente">;
export type PreClienteDraftPayload = {
  cliente: Omit<TablesInsert<"cliente">, "id_cliente">;
  contrato: PreClienteContratoDraft;
  productos: PreClienteProductoDraft[];
};
export type PreClienteSubmitPayload = {
  values: PreClienteFormValues;
  payload: PreClienteDraftPayload;
};

const EMPTY_PRE_CLIENTE_VALUES: PreClienteFormValues = {
  numero_formulario: "",
  numero_contrato: "",
  nombre_completo: "",
  estado_civil: "",
  profesion: "",
  identificacion: "",
  direccion: "",
  correo: "",
  telefono1: "",
  telefono2: "",
  id_jardin: "",
  cantidad_lotes: "",
  lote_numeros: [],
  tipo_lote: "",
  cenizario_numeros: [],
  id_paquete_funerario: "",
  tipo_cremacion: "",
  tipos_paquete_funerario: [],
  precio: "",
  plazo_anios: "",
  total_meses: "",
  cuota_fija: "",
  monto_mantenimiento_mensual: "",
  dia_pago: "",
  tasa_interes_anual: "",
  prima: "",
  saldo: "",
  monto_mantenimiento_anual: "",
  anio_inicio_mantenimiento: "",
  observaciones: "",
  fecha: "",
  metodo_pago: "",
  vendedor: "",
};

const PACKAGE_PRODUCT_OPTIONS: Array<{ value: ProductType; label: string }> = [
  { value: "LOTE", label: "Lote" },
  { value: "CENIZARIO", label: "Cenizario" },
  { value: "CREMACION", label: "Cremación" },
  { value: "PAQUETE_FUNERARIO", label: "Paquete funerario" },
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function formatCremacionLabel(description: string): string {
  return description.replace(/cremacion/gi, "Cremación");
}

function formatProductType(type: ProductType): string {
  if (type === "LOTE") return "Lote";
  if (type === "CENIZARIO") return "Cenizario";
  if (type === "PAQUETE_FUNERARIO") return "Paquete funerario";
  return "Cremación";
}

function isFormalizedContractState(estado: string | null | undefined): boolean {
  return estado === "VIGENTE";
}

function parseNumber(value?: string): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) {
    return null;
  }

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;

  if (hasComma && hasDot) {
    const decimalIndex = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
    const intPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, "");
    const decPart = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${decPart}`;
  } else if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const parts = cleaned.split(separator);
    if (parts.length > 2) {
      normalized = parts.join("");
    } else if (parts.length === 2) {
      const decimalPart = parts[1];
      const looksLikeThousands = decimalPart.length === 3;
      normalized = looksLikeThousands ? parts.join("") : `${parts[0]}.${parts[1]}`;
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumberToString(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(decimals);
}

const crcCurrencyFormatter = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCRC(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return crcCurrencyFormatter.format(value);
}

interface PreClienteFormProps {
  initialValues?: PreClienteFormValues;
  onComplete: (payload: PreClienteSubmitPayload) => void;
  submitButtonLabel?: string;
  showConfirmation?: boolean;
  confirmOnSubmit?: boolean;
  confirmationTitle?: string;
  confirmationDescription?: string;
  confirmationActionLabel?: string;
  saveConfirmationTitle?: string;
  saveConfirmationDescription?: string;
  saveConfirmationActionLabel?: string;
  hideNumeroFormulario?: boolean;
  useWhiteGraphBackground?: boolean;
  useDarkGraphText?: boolean;
  skipNumeroFormularioUniquenessCheck?: boolean;
  ignoredLoteIds?: string[];
  ignoredCenizarioIds?: string[];
}

export function PreClienteForm({
  onComplete,
  initialValues,
  submitButtonLabel = "Siguiente",
  showConfirmation = true,
  confirmOnSubmit = false,
  confirmationTitle = "Confirmar paso a pre-autorizados",
  confirmationDescription = "Esta información quedará guardada temporalmente para que la completes en el siguiente paso y se registre al finalizar el precontrato.",
  confirmationActionLabel = "Continuar",
  saveConfirmationTitle = "Confirmar cambios",
  saveConfirmationDescription = "¿Deseas guardar los cambios realizados?",
  saveConfirmationActionLabel = "Guardar cambios",
  hideNumeroFormulario = false,
  useWhiteGraphBackground = false,
  useDarkGraphText = false,
  skipNumeroFormularioUniquenessCheck = false,
  ignoredLoteIds = [],
  ignoredCenizarioIds = [],
}: PreClienteFormProps) {
  const [jardines, setJardines] = useState<Jardin[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [tiposLote, setTiposLote] = useState<TipoLote[]>([]);
  const [tiposCenizario, setTiposCenizario] = useState<TipoCenizario[]>([]);
  const [tiposCremacion, setTiposCremacion] = useState<TipoCremacion[]>([]);
  const [paquetesFunerarios, setPaquetesFunerarios] = useState<PaqueteFunerario[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [contractStatusByLot, setContractStatusByLot] = useState<
    Record<number, "contract" | "precontract">
  >({});
  const [contractStatusByCenizario, setContractStatusByCenizario] = useState<
    Record<number, "contract" | "precontract">
  >({});
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  const form = useForm<PreClienteFormValues>({
    resolver: zodResolver(preClienteSchema),
    defaultValues: {
      ...EMPTY_PRE_CLIENTE_VALUES,
      ...initialValues,
    },
  });

  useEffect(() => {
    form.reset({
      ...EMPTY_PRE_CLIENTE_VALUES,
      ...initialValues,
    });
  }, [initialValues, form]);

  const selectedJardin = form.watch("id_jardin");
  const selectedLoteIds = form.watch("lote_numeros");
  const selectedCenizarioIds = form.watch("cenizario_numeros");
  const enabledProductTypes = form.watch("tipos_paquete_funerario");
  const montoTotalInput = form.watch("precio");
  const plazoMesesInput = form.watch("plazo_anios");
  const primaInput = form.watch("prima");
  const tasaAnualInput = form.watch("tasa_interes_anual");
  const mantenimientoAnualInput = form.watch("monto_mantenimiento_anual");

  const hasLote = enabledProductTypes.includes("LOTE");
  const hasCenizario = enabledProductTypes.includes("CENIZARIO");
  const hasCremacion = enabledProductTypes.includes("CREMACION");
  const hasPaqueteFunerario = enabledProductTypes.includes("PAQUETE_FUNERARIO");
  const requiresGardenSelection = hasLote || hasCenizario;

  const handleCurrencyFocus = (
    fieldName: "precio" | "prima" | "monto_mantenimiento_anual"
  ) => {
    const parsed = parseNumber(form.getValues(fieldName));
    if (parsed === null) {
      return;
    }
    const editableValue = formatNumberToString(parsed);
    if (form.getValues(fieldName) !== editableValue) {
      form.setValue(fieldName, editableValue, { shouldDirty: false, shouldValidate: false });
    }
  };

  const handleCurrencyBlur = (
    fieldName: "precio" | "prima" | "monto_mantenimiento_anual"
  ) => {
    const parsed = parseNumber(form.getValues(fieldName));
    if (parsed === null) {
      if (form.getValues(fieldName) !== "") {
        form.setValue(fieldName, "", { shouldDirty: true, shouldValidate: true });
      }
      return;
    }

    const formatted = formatCRC(parsed);
    if (form.getValues(fieldName) !== formatted) {
      form.setValue(fieldName, formatted, { shouldDirty: true, shouldValidate: true });
    }
  };

  useEffect(() => {
    if (!hasLote) {
      form.setValue("lote_numeros", []);
      form.setValue("tipo_lote", "");
    }
    if (!hasCenizario) {
      form.setValue("cenizario_numeros", []);
    }
    if (!hasCremacion) {
      form.setValue("tipo_cremacion", "");
    }
    if (!hasPaqueteFunerario) {
      form.setValue("id_paquete_funerario", "");
    }
    if (!requiresGardenSelection && form.getValues("id_jardin")) {
      form.setValue("id_jardin", "");
    }
  }, [hasLote, hasCenizario, hasCremacion, hasPaqueteFunerario, requiresGardenSelection, form]);

  useEffect(() => {
    const montoTotal = parseNumber(montoTotalInput);
    const plazoMeses = parseNumber(plazoMesesInput);
    const prima = parseNumber(primaInput) ?? 0;
    const tasaAnual = parseNumber(tasaAnualInput) ?? 0;

    const mesesCalculados =
      plazoMeses && plazoMeses > 0 ? Math.max(0, Math.round(plazoMeses)) : null;
    const totalMesesStr = mesesCalculados ? String(mesesCalculados) : "";
    if (form.getValues("total_meses") !== totalMesesStr) {
      form.setValue("total_meses", totalMesesStr, { shouldDirty: false });
    }

    if (montoTotal === null) {
      if (form.getValues("saldo") !== "") {
        form.setValue("saldo", "", { shouldDirty: false });
      }
      if (form.getValues("cuota_fija") !== "") {
        form.setValue("cuota_fija", "", { shouldDirty: false });
      }
      return;
    }

    const saldoPendiente = Math.max(montoTotal - prima, 0);
    const saldoStr = formatCRC(saldoPendiente);
    if (form.getValues("saldo") !== saldoStr) {
      form.setValue("saldo", saldoStr, { shouldDirty: false });
    }

    if (!mesesCalculados || mesesCalculados <= 0) {
      if (form.getValues("cuota_fija") !== "") {
        form.setValue("cuota_fija", "", { shouldDirty: false });
      }
      return;
    }

    const tasaMensual = tasaAnual > 0 ? tasaAnual / 100 / 12 : 0;
    let cuotaMensual = 0;
    if (saldoPendiente > 0) {
      if (tasaMensual > 0) {
        const factor = Math.pow(1 + tasaMensual, -mesesCalculados);
        const denominator = 1 - factor;
        cuotaMensual =
          denominator > 0
            ? saldoPendiente * (tasaMensual / denominator)
            : saldoPendiente / mesesCalculados;
      } else {
        cuotaMensual = saldoPendiente / mesesCalculados;
      }
    }

    const cuotaStr = formatCRC(cuotaMensual);
    if (form.getValues("cuota_fija") !== cuotaStr) {
      form.setValue("cuota_fija", cuotaStr, { shouldDirty: false });
    }

    const mantenimientoAnual = parseNumber(mantenimientoAnualInput);
    const mantenimientoMensual =
      mantenimientoAnual && mantenimientoAnual > 0 ? formatCRC(mantenimientoAnual / 12) : "";
    if (form.getValues("monto_mantenimiento_mensual") !== mantenimientoMensual) {
      form.setValue("monto_mantenimiento_mensual", mantenimientoMensual, {
        shouldDirty: false,
      });
    }
  }, [montoTotalInput, plazoMesesInput, primaInput, tasaAnualInput, mantenimientoAnualInput, form]);

  const lotesDelJardin = useMemo(
    () => lotes.filter((lote) => String(lote.id_jardin) === selectedJardin),
    [lotes, selectedJardin]
  );

  const selectedLots = useMemo(
    () => lotes.filter((lote) => selectedLoteIds.includes(String(lote.id_lote))),
    [lotes, selectedLoteIds]
  );

  const selectedFamilyLotsCount = useMemo(
    () =>
      selectedLots.filter((lote) => {
        const tipo = tiposLote.find((item) => item.id_tipo_lote === lote.id_tipo_lote);
        return (tipo?.descripcion || "").toLowerCase().trim() === "familiar";
      }).length,
    [selectedLots, tiposLote]
  );

  const hasFamilyLotsSelected = selectedFamilyLotsCount > 0;
  const selectedIndividualLotsCount = selectedLots.length - selectedFamilyLotsCount;

  const isFamilyLot = (lote: Lote) => {
    const tipo = tiposLote.find((item) => item.id_tipo_lote === lote.id_tipo_lote);
    return (tipo?.descripcion || "").toLowerCase().trim() === "familiar";
  };

  const cenizariosDelJardin = useMemo(
    () => tiposCenizario.filter((cenizario) => String(cenizario.id_jardin) === selectedJardin),
    [tiposCenizario, selectedJardin]
  );

  const lotStatus = useMemo<Record<number, LoteStatus>>(() => {
    return lotesDelJardin.reduce((acc, lote) => {
      const tipo = tiposLote.find((item) => item.id_tipo_lote === lote.id_tipo_lote);
      const isFamiliar = (tipo?.descripcion || "").toLowerCase().trim() === "familiar";
      const status = contractStatusByLot[lote.id_lote];
      acc[lote.id_lote] =
        status === "contract"
          ? "contract"
          : status === "precontract"
          ? "precontract"
          : isFamiliar
          ? "familiar"
          : "available";
      return acc;
    }, {} as Record<number, LoteStatus>);
  }, [lotesDelJardin, contractStatusByLot, tiposLote]);

  const cenizarioStatus = useMemo<Record<number, CenizarioStatus>>(() => {
    return cenizariosDelJardin.reduce((acc, cenizario) => {
      const status = contractStatusByCenizario[cenizario.id_tipo_cenizario];
      acc[cenizario.id_tipo_cenizario] =
        status === "contract" ? "contract" : status === "precontract" ? "precontract" : "available";
      return acc;
    }, {} as Record<number, CenizarioStatus>);
  }, [cenizariosDelJardin, contractStatusByCenizario]);

  const lotesPorFila = useMemo(() => {
    const grouped: Record<number, Lote[]> = {};
    lotesDelJardin.forEach((lote) => {
      const match = (lote.numero_lote || "").match(/^F(\d+)-/i);
      const row = match ? Number(match[1]) : 1;
      if (!grouped[row]) {
        grouped[row] = [];
      }
      grouped[row].push(lote);
    });

    Object.keys(grouped).forEach((row) => {
      grouped[Number(row)].sort((a, b) => a.numero_lote.localeCompare(b.numero_lote));
    });

    return grouped;
  }, [lotesDelJardin]);

  const filasLotes = useMemo(
    () => Object.keys(lotesPorFila).map(Number).sort((a, b) => a - b),
    [lotesPorFila]
  );

  useEffect(() => {
    if (selectedLots.length === 0) {
      form.setValue("tipo_lote", "");
      return;
    }

    const hasFamily = selectedLots.some((lote) => {
      const tipo = tiposLote.find((item) => item.id_tipo_lote === lote.id_tipo_lote);
      return (tipo?.descripcion || "").toLowerCase().trim() === "familiar";
    });
    form.setValue("tipo_lote", hasFamily ? "Familiar" : "Individual");
  }, [selectedLots, tiposLote, form]);

  useEffect(() => {
    if (!hasLote) {
      return;
    }
    if (selectedLots.length > 0) {
      const minAllowed = hasFamilyLotsSelected ? 2 : 1;
      const nextCount = Math.max(selectedLots.length, minAllowed);
      form.setValue("cantidad_lotes", String(nextCount));
    }
  }, [hasLote, hasFamilyLotsSelected, selectedLots, form]);

  useEffect(() => {
    async function loadCatalogs() {
      setLoadingCatalogs(true);
      try {
        const [
          jardinesRes,
          lotesRes,
          tiposLoteRes,
          tiposCenizarioRes,
          tiposCremacionRes,
          paquetesFunerariosRes,
          vendedoresRes,
        ] = await Promise.all([
          supabase.from("jardin").select("*").order("nombre"),
          supabase.from("lote").select("*").order("numero_lote"),
          supabase.from("tipo_lote").select("*").order("descripcion"),
          supabase.from("tipo_cenizario").select("*").order("numero_cenizario"),
          supabase.from("tipo_cremacion").select("*").order("descripcion"),
          supabase.from("paquete_funerario").select("*").order("descripcion"),
          supabase.from("vendedor").select("*").order("nombre_completo"),
        ]);

        if (jardinesRes.error) throw jardinesRes.error;
        if (lotesRes.error) throw lotesRes.error;
        if (tiposLoteRes.error) throw tiposLoteRes.error;
        if (tiposCenizarioRes.error) throw tiposCenizarioRes.error;
        if (tiposCremacionRes.error) throw tiposCremacionRes.error;
        if (paquetesFunerariosRes.error) throw paquetesFunerariosRes.error;
        if (vendedoresRes.error) throw vendedoresRes.error;

        const jardinesData = jardinesRes.data ?? [];
        const lotesData = lotesRes.data ?? [];
        const tiposLoteData = tiposLoteRes.data ?? [];
        const cenizariosData = tiposCenizarioRes.data ?? [];
        const paquetesData = paquetesFunerariosRes.data ?? [];

        const cremacionesActuales = tiposCremacionRes.data ?? [];
        const missingCremaciones = REQUIRED_CREMATION_TYPES.filter(
          (nombre) =>
            !cremacionesActuales.some(
              (item) => normalizeText(item.descripcion) === normalizeText(nombre)
            )
        );

        let cremacionesFinales = [...cremacionesActuales];
        if (missingCremaciones.length > 0) {
          const { data: insertedCremaciones, error: insertCremError } = await supabase
            .from("tipo_cremacion")
            .insert(missingCremaciones.map((descripcion) => ({ descripcion })))
            .select("*");
          if (!insertCremError && insertedCremaciones) {
            cremacionesFinales = [...cremacionesFinales, ...insertedCremaciones];
          }
        }

        const cremacionesFiltradas = REQUIRED_CREMATION_TYPES.map((nombre) =>
          cremacionesFinales.find(
            (item) => normalizeText(item.descripcion) === normalizeText(nombre)
          )
        ).filter(Boolean) as TipoCremacion[];

        let vendedoresData = vendedoresRes.data ?? [];
        const hasDefaultVendor = vendedoresData.some(
          (item) => item.nombre_completo.trim().toLowerCase() === DEFAULT_VENDOR_NAME
        );
        if (!hasDefaultVendor) {
          const { data: insertedVendor, error: vendorInsertError } = await supabase
            .from("vendedor")
            .insert({ nombre_completo: DEFAULT_VENDOR_NAME })
            .select("*")
            .single();
          if (!vendorInsertError && insertedVendor) {
            vendedoresData = [...vendedoresData, insertedVendor];
          }
        }

        setJardines(jardinesData);
        setLotes(lotesData);
        setTiposLote(tiposLoteData);
        setTiposCenizario(cenizariosData);
        setTiposCremacion(
          cremacionesFiltradas.length > 0 ? cremacionesFiltradas : cremacionesFinales
        );
        const paquetesUnicos = new Map<string, PaqueteFunerario>();
        paquetesData.forEach((item) => {
          const key = item.descripcion.trim().toLowerCase();
          const current = paquetesUnicos.get(key);
          if (!current || item.id_paquete < current.id_paquete) {
            paquetesUnicos.set(key, item);
          }
        });

        setPaquetesFunerarios(
          Array.from(paquetesUnicos.values()).sort((a, b) =>
            a.descripcion.localeCompare(b.descripcion, "es")
          )
        );
        setVendedores(
          vendedoresData.sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))
        );
      } catch (error) {
        console.error("Error cargando catalogos de precontrato:", error);
        toast.error("No se pudieron cargar los catálogos de Supabase");
      } finally {
        setLoadingCatalogs(false);
      }
    }

    void loadCatalogs();
  }, []);

  useEffect(() => {
    async function loadProductStatus() {
      if (lotes.length === 0 && tiposCenizario.length === 0) {
        setContractStatusByLot({});
        setContractStatusByCenizario({});
        return;
      }
      const ignoredLoteSet = new Set(ignoredLoteIds);
      const ignoredCenizarioSet = new Set(ignoredCenizarioIds);

      try {
        const lotIds = lotes.map((lote) => lote.id_lote);
        const cenizarioIds = tiposCenizario.map((item) => item.id_tipo_cenizario);

        const [lotContracts, cenizarioContracts] = await Promise.all([
          lotIds.length > 0
            ? supabase
                .from("contrato_producto")
                .select("id_lote, contrato:contrato(estado_contrato)")
                .eq("tipo_producto", "LOTE")
                .in("id_lote", lotIds)
            : Promise.resolve({ data: [], error: null }),
          cenizarioIds.length > 0
            ? supabase
                .from("contrato_producto")
                .select("id_tipo_cenizario, contrato:contrato(estado_contrato)")
                .eq("tipo_producto", "CENIZARIO")
                .in("id_tipo_cenizario", cenizarioIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (lotContracts.error) throw lotContracts.error;
        if (cenizarioContracts.error) throw cenizarioContracts.error;

        const lotMap: Record<number, "contract" | "precontract"> = {};
        (lotContracts.data ?? []).forEach((item) => {
          const idLote = (item as { id_lote: number | null }).id_lote;
          const contrato = (item as { contrato: { estado_contrato: string } | null }).contrato;
          if (!idLote || !contrato?.estado_contrato) {
            return;
          }
          if (contrato.estado_contrato === "PRECONTRATO") {
            if (ignoredLoteSet.has(String(idLote))) {
              return;
            }
            if (!lotMap[idLote]) {
              lotMap[idLote] = "precontract";
            }
            return;
          }
          if (isFormalizedContractState(contrato.estado_contrato)) {
            lotMap[idLote] = "contract";
          }
        });

        const cenizarioMap: Record<number, "contract" | "precontract"> = {};
        (cenizarioContracts.data ?? []).forEach((item) => {
          const idCenizario = (item as { id_tipo_cenizario: number | null }).id_tipo_cenizario;
          const contrato = (item as { contrato: { estado_contrato: string } | null }).contrato;
          if (!idCenizario || !contrato?.estado_contrato) {
            return;
          }
          if (contrato.estado_contrato === "PRECONTRATO") {
            if (ignoredCenizarioSet.has(String(idCenizario))) {
              return;
            }
            if (!cenizarioMap[idCenizario]) {
              cenizarioMap[idCenizario] = "precontract";
            }
            return;
          }
          if (isFormalizedContractState(contrato.estado_contrato)) {
            cenizarioMap[idCenizario] = "contract";
          }
        });

        setContractStatusByLot(lotMap);
        setContractStatusByCenizario(cenizarioMap);
      } catch (error) {
        console.error("Error cargando estado de lotes/cenizarios:", error);
      }
    }

    void loadProductStatus();
  }, [lotes, tiposCenizario, ignoredLoteIds, ignoredCenizarioIds]);

  const onSubmit = async (values: PreClienteFormValues) => {
    try {
      const packageTypes = values.tipos_paquete_funerario;
      const needsGarden = packageTypes.includes("LOTE") || packageTypes.includes("CENIZARIO");

      if (needsGarden && !values.id_jardin) {
        form.setError("id_jardin", {
          message: "Seleccione un jardín para lotes o cenizarios",
        });
        toast.error("Debe seleccionar un jardín para lote o cenizario");
        return;
      }

      if (packageTypes.includes("LOTE") && (values.lote_numeros ?? []).length === 0) {
        form.setError("lote_numeros", { message: "Seleccione al menos un lote" });
        toast.error("El paquete seleccionado requiere lote");
        return;
      }
      if (packageTypes.includes("LOTE")) {
        const selectedIds = values.lote_numeros ?? [];
        if (selectedIds.length === 0) {
          form.setError("lote_numeros", { message: "Seleccione al menos un lote" });
          toast.error("Seleccione al menos un lote");
          return;
        }

        const selectedLotes = lotes.filter((lote) =>
          selectedIds.includes(String(lote.id_lote))
        );
        const familyCount = selectedLotes.filter((lote) => {
          return isFamilyLot(lote);
        }).length;
        const individualCount = selectedLotes.length - familyCount;

        if (familyCount > 0 && individualCount > 0) {
          form.setError("lote_numeros", {
            message: "No se pueden mezclar lotes familiares con individuales",
          });
          toast.error("No se pueden mezclar lotes familiares con individuales");
          return;
        }

        if (familyCount === 1 || familyCount % 2 !== 0) {
          form.setError("lote_numeros", {
            message: "Los lotes familiares deben seleccionarse en pares",
          });
          toast.error("Los lotes familiares deben seleccionarse en pares");
          return;
        }
        if (familyCount > 0 && selectedIds.length < 2) {
          form.setError("lote_numeros", {
            message: "Un plan familiar requiere mínimo 2 lotes",
          });
          toast.error("Un plan familiar requiere mínimo 2 lotes");
          return;
        }

        if (familyCount === 0 && individualCount > 1) {
          form.setError("lote_numeros", {
            message: "Para lotes individuales solo se permite seleccionar 1",
          });
          toast.error("Para lotes individuales solo se permite seleccionar 1");
          return;
        }

        const cantidadLotes = parseNumber(values.cantidad_lotes) ?? 0;
        if (familyCount > 0 && cantidadLotes < 2) {
          form.setError("cantidad_lotes", {
            message: "Para lotes familiares la cantidad mínima es 2",
          });
          toast.error("Para lotes familiares la cantidad mínima es 2");
          return;
        }
      }
      if (packageTypes.includes("CENIZARIO") && (values.cenizario_numeros ?? []).length === 0) {
        form.setError("cenizario_numeros", { message: "Seleccione al menos un cenizario" });
        toast.error("El paquete seleccionado requiere al menos un cenizario");
        return;
      }
      if (packageTypes.includes("CREMACION") && !values.tipo_cremacion) {
        form.setError("tipo_cremacion", { message: "Seleccione el tipo de cremación" });
        toast.error("El paquete seleccionado requiere cremación");
        return;
      }
      if (packageTypes.includes("PAQUETE_FUNERARIO") && !values.id_paquete_funerario) {
        form.setError("id_paquete_funerario", { message: "Seleccione el paquete funerario" });
        toast.error("El producto seleccionado requiere paquete funerario");
        return;
      }

      const idVendedor = Number(values.vendedor);
      if (!Number.isFinite(idVendedor)) {
        toast.error("El vendedor seleccionado no es válido");
        return;
      }

      const numeroFormulario = values.numero_formulario.trim();
      if (!numeroFormulario) {
        form.setError("numero_formulario", {
          message: "El número de formulario es requerido",
        });
        toast.error("Debe indicar el número de formulario");
        return;
      }

      if (!skipNumeroFormularioUniquenessCheck) {
        const dupCheckByNumeroFormulario = await supabase
          .from("contrato")
          .select("id_contrato")
          .eq("numero_formulario", numeroFormulario)
          .limit(1);

        if (dupCheckByNumeroFormulario.error) {
          throw dupCheckByNumeroFormulario.error;
        }
        if ((dupCheckByNumeroFormulario.data ?? []).length > 0) {
          form.setError("numero_formulario", {
            message: "Este número de formulario ya existe",
          });
          toast.error("Ya existe un precontrato con ese número de formulario");
          return;
        }
      }

      const numeroContratoIngresado = values.numero_contrato?.trim() || "";
      if (numeroContratoIngresado.length > 50) {
        form.setError("numero_contrato", {
          message: "El número de contrato no puede superar 50 caracteres",
        });
        toast.error("El número de contrato no puede superar 50 caracteres");
        return;
      }

      const identificacion = values.identificacion?.trim() || "";
      if (identificacion.length > 30) {
        form.setError("identificacion", {
          message: "La identificación no puede superar 30 caracteres",
        });
        toast.error("La identificación no puede superar 30 caracteres");
        return;
      }

      const correo = values.correo?.trim() || "";
      if (correo.length > 120) {
        form.setError("correo", {
          message: "El correo no puede superar 120 caracteres",
        });
        toast.error("El correo no puede superar 120 caracteres");
        return;
      }

      const clientePayload: Omit<TablesInsert<"cliente">, "id_cliente"> = {
        nombre_completo: values.nombre_completo,
        cedula: identificacion || null,
        email: correo || null,
        direccion: values.direccion || null,
        estado_civil: values.estado_civil || null,
        profesion: values.profesion || null,
        telefono1: values.telefono1 || null,
        telefono2: values.telefono2 || null,
        observaciones: values.observaciones || null,
      };

      const numeroContrato = numeroContratoIngresado || `PRE-${String(Date.now()).slice(-8)}`;

      const totalMeses = parseNumber(values.total_meses);
      const plazoAniosCompat =
        totalMeses !== null && totalMeses % 12 === 0 ? totalMeses / 12 : null;

      const contratoPayload: PreClienteContratoDraft = {
        numero_contrato: numeroContrato,
        numero_formulario: numeroFormulario,
        fecha_firma: values.fecha || null,
        id_vendedor: idVendedor,
        monto_arrendamiento_total: parseNumber(values.precio),
        plazo_anios: plazoAniosCompat,
        cuota_mensual: parseNumber(values.cuota_fija),
        dia_pago_mensual: parseNumber(values.dia_pago),
        total_meses: totalMeses,
        tasa_interes_anual: parseNumber(values.tasa_interes_anual),
        monto_entregado_inicial: parseNumber(values.prima),
        saldo_pendiente: parseNumber(values.saldo),
        cantidad_lotes: parseNumber(values.cantidad_lotes),
        monto_mantenimiento_anual: parseNumber(values.monto_mantenimiento_anual),
        anio_inicio_mantenimiento: parseNumber(values.anio_inicio_mantenimiento),
        observaciones_contrato: values.observaciones || null,
        estado_contrato: "PRECONTRATO",
      };

      const buildPayloadByType = (tipoProducto: ProductType) => {
        const payload: PreClienteProductoDraft = {
          tipo_producto: tipoProducto,
          id_lote: null,
          id_tipo_cenizario: null,
          id_tipo_cremacion: null,
          id_paquete: null,
          precio: parseNumber(values.precio),
          cantidad: parseNumber(values.cantidad_lotes),
        };

        if (tipoProducto === "PAQUETE_FUNERARIO") {
          payload.id_paquete = parseNumber(values.id_paquete_funerario);
          payload.cantidad = 1;
        }
        if (tipoProducto === "CREMACION") {
          payload.id_tipo_cremacion = parseNumber(values.tipo_cremacion);
        }
        return payload;
      };

      const payloadProductos = packageTypes.flatMap((tipo) => {
        if (tipo === "LOTE") {
          const selectedIds = values.lote_numeros ?? [];
          return selectedIds.map((id) => {
            const payload = buildPayloadByType("LOTE");
            payload.id_lote = parseNumber(id);
            return payload;
          });
        }
        if (tipo === "CENIZARIO") {
          const selectedIds = values.cenizario_numeros ?? [];
          return selectedIds.map((id) => {
            const payload = buildPayloadByType("CENIZARIO");
            payload.id_tipo_cenizario = parseNumber(id);
            payload.cantidad = 1;
            return payload;
          });
        }
        return [buildPayloadByType(tipo)];
      });

      onComplete({
        values,
        payload: {
          cliente: clientePayload,
          contrato: contratoPayload,
          productos: payloadProductos,
        },
      });
      toast.success("Pre-cliente preparado para continuar");
    } catch (error) {
      console.error("Error registrando pre-cliente:", error);
      toast.error("No se pudo registrar el pre-contrato");
    }
  };

  const handleRequestSubmit = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }
    if (showConfirmation) {
      setConfirmOpen(true);
      return;
    }
    if (confirmOnSubmit) {
      setConfirmSaveOpen(true);
      return;
    }
    void form.handleSubmit(onSubmit)();
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleRequestSubmit();
        }}
        className={`space-y-6 ${hideNumeroFormulario ? "text-foreground" : "text-card-foreground"}`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!hideNumeroFormulario && (
            <FormField
              control={form.control}
              name="numero_formulario"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Formulario *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: F-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

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
                    <SelectItem value="Union Libre">Union Libre</SelectItem>
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
                <FormLabel>Teléfono 1 *</FormLabel>
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
                <FormLabel>Teléfono 2 *</FormLabel>
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
          <h3
            className={`mb-4 text-lg font-semibold ${hideNumeroFormulario ? "text-foreground" : "text-text-primary"}`}
          >
            Información de Producto y Lotes
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requiresGardenSelection ? (
              <FormField
                control={form.control}
                name="id_jardin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jardín</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("lote_numeros", []);
                        form.setValue("cenizario_numeros", []);
                      }}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              loadingCatalogs ? "Cargando jardines..." : "Seleccione jardín"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {jardines.map((jardin) => (
                          <SelectItem key={jardin.id_jardin} value={String(jardin.id_jardin)}>
                            {jardin.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                Jardín no requerido para paquete funerario o cremación.
              </div>
            )}

            <FormField
              control={form.control}
              name="tipos_paquete_funerario"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Producto</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {PACKAGE_PRODUCT_OPTIONS.map((option) => {
                        const selected = field.value.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              const next = selected
                                ? field.value.filter((item) => item !== option.value)
                                : [...field.value, option.value];
                              field.onChange(next);
                            }}
                            className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                              selected
                                ? "border-primary bg-primary text-white"
                                : "border-border bg-background text-foreground hover:bg-muted"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {enabledProductTypes.length > 0
                      ? `Productos habilitados: ${enabledProductTypes
                          .map((item) => formatProductType(item))
                          .join(", ")}`
                      : "Seleccione uno o varios productos"}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="id_paquete_funerario"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paquete Funerario</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={!hasPaqueteFunerario}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            hasPaqueteFunerario
                              ? "Seleccione paquete funerario"
                              : "No aplica para este producto"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paquetesFunerarios.map((paquete) => (
                        <SelectItem key={paquete.id_paquete} value={String(paquete.id_paquete)}>
                          {paquete.descripcion}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lote_numeros"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Lote</FormLabel>
                  <FormControl>
                    <Input
                      readOnly
                      value={
                        selectedLots.length > 0
                          ? selectedLots.map((l) => l.numero_lote).join(", ")
                          : ""
                      }
                      placeholder={
                        !hasLote
                          ? "No aplica para este paquete"
                          : "Seleccione lote(s) en la gráfica"
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo_lote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Lote</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Se completa al seleccionar lote"
                      {...field}
                      readOnly
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cantidad_lotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de Lotes</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={hasFamilyLotsSelected ? "2" : "1"}
                      placeholder="Ej: 1"
                      readOnly={hasLote && selectedLots.length > 0}
                      {...field}
                    />
                  </FormControl>
                  {hasFamilyLotsSelected && (
                  <p className="text-xs text-muted-foreground">
                    Plan familiar detectado: mínimo 2 lotes y selección en pares.
                  </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cenizario_numeros"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cenizarios seleccionados</FormLabel>
                  <FormControl>
                    <div className="rounded-md border border-border bg-background px-3 py-2">
                      {!hasCenizario ? (
                        <p className="text-sm text-muted-foreground">
                          No aplica para este paquete.
                        </p>
                      ) : !selectedJardin ? (
                        <p className="text-sm text-muted-foreground">
                          Primero seleccione jardín.
                        </p>
                      ) : (field.value ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Seleccione uno o más cenizarios en la gráfica.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-white">
                            {(field.value ?? []).length} cenizario(s) seleccionado(s)
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(field.value ?? []).map((id) => {
                              const cenizario = cenizariosDelJardin.find(
                                (item) => String(item.id_tipo_cenizario) === id
                              );
                              return (
                                <span
                                  key={id}
                                  className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                                >
                                  {cenizario
                                    ? `${cenizario.numero_cenizario}`
                                    : `Cenizario ${id}`}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo_cremacion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Cremación</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={!hasCremacion}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            hasCremacion
                              ? "Seleccione tipo de cremación"
                              : "No aplica para este paquete"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {tiposCremacion.map((tipo) => (
                        <SelectItem
                          key={tipo.id_tipo_cremacion}
                          value={String(tipo.id_tipo_cremacion)}
                        >
                          {formatCremacionLabel(tipo.descripcion)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

          </div>

          {selectedJardin && (hasLote || hasCenizario) && (
            <div
              className={`mt-6 space-y-4 rounded-md border border-border p-4 ${
                useWhiteGraphBackground ? "bg-white" : "bg-muted/20"
              }`}
            >
              <h4 className="text-sm font-semibold text-text-primary">
                Selección gráfica del jardín
              </h4>

              <div className="flex flex-wrap gap-4 text-xs text-text-primary">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-success" />
                  Disponible
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-accent" />
                  Familiar
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-warning" />
                  Pre-contrato
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-destructive" />
                  Vendido
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-primary">
                  Lotes por fila
                </p>
                {filasLotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No hay lotes registrados.
                  </p>
                ) : (
                  filasLotes.map((fila) => (
                    <div key={`fila-${fila}`} className="flex items-start gap-3">
                      <div className="w-7 pt-2 text-xs font-bold text-text-secondary">
                        F{fila}
                      </div>
                      <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
                        {(lotesPorFila[fila] ?? []).map((lote) => {
                          const isSelected = selectedLoteIds.includes(String(lote.id_lote));
                          const status = lotStatus[lote.id_lote];
                          const clickedIsFamily = isFamilyLot(lote);
                          const invalidByFamilyRule =
                            (hasFamilyLotsSelected && !clickedIsFamily) ||
                            (selectedIndividualLotsCount > 0 && clickedIsFamily);
                          const invalidByIndividualRule =
                            selectedIndividualLotsCount > 0 &&
                            !clickedIsFamily &&
                            !isSelected;
                          const statusClass =
                            status === "contract"
                              ? "bg-destructive text-destructive-foreground"
                              : status === "precontract"
                              ? "bg-warning text-warning-foreground"
                              : status === "familiar"
                              ? "bg-accent text-accent-foreground"
                              : "bg-success text-success-foreground";

                          return (
                            <button
                              key={lote.id_lote}
                              type="button"
                              disabled={
                                !hasLote ||
                                status === "contract" ||
                                status === "precontract" ||
                                invalidByFamilyRule ||
                                invalidByIndividualRule
                              }
                              onClick={() => {
                                const id = String(lote.id_lote);
                                const current = form.getValues("lote_numeros");
                                if (current.includes(id)) {
                                  const next = current.filter((item) => item !== id);
                                  form.setValue("lote_numeros", next, { shouldValidate: true });
                                  return;
                                }

                                if (current.length === 0) {
                                  form.setValue("lote_numeros", [id], { shouldValidate: true });
                                  return;
                                }

                                if (hasFamilyLotsSelected) {
                                  if (!clickedIsFamily) {
                                    return;
                                  }
                                  form.setValue("lote_numeros", [...current, id], {
                                    shouldValidate: true,
                                  });
                                  return;
                                }

                                if (selectedIndividualLotsCount > 0) {
                                  if (clickedIsFamily) {
                                    return;
                                  }
                                  form.setValue("lote_numeros", [id], { shouldValidate: true });
                                  return;
                                }

                                const next = current.includes(id)
                                  ? current.filter((item) => item !== id)
                                  : [...current, id];
                                form.setValue("lote_numeros", next, { shouldValidate: true });
                              }}
                              className={`relative rounded px-2 py-2 text-xs font-semibold transition ${
                                status === "contract" || status === "precontract"
                                  ? "cursor-not-allowed opacity-70"
                                  : "hover:brightness-110"
                              } ${statusClass} ${
                                isSelected ? "ring-2 ring-primary ring-offset-1" : ""
                              }`}
                              title={`${lote.numero_lote} - ${
                                status === "available"
                                  ? "Disponible"
                                  : status === "familiar"
                                  ? "Familiar"
                                  : status === "precontract"
                                  ? "En pre-contrato"
                                  : "Vendido"
                              }`}
                            >
                              {lote.numero_lote}
                              {clickedIsFamily && status !== "familiar" && (
                              <span className="absolute top-1 right-1 rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                                  F
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-primary">
                  Cenizarios
                </p>
                {cenizariosDelJardin.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No hay cenizarios registrados.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {cenizariosDelJardin.map((cenizario) => {
                      const isSelected =
                        selectedCenizarioIds.includes(String(cenizario.id_tipo_cenizario));
                      const status = cenizarioStatus[cenizario.id_tipo_cenizario];
                      const statusClass =
                        status === "contract"
                          ? "bg-destructive text-destructive-foreground"
                          : status === "precontract"
                          ? "bg-warning text-warning-foreground"
                          : "bg-success text-success-foreground";

                      return (
                        <button
                          key={cenizario.id_tipo_cenizario}
                          type="button"
                          disabled={!hasCenizario || status !== "available"}
                          onClick={() => {
                            const id = String(cenizario.id_tipo_cenizario);
                            const current = form.getValues("cenizario_numeros") ?? [];
                            const next = current.includes(id)
                              ? current.filter((item) => item !== id)
                              : [...current, id];
                            form.setValue("cenizario_numeros", next, { shouldValidate: true });
                          }}
                          className={`rounded border border-border p-3 text-left transition ${
                            status !== "available"
                              ? "cursor-not-allowed opacity-70"
                              : "hover:brightness-110"
                          } ${statusClass} ${
                            isSelected ? "ring-2 ring-primary ring-offset-1" : ""
                          }`}
                        >
                          <div className="text-xs font-semibold text-text-primary">
                            {cenizario.numero_cenizario}
                          </div>
                          <div
                            className="text-[11px] opacity-90"
                          >
                            {cenizario.descripcion}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-6">
          <h3
            className={`mb-4 text-lg font-semibold ${hideNumeroFormulario ? "text-foreground" : "text-text-primary"}`}
          >
            Condiciones Financieras
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 -mb-1">
              <p className="text-xs text-muted-foreground">
                Todos los montos se muestran en colones costarricenses (CRC).
              </p>
            </div>

            <FormField
              control={form.control}
              name="precio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto Total de Arrendamiento (CRC)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="¢ 0,00"
                      {...field}
                      onFocus={() => handleCurrencyFocus("precio")}
                      onBlur={() => {
                        field.onBlur();
                        handleCurrencyBlur("precio");
                      }}
                      onChange={(event) => {
                        field.onChange(event.target.value.replace(/[^\d.,-]/g, ""));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="plazo_anios"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plazo (meses)</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" step="1" placeholder="Ej: 6" {...field} />
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
                  <FormLabel>Monto Entregado Inicial (Prima) (CRC)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="¢ 0,00"
                      {...field}
                      onFocus={() => handleCurrencyFocus("prima")}
                      onBlur={() => {
                        field.onBlur();
                        handleCurrencyBlur("prima");
                      }}
                      onChange={(event) => {
                        field.onChange(event.target.value.replace(/[^\d.,-]/g, ""));
                      }}
                    />
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
                  <FormLabel>Día de Pago Mensual</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="31" placeholder="1-31" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tasa_interes_anual"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tasa de Interés Anual (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="Ej: 8.50" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="monto_mantenimiento_anual"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto Mantenimiento Anual + IVA (CRC)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="¢ 0,00"
                      {...field}
                      onFocus={() => handleCurrencyFocus("monto_mantenimiento_anual")}
                      onBlur={() => {
                        field.onBlur();
                        handleCurrencyBlur("monto_mantenimiento_anual");
                      }}
                      onChange={(event) => {
                        field.onChange(event.target.value.replace(/[^\d.,-]/g, ""));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anio_inicio_mantenimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Año Inicio Mantenimiento</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Ej: 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fecha"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Firma</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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
                        <SelectValue placeholder="Seleccione método" />
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
              name="vendedor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendedor</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingCatalogs
                              ? "Cargando vendedores..."
                              : "Seleccione vendedor"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vendedores.map((vendedor) => (
                        <SelectItem
                          key={vendedor.id_vendedor}
                          value={String(vendedor.id_vendedor)}
                        >
                          {vendedor.nombre_completo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2 pt-1">
              <p
                className={`text-sm font-medium ${hideNumeroFormulario ? "text-muted-foreground" : "text-text-secondary"}`}
              >
                Campos calculados automáticamente
              </p>
            </div>

            <FormField
              control={form.control}
              name="total_meses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total de Meses</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Se calcula con el plazo"
                      readOnly
                      className="bg-muted"
                      {...field}
                    />
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
                  <FormLabel>Saldo Pendiente (CRC)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Se calcula automáticamente"
                      readOnly
                      className="bg-muted"
                      {...field}
                    />
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
                  <FormLabel>Cuota Mensual (CRC)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Se calcula automáticamente"
                      readOnly
                      className="bg-muted"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <FormField
            control={form.control}
            name="observaciones"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observaciones</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Notas relevantes del pre-contrato"
                    className="min-h-28"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
            {submitButtonLabel}
          </Button>
        </div>
      </form>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void form.handleSubmit(onSubmit)();
              }}
              disabled={form.formState.isSubmitting}
            >
              {confirmationActionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{saveConfirmationTitle}</AlertDialogTitle>
            <AlertDialogDescription>{saveConfirmationDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSaveOpen(false);
                void form.handleSubmit(onSubmit)();
              }}
              disabled={form.formState.isSubmitting}
            >
              {saveConfirmationActionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}











