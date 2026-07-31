import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OneDriveConnectionStatus = {
  connected: boolean;
  accountEmail: string | null;
  accountDisplayName: string | null;
  lastConnectedAt: string | null;
  updatedAt: string | null;
};

const STATE_STORAGE_KEY = "onedrive_oauth_state";

export default function OneDriveAdmin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<OneDriveConnectionStatus | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<OneDriveConnectionStatus>(
        "onedrive-connection-status",
        { body: {} },
      );

      if (error) {
        throw error;
      }

      setStatus(data ?? null);
    } catch (error) {
      console.error("Error cargando estado de OneDrive:", error);
      toast.error("No se pudo cargar el estado de la conexion con OneDrive");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        authorizationUrl: string;
        state: string;
      }>("onedrive-oauth-start", {
        body: {},
      });

      if (error || !data?.authorizationUrl || !data.state) {
        throw error ?? new Error("No se pudo generar la autorizacion de OneDrive");
      }

      sessionStorage.setItem(STATE_STORAGE_KEY, data.state);
      window.location.href = data.authorizationUrl;
    } catch (error) {
      console.error("Error iniciando autorizacion de OneDrive:", error);
      toast.error("No se pudo iniciar la reconexion con OneDrive");
      setConnecting(false);
    }
  };

  const connectedLabel = status?.connected ? "Conectado" : "Sin conexion";
  const lastConnected = status?.lastConnectedAt
    ? new Date(status.lastConnectedAt).toLocaleString("es-CR")
    : "Sin registro";

  return (
    <div className="app-page">
      <div className="mx-auto w-full min-w-0 max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="mb-2 text-2xl font-bold text-primary sm:text-3xl">Conexion con OneDrive</h1>
            <p className="text-muted-foreground">
              Administra la autorizacion OAuth usada para crear carpetas desde el sistema.
            </p>
          </div>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => navigate("/")}>
            Volver al Menu
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Estado actual
              </CardTitle>
              <CardDescription>
                Esta seccion te permite reconectar OneDrive sin depender de Postman.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando conexion...
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-border/70 p-4">
                    <p className="text-sm font-medium text-card-foreground">Estado</p>
                    <p className="text-sm text-muted-foreground">{connectedLabel}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-4">
                    <p className="text-sm font-medium text-card-foreground">Cuenta autorizada</p>
                    <p className="text-sm text-muted-foreground">
                      {status?.accountDisplayName || status?.accountEmail || "Sin cuenta registrada"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-4">
                    <p className="text-sm font-medium text-card-foreground">Ultima conexion</p>
                    <p className="text-sm text-muted-foreground">{lastConnected}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                Acciones
              </CardTitle>
              <CardDescription>
                Usa este boton cuando necesites volver a autorizar la cuenta de OneDrive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={() => void handleConnect()} disabled={connecting}>
                {connecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirigiendo...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reconectar OneDrive
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                La reconexion abrira Microsoft para solicitar consentimiento y renovar el refresh token.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export { STATE_STORAGE_KEY };
