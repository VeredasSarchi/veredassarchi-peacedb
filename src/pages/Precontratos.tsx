import { useState } from "react";
import { PreClienteForm } from "@/components/precontratos/PreClienteForm";
import { PreAutorizadoForm } from "@/components/precontratos/PreAutorizadoForm";
import { BeneficiarioForm } from "@/components/precontratos/BeneficiarioForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";

type FormStep = "pre_cliente" | "pre_autorizado" | "beneficiario" | "complete";

export default function Precontratos() {
  const [currentStep, setCurrentStep] = useState<FormStep>("pre_cliente");
  const [preClienteId, setPreClienteId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<FormStep>>(new Set());

  const handlePreClienteComplete = (id: string) => {
    setPreClienteId(id);
    setCompletedSteps(prev => new Set(prev).add("pre_cliente"));
    setCurrentStep("pre_autorizado");
    toast.success("Pre-cliente registrado exitosamente");
  };

  const handlePreAutorizadoComplete = () => {
    setCompletedSteps(prev => new Set(prev).add("pre_autorizado"));
    setCurrentStep("beneficiario");
    toast.success("Pre-autorizado registrado exitosamente");
  };

  const handleBeneficiarioComplete = () => {
    setCompletedSteps(prev => new Set(prev).add("beneficiario"));
    setCurrentStep("complete");
    toast.success("Beneficiario registrado exitosamente");
  };

  const handleSkipAutorizado = () => {
    setCurrentStep("beneficiario");
    toast.info("Pre-autorizado omitido");
  };

  const handleSkipBeneficiario = () => {
    setCurrentStep("complete");
    toast.info("Beneficiario omitido");
  };

  const handleNewPrecontrato = () => {
    setCurrentStep("pre_cliente");
    setPreClienteId(null);
    setCompletedSteps(new Set());
  };

  const steps = [
    { id: "pre_cliente", label: "Pre-cliente", required: true },
    { id: "pre_autorizado", label: "Pre-autorizado", required: false },
    { id: "beneficiario", label: "Beneficiario", required: false },
  ];

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Precontratos</h1>
            <p className="text-muted-foreground">
              Sistema de registro de precontratos para Jardines de Paz VeredasSarchi
            </p>
          </div>

          {/* Progress Steps */}
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
                      currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                    {!step.required && (
                      <span className="ml-1 text-muted-foreground">(Opcional)</span>
                    )}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className="mx-4 h-0.5 w-12 bg-muted" />
                )}
              </div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {currentStep === "pre_cliente" && "Información del Pre-Cliente"}
                {currentStep === "pre_autorizado" && "Información del Pre-Autorizado"}
                {currentStep === "beneficiario" && "Información del Beneficiario"}
                {currentStep === "complete" && "Registro Completado"}
              </CardTitle>
              <CardDescription>
                {currentStep === "pre_cliente" &&
                  "Complete la información básica del pre-cliente"}
                {currentStep === "pre_autorizado" &&
                  "Agregue una persona autorizada (opcional)"}
                {currentStep === "beneficiario" &&
                  "Agregue un beneficiario (opcional)"}
                {currentStep === "complete" &&
                  "El precontrato ha sido registrado exitosamente"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentStep === "pre_cliente" && (
                <PreClienteForm onComplete={handlePreClienteComplete} />
              )}

              {currentStep === "pre_autorizado" && preClienteId && (
                <PreAutorizadoForm
                  preClienteId={preClienteId}
                  onComplete={handlePreAutorizadoComplete}
                  onSkip={handleSkipAutorizado}
                />
              )}

              {currentStep === "beneficiario" && preClienteId && (
                <BeneficiarioForm
                  preClienteId={preClienteId}
                  onComplete={handleBeneficiarioComplete}
                  onSkip={handleSkipBeneficiario}
                />
              )}

              {currentStep === "complete" && (
                <div className="flex flex-col items-center justify-center py-8">
                  <CheckCircle2 className="h-16 w-16 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-2">¡Precontrato Registrado!</h3>
                  <p className="text-muted-foreground mb-6 text-center">
                    El precontrato ha sido registrado exitosamente en el sistema.
                  </p>
                  <Button onClick={handleNewPrecontrato}>
                    Registrar Nuevo Precontrato
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
