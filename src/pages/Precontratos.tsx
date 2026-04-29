import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type PreClienteSubmitPayload,
  PreClienteForm,
} from "@/components/precontratos/PreClienteForm";
import { type PreAutorizadoDraft, PreAutorizadoForm } from "@/components/precontratos/PreAutorizadoForm";
import { type BeneficiarioDraft, BeneficiarioForm } from "@/components/precontratos/BeneficiarioForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type FormStep = "pre_cliente" | "pre_autorizado" | "beneficiario" | "complete";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error) {
    const maybeMessage = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
    const maybeDetails = "details" in error ? String((error as { details?: unknown }).details ?? "") : "";
    const maybeHint = "hint" in error ? String((error as { hint?: unknown }).hint ?? "") : "";
    const parts = [maybeMessage, maybeDetails, maybeHint].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return fallback;
}

export default function Precontratos() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [currentStep, setCurrentStep] = useState<FormStep>("pre_cliente");
  const [preClienteDraft, setPreClienteDraft] = useState<PreClienteSubmitPayload | null>(null);
  const [preAutorizadosDraft, setPreAutorizadosDraft] = useState<PreAutorizadoDraft[]>([]);
  const [beneficiarioDraft, setBeneficiarioDraft] = useState<BeneficiarioDraft>({
    nombre: "",
    cedula: "",
    contacto: "",
  });
  const [savingFinal, setSavingFinal] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<FormStep>>(new Set());
  const menuPath = role === "vendedor" ? "/vendedor" : "/";

  const handlePreClienteComplete = (payload: PreClienteSubmitPayload) => {
    setPreClienteDraft(payload);
    setCompletedSteps((prev) => new Set(prev).add("pre_cliente"));
    setCurrentStep("pre_autorizado");
    toast.success("Pre-cliente preparado exitosamente");
  };

  const handlePreAutorizadoSave = (autorizados: PreAutorizadoDraft[]) => {
    setPreAutorizadosDraft(autorizados);
  };

  const handlePreAutorizadoComplete = () => {
    setCompletedSteps((prev) => new Set(prev).add("pre_autorizado"));
    setCurrentStep("beneficiario");
    toast.success("Pre-autorizado registrado correctamente");
  };

  const handlePreAutorizadoBack = (autorizados: PreAutorizadoDraft[]) => {
    setPreAutorizadosDraft(autorizados);
    setCurrentStep("pre_cliente");
  };

  const handleBeneficiarioSave = (beneficiario: BeneficiarioDraft) => {
    setBeneficiarioDraft(beneficiario);
  };

  const handleSkipAutorizado = () => {
    setPreAutorizadosDraft([]);
    setCurrentStep("beneficiario");
    toast.info("Pre-autorizado omitido");
  };

  const handleBeneficiarioBack = (beneficiario: BeneficiarioDraft) => {
    setBeneficiarioDraft(beneficiario);
    setCurrentStep("pre_autorizado");
  };

  const handleBeneficiarioComplete = async (beneficiario: BeneficiarioDraft) => {
    if (!preClienteDraft) {
      toast.error("No se encontró la información del pre-cliente");
      return;
    }

    if (!beneficiario.nombre.trim()) {
      toast.error("El beneficiario es obligatorio");
      setCurrentStep("beneficiario");
      return;
    }

    setBeneficiarioDraft(beneficiario);
    setSavingFinal(true);
    let createdClientId: number | null = null;
    let createdContractId: number | null = null;
    try {
      const { data: clienteInsertado, error: clienteError } = await supabase
        .from("cliente")
        .insert(preClienteDraft.payload.cliente)
        .select("id_cliente")
        .single();

      if (clienteError || !clienteInsertado) {
        throw new Error(getErrorMessage(clienteError, "No se pudo crear el cliente"));
      }
      createdClientId = clienteInsertado.id_cliente;

      const contratoPayload = {
        ...preClienteDraft.payload.contrato,
        id_cliente: clienteInsertado.id_cliente,
      };

      const { data: contratoInsertado, error: contratoError } = await supabase
        .from("contrato")
        .insert(contratoPayload)
        .select("id_contrato, numero_formulario")
        .single();

      if (contratoError) {
        if ((contratoError as { code?: string }).code === "23505") {
          await supabase.from("cliente").delete().eq("id_cliente", clienteInsertado.id_cliente);
          toast.error("Ya existe un precontrato con ese número de formulario");
          return;
        }
        throw new Error(getErrorMessage(contratoError, "No se pudo crear el contrato"));
      }
      if (!contratoInsertado) {
        throw new Error("No se pudo crear el contrato");
      }
      createdContractId = contratoInsertado.id_contrato;

      const idContrato = contratoInsertado.id_contrato;
      const productosPayload = preClienteDraft.payload.productos.map((producto) => ({
        ...producto,
        id_contrato: idContrato,
      }));

      if (productosPayload.length > 0) {
        const { error: productoError } = await supabase.from("contrato_producto").insert(productosPayload);
        if (productoError) {
          throw new Error(getErrorMessage(productoError, "No se pudieron crear los productos del contrato"));
        }
      }

      const autorizados = preAutorizadosDraft.filter((item) => item.nombre.trim().length > 0);

      if (autorizados.length > 0) {
        const { error } = await supabase.from("contrato_autorizados").insert(
          autorizados.map((item) => ({
            id_contrato: idContrato,
            nombre: item.nombre,
            cedula: item.cedula || null,
          }))
        );
        if (error) {
          throw new Error(getErrorMessage(error, "No se pudieron guardar los pre-autorizados"));
        }
      }

      const { error: beneficiarioError } = await supabase
        .from("contrato_beneficiarios")
        .insert({
          id_contrato: idContrato,
          nombre: beneficiario.nombre,
          cedula: beneficiario.cedula || null,
          contacto: beneficiario.contacto || null,
        });
      if (beneficiarioError) {
        throw new Error(getErrorMessage(beneficiarioError, "No se pudo guardar el beneficiario"));
      }

      setCompletedSteps((prev) => new Set(prev).add("beneficiario"));
      setCurrentStep("complete");
      toast.success("Precontrato registrado correctamente");
    } catch (error) {
      console.error("Error guardando precontrato final:", error);
      if (createdContractId) {
        await supabase.from("contrato").delete().eq("id_contrato", createdContractId);
      }
      if (createdClientId) {
        await supabase.from("cliente").delete().eq("id_cliente", createdClientId);
      }
      toast.error(getErrorMessage(error, "No se pudo completar el precontrato"));
    } finally {
      setSavingFinal(false);
    }
  };

  const handleNewPrecontrato = () => {
    setCurrentStep("pre_cliente");
    setPreClienteDraft(null);
    setPreAutorizadosDraft([]);
    setBeneficiarioDraft({
      nombre: "",
      cedula: "",
      contacto: "",
    });
    setCompletedSteps(new Set());
  };

  const steps = [
    { id: "pre_cliente", label: "Pre-cliente", required: true },
    { id: "pre_autorizado", label: "Pre-autorizado", required: false },
    { id: "beneficiario", label: "Beneficiario", required: true },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Precontratos</h1>
            <p className="text-muted-foreground">
              Sistema de registro de precontratos para Jardines de Paz VeredasSarchi
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate(menuPath)}>
            Volver al Menu
          </Button>
        </div>

        <div className="mb-8 flex items-center justify-center gap-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                    completedSteps.has(step.id as FormStep)
                      ? "border-primary bg-primary text-primary-foreground"
                      : currentStep === step.id
                      ? "border-primary bg-background text-primary"
                      : "border-muted bg-background text-muted-foreground"
                  }`}
                >
                  {completedSteps.has(step.id as FormStep) ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    currentStep === step.id ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                  {!step.required && (
                    <span
                      className={`ml-1 ${
                        currentStep === step.id ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      (Opcional)
                    </span>
                  )}
                </span>
              </div>
              {index < steps.length - 1 && <div className="mx-4 h-0.5 w-12 bg-muted" />}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-text-primary">
              {currentStep === "pre_cliente" && "Informacion del Pre-Cliente"}
              {currentStep === "pre_autorizado" && "Informacion del Pre-Autorizado"}
              {currentStep === "beneficiario" && "Informacion del Beneficiario"}
              {currentStep === "complete" && "Registro Completado"}
            </CardTitle>
            <CardDescription>
              {currentStep === "pre_cliente" && "Complete la informacion basica del pre-cliente"}
              {currentStep === "pre_autorizado" && "Agregue una persona autorizada (opcional)"}
              {currentStep === "beneficiario" && "Agregue la información del beneficiario (obligatorio)"}
              {currentStep === "complete" && "El precontrato ha sido registrado exitosamente"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentStep === "pre_cliente" && (
              <PreClienteForm
                initialValues={preClienteDraft?.values}
                onComplete={handlePreClienteComplete}
              />
            )}

            {currentStep === "pre_autorizado" && (
              <PreAutorizadoForm
                preAutorizados={preAutorizadosDraft}
                onSave={handlePreAutorizadoSave}
                onComplete={handlePreAutorizadoComplete}
                onSkip={handleSkipAutorizado}
                onBack={handlePreAutorizadoBack}
              />
            )}

            {currentStep === "beneficiario" && (
              <BeneficiarioForm
                initialValues={beneficiarioDraft}
                onSave={handleBeneficiarioSave}
                onComplete={handleBeneficiarioComplete}
                onBack={handleBeneficiarioBack}
                disabled={savingFinal}
              />
            )}

            {currentStep === "complete" && (
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle2 className="h-16 w-16 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">Precontrato Registrado!</h3>
                <p className="text-muted-foreground mb-6 text-center">
                  El precontrato ha sido registrado exitosamente en el sistema.
                </p>
                <Button onClick={handleNewPrecontrato}>Registrar Nuevo Precontrato</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
