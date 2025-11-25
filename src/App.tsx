import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import Layout from "./pages/Layout";
import Dashboard from "./pages/Dashboard";
import DomainSearch from "./pages/DomainSearch";
import DomainManagement from "./pages/DomainManagement";
import DomainDetails from "./pages/DomainDetails";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import AcceptInvite from "@/pages/AcceptInvite";
import NoAccess from "./pages/NoAccess";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      retry: 2,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Routes>
              {/* Rotas públicas */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
              <Route path="/no-access" element={<NoAccess />} />

              {/* Rota raiz redireciona para dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* Rotas protegidas dentro do Layout */}
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute page="dashboard">
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/search"
                  element={
                    <ProtectedRoute page="domain-search">
                      <DomainSearch />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/domains"
                  element={
                    <ProtectedRoute page="management">
                      <DomainManagement />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/domains/:id"
                  element={
                    <ProtectedRoute page="management">
                      <DomainDetails />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute page="settings">
                      <Settings />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Rota 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
