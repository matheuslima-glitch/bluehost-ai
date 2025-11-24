import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface ProtectedRouteProps {
  children: ReactNode;
  page?: "dashboard" | "domain-search" | "management" | "settings";
}

export function ProtectedRoute({ children, page }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { canAccessPage, isLoading: permissionsLoading, isAdmin } = usePermissions();

  // Mostrar loading enquanto verifica autenticação
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  // Se não está autenticado, redirecionar para login
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Mostrar loading enquanto carrega permissões
  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  // Se é admin, sempre tem acesso
  if (isAdmin) {
    return <>{children}</>;
  }

  // Se não foi especificada uma página, permitir acesso (usado para Layout)
  if (!page) {
    return <>{children}</>;
  }

  // Verificar permissão para a página específica
  if (!canAccessPage(page)) {
    return <Navigate to="/no-access" replace />;
  }

  return <>{children}</>;
}
