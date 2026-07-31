import { Home, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function Navigation() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const homePath = role === "vendedor" ? "/vendedor" : "/";
  const userEmail = user?.email ?? "";

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="app-header sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 text-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <nav
        aria-label="Navegación principal"
        className="mx-auto grid w-full max-w-[100rem] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:flex sm:min-h-16 sm:px-6 sm:py-3 lg:px-8"
      >
        <div className="flex min-w-0 items-center gap-1 sm:gap-3">
          <Link
            to={homePath}
            className="min-w-0 truncate rounded-md px-1 py-2 text-sm font-bold tracking-tight outline-none ring-ring focus-visible:ring-2 sm:text-base"
          >
            Veredas Sarchí - Poás
          </Link>
          <Button asChild size="sm" variant="ghost" className="shrink-0 px-2 sm:px-3">
            <Link to={homePath}>
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Inicio</span>
              <span className="sr-only sm:hidden">Ir al inicio</span>
            </Link>
          </Button>
        </div>

        <div className="ml-auto hidden min-w-0 items-center gap-3 sm:flex">
          <div className="min-w-0 text-right text-xs leading-tight">
            <p className="font-semibold text-foreground">{role?.toUpperCase()}</p>
            <p className="max-w-[min(34vw,22rem)] truncate text-muted-foreground" title={userEmail}>
              {userEmail}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 hover:bg-primary hover:text-primary-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>

        <Button
          size="icon"
          variant="outline"
          className="h-10 w-10 shrink-0 sm:hidden"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </Button>

        <div className="col-span-2 flex min-w-0 items-center gap-2 border-t border-border/70 pt-2 text-xs sm:hidden">
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 font-semibold text-primary">
            {role?.toUpperCase()}
          </span>
          <span className="min-w-0 truncate text-muted-foreground" title={userEmail}>
            {userEmail}
          </span>
        </div>
      </nav>
    </header>
  );
}
