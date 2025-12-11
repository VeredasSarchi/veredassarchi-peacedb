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
import NotFound from "@/pages/NotFound";
import Navigation from "@/components/Navigation";

function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen w-full bg-background">
      <Toaster richColors closeButton />
      {user && <Navigation />}

      <main className="w-full min-h-screen px-4 sm:px-6 lg:px-8 py-6">
        <Routes>
          {/* Login: si ya estǭ logueado, lo mandamos al home */}
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

          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
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
