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
import { Plus, Trash2, Settings as SettingsIcon, Mail, Check, Shield, Eye, Edit, Ban } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

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
}

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  permissions: UserPermission | null;
}

// Componente para renderizar o selector de permissão
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

  const getVariant = (level: PermissionLevel): "default" | "secondary" | "destructive" => {
    switch (level) {
      case "write":
        return "default";
      case "read":
        return "secondary";
      case "none":
        return "destructive";
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

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [invitePermissionsDialogOpen, setInvitePermissionsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [customPermissions, setCustomPermissions] = useState<Partial<UserPermission>>({});
  const [invitePermissions, setInvitePermissions] = useState<Partial<UserPermission>>({
    permission_type: "total",
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
  });
  const [makeAdmin, setMakeAdmin] = useState(false);

  // Verificar se o usuário atual é admin
  const { data: currentUserProfile } = useQuery({
    queryKey: ["current-user-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("is_admin, full_name").eq("id", user?.id).single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const isAdmin = currentUserProfile?.is_admin || false;

  // Buscar todos os usuários da equipe
  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, is_admin, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: permissions, error: permissionsError } = await supabase.from("user_permissions").select("*");

      if (permissionsError && permissionsError.code !== "PGRST116") throw permissionsError;

      return profiles.map((profile) => ({
        ...profile,
        permissions: permissions?.find((p: any) => p.user_id === profile.id) || null,
      })) as TeamMember[];
    },
    enabled: isAdmin,
  });

  // Mutation para enviar convite
  const inviteMutation = useMutation({
    mutationFn: async ({
      email,
      permissions,
      isAdmin,
    }: {
      email: string;
      permissions?: Partial<UserPermission>;
      isAdmin: boolean;
    }) => {
      // Criar convite na tabela de convites
      const { data: invitation, error: inviteError } = await supabase
        .from("invitations")
        .insert({
          email,
          invited_by: user?.id,
          is_admin: isAdmin,
          permissions: permissions ? JSON.stringify(permissions) : null,
        })
        .select()
        .single();

      if (inviteError) throw inviteError;

      // Enviar email usando função edge do Supabase
      const { error: emailError } = await supabase.functions.invoke("send-invite-email", {
        body: {
          email,
          inviteUrl: `${window.location.origin}/accept-invite/${invitation.token}`,
        },
      });

      if (emailError) {
        // Se falhar o email, ainda assim o convite foi criado
        console.error("Erro ao enviar email:", emailError);
        toast({
          title: "Convite criado",
          description: "O convite foi criado mas o email não pôde ser enviado. Compartilhe o link manualmente.",
        });

        // Copiar link para clipboard
        const inviteLink = `${window.location.origin}/accept-invite/${invitation.token}`;
        await navigator.clipboard.writeText(inviteLink);

        toast({
          title: "Link copiado!",
          description: "O link do convite foi copiado para a área de transferência.",
        });
      }

      return invitation;
    },
    onSuccess: () => {
      toast({
        title: "Convite enviado!",
        description: "Um email foi enviado com o link de convite.",
      });
      setInviteEmail("");
      setInviteDialogOpen(false);
      setInvitePermissionsDialogOpen(false);
      setMakeAdmin(false);
      setInvitePermissions({
        permission_type: "total",
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
      });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao enviar convite",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para atualizar permissões
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({
      userId,
      type,
      permissions,
      isAdmin,
    }: {
      userId: string;
      type: "total" | "personalizado";
      permissions?: Partial<UserPermission>;
      isAdmin?: boolean;
    }) => {
      // Se for para tornar admin
      if (isAdmin !== undefined) {
        const { error: profileError } = await supabase.from("profiles").update({ is_admin: isAdmin }).eq("id", userId);

        if (profileError) throw profileError;
        return;
      }

      if (type === "total") {
        const { error } = await supabase
          .from("user_permissions")
          .upsert({
            user_id: userId,
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
          })
          .select();

        if (error) throw error;
      } else if (permissions) {
        const { error } = await supabase
          .from("user_permissions")
          .upsert({
            user_id: userId,
            permission_type: "personalizado",
            ...permissions,
          })
          .select();

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Permissões atualizadas!",
        description: "As permissões foram atualizadas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      setPermissionsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar permissões",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para deletar usuário
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Usuário removido!",
        description: "O usuário foi removido com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover usuário",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInvite = () => {
    setInvitePermissionsDialogOpen(true);
  };

  const handleSendInvite = () => {
    inviteMutation.mutate({
      email: inviteEmail,
      permissions: makeAdmin ? undefined : invitePermissions,
      isAdmin: makeAdmin,
    });
  };

  const handleEditPermissions = (member: TeamMember) => {
    setSelectedUserId(member.id);
    setCustomPermissions(
      member.permissions || {
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
      },
    );
    setPermissionsDialogOpen(true);
  };

  const handleSaveCustomPermissions = () => {
    if (selectedUserId) {
      updatePermissionsMutation.mutate({
        userId: selectedUserId,
        type: "personalizado",
        permissions: customPermissions,
      });
    }
  };

  const updatePermission = (key: keyof UserPermission, value: PermissionLevel) => {
    setCustomPermissions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateInvitePermission = (key: keyof UserPermission, value: PermissionLevel) => {
    setInvitePermissions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Gerenciamento de Usuários
          </CardTitle>
          <CardDescription>Você precisa ser administrador para acessar esta seção</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Gerenciamento de Usuários
              </CardTitle>
              <CardDescription>Gerencie os membros da sua equipe e suas permissões</CardDescription>
            </div>
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Convidar Membro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar Novo Membro</DialogTitle>
                  <DialogDescription>
                    Envie um convite por email para adicionar um novo membro à equipe
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleInvite} disabled={!inviteEmail}>
                    <Mail className="h-4 w-4 mr-2" />
                    Configurar Permissões
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando membros da equipe...</p>
          ) : teamMembers.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nenhum membro na equipe ainda</p>
          ) : (
            <div className="space-y-4">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{member.full_name || "Nome não definido"}</p>
                      {member.is_admin && (
                        <Badge variant="default" className="text-xs">
                          Admin
                        </Badge>
                      )}
                      {member.permissions?.permission_type === "total" && !member.is_admin && (
                        <Badge variant="secondary" className="text-xs">
                          Acesso Total
                        </Badge>
                      )}
                      {member.permissions?.permission_type === "personalizado" && (
                        <Badge variant="outline" className="text-xs">
                          Personalizado
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.id !== user?.id && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleEditPermissions(member)}>
                          <SettingsIcon className="h-4 w-4 mr-1" />
                          Permissões
                        </Button>
                        {member.is_admin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updatePermissionsMutation.mutate({ userId: member.id, type: "total", isAdmin: false })
                            }
                          >
                            Remover Admin
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updatePermissionsMutation.mutate({ userId: member.id, type: "total", isAdmin: true })
                            }
                          >
                            Tornar Admin
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. O usuário será permanentemente removido da equipe.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUserMutation.mutate(member.id)}>
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Configuração de Permissões do Convite */}
      <Dialog open={invitePermissionsDialogOpen} onOpenChange={setInvitePermissionsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Configurar Permissões do Convite</DialogTitle>
            <DialogDescription>
              Configure as permissões que o usuário {inviteEmail} terá ao aceitar o convite.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <Label htmlFor="make-admin" className="text-base font-semibold">
                Tornar Administrador
              </Label>
              <Select value={makeAdmin ? "true" : "false"} onValueChange={(value) => setMakeAdmin(value === "true")}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Não</SelectItem>
                  <SelectItem value="true">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!makeAdmin && (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-6">
                  {/* Acesso por Aba */}
                  <div>
                    <h4 className="font-semibold mb-3">Acesso por Aba</h4>
                    <div className="space-y-2">
                      <PermissionSelector
                        label="Dashboard"
                        value={invitePermissions.can_access_dashboard || "write"}
                        onChange={(value) => updateInvitePermission("can_access_dashboard", value)}
                      />
                      <PermissionSelector
                        label="Compra de Domínios"
                        value={invitePermissions.can_access_domain_search || "write"}
                        onChange={(value) => updateInvitePermission("can_access_domain_search", value)}
                      />
                      <PermissionSelector
                        label="Gerenciamento"
                        value={invitePermissions.can_access_management || "write"}
                        onChange={(value) => updateInvitePermission("can_access_management", value)}
                      />
                      <PermissionSelector
                        label="Configurações"
                        value={invitePermissions.can_access_settings || "read"}
                        onChange={(value) => updateInvitePermission("can_access_settings", value)}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Dashboard */}
                  <div>
                    <h4 className="font-semibold mb-3">Dashboard</h4>
                    <div className="space-y-2">
                      <PermissionSelector
                        label="Gestão de domínios críticos"
                        value={invitePermissions.can_view_critical_domains || "write"}
                        onChange={(value) => updateInvitePermission("can_view_critical_domains", value)}
                        disabled={invitePermissions.can_access_dashboard === "none"}
                      />
                      <PermissionSelector
                        label="Acesso rápido às integrações"
                        value={invitePermissions.can_view_integrations || "read"}
                        onChange={(value) => updateInvitePermission("can_view_integrations", value)}
                        disabled={invitePermissions.can_access_dashboard === "none"}
                      />
                      <PermissionSelector
                        label="Saldo"
                        value={invitePermissions.can_view_balance || "read"}
                        onChange={(value) => updateInvitePermission("can_view_balance", value)}
                        disabled={invitePermissions.can_access_dashboard === "none"}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Compra de Domínios */}
                  <div>
                    <h4 className="font-semibold mb-3">Compra de Domínios</h4>
                    <div className="space-y-2">
                      <PermissionSelector
                        label="Compra de domínios manual"
                        value={invitePermissions.can_manual_purchase || "write"}
                        onChange={(value) => updateInvitePermission("can_manual_purchase", value)}
                        disabled={invitePermissions.can_access_domain_search === "none"}
                      />
                      <PermissionSelector
                        label="Compra de domínios com IA"
                        value={invitePermissions.can_ai_purchase || "write"}
                        onChange={(value) => updateInvitePermission("can_ai_purchase", value)}
                        disabled={invitePermissions.can_access_domain_search === "none"}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Gerenciamento */}
                  <div>
                    <h4 className="font-semibold mb-3">Gerenciamento</h4>
                    <div className="space-y-2">
                      <PermissionSelector
                        label="Ver detalhes"
                        value={invitePermissions.can_view_domain_details || "write"}
                        onChange={(value) => updateInvitePermission("can_view_domain_details", value)}
                        disabled={invitePermissions.can_access_management === "none"}
                      />
                      <PermissionSelector
                        label="Mudar status"
                        value={invitePermissions.can_change_domain_status || "write"}
                        onChange={(value) => updateInvitePermission("can_change_domain_status", value)}
                        disabled={invitePermissions.can_access_management === "none"}
                      />
                      <PermissionSelector
                        label="Selecionar plataforma"
                        value={invitePermissions.can_select_platform || "write"}
                        onChange={(value) => updateInvitePermission("can_select_platform", value)}
                        disabled={invitePermissions.can_access_management === "none"}
                      />
                      <PermissionSelector
                        label="Fonte de tráfego"
                        value={invitePermissions.can_select_traffic_source || "write"}
                        onChange={(value) => updateInvitePermission("can_select_traffic_source", value)}
                        disabled={invitePermissions.can_access_management === "none"}
                      />
                      <PermissionSelector
                        label="Inserir Funnel ID"
                        value={invitePermissions.can_insert_funnel_id || "write"}
                        onChange={(value) => updateInvitePermission("can_insert_funnel_id", value)}
                        disabled={invitePermissions.can_access_management === "none"}
                      />
                      <PermissionSelector
                        label="Ver logs"
                        value={invitePermissions.can_view_logs || "read"}
                        onChange={(value) => updateInvitePermission("can_view_logs", value)}
                        disabled={invitePermissions.can_access_management === "none"}
                      />
                      <PermissionSelector
                        label="Alterar nameservers"
                        value={invitePermissions.can_change_nameservers || "write"}
                        onChange={(value) => updateInvitePermission("can_change_nameservers", value)}
                        disabled={invitePermissions.can_access_management === "none"}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Configurações */}
                  <div>
                    <h4 className="font-semibold mb-3">Configurações</h4>
                    <div className="space-y-2">
                      <PermissionSelector
                        label="Criar filtros"
                        value={invitePermissions.can_create_filters || "write"}
                        onChange={(value) => updateInvitePermission("can_create_filters", value)}
                        disabled={invitePermissions.can_access_settings === "none"}
                      />
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Gerenciar usuários</Label>
                          <Badge variant="secondary" className="text-xs">
                            Apenas Admin
                          </Badge>
                        </div>
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <Ban className="h-3 w-3" />
                          Sem Acesso
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInvitePermissionsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendInvite}>
              <Mail className="h-4 w-4 mr-2" />
              Enviar Convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição de Permissões */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Editar Permissões</DialogTitle>
            <DialogDescription>Configure as permissões personalizadas do usuário</DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-6">
              {/* Acesso por Aba */}
              <div>
                <h4 className="font-semibold mb-3">Acesso por Aba</h4>
                <div className="space-y-2">
                  <PermissionSelector
                    label="Dashboard"
                    value={customPermissions.can_access_dashboard || "none"}
                    onChange={(value) => updatePermission("can_access_dashboard", value)}
                  />
                  <PermissionSelector
                    label="Compra de Domínios"
                    value={customPermissions.can_access_domain_search || "none"}
                    onChange={(value) => updatePermission("can_access_domain_search", value)}
                  />
                  <PermissionSelector
                    label="Gerenciamento"
                    value={customPermissions.can_access_management || "none"}
                    onChange={(value) => updatePermission("can_access_management", value)}
                  />
                  <PermissionSelector
                    label="Configurações"
                    value={customPermissions.can_access_settings || "none"}
                    onChange={(value) => updatePermission("can_access_settings", value)}
                  />
                </div>
              </div>

              <Separator />

              {/* Dashboard */}
              <div>
                <h4 className="font-semibold mb-3">Dashboard</h4>
                <div className="space-y-2">
                  <PermissionSelector
                    label="Gestão de domínios críticos"
                    value={customPermissions.can_view_critical_domains || "none"}
                    onChange={(value) => updatePermission("can_view_critical_domains", value)}
                    disabled={customPermissions.can_access_dashboard === "none"}
                  />
                  <PermissionSelector
                    label="Acesso rápido às integrações"
                    value={customPermissions.can_view_integrations || "none"}
                    onChange={(value) => updatePermission("can_view_integrations", value)}
                    disabled={customPermissions.can_access_dashboard === "none"}
                  />
                  <PermissionSelector
                    label="Saldo"
                    value={customPermissions.can_view_balance || "none"}
                    onChange={(value) => updatePermission("can_view_balance", value)}
                    disabled={customPermissions.can_access_dashboard === "none"}
                  />
                </div>
              </div>

              <Separator />

              {/* Compra de Domínios */}
              <div>
                <h4 className="font-semibold mb-3">Compra de Domínios</h4>
                <div className="space-y-2">
                  <PermissionSelector
                    label="Compra de domínios manual"
                    value={customPermissions.can_manual_purchase || "none"}
                    onChange={(value) => updatePermission("can_manual_purchase", value)}
                    disabled={customPermissions.can_access_domain_search === "none"}
                  />
                  <PermissionSelector
                    label="Compra de domínios com IA"
                    value={customPermissions.can_ai_purchase || "none"}
                    onChange={(value) => updatePermission("can_ai_purchase", value)}
                    disabled={customPermissions.can_access_domain_search === "none"}
                  />
                </div>
              </div>

              <Separator />

              {/* Gerenciamento */}
              <div>
                <h4 className="font-semibold mb-3">Gerenciamento</h4>
                <div className="space-y-2">
                  <PermissionSelector
                    label="Ver detalhes"
                    value={customPermissions.can_view_domain_details || "none"}
                    onChange={(value) => updatePermission("can_view_domain_details", value)}
                    disabled={customPermissions.can_access_management === "none"}
                  />
                  <PermissionSelector
                    label="Mudar status de domínios"
                    value={customPermissions.can_change_domain_status || "none"}
                    onChange={(value) => updatePermission("can_change_domain_status", value)}
                    disabled={customPermissions.can_access_management === "none"}
                  />
                  <PermissionSelector
                    label="Selecionar plataforma"
                    value={customPermissions.can_select_platform || "none"}
                    onChange={(value) => updatePermission("can_select_platform", value)}
                    disabled={customPermissions.can_access_management === "none"}
                  />
                  <PermissionSelector
                    label="Selecionar fonte de tráfego"
                    value={customPermissions.can_select_traffic_source || "none"}
                    onChange={(value) => updatePermission("can_select_traffic_source", value)}
                    disabled={customPermissions.can_access_management === "none"}
                  />
                  <PermissionSelector
                    label="Inserir ID"
                    value={customPermissions.can_insert_funnel_id || "none"}
                    onChange={(value) => updatePermission("can_insert_funnel_id", value)}
                    disabled={customPermissions.can_access_management === "none"}
                  />
                  <PermissionSelector
                    label="Ver logs"
                    value={customPermissions.can_view_logs || "none"}
                    onChange={(value) => updatePermission("can_view_logs", value)}
                    disabled={customPermissions.can_access_management === "none"}
                  />
                  <PermissionSelector
                    label="Alterar nameservers"
                    value={customPermissions.can_change_nameservers || "none"}
                    onChange={(value) => updatePermission("can_change_nameservers", value)}
                    disabled={customPermissions.can_access_management === "none"}
                  />
                </div>
              </div>

              <Separator />

              {/* Configurações */}
              <div>
                <h4 className="font-semibold mb-3">Configurações</h4>
                <div className="space-y-2">
                  <PermissionSelector
                    label="Criação de filtros"
                    value={customPermissions.can_create_filters || "none"}
                    onChange={(value) => updatePermission("can_create_filters", value)}
                    disabled={customPermissions.can_access_settings === "none"}
                  />
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Gerenciar usuários</Label>
                      <Badge variant="secondary" className="text-xs">
                        Apenas Admin
                      </Badge>
                    </div>
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      Sem Acesso
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCustomPermissions}>
              <Check className="h-4 w-4 mr-2" />
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
