import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Layout from "./pages/Layout";
import Dashboard from "./pages/Dashboard";
import DomainSearch from "./pages/DomainSearch";
import DomainManagement from "./pages/DomainManagement";
import DomainDetails from "./pages/DomainDetails";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import AcceptInvite from "@/pages/AcceptInvite";
import NoAccess from "./pages/NoAccess";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { canAccessPage, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/accept-invite/:token" element={<AcceptInvite />} />
      <Route path="/no-access" element={<NoAccess />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          path="dashboard"
          element={canAccessPage("dashboard") ? <Dashboard /> : <Navigate to="/no-access" replace />}
        />

        <Route
          path="search"
          element={canAccessPage("domain-search") ? <DomainSearch /> : <Navigate to="/no-access" replace />}
        />

        <Route
          path="domains"
          element={canAccessPage("management") ? <DomainManagement /> : <Navigate to="/no-access" replace />}
        />

        <Route
          path="domains/:id"
          element={canAccessPage("management") ? <DomainDetails /> : <Navigate to="/no-access" replace />}
        />

        <Route
          path="settings"
          element={canAccessPage("settings") ? <Settings /> : <Navigate to="/no-access" replace />}
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <ProtectedRoutes />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
