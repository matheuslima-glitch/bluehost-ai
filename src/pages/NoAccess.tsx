import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";

export default function NoAccess() {
  const navigate = useNavigate();
  const { canAccessPage, isLoading } = usePermissions();

  // Encontrar a primeira página acessível para o usuário
  const getFirstAccessiblePage = () => {
    if (canAccessPage("dashboard")) return "/dashboard";
    if (canAccessPage("domain-search")) return "/search";
    if (canAccessPage("management")) return "/domains";
    if (canAccessPage("settings")) return "/settings";
    return "/auth"; // Se não tem acesso a nada, voltar para login
  };

  const handleNavigate = () => {
    const targetPage = getFirstAccessiblePage();
    navigate(targetPage);
  };

  const getButtonText = () => {
    const targetPage = getFirstAccessiblePage();
    switch (targetPage) {
      case "/dashboard":
        return "Ir para Dashboard";
      case "/search":
        return "Ir para Busca de Domínios";
      case "/domains":
        return "Ir para Gerenciamento";
      case "/settings":
        return "Ir para Configurações";
      default:
        return "Fazer Login";
    }
  };

  return (
    <div className="container mx-auto p-6 flex items-center justify-center min-h-[calc(100vh-200px)]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Acesso Restrito</CardTitle>
          <CardDescription>Você não tem permissão para acessar esta página.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Entre em contato com o administrador para solicitar acesso.
          </p>
          <Button onClick={handleNavigate} disabled={isLoading}>
            {getButtonText()}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
