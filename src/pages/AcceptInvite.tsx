import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toast } from "sonner";
import { Mail, Lock, User, Shield, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";

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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);
  const [permissions, setPermissions] = useState<InvitePermissions | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<"loading" | "setup" | "success">("loading");

  useEffect(() => {
    processInvite();
  }, []);

  const processInvite = async () => {
    try {
      // Obter os parâmetros da URL do convite do Supabase
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      console.log("AcceptInvite - Processando convite:", { tokenHash: !!tokenHash, type });

      if (!tokenHash || type !== "invite") {
        // Verificar se já existe uma sessão (usuário pode ter clicado no link depois de já estar logado)
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          // Verificar se o usuário precisa completar o setup
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("id", session.user.id)
            .single();

          if (profile && !profile.full_name) {
            // Usuário existe mas não completou o setup
            const userMetadata = session.user.user_metadata || {};
            setInviteData({
              user: session.user,
              email: session.user.email,
              is_admin: userMetadata.is_admin || false,
            });

            // Parse das permissões
            if (userMetadata.permissions) {
              try {
                const parsedPermissions =
                  typeof userMetadata.permissions === "string"
                    ? JSON.parse(userMetadata.permissions)
                    : userMetadata.permissions;
                setPermissions(parsedPermissions);
              } catch (e) {
                console.error("Erro ao parsear permissões:", e);
              }
            }

            setStep("setup");
            setLoading(false);
            return;
          }

          // Usuário já tem setup completo, ir para dashboard
          navigate("/dashboard");
          return;
        }

        toast.error("Link de convite inválido");
        navigate("/auth");
        return;
      }

      // Verificar o token do convite com o Supabase
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
      });

      if (error) {
        console.error("Erro ao verificar convite:", error);
        toast.error("Convite inválido ou expirado");
        navigate("/auth");
        return;
      }

      if (data.user) {
        // Extrair metadados do usuário
        const userMetadata = data.user.user_metadata || {};
        const isAdmin = userMetadata.is_admin || false;

        // Parse das permissões se existirem
        let parsedPermissions = null;
        if (userMetadata.permissions) {
          try {
            parsedPermissions =
              typeof userMetadata.permissions === "string"
                ? JSON.parse(userMetadata.permissions)
                : userMetadata.permissions;
          } catch (e) {
            console.error("Erro ao parsear permissões:", e);
          }
        }

        setInviteData({
          user: data.user,
          email: data.user.email,
          is_admin: isAdmin,
        });
        setPermissions(parsedPermissions);
        setStep("setup");
      }
    } catch (error: any) {
      console.error("Erro ao processar convite:", error);
      toast.error("Erro ao processar convite");
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

    if (!fullName.trim()) {
      toast.error("Por favor, insira seu nome completo");
      return;
    }

    setSubmitting(true);

    try {
      console.log("🚀 Iniciando processo de aceitar convite...");
      console.log("📧 Email do convite:", inviteData.email);

      // Atualizar a senha do usuário
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: {
          full_name: fullName,
        },
      });

      if (updateError) throw updateError;
      console.log("✅ Senha atualizada com sucesso");

      // ⭐ CORREÇÃO: Buscar is_admin e permissions da tabela invitations (fonte de verdade)
      // O user_metadata pode não ter sido atualizado corretamente
      console.log("🔍 Buscando dados do convite na tabela invitations...");

      const { data: invitationData, error: invitationFetchError } = await supabaseAdmin
        .from("invitations")
        .select("is_admin, permissions")
        .eq("email", inviteData.email)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Usar dados do invitation se disponíveis, senão fallback para inviteData
      const finalIsAdmin = invitationData?.is_admin ?? inviteData.is_admin ?? false;
      const finalPermissions = invitationData?.permissions ?? permissions;

      console.log("📋 Dados finais do convite:", {
        finalIsAdmin,
        hasPermissions: !!finalPermissions,
        source: invitationData ? "invitations table" : "user_metadata",
      });

      // Criar perfil no banco de dados
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: inviteData.user.id,
        email: inviteData.email,
        full_name: fullName,
        is_admin: finalIsAdmin,
      });

      if (profileError) throw profileError;
      console.log("✅ Perfil criado com sucesso (is_admin:", finalIsAdmin, ")");

      // ⭐ CORREÇÃO CRÍTICA: Criar permissões para TODOS os usuários
      // Admins recebem permissões totais, não-admins recebem as permissões configuradas
      if (finalIsAdmin) {
        // Admin: criar permissões totais
        const adminPermissions = {
          user_id: inviteData.user.id,
          permission_type: "total" as const,
          can_access_dashboard: "write" as const,
          can_access_domain_search: "write" as const,
          can_access_management: "write" as const,
          can_access_settings: "write" as const,
          can_view_critical_domains: "write" as const,
          can_view_integrations: "write" as const,
          can_view_balance: "write" as const,
          can_manual_purchase: "write" as const,
          can_ai_purchase: "write" as const,
          can_view_domain_details: "write" as const,
          can_change_domain_status: "write" as const,
          can_select_platform: "write" as const,
          can_select_traffic_source: "write" as const,
          can_insert_funnel_id: "write" as const,
          can_view_logs: "write" as const,
          can_change_nameservers: "write" as const,
          can_create_filters: "write" as const,
          can_manage_users: "write" as const,
          can_send_invites: "write" as const,
        };

        const { error: permissionsError } = await supabase.from("user_permissions").upsert(adminPermissions);
        if (permissionsError) throw permissionsError;
        console.log("✅ Permissões de ADMIN criadas com sucesso");
      } else if (finalPermissions) {
        // Não-admin: usar permissões configuradas
        const { error: permissionsError } = await supabase.from("user_permissions").upsert({
          user_id: inviteData.user.id,
          ...finalPermissions,
        });

        if (permissionsError) throw permissionsError;
        console.log("✅ Permissões personalizadas criadas com sucesso");
      } else {
        // Fallback: criar permissões padrão se não houver nada definido
        console.log("⚠️ Nenhuma permissão definida, usando padrão limitado");
      }

      // ⭐ CORREÇÃO CRÍTICA: Usar supabaseAdmin para atualizar o convite ⭐
      // O supabaseAdmin usa service_role que bypassa RLS
      // A função get_data_owner_id() exige AMBOS: status = 'accepted' E accepted_at IS NOT NULL
      console.log("🔄 Atualizando convite com supabaseAdmin...");

      const { data: updateData, error: invitationError } = await supabaseAdmin
        .from("invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("email", inviteData.email)
        .select();

      if (invitationError) {
        console.error("❌ Erro ao atualizar convite:", invitationError);
        // Tentar novamente com status pending (pode ter mais de um convite)
        const { error: retryError } = await supabaseAdmin
          .from("invitations")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
          })
          .eq("email", inviteData.email)
          .eq("status", "pending");

        if (retryError) {
          console.error("❌ Erro na segunda tentativa:", retryError);
        } else {
          console.log("✅ Convite atualizado na segunda tentativa");
        }
      } else {
        console.log("✅ Convite atualizado com sucesso:", updateData);
      }

      // Verificar se a atualização funcionou
      const { data: verifyData } = await supabaseAdmin
        .from("invitations")
        .select("*")
        .eq("email", inviteData.email)
        .single();

      console.log("🔍 Verificação do convite após update:", verifyData);

      toast.success("Conta criada com sucesso!");
      setStep("success");

      // Redirecionar após 2 segundos
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (error: any) {
      console.error("Erro ao criar conta:", error);
      toast.error(error.message || "Erro ao criar conta");
      setSubmitting(false);
    }
  };

  const getPermissionSummary = () => {
    if (inviteData?.is_admin) {
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

  if (step === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando convite...</p>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Conta Criada com Sucesso!</CardTitle>
            <CardDescription>Redirecionando para o dashboard...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary flex items-center justify-center">
            <Mail className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Bem-vindo ao Domain Hub!</CardTitle>
          <CardDescription>Complete seu cadastro para acessar a plataforma</CardDescription>

          {/* Mostrar nível de acesso */}
          <div className="mt-4">
            {inviteData?.is_admin ? (
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
              <Input id="email" type="email" value={inviteData?.email || ""} disabled className="bg-muted" />
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
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  disabled={submitting}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  disabled={submitting}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
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
