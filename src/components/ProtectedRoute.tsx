import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface ProtectedRouteProps {
  children: ReactNode;
  page: "dashboard" | "domain-search" | "management" | "settings";
}

export function ProtectedRoute({ children, page }: ProtectedRouteProps) {
  const { canAccessPage, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canAccessPage(page)) {
    return <Navigate to="/no-access" replace />;
  }

  return <>{children}</>;
}
