import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { FileText, Users, Building2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";

const Index = () => {
  const navigate = useNavigate();

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-secondary p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-primary mb-2">
              Campo Santo Veredas de Paz Sarchí
            </h1>
            <p className="text-xl text-secondary-foreground/80">
              Sistema de Gestión Integral
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate("/precontratos")}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Precontratos</CardTitle>
                    <CardDescription>Gestión de precontratos</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Registre y administre los precontratos de nuevos clientes
                </p>
                <Button className="w-full mt-4" onClick={() => navigate("/precontratos")}>
                  Acceder
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow opacity-50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-3">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-muted-foreground">Clientes</CardTitle>
                    <CardDescription>Próximamente</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Gestión completa de clientes y contratos activos
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow opacity-50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-3">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-muted-foreground">Jardines</CardTitle>
                    <CardDescription>Próximamente</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Administración de jardines y ubicaciones
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};

export default Index;
