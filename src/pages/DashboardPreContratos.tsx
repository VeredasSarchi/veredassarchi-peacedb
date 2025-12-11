import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type Precontrato = {
  id: string;
  cliente: string;
  estado: string;
  fecha: string;
  monto: string;
};

const mockPrecontratos: Precontrato[] = [
  { id: "PC-001", cliente: "Juan Perez", estado: "En revision", fecha: "08/12/2025", monto: "$1,200" },
  { id: "PC-002", cliente: "Maria Gomez", estado: "Aprobado", fecha: "07/12/2025", monto: "$2,500" },
  { id: "PC-003", cliente: "Carlos Diaz", estado: "Pendiente", fecha: "06/12/2025", monto: "$980" },
];

export default function DashboardPreContratos() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full px-2 sm:px-4 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">
            Dashboard de Pre-Contratos
          </h1>
          <p className="text-lg text-muted-foreground">
            Visualiza y gestiona los pre-contratos registrados
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-foreground text-black font-bold">
              Listado de Pre-Contratos
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Consulta rapida de los registros actuales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockPrecontratos.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.id}</TableCell>
                    <TableCell>{item.cliente}</TableCell>
                    <TableCell>{item.estado}</TableCell>
                    <TableCell>{item.fecha}</TableCell>
                    <TableCell>{item.monto}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline-green">
                        Ver Pre-contrato
                      </Button>
                      <Button size="sm" variant="secondary">
                        Editar Pre-Contrato
                      </Button>
                      <Button size="sm" variant="destructive">
                        Eliminar Pre-Contrato
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
