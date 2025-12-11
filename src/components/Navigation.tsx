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
    <nav className="w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border bg-background text-foreground">
      <div className="flex gap-4 items-center">
        <span className="font-bold">Veredas Sarchi</span>

        {user && (
          <>
            {role === "admin" && (
              <Link to="/" className="text-sm hover:underline">
                Inicio
              </Link>
            )}
            {role === "vendedor" && (
              <Link to="/vendedor" className="text-sm hover:underline">
                Inicio
              </Link>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="text-xs text-muted-foreground font-bold">
              {role?.toUpperCase()} • {user.email}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="hover:bg-primary hover:text-primary-foreground"
              onClick={handleLogout}
            >
              Cerrar sesion
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}
