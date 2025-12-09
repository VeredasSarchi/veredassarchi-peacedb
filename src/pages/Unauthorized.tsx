export default function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white shadow rounded-lg p-6 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-2">Acceso no autorizado</h1>
        <p className="text-slate-600 mb-4">
          No tienes permisos para acceder a esta sección del sistema.
        </p>
        <p className="text-xs text-slate-400">
          Si crees que esto es un error, contacta al administrador.
        </p>
      </div>
    </div>
  );
}
