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
  Folder,
  Banknote,
  CreditCard,
  Wrench,
  Package,
  Flame,
  Trees,
} from "lucide-react";

const AdminHome = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">
            Veredas Sarchi-Poás
          </h1>
          <p className="text-xl text-secondary-foreground/80">
            Sistema de Gestion Integral
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              actionLabel: "Acceder",
              disabled: true,
            },
            {
              title: "Contratos Activos",
              description: "Consulta y administra los contratos vigentes.",
              icon: FileCheck2,
              actionLabel: "Acceder",
              disabled: true,
            },
            {
              title: "Contratos Anulados",
              description: "Revisa anulaciones, motivos y trazabilidad.",
              icon: FileX2,
              actionLabel: "Acceder",
              disabled: true,
            },
            {
              title: "Docs Adjuntos (One Drive)",
              description: "Accede a documentos y respaldos almacenados en One Drive.",
              icon: Folder,
              actionLabel: "Acceder",
              disabled: true,
            },
            {
              title: "Ingresos Campo Santo",
              description: "Resumen de ingresos, cobros y flujo de caja.",
              icon: Banknote,
              actionLabel: "Acceder",
              disabled: true,
            },
            {
              title: "Control de cuotas",
              description: "Seguimiento de cuotas, vencimientos y pagos pendientes.",
              icon: CreditCard,
              actionLabel: "Acceder",
              disabled: true,
            },
            {
              title: "Control de Mantenimiento",
              description: "Gestion de tareas y ordenes de mantenimiento.",
              icon: Wrench,
              actionLabel: "Acceder",
              disabled: true,
            },
            {
              title: "Paquetes Funerarios",
              description: "Configura y administra los paquetes de servicios.",
              icon: Package,
              actionLabel: "Acceder",
              disabled: true,
            },
            {
              title: "Cremaciones",
              description: "Agregar, ver y editar tipos de cremaciones.",
              icon: Flame,
              actionLabel: "Acceder",
              disabled: true,
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
              className={`relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-white/5 to-primary/5 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-primary/60 before:opacity-70 ${item.action ? "cursor-pointer" : ""}`}
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
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
                {item.actionLabel && (
                  <Button
                    className="w-full mt-3"
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
