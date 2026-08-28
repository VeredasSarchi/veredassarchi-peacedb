import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  createManagedUser,
  deleteManagedUser,
  listManagedUsers,
  updateManagedUser,
  type AdminUserRole,
  type ManagedAuthUser,
} from "@/lib/admin-users-service";

type RoleFilter = "todos" | AdminUserRole | "sin_rol";

type UserFormState = {
  email: string;
  role: AdminUserRole | "";
  password: string;
  passwordConfirmation: string;
};

const emptyForm: UserFormState = {
  email: "",
  role: "",
  password: "",
  passwordConfirmation: "",
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getRoleLabel(role: AdminUserRole | null): string {
  if (role === "admin") return "Administrador";
  if (role === "vendedor") return "Vendedor";
  return "Sin rol";
}

export default function Usuarios() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedAuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("todos");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedAuthUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ManagedAuthUser | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listManagedUsers());
    } catch (error) {
      console.error("Error cargando usuarios:", error);
      toast.error(getErrorMessage(error, "No se pudieron cargar los usuarios"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const totals = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((item) => item.role === "admin").length,
      sellers: users.filter((item) => item.role === "vendedor").length,
      unassigned: users.filter((item) => item.role === null).length,
    }),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return users.filter((item) => {
      const matchesSearch = !normalizedSearch || item.email.toLowerCase().includes(normalizedSearch);
      const matchesRole =
        roleFilter === "todos" ||
        (roleFilter === "sin_rol" ? item.role === null : item.role === roleFilter);
      return matchesSearch && matchesRole;
    });
  }, [roleFilter, search, users]);

  const openCreateDialog = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (selectedUser: ManagedAuthUser) => {
    setEditingUser(selectedUser);
    setForm({
      email: selectedUser.email,
      role: selectedUser.role ?? "",
      password: "",
      passwordConfirmation: "",
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (selectedUser: ManagedAuthUser) => {
    setDeleteTarget(selectedUser);
    setDeleteConfirmation("");
  };

  const handleSave = async () => {
    const email = form.email.trim().toLowerCase();
    if (!email) {
      toast.error("El correo electronico es obligatorio");
      return;
    }

    if (!form.role) {
      toast.error("Debes seleccionar un rol");
      return;
    }

    if (!editingUser && form.password.length < 8) {
      toast.error("La contrasena inicial debe tener al menos 8 caracteres");
      return;
    }

    if (editingUser && form.password && form.password.length < 8) {
      toast.error("La nueva contrasena debe tener al menos 8 caracteres");
      return;
    }

    if (form.password !== form.passwordConfirmation) {
      toast.error("Las contrasenas no coinciden");
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const updatedUser = await updateManagedUser({
          userId: editingUser.id,
          email,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });

        if (editingUser.id === currentUser?.id) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.warn("No se pudo refrescar la sesion tras editar el usuario actual", refreshError);
          }
        }

        setUsers((current) =>
          current.map((item) => (item.id === updatedUser.id ? updatedUser : item)),
        );
        toast.success("Usuario actualizado correctamente");
      } else {
        const createdUser = await createManagedUser({
          email,
          password: form.password,
          role: form.role,
        });
        setUsers((current) =>
          [...current, createdUser].sort((left, right) => left.email.localeCompare(right.email, "es")),
        );
        toast.success("Usuario creado correctamente");
      }

      setDialogOpen(false);
      setEditingUser(null);
      setForm(emptyForm);
    } catch (error) {
      console.error("Error guardando usuario:", error);
      toast.error(getErrorMessage(error, "No se pudo guardar el usuario"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await deleteManagedUser(deleteTarget.id, deleteConfirmation.trim().toLowerCase());
      setUsers((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success("Usuario eliminado correctamente");
      setDeleteTarget(null);
      setDeleteConfirmation("");
    } catch (error) {
      console.error("Error eliminando usuario:", error);
      toast.error(getErrorMessage(error, "No se pudo eliminar el usuario"));
    } finally {
      setDeleting(false);
    }
  };

  const editingCurrentUser = editingUser?.id === currentUser?.id;
  const editingProtectedAdmin = editingUser?.isProtected === true;
  const canConfirmDelete =
    Boolean(deleteTarget) &&
    !deleteTarget?.isCurrentUser &&
    !deleteTarget?.isProtected &&
    deleteConfirmation.trim().toLowerCase() === deleteTarget?.email.trim().toLowerCase();

  return (
    <div className="app-page">
      <div className="app-page-content">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-primary sm:text-3xl">Usuarios</h1>
            <p className="max-w-3xl text-base text-muted-foreground sm:text-lg">
              Crea y administra las cuentas que ingresan como administradores o vendedores.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
              Volver al menu
            </Button>
            <Button variant="secondary" onClick={() => void loadUsers()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <UsersRound className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Total de usuarios</p>
                <p className="text-2xl font-bold">{totals.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Administradores</p>
                <p className="text-2xl font-bold">{totals.admins}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <UserRoundCheck className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Vendedores</p>
                <p className="text-2xl font-bold">{totals.sellers}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <KeyRound className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-sm text-muted-foreground">Sin rol asignado</p>
                <p className="text-2xl font-bold">{totals.unassigned}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cuentas de acceso</CardTitle>
            <CardDescription>
              El rol determina el modulo disponible al iniciar sesion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por correo..."
                  className="pl-9"
                />
              </div>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
                <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por rol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los roles</SelectItem>
                  <SelectItem value="admin">Administradores</SelectItem>
                  <SelectItem value="vendedor">Vendedores</SelectItem>
                  <SelectItem value="sin_rol">Sin rol</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Cargando usuarios...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                No se encontraron usuarios con los filtros seleccionados.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead>Ultimo acceso</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="max-w-[18rem] whitespace-normal">
                          <p className="break-all font-medium">{item.email || "Correo no disponible"}</p>
                          {item.isCurrentUser && (
                            <p className="mt-1 text-xs text-muted-foreground">Tu cuenta actual</p>
                          )}
                          {item.isProtected && (
                            <p className="mt-1 text-xs font-medium text-primary">
                              Administrador principal protegido
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.role === "admin"
                              ? "default"
                              : item.role === "vendedor"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {getRoleLabel(item.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>{formatDateTime(item.lastSignInAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(item)}
                            disabled={item.isProtected && !item.isCurrentUser}
                            title={
                              item.isProtected && !item.isCurrentUser
                                ? "Solo el administrador principal puede editar sus credenciales"
                                : undefined
                            }
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openDeleteDialog(item)}
                            disabled={item.isCurrentUser || item.isProtected}
                            title={
                              item.isCurrentUser
                                ? "No puedes eliminar tu propia cuenta"
                                : item.isProtected
                                  ? "El administrador principal esta protegido"
                                  : undefined
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {!loading && (
              <p className="mt-4 text-sm text-muted-foreground">
                Mostrando {filteredUsers.length} de {users.length} usuario(s).
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Actualiza el correo, rol o contrasena. Deja la contrasena vacia para conservar la actual."
                : "La cuenta quedara confirmada y podra iniciar sesion inmediatamente."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="usuario-email">Correo electronico</Label>
              <Input
                id="usuario-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="usuario@correo.com"
                disabled={saving}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="usuario-rol">Rol</Label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, role: value as AdminUserRole }))
                }
                disabled={saving || editingCurrentUser || editingProtectedAdmin}
              >
                <SelectTrigger id="usuario-rol">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                </SelectContent>
              </Select>
              {editingCurrentUser && (
                <p className="text-xs text-muted-foreground">
                  Por seguridad no puedes quitarte tu propio rol de administrador.
                </p>
              )}
              {!editingCurrentUser && editingProtectedAdmin && (
                <p className="text-xs text-muted-foreground">
                  El administrador principal protegido debe conservar el rol de administrador.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="usuario-password">
                {editingUser ? "Nueva contrasena (opcional)" : "Contrasena inicial"}
              </Label>
              <Input
                id="usuario-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Minimo 8 caracteres"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="usuario-password-confirmation">Confirmar contrasena</Label>
              <Input
                id="usuario-password-confirmation"
                type="password"
                autoComplete="new-password"
                value={form.passwordConfirmation}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    passwordConfirmation: event.target.value,
                  }))
                }
                placeholder="Repite la contrasena"
                disabled={saving}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Guardando..." : editingUser ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(null);
            setDeleteConfirmation("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion elimina permanentemente la cuenta de acceso. Para confirmar, escribe el
              correo completo del usuario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="break-all rounded-md bg-muted px-3 py-2 text-sm font-semibold">
              {deleteTarget?.email}
            </p>
            <Label htmlFor="usuario-delete-confirmation">Correo de confirmacion</Label>
            <Input
              id="usuario-delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              disabled={deleting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={deleting || !canConfirmDelete}
            >
              {deleting ? "Eliminando..." : "Eliminar permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
