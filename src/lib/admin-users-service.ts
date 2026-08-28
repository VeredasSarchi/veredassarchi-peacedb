import { supabase } from "@/integrations/supabase/client";

export type AdminUserRole = "admin" | "vendedor";

export type ManagedAuthUser = {
  id: string;
  email: string;
  role: AdminUserRole | null;
  createdAt: string;
  updatedAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  isCurrentUser: boolean;
  isProtected: boolean;
};

type ListUsersResponse = {
  ok: boolean;
  users: ManagedAuthUser[];
  total: number;
};

type UserMutationResponse = {
  ok: boolean;
  user: ManagedAuthUser;
};

type DeleteUserResponse = {
  ok: boolean;
  deletedUserId: string;
};

type CreateUserInput = {
  email: string;
  password: string;
  role: AdminUserRole;
};

type UpdateUserInput = {
  userId: string;
  email: string;
  password?: string;
  role: AdminUserRole;
};

async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response =
    typeof error === "object" && error && "context" in error
      ? (error as { context?: Response }).context
      : undefined;

  if (response) {
    try {
      const body = (await response.clone().json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      // La respuesta del gateway no siempre contiene JSON.
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function invokeAdminUsers<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("admin-users", { body });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, fallback));
  }

  if (!data) {
    throw new Error(fallback);
  }

  return data;
}

export async function listManagedUsers(): Promise<ManagedAuthUser[]> {
  const response = await invokeAdminUsers<ListUsersResponse>(
    { action: "list" },
    "No se pudo consultar la lista de usuarios",
  );
  return response.users;
}

export async function createManagedUser(input: CreateUserInput): Promise<ManagedAuthUser> {
  const response = await invokeAdminUsers<UserMutationResponse>(
    { action: "create", ...input },
    "No se pudo crear el usuario",
  );
  return response.user;
}

export async function updateManagedUser(input: UpdateUserInput): Promise<ManagedAuthUser> {
  const response = await invokeAdminUsers<UserMutationResponse>(
    { action: "update", ...input },
    "No se pudo actualizar el usuario",
  );
  return response.user;
}

export async function deleteManagedUser(userId: string, confirmationEmail: string): Promise<void> {
  await invokeAdminUsers<DeleteUserResponse>(
    { action: "delete", userId, confirmationEmail },
    "No se pudo eliminar el usuario",
  );
}
