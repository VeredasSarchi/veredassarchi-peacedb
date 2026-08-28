import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "vendedor";

export function getUserAppRole(user: User | null | undefined): AppRole | null {
  const role = user?.app_metadata?.role;
  return role === "admin" || role === "vendedor" ? role : null;
}
