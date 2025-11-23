import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Lock, User, Shield, Loader2 } from "lucide-react";

type PermissionLevel = "none" | "read" | "write";

interface InvitePermissions {
  permission_type: "total" | "personalizado";
  can_access_dashboard: PermissionLevel;
  can_access_domain_search: PermissionLevel;
  can_access_management: PermissionLevel;
  can_access_settings: PermissionLevel;
  can_view_critical_domains: PermissionLevel;
  can_view_integrations: PermissionLevel;
  can_view_balance: PermissionLevel;
  can_manual_purchase: PermissionLevel;
  can_ai_purchase: PermissionLevel;
  can_view_domain_details: PermissionLevel;
  can_change_domain_status: PermissionLevel;
  can_select_platform: PermissionLevel;
  can_select_traffic_source: PermissionLevel;
  can_insert_funnel_id: PermissionLevel;
  can_view_logs: PermissionLevel;
  can_change_nameservers: PermissionLevel;
  can_create_filters: PermissionLevel;
  can_manage_users: PermissionLevel;
}

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<any>(null);
  const [permissions, setPermissions] = useState<InvitePermissions | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    checkInvitation();
  }, [token]);

  const checkInvitation = async () => {
    try {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("token", token)
        .eq("status", "pending")
        .single();

      if (error || !data) {
        toast.error("Convite inválido ou expirado");
        navigate("/auth");
        return;
      }

      // Verificar se expirou
      if (new Date(data.expires_at) < new Date()) {
        // Atualizar status para expirado
        await supabase.from("invitations").update({ status: "expired" }).eq("id", data.id);

        toast.error("Este convite expirou");
        navigate("/auth");
        return;
      }

      setInvitation(data);

      // Parse das permissões se existirem
      if (data.permissions) {
        try {
          const parsedPermissions = JSON.parse(data.permissions);
          setPermissions(parsedPermissions);
        } catch (e) {
          console.error("Erro ao parsear permissões:", e);
        }
      }
    } catch (error) {
      toast.error("Erro ao verificar convite");
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setSubmitting(true);

    try {
      // Criar conta
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password: password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) throw signUpError;

      if (authData.user) {
        // Criar perfil
        const { error: profileError } = await supabase.from("profiles").insert({
          id: authData.user.id,
          email: invitation.email,
          full_name: fullName,
          is_admin: invitation.is_admin || false,
        });

        if (profileError) throw profileError;

        // Criar permissões personalizadas se não for admin
        if (!invitation.is_admin && permissions) {
          const { error: permissionsError } = await supabase.from("user_permissions").insert({
            user_id: authData.user.id,
            ...permissions,
          });

          if (permissionsError) throw permissionsError;
        }

        // Marcar convite como aceito
        await supabase
          .from("invitations")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
          })
          .eq("id", invitation.id);

        toast.success("Conta criada com sucesso! Faça login para continuar.");

        // Fazer login automático
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password: password,
        });

        if (!signInError) {
          navigate("/dashboard");
        } else {
          navigate("/auth");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
      setSubmitting(false);
    }
  };

  const getPermissionSummary = () => {
    if (invitation?.is_admin) {
      return "Administrador Completo";
    }

    if (!permissions) {
      return "Acesso Padrão";
    }

    if (permissions.permission_type === "total") {
      return "Acesso Total";
    }

    // Contar permissões ativas
    const accessiblePages = [
      permissions.can_access_dashboard !== "none" ? "Dashboard" : null,
      permissions.can_access_domain_search !== "none" ? "Compra de Domínios" : null,
      permissions.can_access_management !== "none" ? "Gerenciamento" : null,
      permissions.can_access_settings !== "none" ? "Configurações" : null,
    ].filter(Boolean);

    if (accessiblePages.length === 0) {
      return "Sem Acesso";
    }

    return `Acesso a: ${accessiblePages.join(", ")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando convite...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary flex items-center justify-center">
            <Mail className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Bem-vindo ao Domain Hub!</CardTitle>
          <CardDescription>Complete seu cadastro para acessar a plataforma</CardDescription>

          {/* Mostrar nível de acesso */}
          <div className="mt-4">
            {invitation?.is_admin ? (
              <Badge className="gap-1">
                <Shield className="h-3 w-3" />
                {getPermissionSummary()}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                {getPermissionSummary()}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleAcceptInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={invitation?.email} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="João Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10"
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  disabled={submitting}
                  minLength={6}
                />
              </div>
              <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                  disabled={submitting}
                  minLength={6}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando conta...
                </>
              ) : (
                "Criar Minha Conta"
              )}
            </Button>
          </form>

          {/* Informações sobre permissões */}
          {permissions && permissions.permission_type === "personalizado" && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="text-sm font-medium mb-2">Suas permissões incluem:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                {permissions.can_access_dashboard !== "none" && (
                  <li>• Dashboard ({permissions.can_access_dashboard === "write" ? "Completo" : "Visualização"})</li>
                )}
                {permissions.can_access_domain_search !== "none" && (
                  <li>
                    • Compra de Domínios (
                    {permissions.can_access_domain_search === "write" ? "Completo" : "Visualização"})
                  </li>
                )}
                {permissions.can_access_management !== "none" && (
                  <li>
                    • Gerenciamento ({permissions.can_access_management === "write" ? "Completo" : "Visualização"})
                  </li>
                )}
                {permissions.can_access_settings !== "none" && (
                  <li>• Configurações ({permissions.can_access_settings === "write" ? "Completo" : "Visualização"})</li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
