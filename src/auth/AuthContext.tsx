import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { getUserAppRole, type AppRole } from "@/auth/roles";

type AuthContextType = {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Error getting session", error);
        setLoading(false);
        return;
      }

      if (!data.session) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      // getSession lee el cache local. getUser valida la sesion contra Auth y
      // obtiene app_metadata actual, importante cuando otro admin cambio el rol.
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Error validating current user", userError);
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      const currentUser = userData.user;
      setUser(currentUser);

      setRole(getUserAppRole(currentUser));

      setLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        setRole(getUserAppRole(currentUser));
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
