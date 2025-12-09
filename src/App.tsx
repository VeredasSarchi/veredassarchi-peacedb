import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";

import Login from "@/pages/Login";
import Unauthorized from "@/pages/Unauthorized";
import Precontratos from "@/pages/Precontratos";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import Navigation from "@/components/Navigation";

function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      {user && <Navigation />}

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          {/* Login: si ya está logueado, lo mandamos al home */}
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <Login />}
          />

          {/* Home / Index: requiere estar logueado */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            }
          />

          {/* Aceptar también /index por si hay enlaces viejos */}
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
