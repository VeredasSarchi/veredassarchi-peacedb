import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  CheckCircle2,
  FileCheck2,
  FileX2,
  Banknote,
  CreditCard,
  Wrench,
  Package,
  Flame,
  Trees,
  Link,
} from "lucide-react";

const AdminHome = () => {
  const navigate = useNavigate();

  return (
    <div className="app-page">
      <div className="app-page-content">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-primary sm:text-4xl">
            Veredas Sarchi-Poás
          </h1>
          <p className="text-base text-text-secondary sm:text-xl">
            Sistema de Gestion Integral
          </p>
        </div>

        <div className="grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Pre-Contratos",
              description: "Gestion de pre-contratos desde el alta hasta el seguimiento.",
              icon: FileText,
              action: () => navigate("/precontratos"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Formalizar Pre-Contratos",
              description: "Completa la formalizacion y firma de pre-contratos.",
              icon: CheckCircle2,
              action: () => navigate("/dashboard-precontratos"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Contratos Activos",
              description: "Consulta y administra los contratos vigentes.",
              icon: FileCheck2,
              action: () => navigate("/dashboard-contratos-activos"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Contratos Anulados",
              description: "Revisa anulaciones, motivos y trazabilidad.",
              icon: FileX2,
              action: () => navigate("/dashboard-contratos-anulados"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Conexion OneDrive",
              description: "Reconecta la cuenta de Microsoft y valida el estado actual de la integracion.",
              icon: Link,
              action: () => navigate("/onedrive-admin"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Ingresos Campo Santo",
              description: "Resumen de ingresos, cobros y flujo de caja.",
              icon: Banknote,
              action: () => navigate("/ingresos-campo-santo"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Control de cuotas",
              description: "Seguimiento de cuotas, vencimientos y pagos pendientes.",
              icon: CreditCard,
              action: () => navigate("/control-cuotas"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Control de Mantenimiento",
              description: "Cobro anual, alertas y seguimiento de cuotas de mantenimiento.",
              icon: Wrench,
              action: () => navigate("/control-mantenimiento"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Paquetes Funerarios",
              description: "Configura y administra los paquetes de servicios.",
              icon: Package,
              action: () => navigate("/paquetes-funerarios"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Cremaciones",
              description: "Agregar, ver y editar tipos de cremaciones.",
              icon: Flame,
              action: () => navigate("/cremaciones"),
              actionLabel: "Acceder",
              disabled: false,
            },
            {
              title: "Jardines, Lotes y Cenizarios",
              description: "Gestion de espacios, disponibilidad y ubicaciones.",
              icon: Trees,
              action: () => navigate("/jardines"),
              actionLabel: "Acceder",
              disabled: false,
            },
          ].map((item) => (
            <Card
              key={item.title}
              className={`relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-primary/70 hover:-translate-y-1 hover:shadow-md ${item.action ? "cursor-pointer" : ""}`}
              onClick={item.action}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{item.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="flex-1 text-sm text-muted-foreground">
                  {item.description}
                </p>
                {item.actionLabel && (
                  <Button
                    className="mt-3 w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      item.action?.();
                    }}
                    disabled={item.disabled}
                  >
                    {item.actionLabel}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminHome;
