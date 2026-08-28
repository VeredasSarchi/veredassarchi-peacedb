import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const USERS_PER_PAGE = 1_000;
const MAX_PAGES = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ManagedRole = "admin" | "vendedor";
type AdminAction = "list" | "create" | "update" | "delete";

type RequestPayload = {
  action?: AdminAction;
  userId?: string;
  email?: string;
  confirmationEmail?: string;
  password?: string;
  role?: ManagedRole;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Falta configurar la variable ${name}`);
  }
  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function isManagedRole(value: unknown): value is ManagedRole {
  return value === "admin" || value === "vendedor";
}

function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, "Debes indicar un correo electronico valido");
  }
  return email;
}

function validatePassword(value: unknown, required: boolean): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new HttpError(400, "La contrasena inicial es obligatoria");
    }
    return undefined;
  }

  if (typeof value !== "string" || value.length < 8) {
    throw new HttpError(400, "La contrasena debe tener al menos 8 caracteres");
  }

  if (value.length > 72) {
    throw new HttpError(400, "La contrasena no puede exceder 72 caracteres");
  }

  return value;
}

function validateRole(value: unknown): ManagedRole {
  if (!isManagedRole(value)) {
    throw new HttpError(400, "El rol debe ser admin o vendedor");
  }
  return value;
}

function validateUserId(value: unknown): string {
  const userId = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(userId)) {
    throw new HttpError(400, "El identificador del usuario no es valido");
  }
  return userId.toLowerCase();
}

function getAuthorizationToken(request: Request): string {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) {
    throw new HttpError(401, "La sesion no es valida o ha expirado");
  }
  return match[1];
}

async function readPayload(request: Request): Promise<RequestPayload> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "El cuerpo de la solicitud no es valido");
    }
    return value as RequestPayload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "El cuerpo de la solicitud no contiene JSON valido");
  }
}

function getUserRole(user: User): ManagedRole | null {
  const role = user.app_metadata?.role;
  return isManagedRole(role) ? role : null;
}

function getProtectedAdminId(): string {
  const userId = getRequiredEnv("PROTECTED_ADMIN_USER_ID");
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("PROTECTED_ADMIN_USER_ID no contiene un UUID valido");
  }
  return userId.toLowerCase();
}

function toManagedUser(user: User, actorId: string, protectedAdminId: string) {
  return {
    id: user.id,
    email: user.email ?? "",
    role: getUserRole(user),
    createdAt: user.created_at,
    updatedAt: user.updated_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    isCurrentUser: user.id === actorId,
    isProtected: user.id === protectedAdminId,
  };
}

async function requireCurrentAdmin(
  request: Request,
  supabaseAdmin: SupabaseClient,
): Promise<User> {
  const token = getAuthorizationToken(request);
  const { data: verifiedData, error: verifyError } = await supabaseAdmin.auth.getUser(token);

  if (verifyError || !verifiedData.user) {
    throw new HttpError(401, "La sesion no es valida o ha expirado");
  }

  // Se vuelve a leer el usuario con privilegios para no confiar en un rol viejo
  // contenido en un JWT emitido antes de una degradacion de permisos.
  const { data: currentData, error: currentError } =
    await supabaseAdmin.auth.admin.getUserById(verifiedData.user.id);

  if (currentError || !currentData.user) {
    throw new HttpError(401, "No se pudo validar el usuario autenticado");
  }

  if (getUserRole(currentData.user) !== "admin") {
    throw new HttpError(403, "Solo un administrador puede gestionar usuarios");
  }

  return currentData.user;
}

async function listAllUsers(supabaseAdmin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) {
      throw new HttpError(500, "No se pudo consultar la lista de usuarios");
    }

    users.push(...data.users);
    if (data.users.length < USERS_PER_PAGE) {
      return users;
    }
  }

  throw new HttpError(500, "La cantidad de usuarios excede el limite operativo configurado");
}

async function getTargetUser(supabaseAdmin: SupabaseClient, userId: string): Promise<User> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new HttpError(404, "El usuario seleccionado ya no existe");
  }
  return data.user;
}

async function requireProtectedAdmin(
  supabaseAdmin: SupabaseClient,
  protectedAdminId: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(protectedAdminId);
  if (error || !data.user || getUserRole(data.user) !== "admin") {
    throw new Error(
      "PROTECTED_ADMIN_USER_ID debe identificar un administrador existente",
    );
  }
}

async function writeAudit(
  supabaseAdmin: SupabaseClient,
  values: {
    actor: User;
    target?: User;
    targetId?: string | null;
    targetEmail?: string | null;
    action: "CREAR" | "EDITAR" | "ELIMINAR";
    result: "INTENTO" | "EXITO" | "ERROR";
    operationId: string;
    previousRole?: ManagedRole | null;
    newRole?: ManagedRole | null;
    changes?: Record<string, unknown>;
    errorDetail?: string | null;
  },
  required = false,
): Promise<void> {
  const { error } = await supabaseAdmin.from("usuario_administracion_auditoria").insert({
    id_operacion: values.operationId,
    actor_id: values.actor.id,
    actor_email: values.actor.email ?? null,
    target_id: values.target?.id ?? values.targetId ?? null,
    target_email: values.target?.email ?? values.targetEmail ?? null,
    accion: values.action,
    resultado: values.result,
    rol_anterior: values.previousRole ?? null,
    rol_nuevo: values.newRole ?? null,
    cambios: values.changes ?? {},
    detalle_error: values.errorDetail ?? null,
  });

  // Auth y Postgres no comparten transaccion. Una falla de auditoria se registra
  // en logs, pero no se informa como fallo de una operacion Auth ya completada.
  if (error) {
    console.error("No se pudo guardar la auditoria de usuarios:", error.message);
    if (required) {
      throw new HttpError(
        500,
        "No se pudo iniciar la trazabilidad de la operacion; no se realizaron cambios",
      );
    }
  }
}

function throwAuthOperationError(error: { message?: string; status?: number }, fallback: string): never {
  const message = (error.message ?? "").toLowerCase();
  if (
    message.includes("already") ||
    message.includes("registered") ||
    message.includes("exists") ||
    message.includes("duplicate")
  ) {
    throw new HttpError(409, "Ya existe un usuario registrado con ese correo");
  }

  if (message.includes("password")) {
    throw new HttpError(400, "La contrasena no cumple la politica configurada en Supabase");
  }

  if (message.includes("email")) {
    throw new HttpError(400, "El correo electronico no es valido o no puede utilizarse");
  }

  if (message.includes("storage") || message.includes("object owner")) {
    throw new HttpError(
      409,
      "No se puede eliminar el usuario mientras sea propietario de archivos en Supabase Storage",
    );
  }

  const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
  throw new HttpError(status, fallback);
}

async function handleList(
  supabaseAdmin: SupabaseClient,
  actor: User,
  protectedAdminId: string,
): Promise<Response> {
  const users = await listAllUsers(supabaseAdmin);
  const managedUsers = users
    .map((user) => toManagedUser(user, actor.id, protectedAdminId))
    .sort((left, right) => left.email.localeCompare(right.email, "es"));

  return jsonResponse({
    ok: true,
    users: managedUsers,
    total: managedUsers.length,
  });
}

async function handleCreate(
  supabaseAdmin: SupabaseClient,
  actor: User,
  protectedAdminId: string,
  payload: RequestPayload,
): Promise<Response> {
  const email = normalizeEmail(payload.email);
  const password = validatePassword(payload.password, true) as string;
  const role = validateRole(payload.role);
  const operationId = crypto.randomUUID();

  await writeAudit(
    supabaseAdmin,
    {
      actor,
      targetEmail: email,
      action: "CREAR",
      result: "INTENTO",
      operationId,
      previousRole: null,
      newRole: role,
      changes: { email, role, contrasenaDefinida: true },
    },
    true,
  );

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  });

  if (error || !data.user) {
    await writeAudit(supabaseAdmin, {
      actor,
      targetEmail: email,
      action: "CREAR",
      result: "ERROR",
      operationId,
      previousRole: null,
      newRole: role,
      changes: { email, role, contrasenaDefinida: true },
      errorDetail: "Supabase Auth rechazo la creacion del usuario",
    });
    throwAuthOperationError(error ?? {}, "No se pudo crear el usuario");
  }

  await writeAudit(supabaseAdmin, {
    actor,
    target: data.user,
    action: "CREAR",
    result: "EXITO",
    operationId,
    previousRole: null,
    newRole: role,
    changes: { email, role },
  });

  return jsonResponse(
    {
      ok: true,
      user: toManagedUser(data.user, actor.id, protectedAdminId),
    },
    201,
  );
}

async function handleUpdate(
  supabaseAdmin: SupabaseClient,
  actor: User,
  protectedAdminId: string,
  payload: RequestPayload,
): Promise<Response> {
  const userId = validateUserId(payload.userId);
  const email = normalizeEmail(payload.email);
  const password = validatePassword(payload.password, false);
  const role = validateRole(payload.role);
  const target = await getTargetUser(supabaseAdmin, userId);
  const previousRole = getUserRole(target);

  if (target.id === protectedAdminId && actor.id !== protectedAdminId) {
    throw new HttpError(
      409,
      "Solo el administrador principal puede editar sus propias credenciales",
    );
  }

  if (target.id === actor.id && role !== "admin") {
    throw new HttpError(409, "No puedes quitarte tu propio rol de administrador");
  }

  if (target.id === protectedAdminId && role !== "admin") {
    throw new HttpError(409, "No se puede degradar al administrador principal protegido");
  }

  if (previousRole === "admin" && role !== "admin") {
    const users = await listAllUsers(supabaseAdmin);
    const adminCount = users.filter((user) => getUserRole(user) === "admin").length;
    if (adminCount <= 1) {
      throw new HttpError(409, "No se puede degradar al ultimo administrador del sistema");
    }
  }

  const attributes = {
    email,
    email_confirm: true,
    app_metadata: {
      ...(target.app_metadata ?? {}),
      role,
    },
    ...(password ? { password } : {}),
  };
  const operationId = crypto.randomUUID();
  const auditChanges = {
    emailAnterior: target.email ?? null,
    emailNuevo: email,
    contrasenaActualizada: Boolean(password),
    rolAnterior: previousRole,
    rolNuevo: role,
  };

  await writeAudit(
    supabaseAdmin,
    {
      actor,
      target,
      action: "EDITAR",
      result: "INTENTO",
      operationId,
      previousRole,
      newRole: role,
      changes: auditChanges,
    },
    true,
  );

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, attributes);
  if (error || !data.user) {
    await writeAudit(supabaseAdmin, {
      actor,
      target,
      action: "EDITAR",
      result: "ERROR",
      operationId,
      previousRole,
      newRole: role,
      changes: auditChanges,
      errorDetail: "Supabase Auth rechazo la actualizacion del usuario",
    });
    throwAuthOperationError(error ?? {}, "No se pudo actualizar el usuario");
  }

  await writeAudit(supabaseAdmin, {
    actor,
    target: data.user,
    action: "EDITAR",
    result: "EXITO",
    operationId,
    previousRole,
    newRole: role,
    changes: auditChanges,
  });

  return jsonResponse({
    ok: true,
    user: toManagedUser(data.user, actor.id, protectedAdminId),
  });
}

async function handleDelete(
  supabaseAdmin: SupabaseClient,
  actor: User,
  protectedAdminId: string,
  payload: RequestPayload,
): Promise<Response> {
  const userId = validateUserId(payload.userId);
  if (userId === actor.id) {
    throw new HttpError(409, "No puedes eliminar tu propio usuario");
  }

  const target = await getTargetUser(supabaseAdmin, userId);
  if (target.id === actor.id) {
    throw new HttpError(409, "No puedes eliminar tu propio usuario");
  }
  if (target.id === protectedAdminId) {
    throw new HttpError(409, "No se puede eliminar al administrador principal protegido");
  }
  const confirmationEmail = normalizeEmail(payload.confirmationEmail);
  if (confirmationEmail !== (target.email ?? "").trim().toLowerCase()) {
    throw new HttpError(400, "El correo de confirmacion no coincide con el usuario");
  }

  if (getUserRole(target) === "admin") {
    const users = await listAllUsers(supabaseAdmin);
    const adminCount = users.filter((user) => getUserRole(user) === "admin").length;
    if (adminCount <= 1) {
      throw new HttpError(409, "No se puede eliminar al ultimo administrador del sistema");
    }
  }

  const operationId = crypto.randomUUID();
  const targetRole = getUserRole(target);

  await writeAudit(
    supabaseAdmin,
    {
      actor,
      target,
      action: "ELIMINAR",
      result: "INTENTO",
      operationId,
      previousRole: targetRole,
      newRole: null,
      changes: { email: target.email ?? null },
    },
    true,
  );

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId, false);
  if (error) {
    await writeAudit(supabaseAdmin, {
      actor,
      target,
      action: "ELIMINAR",
      result: "ERROR",
      operationId,
      previousRole: targetRole,
      newRole: null,
      changes: { email: target.email ?? null },
      errorDetail: "Supabase Auth rechazo la eliminacion del usuario",
    });
    throwAuthOperationError(error, "No se pudo eliminar el usuario");
  }

  await writeAudit(supabaseAdmin, {
    actor,
    target,
    action: "ELIMINAR",
    result: "EXITO",
    operationId,
    previousRole: targetRole,
    newRole: null,
    changes: { email: target.email ?? null },
  });

  return jsonResponse({ ok: true, deletedUserId: userId });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo no permitido" }, 405);
  }

  try {
    const supabaseAdmin = createClient(
      getRequiredEnv("SUPABASE_URL"),
      getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );

    const actor = await requireCurrentAdmin(request, supabaseAdmin);
    const protectedAdminId = getProtectedAdminId();
    await requireProtectedAdmin(supabaseAdmin, protectedAdminId);
    const payload = await readPayload(request);

    switch (payload.action) {
      case "list":
        return await handleList(supabaseAdmin, actor, protectedAdminId);
      case "create":
        return await handleCreate(supabaseAdmin, actor, protectedAdminId, payload);
      case "update":
        return await handleUpdate(supabaseAdmin, actor, protectedAdminId, payload);
      case "delete":
        return await handleDelete(supabaseAdmin, actor, protectedAdminId, payload);
      default:
        throw new HttpError(400, "La operacion solicitada no es valida");
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message =
      error instanceof HttpError
        ? error.message
        : "Ocurrio un error inesperado al gestionar usuarios";

    console.error("Error en admin-users:", error);
    return jsonResponse({ error: message }, status);
  }
});
