import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function Navigation() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <nav className="w-full flex items-center justify-between px-4 py-2 border-b bg-white">
      <div className="flex gap-4 items-center">
        <span className="font-bold">Veredas Sarchí</span>

        {user && (
          <>
            <Link to="/" className="text-sm hover:underline">
              Inicio
            </Link>

            <Link to="/precontratos" className="text-sm hover:underline">
              Pre-contratos
            </Link>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="text-xs text-slate-500">
              {role?.toUpperCase()} · {user.email}
            </span>
            <Button size="sm" variant="outline" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}
