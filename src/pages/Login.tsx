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
      toast.error("Credenciales inválidas o error al iniciar sesión");
      return;
    }

    toast.success("Sesión iniciada correctamente");

    const userRole =
      (data.user?.app_metadata as any)?.role ??
      (data.user?.user_metadata as any)?.role ??
      null;

    console.log("ROL DETECTADO:", userRole);

    if (userRole === "admin") {
      navigate("/", { replace: true }); // 👈 admin va al home (/)
    } else if (userRole === "vendedor") {
      navigate("/precontratos", { replace: true });
    } else {
      navigate("/unauthorized", { replace: true });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Ingreso al sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block mb-1 text-sm font-medium">Correo</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@veredas.com"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Contraseña</label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
