import { Link, useLocation } from "react-router-dom";
import { Home, FileText, Users, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const navigationItems = [
  { name: "Inicio", path: "/", icon: Home },
  { name: "Precontratos", path: "/precontratos", icon: FileText },
  { name: "Clientes", path: "/clientes", icon: Users, disabled: true },
  { name: "Jardines", path: "/jardines", icon: Building2, disabled: true },
];

export const Navigation = () => {
  const location = useLocation();

  return (
    <nav className="bg-secondary border-b border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-4">
            {navigationItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              
              return item.disabled ? (
                <div
                  key={item.name}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-secondary-foreground/40 cursor-not-allowed"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.name}</span>
                </div>
              ) : (
                <Link
                  key={item.name}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-secondary-foreground hover:bg-secondary-foreground/10"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};
