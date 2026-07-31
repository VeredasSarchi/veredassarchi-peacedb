import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      console.error(error);
      const message = (error.message || "").toLowerCase();
      if (message.includes("invalid login credentials")) {
        toast.error("Usuario no registrado, contactar a administracion.");
      } else {
        toast.error("Credenciales invalidas o error al iniciar sesion");
      }
      return;
    }

    toast.success("Sesion iniciada correctamente");

    const userRole =
      (data.user?.app_metadata as any)?.role ??
      (data.user?.user_metadata as any)?.role ??
      null;

    console.log("ROL DETECTADO:", userRole);

    if (userRole === "admin") {
      navigate("/", { replace: true });
    } else if (userRole === "vendedor") {
      navigate("/vendedor", { replace: true });
    } else {
      navigate("/unauthorized", { replace: true });
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md shadow-lg bg-card text-card-foreground">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-2xl font-bold text-black">
            Ingreso al sistema
          </CardTitle>
          <p className="text-center text-sm text-black">
            Usa tus credenciales para acceder al panel
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block mb-1 text-sm font-bold text-black">
                Correo
              </label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@veredas.com"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-bold text-black">
                Contraseña
              </label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
