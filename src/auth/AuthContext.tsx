import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type Role = "admin" | "vendedor" | null;

type AuthContextType = {
  user: User | null;
  role: Role;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Error getting session", error);
        setLoading(false);
        return;
      }

      const currentUser = data.session?.user ?? null;
      setUser(currentUser);

      const rawRole =
        (currentUser?.app_metadata as any)?.role ??
        (currentUser?.user_metadata as any)?.role ??
        null;

      const userRole = (rawRole as Role) || null;
      setRole(userRole);

      setLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        const rawRole =
          (currentUser?.app_metadata as any)?.role ??
          (currentUser?.user_metadata as any)?.role ??
          null;

        const userRole = (rawRole as Role) || null;
        setRole(userRole);
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
