export default function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-text-primary">Acceso no autorizado</h1>
        <p className="mb-4 text-text-secondary">
          No tienes permisos para acceder a esta sección del sistema.
        </p>
        <p className="text-xs text-text-secondary">
          Si crees que esto es un error, contacta al administrador.
        </p>
      </div>
    </div>
  );
}
