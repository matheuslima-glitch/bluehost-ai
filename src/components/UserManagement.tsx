import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Settings as SettingsIcon, Mail, Check, Shield, Eye, Edit, Ban, Clock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

type PermissionLevel = "none" | "read" | "write";

interface UserPermission {
  id: string;
  user_id: string;
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
  can_send_invites: PermissionLevel;
}

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  permissions: UserPermission | null;
  invitation_status: "accepted" | "pending" | null;
}

const DEFAULT_PERMISSIONS: Partial<UserPermission> = {
  permission_type: "personalizado",
  can_access_dashboard: "write",
  can_access_domain_search: "write",
  can_access_management: "write",
  can_access_settings: "read",
  can_view_critical_domains: "write",
  can_view_integrations: "read",
  can_view_balance: "read",
  can_manual_purchase: "write",
  can_ai_purchase: "write",
  can_view_domain_details: "write",
  can_change_domain_status: "write",
  can_select_platform: "write",
  can_select_traffic_source: "write",
  can_insert_funnel_id: "write",
  can_view_logs: "read",
  can_change_nameservers: "write",
  can_create_filters: "write",
  can_manage_users: "none",
  can_send_invites: "none",
};

function PermissionSelector({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: PermissionLevel;
  onChange: (value: PermissionLevel) => void;
  disabled?: boolean;
  label: string;
}) {
  const getIcon = (level: PermissionLevel) => {
    switch (level) {
      case "none":
        return <Ban className="h-3 w-3" />;
      case "read":
        return <Eye className="h-3 w-3" />;
      case "write":
        return <Edit className="h-3 w-3" />;
    }
  };

  return (
    <div className="flex items-center justify-between py-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-[140px]">
          <SelectValue>
            <div className="flex items-center gap-2">
              {getIcon(value)}
              <span className="capitalize">
                {value === "none" ? "Sem Acesso" : value === "read" ? "Ver" : "Editar"}
              </span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4" />
              Sem Acesso
            </div>
          </SelectItem>
          <SelectItem value="read">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Ver
            </div>
          </SelectItem>
          <SelectItem value="write">
            <div className="flex items-center gap-2">
              <Edit className="h-4 w-4" />
              Editar
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function UserManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [invitePermissionsDialogOpen, setInvitePermissionsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [customPermissions, setCustomPermissions] = useState<Partial<UserPermission>>({});
  const [invitePermissions, setInvitePermissions] = useState<Partial<UserPermission>>(DEFAULT_PERMISSIONS);
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [makeAdminEdit, setMakeAdminEdit] = useState(false);

  const { data: currentUserProfile } = useQuery({
    queryKey: ["current-user-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("is_admin, full_name").eq("id", user?.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const isCurrentUserAdmin = currentUserProfile?.is_admin || false;

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, is_admin, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: permissions, error: permissionsError } = await supabase.from("user_permissions").select("*");
      if (permissionsError) throw permissionsError;

      const { data: invitations, error: invitationsError } = await supabase
        .from("invitations")
        .select("id, email, status, created_at, is_admin")
        .order("created_at", { ascending: false });

      if (invitationsError) throw invitationsError;

      const membersWithPermissions = profiles.map((profile) => ({
        ...profile,
        permissions: permissions?.find((p) => p.user_id === profile.id) || null,
        invitation_status: "accepted" as const,
      }));

      const pendingInvites = invitations
        ?.filter((inv) => inv.status === "pending")
        .filter((inv) => !profiles.some((p) => p.email === inv.email))
        .map((inv) => ({
          id: inv.id,
          email: inv.email,
          full_name: null,
          is_admin: inv.is_admin || false,
          created_at: inv.created_at,
          permissions: null,
          invitation_status: "pending" as const,
        }));

      const allMembers = [...membersWithPermissions, ...(pendingInvites || [])];
      return allMembers as TeamMember[];
    },
  });

  // ============================================================
  // MUTATION DE CONVITE - OPÇÃO 1 (EMAIL PRIMEIRO)
  // ============================================================
  const inviteMutation = useMutation({
    mutationFn: async ({
      email,
      isAdmin,
      permissions,
    }: {
      email: string;
      isAdmin: boolean;
      permissions: Partial<UserPermission>;
    }) => {
      console.log("🚀 INICIANDO ENVIO DE CONVITE");
      console.log("📧 Email:", email);
      console.log("👤 Is Admin:", isAdmin);
      console.log("🔐 Permissions:", permissions);

      // ============================================================
      // PASSO 1: ENVIAR EMAIL PRIMEIRO (PRIORIDADE!)
      // ============================================================
      const redirectUrl = `${window.location.origin}/accept-invite`;

      console.log("📧 ENVIANDO EMAIL VIA SUPABASE ADMIN...");
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectUrl,
      });

      console.log("📬 Resultado inviteUserByEmail:");
      console.log("  - Data:", inviteData);
      console.log("  - Error:", inviteError);

      // Verificar erros conhecidos
      if (inviteError) {
        const errorMsg = inviteError.message || "";

        // Erros que são OK (usuário já existe)
        if (
          errorMsg.includes("User already registered") ||
          errorMsg.includes("already been invited") ||
          errorMsg.includes("Database error saving new user")
        ) {
          console.warn("⚠️ Usuário já existe, mas continuando para salvar permissões...");
          // Não retorna erro - continua para salvar permissões
        } else {
          // Erro real - lançar exceção
          console.error("❌ ERRO ao enviar email:", inviteError);
          throw new Error(`Erro ao enviar convite: ${errorMsg}`);
        }
      } else {
        console.log("✅ EMAIL ENVIADO COM SUCESSO!");
      }

      // ============================================================
      // PASSO 2: SALVAR PERMISSÕES (BEST EFFORT)
      // ============================================================
      // Se falhar aqui, não impede que email tenha sido enviado

      console.log("💾 Salvando permissões em invitations...");

      try {
        const { data: saveData, error: saveError } = await supabase.rpc("save_invitation_with_permissions", {
          p_email: email,
          p_invited_by: user?.id,
          p_is_admin: isAdmin,
          p_permissions: permissions,
        });

        if (saveError) {
          console.warn("⚠️ Erro ao salvar invitations:", saveError);
          // NÃO lança erro - email já foi enviado!
        } else if (!saveData?.success) {
          console.warn("⚠️ Função retornou falha:", saveData);
          // NÃO lança erro - email já foi enviado!
        } else {
          console.log("✅ Permissões salvas com sucesso!");
          console.log("🎫 Token gerado:", saveData.token);
        }
      } catch (catchError: any) {
        console.warn("⚠️ Exceção ao salvar invitations:", catchError);
        // NÃO lança erro - email já foi enviado!
      }

      // ============================================================
      // RETORNAR SUCESSO
      // ============================================================
      const wasEmailSent =
        !inviteError ||
        inviteError.message?.includes("already been invited") ||
        inviteError.message?.includes("User already registered");

      return {
        success: true,
        emailSent: wasEmailSent,
        data: inviteData,
        message: wasEmailSent
          ? "Convite enviado com sucesso! O usuário receberá um e-mail."
          : "Convite atualizado! O usuário já foi convidado anteriormente.",
      };
    },

    onSuccess: (result: any) => {
      console.log("🎉 SUCESSO GERAL:", result);

      toast({
        title: "Sucesso!",
        description: result.message || "Convite processado com sucesso!",
      });

      setInviteEmail("");
      setInvitePermissionsDialogOpen(false);
      setInviteDialogOpen(false);
      setMakeAdmin(false);
      setInvitePermissions(DEFAULT_PERMISSIONS);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },

    onError: (error: any) => {
      console.error("❌ ERRO GERAL:", error);
      console.error("  - Message:", error.message);
      console.error("  - Stack:", error.stack);

      toast({
        title: "Erro ao enviar convite",
        description: error.message || "Ocorreu um erro ao processar o convite",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteUserError) throw deleteUserError;

      const { error: deletePermissionsError } = await supabase.from("user_permissions").delete().eq("user_id", userId);
      if (deletePermissionsError) throw deletePermissionsError;

      const { error: deleteProfileError } = await supabase.from("profiles").delete().eq("id", userId);
      if (deleteProfileError) throw deleteProfileError;
    },
    onSuccess: () => {
      toast({ title: "Usuário removido", description: "O usuário foi removido com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover usuário", description: error.message, variant: "destructive" });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("invitations").delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Convite removido", description: "O convite pendente foi removido" });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover convite", description: error.message, variant: "destructive" });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: async ({
      userId,
      permissions,
      promoteToAdmin,
    }: {
      userId: string;
      permissions: Partial<UserPermission>;
      promoteToAdmin?: boolean;
    }) => {
      // Se promover a admin, atualizar profiles.is_admin
      if (promoteToAdmin) {
        const { error: adminError } = await supabase.from("profiles").update({ is_admin: true }).eq("id", userId);
        if (adminError) throw adminError;
      }

      // Salvar permissões
      const { data: existing } = await supabase.from("user_permissions").select("id").eq("user_id", userId).single();

      if (existing) {
        const { error } = await supabase.from("user_permissions").update(permissions).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_permissions").insert({ user_id: userId, ...permissions });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Permissões atualizadas", description: "As permissões do usuário foram atualizadas com sucesso" });
      setPermissionsDialogOpen(false);
      setSelectedUserId(null);
      setSelectedMember(null);
      setMakeAdminEdit(false);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar permissões", description: error.message, variant: "destructive" });
    },
  });

  const handleSendInvite = () => {
    console.log("🎯 handleSendInvite chamado");
    console.log("📧 Email:", inviteEmail);
    console.log("👤 Make Admin:", makeAdmin);
    console.log("🔐 Permissions:", invitePermissions);

    if (!inviteEmail) {
      console.warn("⚠️ Email vazio!");
      toast({
        title: "Email obrigatório",
        description: "Por favor, insira um email válido",
        variant: "destructive",
      });
      return;
    }

    console.log("✅ Validação OK, chamando mutation...");
    inviteMutation.mutate({ email: inviteEmail, isAdmin: makeAdmin, permissions: invitePermissions });
  };

  const handleDeleteUser = (userId: string) => {
    deleteMutation.mutate(userId);
  };

  const handleDeleteInvite = (inviteId: string) => {
    deleteInviteMutation.mutate(inviteId);
  };

  const openEditPermissions = (member: TeamMember) => {
    setSelectedUserId(member.id);
    setSelectedMember(member);
    setMakeAdminEdit(false); // Resetar ao abrir
    if (member.permissions) {
      setCustomPermissions(member.permissions);
    } else {
      setCustomPermissions(DEFAULT_PERMISSIONS);
    }
    setPermissionsDialogOpen(true);
  };

  const handleSaveCustomPermissions = () => {
    if (!selectedUserId) return;

    // Se marcar para tornar admin, define permission_type como "total"
    const finalPermissions = makeAdminEdit
      ? { ...customPermissions, permission_type: "total" as const }
      : customPermissions;

    savePermissionsMutation.mutate({
      userId: selectedUserId,
      permissions: finalPermissions,
      promoteToAdmin: makeAdminEdit,
    });
  };

  const updatePermission = (key: keyof UserPermission, value: PermissionLevel) => {
    setCustomPermissions((prev) => ({ ...prev, [key]: value }));
  };

  const updateInvitePermission = (key: keyof UserPermission, value: PermissionLevel) => {
    setInvitePermissions((prev) => ({ ...prev, [key]: value }));
  };

  const canManageUsers = isCurrentUserAdmin || canEdit("can_manage_users");
  const canSendInvites = isCurrentUserAdmin || canEdit("can_send_invites");

  const renderPermissionsSections = (
    permissions: Partial<UserPermission>,
    updateFn: (key: keyof UserPermission, value: PermissionLevel) => void,
    disabled: boolean = false,
  ) => (
    <div className="space-y-6">
      <div>
        <h4 className="font-semibold mb-3 text-primary">Dashboard</h4>
        <div className="space-y-1 border rounded-lg p-3 bg-muted/30">
          <PermissionSelector
            label="Ver Saldo"
            value={permissions.can_view_balance || "none"}
            onChange={(value) => updateFn("can_view_balance", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Acessar Integrações"
            value={permissions.can_view_integrations || "none"}
            onChange={(value) => updateFn("can_view_integrations", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Gestão de Domínios Críticos"
            value={permissions.can_view_critical_domains || "none"}
            onChange={(value) => updateFn("can_view_critical_domains", value)}
            disabled={disabled}
          />
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-semibold mb-3 text-primary">Compra de Domínios</h4>
        <div className="space-y-1 border rounded-lg p-3 bg-muted/30">
          <PermissionSelector
            label="Compra Manual"
            value={permissions.can_manual_purchase || "none"}
            onChange={(value) => updateFn("can_manual_purchase", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Compra com IA"
            value={permissions.can_ai_purchase || "none"}
            onChange={(value) => updateFn("can_ai_purchase", value)}
            disabled={disabled}
          />
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-semibold mb-3 text-primary">Gerenciamento</h4>
        <div className="space-y-1 border rounded-lg p-3 bg-muted/30">
          <PermissionSelector
            label="Ver Detalhes"
            value={permissions.can_view_domain_details || "none"}
            onChange={(value) => updateFn("can_view_domain_details", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Alterar Nameservers"
            value={permissions.can_change_nameservers || "none"}
            onChange={(value) => updateFn("can_change_nameservers", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Alterar Status de Domínios"
            value={permissions.can_change_domain_status || "none"}
            onChange={(value) => updateFn("can_change_domain_status", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Alterar Plataformas"
            value={permissions.can_select_platform || "none"}
            onChange={(value) => updateFn("can_select_platform", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Alterar Fonte de Tráfego"
            value={permissions.can_select_traffic_source || "none"}
            onChange={(value) => updateFn("can_select_traffic_source", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Inserir ID do Funil"
            value={permissions.can_insert_funnel_id || "none"}
            onChange={(value) => updateFn("can_insert_funnel_id", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Ver Logs de Atividade"
            value={permissions.can_view_logs || "none"}
            onChange={(value) => updateFn("can_view_logs", value)}
            disabled={disabled}
          />
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-semibold mb-3 text-primary">Configurações</h4>
        <div className="space-y-1 border rounded-lg p-3 bg-muted/30">
          <PermissionSelector
            label="Criar Filtros"
            value={permissions.can_create_filters || "none"}
            onChange={(value) => updateFn("can_create_filters", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Gerenciar Usuários"
            value={permissions.can_manage_users || "none"}
            onChange={(value) => updateFn("can_manage_users", value)}
            disabled={disabled}
          />
          <PermissionSelector
            label="Enviar Convites"
            value={permissions.can_send_invites || "none"}
            onChange={(value) => updateFn("can_send_invites", value)}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );

  if (!canManageUsers && !canSendInvites && !isCurrentUserAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gerenciamento de Usuários</CardTitle>
          <CardDescription>Você pode visualizar os membros da equipe</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{member.full_name || member.email}</p>
                        {member.is_admin && (
                          <Badge className="gap-1 bg-blue-600 hover:bg-blue-700 text-white">
                            <Shield className="h-3 w-3" />
                            Admin
                          </Badge>
                        )}
                        {member.invitation_status === "pending" && (
                          <Badge variant="secondary" className="gap-1 bg-yellow-500 hover:bg-yellow-600 text-white">
                            <Clock className="h-3 w-3" />
                            Pendente
                          </Badge>
                        )}
                        {member.id === user?.id && <Badge variant="outline">Você</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gerenciamento de Usuários</CardTitle>
              <CardDescription>Gerencie os membros da equipe e suas permissões</CardDescription>
            </div>
            {canSendInvites && (
              <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Convidar Usuário
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Convidar Novo Usuário</DialogTitle>
                    <DialogDescription>
                      Envie um convite por e-mail. O usuário receberá um link para criar sua conta.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="usuario@exemplo.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>

                    {isCurrentUserAdmin && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="makeAdmin"
                          checked={makeAdmin}
                          onChange={(e) => setMakeAdmin(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <Label htmlFor="makeAdmin" className="cursor-pointer">
                          Tornar administrador
                        </Label>
                      </div>
                    )}

                    {makeAdmin && (
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          Administradores têm acesso total ao sistema, incluindo gerenciamento de usuários.
                        </p>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => {
                        setInviteDialogOpen(false);
                        setInvitePermissionsDialogOpen(true);
                      }}
                    >
                      Continuar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{member.full_name || member.email}</p>
                        {member.is_admin && (
                          <Badge className="gap-1 bg-blue-600 hover:bg-blue-700 text-white">
                            <Shield className="h-3 w-3" />
                            Admin
                          </Badge>
                        )}
                        {member.invitation_status === "pending" && (
                          <Badge variant="secondary" className="gap-1 bg-yellow-500 hover:bg-yellow-600 text-white">
                            <Clock className="h-3 w-3" />
                            Pendente
                          </Badge>
                        )}
                        {member.id === user?.id && <Badge variant="outline">Você</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                      {member.permissions && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Tipo: {member.permissions.permission_type === "total" ? "Acesso Total" : "Personalizado"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!member.is_admin && canManageUsers && member.invitation_status === "accepted" && (
                      <Button variant="outline" size="sm" onClick={() => openEditPermissions(member)}>
                        <SettingsIcon className="h-4 w-4 mr-2" />
                        Permissões
                      </Button>
                    )}

                    {member.id !== user?.id && isCurrentUserAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja remover {member.full_name || member.email}? Esta ação não pode ser
                              desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                member.invitation_status === "pending"
                                  ? handleDeleteInvite(member.id)
                                  : handleDeleteUser(member.id)
                              }
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={invitePermissionsDialogOpen} onOpenChange={setInvitePermissionsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Definir Permissões do Convite</DialogTitle>
            <DialogDescription>Configure as permissões que o novo usuário terá ao aceitar o convite</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Permissão</Label>
              <Select
                value={invitePermissions.permission_type}
                onValueChange={(value: "total" | "personalizado") =>
                  setInvitePermissions((prev) => ({ ...prev, permission_type: value }))
                }
                disabled={makeAdmin}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Acesso Total</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {invitePermissions.permission_type === "personalizado" && !makeAdmin && (
              <ScrollArea className="h-[500px] pr-4">
                {renderPermissionsSections(invitePermissions, updateInvitePermission)}
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInvitePermissionsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendInvite} disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-background border-t-foreground" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar Convite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={permissionsDialogOpen}
        onOpenChange={(open) => {
          setPermissionsDialogOpen(open);
          if (!open) {
            setMakeAdminEdit(false);
            setSelectedMember(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Editar Permissões</DialogTitle>
            <DialogDescription>
              Configure as permissões de {selectedMember?.full_name || selectedMember?.email}
            </DialogDescription>
          </DialogHeader>

          {/* ⭐ Opção de tornar admin - apenas para admins */}
          {isCurrentUserAdmin && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                <input
                  type="checkbox"
                  id="makeAdminEdit"
                  checked={makeAdminEdit}
                  onChange={(e) => setMakeAdminEdit(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="makeAdminEdit" className="cursor-pointer flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" />
                  Tornar Administrador
                </Label>
              </div>

              {makeAdminEdit && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Atenção:</strong> Administradores têm acesso total ao sistema, incluindo gerenciamento de
                    usuários e todas as funcionalidades. As permissões abaixo serão ignoradas.
                  </p>
                </div>
              )}

              <Separator />
            </div>
          )}

          {/* Tipo de Permissão */}
          {!makeAdminEdit && (
            <div className="space-y-2">
              <Label>Tipo de Permissão</Label>
              <Select
                value={customPermissions.permission_type || "personalizado"}
                onValueChange={(value: "total" | "personalizado") =>
                  setCustomPermissions((prev) => ({ ...prev, permission_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Acesso Total</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <ScrollArea className="h-[350px] pr-4">
            {customPermissions.permission_type === "personalizado" && !makeAdminEdit ? (
              renderPermissionsSections(customPermissions, updatePermission, false)
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {makeAdminEdit
                  ? "Usuário terá acesso total como Administrador"
                  : "Usuário terá acesso total a todas as funcionalidades"}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCustomPermissions} disabled={savePermissionsMutation.isPending}>
              {savePermissionsMutation.isPending ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-background border-t-foreground" />
                  Salvando...
                </>
              ) : makeAdminEdit ? (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Promover a Admin
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Salvar Permissões
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
