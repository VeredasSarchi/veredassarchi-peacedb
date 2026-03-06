import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Eye, FileText, Trees } from "lucide-react";

const VendedorHome = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">
            Panel de Vendedor
          </h1>
          <p className="text-lg text-secondary-foreground/80">
            Accesos rapidos para tu gestion diaria
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card
            className="relative flex h-full flex-col overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-white/5 to-primary/5 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-primary/60 before:opacity-70 cursor-pointer"
            onClick={() => navigate("/precontratos")}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Precontratos</CardTitle>
                  <CardDescription>Registrar nuevos precontratos</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-sm text-muted-foreground flex-1">
                Ingresa la informacion del pre-cliente y da seguimiento a sus datos.
              </p>
              <Button
                className="w-full mt-auto"
                onClick={() => navigate("/precontratos")}
              >
                Ir a Precontratos
              </Button>
            </CardContent>
          </Card>

          <Card
            className="relative flex h-full flex-col overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-white/5 to-primary/5 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-primary/60 before:opacity-70 cursor-pointer"
            onClick={() => navigate("/jardines")}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <Trees className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle >
                    Jardines, Lotes y Cenizarios
                  </CardTitle>
                  <CardDescription>
                    Gestion de espacios, disponibilidad y ubicaciones.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-sm text-muted-foreground flex-1">
                Visualiza y administra los espacios disponibles y asignados.
              </p>
              <Button
                className="w-full mt-auto"
                onClick={() => navigate("/jardines")}
              >
                Acceder
              </Button>
            </CardContent>
          </Card>

          <Card
            className="relative flex h-full flex-col overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-white/5 to-primary/5 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-primary/60 before:opacity-70 cursor-pointer"
            onClick={() => navigate("/dashboard-precontratos")}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <Eye className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Ver Precontratos</CardTitle>
                  <CardDescription>Consulta de precontratos registrados</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-sm text-muted-foreground flex-1">
                Visualiza todos los precontratos en modo lectura, sin editar ni formalizar.
              </p>
              <Button
                className="w-full mt-auto"
                onClick={() => navigate("/dashboard-precontratos")}
              >
                Ver lista
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VendedorHome;
