import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { Toaster } from "sonner";

import Login from "@/pages/Login";
import Unauthorized from "@/pages/Unauthorized";
import Precontratos from "@/pages/Precontratos";
import AdminHome from "@/pages/AdminHome";
import VendedorHome from "@/pages/VendedorHome";
import DashboardPreContratos from "@/pages/DashboardPreContratos";
import DashboardContratosActivos from "@/pages/DashboardContratosActivos";
import DashboardContratosAnulados from "@/pages/DashboardContratosAnulados";
import ControlCuotas from "@/pages/ControlCuotas";
import ControlMantenimiento from "@/pages/ControlMantenimiento";
import IngresosCampoSanto from "@/pages/IngresosCampoSanto";
import PaquetesFunerarios from "@/pages/PaquetesFunerarios";
import Cremaciones from "@/pages/Cremaciones";
import Jardines from "@/pages/Jardines";
import JardinDetalle from "@/pages/JardinDetalle";
import OneDriveAdmin from "@/pages/OneDriveAdmin";
import OneDriveCallback from "@/pages/OneDriveCallback";
import NotFound from "@/pages/NotFound";
import Navigation from "@/components/Navigation";
import AppFooter from "@/components/AppFooter";

function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-clip bg-background">
      <Toaster richColors closeButton />
      {user && <Navigation />}

      <main id="main-content" className="flex w-full min-w-0 flex-1 flex-col">
        <Routes>
          {/* Login: si ya está logueado, lo mandamos al home */}
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <Login />}
          />

          {/* Home admin */}
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminHome />
              </ProtectedRoute>
            }
          />

          {/* Home vendedor */}
          <Route
            path="/vendedor"
            element={
              <ProtectedRoute allowedRoles={["vendedor"]}>
                <VendedorHome />
              </ProtectedRoute>
            }
          />

          {/* Aceptar tambiǸn /index por si hay enlaces viejos */}
          <Route path="/index" element={<Navigate to="/" replace />} />

          {/* Precontratos: admin + vendedor */}
          <Route
            path="/precontratos"
            element={
              <ProtectedRoute allowedRoles={["admin", "vendedor"]}>
                <Precontratos />
                
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard-precontratos"
            element={
              <ProtectedRoute allowedRoles={["admin", "vendedor"]}>
                <DashboardPreContratos />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard-contratos-activos"
            element={
              <ProtectedRoute allowedRoles={["admin", "vendedor"]}>
                <DashboardContratosActivos />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard-contratos-anulados"
            element={
              <ProtectedRoute allowedRoles={["admin", "vendedor"]}>
                <DashboardContratosAnulados />
              </ProtectedRoute>
            }
          />

          <Route
            path="/control-cuotas"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <ControlCuotas />
              </ProtectedRoute>
            }
          />

          <Route
            path="/control-mantenimiento"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <ControlMantenimiento />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ingresos-campo-santo"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <IngresosCampoSanto />
              </ProtectedRoute>
            }
          />

          <Route
            path="/paquetes-funerarios"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <PaquetesFunerarios />
              </ProtectedRoute>
            }
          />

          <Route
            path="/cremaciones"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Cremaciones />
              </ProtectedRoute>
            }
          />

          <Route
            path="/jardines"
            element={
              <ProtectedRoute allowedRoles={["admin", "vendedor"]}>
                <Jardines />
              </ProtectedRoute>
            }
          />

          <Route
            path="/jardines/:id"
            element={
              <ProtectedRoute allowedRoles={["admin", "vendedor"]}>
                <JardinDetalle />
              </ProtectedRoute>
            }
          />

          <Route
            path="/onedrive-admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <OneDriveAdmin />
              </ProtectedRoute>
            }
          />

          <Route
            path="/onedrive-callback"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <OneDriveCallback />
              </ProtectedRoute>
            }
          />

          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {user && <AppFooter />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
