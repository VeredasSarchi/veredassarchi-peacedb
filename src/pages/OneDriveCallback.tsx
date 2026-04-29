import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATE_STORAGE_KEY } from "./OneDriveAdmin";

async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response =
    typeof error === "object" && error && "context" in error
      ? (error as { context?: Response }).context
      : undefined;

  if (!response) {
    return fallback;
  }

  try {
    const body = (await response.clone().json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export default function OneDriveCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Procesando autorizacion de OneDrive...");

  useEffect(() => {
    const run = async () => {
      const error = searchParams.get("error");
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const savedState = sessionStorage.getItem(STATE_STORAGE_KEY);

      if (error) {
        toast.error("Microsoft no autorizo la conexion con OneDrive");
        navigate("/onedrive-admin", { replace: true });
        return;
      }

      if (!code || !state || !savedState || state !== savedState) {
        toast.error("No se pudo validar la respuesta de Microsoft");
        navigate("/onedrive-admin", { replace: true });
        return;
      }

      try {
        setMessage("Guardando la conexion segura de OneDrive...");

        const { error: callbackError } = await supabase.functions.invoke("onedrive-oauth-callback", {
          body: { code },
        });

        if (callbackError) {
          throw new Error(
            await getFunctionErrorMessage(callbackError, "No se pudo completar la conexion de OneDrive"),
          );
        }

        sessionStorage.removeItem(STATE_STORAGE_KEY);
        toast.success("OneDrive quedo reconectado correctamente");
        navigate("/onedrive-admin", { replace: true });
      } catch (callbackError) {
        console.error("Error procesando callback de OneDrive:", callbackError);
        toast.error(
          callbackError instanceof Error
            ? callbackError.message
            : "No se pudo completar la conexion de OneDrive",
        );
        navigate("/onedrive-admin", { replace: true });
      }
    };

    void run();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Conectando OneDrive</CardTitle>
            <CardDescription>Estamos completando la autorizacion segura con Microsoft.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {message}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
