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
import {
  Plus,
  Trash2,
  Settings as SettingsIcon,
  Mail,
  Check,
  Shield,
  Eye,
  Edit,
  Ban,
  Clock,
  RefreshCw,
} from "lucide-react";
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
  is_owner: boolean;
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

// Permissões totais para admins (tudo write)
const ADMIN_PERMISSIONS: Partial<UserPermission> = {
  permission_type: "total",
  can_access_dashboard: "write",
  can_access_domain_search: "write",
  can_access_management: "write",
  can_access_settings: "write",
  can_view_critical_domains: "write",
  can_view_integrations: "write",
  can_view_balance: "write",
  can_manual_purchase: "write",
  can_ai_purchase: "write",
  can_view_domain_details: "write",
  can_change_domain_status: "write",
  can_select_platform: "write",
  can_select_traffic_source: "write",
  can_insert_funnel_id: "write",
  can_view_logs: "write",
  can_change_nameservers: "write",
  can_create_filters: "write",
  can_manage_users: "write",
  can_send_invites: "write",
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

  // Estados para edição de convites pendentes
  const [editPendingDialogOpen, setEditPendingDialogOpen] = useState(false);
  const [selectedPendingInvite, setSelectedPendingInvite] = useState<TeamMember | null>(null);
  const [pendingInvitePermissions, setPendingInvitePermissions] =
    useState<Partial<UserPermission>>(DEFAULT_PERMISSIONS);
  const [pendingMakeAdmin, setPendingMakeAdmin] = useState(false);

  const { data: currentUserProfile } = useQuery({
    queryKey: ["current-user-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_admin, full_name, email")
        .eq("id", user?.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Verificar se usuário atual é owner (admin que nunca foi convidado)
  const { data: isCurrentUserOwner } = useQuery({
    queryKey: ["is-current-user-owner", user?.id, currentUserProfile?.email],
    queryFn: async () => {
      if (!currentUserProfile?.is_admin) return false;

      // Verificar se existe convite para o email do usuário atual
      const { data: invitation } = await supabase
        .from("invitations")
        .select("invited_by")
        .eq("email", currentUserProfile.email)
        .maybeSingle();

      // É owner se: é admin E (não foi convidado OU invited_by é null)
      return !invitation || invitation.invited_by === null;
    },
    enabled: !!user?.id && !!currentUserProfile?.email,
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

      // Buscar invitations COM o campo invited_by para determinar quem é owner
      // Ordenar por created_at ASC para pegar o primeiro convite de cada email
      const { data: invitations, error: invitationsError } = await supabase
        .from("invitations")
        .select("id, email, status, created_at, is_admin, invited_by")
        .order("created_at", { ascending: true });

      if (invitationsError) throw invitationsError;

      // Criar mapa de email -> invitation data para verificar quem convidou quem
      const invitationMap = new Map<string, { invited_by: string | null; status: string }>();
      invitations?.forEach((inv) => {
        // Só considera o primeiro convite (mais antigo) para cada email
        if (!invitationMap.has(inv.email.toLowerCase())) {
          invitationMap.set(inv.email.toLowerCase(), {
            invited_by: inv.invited_by,
            status: inv.status,
          });
        }
      });

      // Owner é admin que:
      // 1. NÃO tem registro na tabela invitations (nunca foi convidado), OU
      // 2. Tem invited_by = null
      // Admins convidados (com invited_by preenchido) NÃO são owners
      const membersWithPermissions = profiles.map((profile) => {
        const emailLower = profile.email.toLowerCase();
        const invitation = invitationMap.get(emailLower);
        const wasInvited = !!invitation;
        const invitedBy = invitation?.invited_by;

        // É owner APENAS se: é admin (na tabela profiles) E (não foi convidado OU invited_by é null)
        // IMPORTANTE: Usa is_admin da tabela PROFILES, não da INVITATIONS
        const isOwner = profile.is_admin && (!wasInvited || invitedBy === null);

        // Debug log
        console.log(
          `👤 ${profile.email}: is_admin=${profile.is_admin}, wasInvited=${wasInvited}, invitedBy=${invitedBy}, isOwner=${isOwner}`,
        );

        return {
          ...profile,
          permissions: permissions?.find((p) => p.user_id === profile.id) || null,
          invitation_status: "accepted" as const,
          is_owner: isOwner,
        };
      });

      const pendingInvites = invitations
        ?.filter((inv) => inv.status === "pending")
        .filter((inv) => !profiles.some((p) => p.email === inv.email))
        .map((inv) => ({
          id: inv.id,
          email: inv.email,
          full_name: null,
          is_admin: inv.is_admin || false,
          is_owner: false,
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
      // ============================================================
      // PASSO 1: ENVIAR EMAIL PRIMEIRO (PRIORIDADE!)
      // ============================================================
      const redirectUrl = `${window.location.origin}/accept-invite`;

      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectUrl,
      });

      // Verificar erros conhecidos
      if (inviteError) {
        const errorMsg = inviteError.message || "";

        // Erros que são OK (usuário já existe)
        if (
          errorMsg.includes("User already registered") ||
          errorMsg.includes("already been invited") ||
          errorMsg.includes("Database error saving new user")
        ) {
          // Não retorna erro - continua para salvar permissões
        } else {
          // Erro real - lançar exceção
          throw new Error(`Erro ao enviar convite: ${errorMsg}`);
        }
      } else {
      }

      // ============================================================
      // PASSO 2: SALVAR PERMISSÕES (BEST EFFORT)
      // ============================================================
      // Se falhar aqui, não impede que email tenha sido enviado

      try {
        const { data: saveData, error: saveError } = await supabase.rpc("save_invitation_with_permissions", {
          p_email: email,
          p_invited_by: user?.id,
          p_is_admin: isAdmin,
          p_permissions: permissions,
        });

        if (saveError) {
          // NÃO lança erro - email já foi enviado!
        } else if (!saveData?.success) {
          // NÃO lança erro - email já foi enviado!
        } else {
        }
      } catch (catchError: any) {
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
      toast({
        title: "Erro ao enviar convite",
        description: error.message || "Ocorreu um erro ao processar o convite",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Usar a função do banco que deleta o usuário completamente
      // (profiles, user_permissions, invitations, auth.users, etc.)
      const { data, error } = await supabase.rpc("delete_user_completely", {
        p_user_id: userId,
      });

      if (error) throw error;

      // Verificar se a função retornou sucesso
      if (data && !data.success) {
        throw new Error(data.error || "Erro ao excluir usuário");
      }

      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Usuário removido",
        description: data?.message || "O usuário foi removido completamente do sistema",
      });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover usuário",
        description: error.message || "Não foi possível remover o usuário",
        variant: "destructive",
      });
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

  // ============================================================
  // MUTATION PARA REENVIAR CONVITE
  // ============================================================
  const resendInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const redirectUrl = `${window.location.origin}/accept-invite`;

      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        // Se o erro for "já convidado", ainda é sucesso (email será reenviado)
        if (error.message?.includes("already been invited") || error.message?.includes("User already registered")) {
          return { success: true, message: "Convite reenviado!" };
        }
        throw error;
      }

      return { success: true, data };
    },
    onSuccess: () => {
      toast({
        title: "Convite reenviado!",
        description: "O usuário receberá um novo e-mail com o link de convite.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reenviar convite",
        description: error.message || "Não foi possível reenviar o convite",
        variant: "destructive",
      });
    },
  });

  // ============================================================
  // MUTATION PARA ATUALIZAR PERMISSÕES DE CONVITE PENDENTE
  // ============================================================
  const updatePendingInviteMutation = useMutation({
    mutationFn: async ({
      inviteId,
      email,
      isAdmin,
      permissions,
    }: {
      inviteId: string;
      email: string;
      isAdmin: boolean;
      permissions: Partial<UserPermission>;
    }) => {
      // Atualizar na tabela invitations
      const { error } = await supabaseAdmin
        .from("invitations")
        .update({
          is_admin: isAdmin,
          permissions: permissions,
        })
        .eq("id", inviteId);

      if (error) throw error;

      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Permissões atualizadas!",
        description: "As permissões do convite foram atualizadas com sucesso.",
      });
      setEditPendingDialogOpen(false);
      setSelectedPendingInvite(null);
      setPendingMakeAdmin(false);
      setPendingInvitePermissions(DEFAULT_PERMISSIONS);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar permissões",
        description: error.message || "Não foi possível atualizar as permissões",
        variant: "destructive",
      });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: async ({
      userId,
      permissions,
      promoteToAdmin,
      demoteFromAdmin,
    }: {
      userId: string;
      permissions: Partial<UserPermission>;
      promoteToAdmin?: boolean;
      demoteFromAdmin?: boolean;
    }) => {
      // Buscar email do usuário para atualizar invitations
      const { data: userProfile } = await supabase.from("profiles").select("email").eq("id", userId).single();

      // Se promover a admin, atualizar:
      // 1. profiles.is_admin = true
      // 2. invitations.is_admin = true
      // 3. user_permissions = ADMIN_PERMISSIONS (tudo write)
      if (promoteToAdmin) {
        const { error: adminError } = await supabaseAdmin.from("profiles").update({ is_admin: true }).eq("id", userId);
        if (adminError) {
          console.error("Erro ao promover admin:", adminError);
          throw adminError;
        }

        // Atualizar na tabela invitations
        if (userProfile?.email) {
          await supabaseAdmin.from("invitations").update({ is_admin: true }).eq("email", userProfile.email);
        }

        // Atualizar permissões para acesso total
        const { error: permError } = await supabase
          .from("user_permissions")
          .upsert({ user_id: userId, ...ADMIN_PERMISSIONS }, { onConflict: "user_id" });

        if (permError) throw permError;

        return { promoteToAdmin, demoteFromAdmin };
      }

      // Se rebaixar de admin, atualizar:
      // 1. profiles.is_admin = false
      // 2. invitations.is_admin = false
      // 3. user_permissions = permissões personalizadas (mantém as que foram passadas)
      if (demoteFromAdmin) {
        const { error: adminError } = await supabaseAdmin.from("profiles").update({ is_admin: false }).eq("id", userId);
        if (adminError) {
          console.error("Erro ao rebaixar admin:", adminError);
          throw adminError;
        }

        // Atualizar na tabela invitations
        if (userProfile?.email) {
          await supabaseAdmin.from("invitations").update({ is_admin: false }).eq("email", userProfile.email);
        }
      }

      // Salvar permissões usando upsert (só chega aqui se NÃO for promoção)
      const { error } = await supabase
        .from("user_permissions")
        .upsert({ user_id: userId, ...permissions }, { onConflict: "user_id" });

      if (error) throw error;

      return { promoteToAdmin, demoteFromAdmin };
    },
    onSuccess: (result) => {
      let title = "Permissões atualizadas";
      let description = "As permissões do usuário foram atualizadas com sucesso";

      if (result?.promoteToAdmin) {
        title = "Usuário promovido!";
        description = "O usuário agora é um administrador com acesso total";
      } else if (result?.demoteFromAdmin) {
        title = "Admin rebaixado";
        description = "O usuário não é mais administrador";
      }

      toast({ title, description });
      setPermissionsDialogOpen(false);
      setSelectedUserId(null);
      setSelectedMember(null);
      setMakeAdminEdit(false);

      // Invalidar todas as queries relacionadas
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["is-current-user-owner"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar permissões", description: error.message, variant: "destructive" });
    },
  });

  const handleSendInvite = () => {
    if (!inviteEmail) {
      toast({
        title: "Email obrigatório",
        description: "Por favor, insira um email válido",
        variant: "destructive",
      });
      return;
    }

    inviteMutation.mutate({ email: inviteEmail, isAdmin: makeAdmin, permissions: invitePermissions });
  };

  const handleDeleteUser = (userId: string) => {
    deleteMutation.mutate(userId);
  };

  const handleDeleteInvite = (inviteId: string) => {
    deleteInviteMutation.mutate(inviteId);
  };

  // ============================================================
  // HANDLERS PARA CONVITES PENDENTES
  // ============================================================
  const handleResendInvite = (email: string) => {
    resendInviteMutation.mutate(email);
  };

  const openEditPendingInvite = async (member: TeamMember) => {
    setSelectedPendingInvite(member);
    setPendingMakeAdmin(member.is_admin);

    // Buscar permissões atuais do convite
    const { data: inviteData } = await supabaseAdmin
      .from("invitations")
      .select("permissions, is_admin")
      .eq("id", member.id)
      .single();

    if (inviteData?.permissions) {
      setPendingInvitePermissions(inviteData.permissions as Partial<UserPermission>);
    } else {
      setPendingInvitePermissions(member.is_admin ? ADMIN_PERMISSIONS : DEFAULT_PERMISSIONS);
    }

    setEditPendingDialogOpen(true);
  };

  const handleSavePendingPermissions = () => {
    if (!selectedPendingInvite) return;

    // Se marcou como admin, usar ADMIN_PERMISSIONS
    const finalPermissions = pendingMakeAdmin ? ADMIN_PERMISSIONS : pendingInvitePermissions;

    updatePendingInviteMutation.mutate({
      inviteId: selectedPendingInvite.id,
      email: selectedPendingInvite.email,
      isAdmin: pendingMakeAdmin,
      permissions: finalPermissions as Partial<UserPermission>,
    });
  };

  const updatePendingPermission = (key: keyof UserPermission, value: PermissionLevel) => {
    setPendingInvitePermissions((prev) => ({ ...prev, [key]: value }));
  };

  const openEditPermissions = (member: TeamMember) => {
    setSelectedUserId(member.id);
    setSelectedMember(member);
    // Se o membro já é admin, iniciar com makeAdminEdit true
    setMakeAdminEdit(member.is_admin);
    if (member.permissions) {
      setCustomPermissions(member.permissions);
    } else {
      setCustomPermissions(DEFAULT_PERMISSIONS);
    }
    setPermissionsDialogOpen(true);
  };

  const handleSaveCustomPermissions = () => {
    if (!selectedUserId || !selectedMember) return;

    // Detectar se está promovendo ou rebaixando
    const wasAdmin = selectedMember.is_admin;
    const willBeAdmin = makeAdminEdit;

    const promoteToAdmin = !wasAdmin && willBeAdmin;
    const demoteFromAdmin = wasAdmin && !willBeAdmin;

    // Se marcar para tornar admin, define permission_type como "total"
    const finalPermissions = makeAdminEdit
      ? { ...customPermissions, permission_type: "total" as const }
      : { ...customPermissions, permission_type: "personalizado" as const };

    savePermissionsMutation.mutate({
      userId: selectedUserId,
      permissions: finalPermissions,
      promoteToAdmin,
      demoteFromAdmin,
    });
  };

  const updatePermission = (key: keyof UserPermission, value: PermissionLevel) => {
    setCustomPermissions((prev) => ({ ...prev, [key]: value }));
  };

  const updateInvitePermission = (key: keyof UserPermission, value: PermissionLevel) => {
    setInvitePermissions((prev) => ({ ...prev, [key]: value }));
  };

  const canManageUsers = isCurrentUserAdmin || canEdit("can_manage_users");
  const canSendInvites = isCurrentUserAdmin; // Somente admins podem enviar convites

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
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 
                      Botões para CONVITES PENDENTES:
                      - Reenviar convite
                      - Editar permissões antes de aceitar
                    */}
                    {member.invitation_status === "pending" && canSendInvites && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResendInvite(member.email)}
                          disabled={resendInviteMutation.isPending}
                        >
                          {resendInviteMutation.isPending ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Reenviar
                            </>
                          )}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditPendingInvite(member)}>
                          <SettingsIcon className="h-4 w-4 mr-2" />
                          Permissões
                        </Button>
                      </>
                    )}

                    {/* 
                      Botão Permissões para USUÁRIOS ACEITOS:
                      - Owner NUNCA pode ter permissões editadas por ninguém
                      - Owner pode gerenciar todos os outros
                      - Admin (não owner) pode gerenciar todos EXCETO owners
                      - Usuário comum não pode gerenciar ninguém
                    */}
                    {canManageUsers &&
                      member.invitation_status === "accepted" &&
                      member.id !== user?.id &&
                      !member.is_owner && (
                        <Button variant="outline" size="sm" onClick={() => openEditPermissions(member)}>
                          <SettingsIcon className="h-4 w-4 mr-2" />
                          Permissões
                        </Button>
                      )}

                    {/* 
                      Botão Excluir:
                      - Owner NUNCA pode ser excluído por ninguém
                      - Owner pode excluir qualquer outro usuário
                      - Admin (não owner) pode excluir usuários não-owners
                    */}
                    {member.id !== user?.id && isCurrentUserAdmin && !member.is_owner && (
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

      <Dialog
        open={invitePermissionsDialogOpen}
        onOpenChange={(open) => {
          setInvitePermissionsDialogOpen(open);
          if (!open) {
            setMakeAdmin(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Definir Permissões do Convite</DialogTitle>
            <DialogDescription>Configure as permissões que o novo usuário terá ao aceitar o convite</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Acesso</Label>
              <Select
                value={makeAdmin ? "admin" : "personalizado"}
                onValueChange={(value: "admin" | "personalizado") => {
                  if (value === "admin") {
                    setMakeAdmin(true);
                    // ⭐ CORREÇÃO: Aplicar TODAS as permissões de admin, não apenas permission_type
                    setInvitePermissions(ADMIN_PERMISSIONS as Partial<UserPermission>);
                  } else {
                    setMakeAdmin(false);
                    // Voltar para permissões padrão quando desmarcar admin
                    setInvitePermissions(DEFAULT_PERMISSIONS);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      Administrador
                    </div>
                  </SelectItem>
                  <SelectItem value="personalizado">
                    <div className="flex items-center gap-2">
                      <SettingsIcon className="h-4 w-4" />
                      Personalizado
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {makeAdmin && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Administrador:</strong> Terá acesso total ao sistema, incluindo gerenciamento de usuários.
                </p>
              </div>
            )}

            {!makeAdmin && (
              <ScrollArea className="h-[400px] pr-4">
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

          {/* Tipo de Acesso - apenas para admins */}
          {isCurrentUserAdmin && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Acesso</Label>
                <Select
                  value={makeAdminEdit ? "admin" : "personalizado"}
                  onValueChange={(value: "admin" | "personalizado") => {
                    setMakeAdminEdit(value === "admin");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-500" />
                        Administrador
                      </div>
                    </SelectItem>
                    <SelectItem value="personalizado">
                      <div className="flex items-center gap-2">
                        <SettingsIcon className="h-4 w-4" />
                        Personalizado
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {makeAdminEdit && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Administrador:</strong> Terá acesso total ao sistema, incluindo gerenciamento de usuários.
                  </p>
                </div>
              )}
            </div>
          )}

          <ScrollArea className="h-[400px] pr-4">
            {!makeAdminEdit ? (
              renderPermissionsSections(customPermissions, updatePermission, false)
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Usuário terá acesso total como Administrador
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCustomPermissions}
              disabled={savePermissionsMutation.isPending}
              variant={selectedMember?.is_admin && !makeAdminEdit ? "destructive" : "default"}
            >
              {savePermissionsMutation.isPending ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-background border-t-foreground" />
                  Salvando...
                </>
              ) : selectedMember?.is_admin && !makeAdminEdit ? (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Rebaixar Admin
                </>
              ) : !selectedMember?.is_admin && makeAdminEdit ? (
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

      {/* ============================================================
          DIALOG PARA EDITAR PERMISSÕES DE CONVITE PENDENTE
          ============================================================ */}
      <Dialog
        open={editPendingDialogOpen}
        onOpenChange={(open) => {
          setEditPendingDialogOpen(open);
          if (!open) {
            setPendingMakeAdmin(false);
            setSelectedPendingInvite(null);
            setPendingInvitePermissions(DEFAULT_PERMISSIONS);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Editar Permissões do Convite</DialogTitle>
            <DialogDescription>
              Altere as permissões de {selectedPendingInvite?.email} antes de aceitar o convite
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Acesso</Label>
              <Select
                value={pendingMakeAdmin ? "admin" : "personalizado"}
                onValueChange={(value: "admin" | "personalizado") => {
                  if (value === "admin") {
                    setPendingMakeAdmin(true);
                    setPendingInvitePermissions(ADMIN_PERMISSIONS as Partial<UserPermission>);
                  } else {
                    setPendingMakeAdmin(false);
                    setPendingInvitePermissions(DEFAULT_PERMISSIONS);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      Administrador
                    </div>
                  </SelectItem>
                  <SelectItem value="personalizado">
                    <div className="flex items-center gap-2">
                      <SettingsIcon className="h-4 w-4" />
                      Personalizado
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {pendingMakeAdmin && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Administrador:</strong> Terá acesso total ao sistema, incluindo gerenciamento de usuários.
                </p>
              </div>
            )}

            {!pendingMakeAdmin && (
              <ScrollArea className="h-[400px] pr-4">
                {renderPermissionsSections(pendingInvitePermissions, updatePendingPermission)}
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPendingDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePendingPermissions} disabled={updatePendingInviteMutation.isPending}>
              {updatePendingInviteMutation.isPending ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-background border-t-foreground" />
                  Salvando...
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
