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
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Settings as SettingsIcon, Mail, Check, Shield } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface UserPermission {
  id: string;
  user_id: string;
  permission_type: "total" | "personalizado";
  can_access_dashboard: boolean;
  can_access_domain_search: boolean;
  can_access_management: boolean;
  can_access_settings: boolean;
  can_view_critical_domains: boolean;
  can_view_integrations: boolean;
  can_view_balance: boolean;
  can_manual_purchase: boolean;
  can_ai_purchase: boolean;
  can_view_domain_details: boolean;
  can_change_domain_status: boolean;
  can_select_platform: boolean;
  can_select_traffic_source: boolean;
  can_insert_funnel_id: boolean;
  can_view_logs: boolean;
  can_change_nameservers: boolean;
  can_create_filters: boolean;
  can_manage_users: boolean;
}

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  permissions: UserPermission | null;
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
  const [invitePermissions, setInvitePermissions] = useState<Partial<UserPermission>>({});
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

      if (permissionsError) throw permissionsError;

      return profiles.map((profile) => ({
        ...profile,
        permissions: permissions.find((p) => p.user_id === profile.id) || null,
      })) as TeamMember[];
    },
    enabled: isAdmin,
  });

  // Mutation para enviar convite usando o método nativo do Supabase
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
      // Usar supabaseAdmin para ter permissões administrativas
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          is_admin: isAdmin,
          permissions: permissions ? JSON.stringify(permissions) : null,
        },
        redirectTo: `${window.location.origin}/accept-invite`,
      });

      if (error) throw error;
      return data;
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
      setInvitePermissions({});
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
            can_access_dashboard: true,
            can_access_domain_search: true,
            can_access_management: true,
            can_access_settings: true,
            can_view_critical_domains: true,
            can_view_integrations: true,
            can_view_balance: true,
            can_manual_purchase: true,
            can_ai_purchase: true,
            can_view_domain_details: true,
            can_change_domain_status: true,
            can_select_platform: true,
            can_select_traffic_source: true,
            can_insert_funnel_id: true,
            can_view_logs: true,
            can_change_nameservers: true,
            can_create_filters: true,
            can_manage_users: false,
          })
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_permissions")
          .upsert({
            user_id: userId,
            permission_type: "personalizado",
            ...permissions,
          })
          .eq("user_id", userId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Permissões atualizadas!",
        description: "As permissões do usuário foram atualizadas com sucesso.",
      });
      setPermissionsDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar permissões",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para remover usuário
  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Deletar permissões primeiro
      const { error: permError } = await supabase.from("user_permissions").delete().eq("user_id", userId);

      if (permError) throw permError;

      // Deletar o usuário do auth usando supabaseAdmin
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) throw authError;
    },
    onSuccess: () => {
      toast({
        title: "Usuário removido!",
        description: "O usuário foi removido da equipe.",
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

  const handleInviteUser = () => {
    if (!inviteEmail.trim()) {
      toast({
        title: "Email inválido",
        description: "Digite um email válido para enviar o convite.",
        variant: "destructive",
      });
      return;
    }

    // Se for admin, enviar direto
    if (makeAdmin) {
      inviteMutation.mutate({
        email: inviteEmail,
        isAdmin: true,
      });
    } else {
      // Abrir dialog de permissões
      setInvitePermissionsDialogOpen(true);
    }
  };

  const handleSendInviteWithPermissions = () => {
    const permissions = {
      permission_type: "personalizado" as const,
      ...invitePermissions,
    };

    inviteMutation.mutate({
      email: inviteEmail,
      permissions,
      isAdmin: false,
    });
  };

  const handleChangePermissionType = (userId: string, type: "total" | "personalizado" | "admin") => {
    if (type === "admin") {
      updatePermissionsMutation.mutate({ userId, type: "total", isAdmin: true });
    } else if (type === "total") {
      updatePermissionsMutation.mutate({ userId, type });
    } else {
      // Abrir dialog de permissões personalizadas
      const member = teamMembers.find((m) => m.id === userId);
      if (member?.permissions) {
        setCustomPermissions(member.permissions);
      } else {
        setCustomPermissions({
          can_access_dashboard: true,
          can_access_domain_search: false,
          can_access_management: true,
          can_access_settings: false,
          can_view_critical_domains: true,
          can_view_integrations: true,
          can_view_balance: true,
          can_manual_purchase: false,
          can_ai_purchase: false,
          can_view_domain_details: true,
          can_change_domain_status: false,
          can_select_platform: false,
          can_select_traffic_source: false,
          can_insert_funnel_id: false,
          can_view_logs: true,
          can_change_nameservers: false,
          can_create_filters: false,
          can_manage_users: false,
        });
      }
      setSelectedUserId(userId);
      setPermissionsDialogOpen(true);
    }
  };

  const handleSaveCustomPermissions = () => {
    if (!selectedUserId) return;

    updatePermissionsMutation.mutate({
      userId: selectedUserId,
      type: "personalizado",
      permissions: customPermissions,
    });
  };

  const togglePermission = (key: keyof UserPermission) => {
    setCustomPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleInvitePermission = (key: keyof UserPermission) => {
    setInvitePermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Não mostrar para não-admins
  if (!isAdmin) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contas e Permissões</CardTitle>
          <CardDescription>Carregando...</CardDescription>
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
                <SettingsIcon className="h-5 w-5" />
                Contas e Permissões
              </CardTitle>
              <CardDescription>Crie contas de equipe e gerencie o que os usuários podem ver ou fazer</CardDescription>
            </div>
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar Novo Usuário</DialogTitle>
                  <DialogDescription>
                    Digite o email do usuário que você deseja convidar para a plataforma.
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

                  <div className="flex items-center space-x-2">
                    <Switch id="admin" checked={makeAdmin} onCheckedChange={setMakeAdmin} />
                    <Label htmlFor="admin" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Tornar Administrador (Acesso Total)
                    </Label>
                  </div>

                  {makeAdmin && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>Administradores</strong> têm acesso total à plataforma e podem gerenciar outros
                        usuários.
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleInviteUser} disabled={inviteMutation.isPending}>
                    <Mail className="h-4 w-4 mr-2" />
                    {makeAdmin ? "Enviar Convite Admin" : "Configurar Permissões"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary-foreground">
                      {member.full_name
                        ? member.full_name.substring(0, 2).toUpperCase()
                        : member.email.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{member.full_name || member.email}</p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {member.is_admin ? (
                    <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600">
                      <Shield className="h-3 w-3 mr-1" />
                      Admin
                    </Badge>
                  ) : (
                    <>
                      <Select
                        value={member.permissions?.permission_type || "total"}
                        onValueChange={(value: "total" | "personalizado" | "admin") =>
                          handleChangePermissionType(member.id, value)
                        }
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Administrador
                            </div>
                          </SelectItem>
                          <SelectItem value="total">Acesso Total</SelectItem>
                          <SelectItem value="personalizado">Acesso Personalizado</SelectItem>
                        </SelectContent>
                      </Select>

                      {member.id !== user?.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover Usuário</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja remover <strong>{member.full_name || member.email}</strong>? Essa
                                ação não pode ser desfeita e o usuário perderá todo o acesso à plataforma.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeUserMutation.mutate(member.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Permissões ao Convidar */}
      <Dialog open={invitePermissionsDialogOpen} onOpenChange={setInvitePermissionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configurar Permissões do Convite</DialogTitle>
            <DialogDescription>
              Configure as permissões que o usuário <strong>{inviteEmail}</strong> terá ao aceitar o convite.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {/* Acesso por Aba */}
              <div>
                <h4 className="font-semibold mb-3">Acesso por Aba</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Dashboard</Label>
                    <Switch
                      checked={invitePermissions.can_access_dashboard || false}
                      onCheckedChange={() => toggleInvitePermission("can_access_dashboard")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Compra de Domínios</Label>
                    <Switch
                      checked={invitePermissions.can_access_domain_search || false}
                      onCheckedChange={() => toggleInvitePermission("can_access_domain_search")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Gerenciamento</Label>
                    <Switch
                      checked={invitePermissions.can_access_management || false}
                      onCheckedChange={() => toggleInvitePermission("can_access_management")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Configurações</Label>
                    <Switch
                      checked={invitePermissions.can_access_settings || false}
                      onCheckedChange={() => toggleInvitePermission("can_access_settings")}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Dashboard */}
              <div>
                <h4 className="font-semibold mb-3">Funcionalidades - Dashboard</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Gestão de domínios críticos</Label>
                    <Switch
                      checked={invitePermissions.can_view_critical_domains || false}
                      onCheckedChange={() => toggleInvitePermission("can_view_critical_domains")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Acesso às integrações</Label>
                    <Switch
                      checked={invitePermissions.can_view_integrations || false}
                      onCheckedChange={() => toggleInvitePermission("can_view_integrations")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Ver saldo</Label>
                    <Switch
                      checked={invitePermissions.can_view_balance || false}
                      onCheckedChange={() => toggleInvitePermission("can_view_balance")}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Compra */}
              <div>
                <h4 className="font-semibold mb-3">Compra de Domínios</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Compra manual</Label>
                    <Switch
                      checked={invitePermissions.can_manual_purchase || false}
                      onCheckedChange={() => toggleInvitePermission("can_manual_purchase")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Compra com IA</Label>
                    <Switch
                      checked={invitePermissions.can_ai_purchase || false}
                      onCheckedChange={() => toggleInvitePermission("can_ai_purchase")}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Gerenciamento */}
              <div>
                <h4 className="font-semibold mb-3">Gerenciamento</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Ver detalhes</Label>
                    <Switch
                      checked={invitePermissions.can_view_domain_details || false}
                      onCheckedChange={() => toggleInvitePermission("can_view_domain_details")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Mudar status</Label>
                    <Switch
                      checked={invitePermissions.can_change_domain_status || false}
                      onCheckedChange={() => toggleInvitePermission("can_change_domain_status")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Selecionar plataforma</Label>
                    <Switch
                      checked={invitePermissions.can_select_platform || false}
                      onCheckedChange={() => toggleInvitePermission("can_select_platform")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Fonte de tráfego</Label>
                    <Switch
                      checked={invitePermissions.can_select_traffic_source || false}
                      onCheckedChange={() => toggleInvitePermission("can_select_traffic_source")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Inserir Funnel ID</Label>
                    <Switch
                      checked={invitePermissions.can_insert_funnel_id || false}
                      onCheckedChange={() => toggleInvitePermission("can_insert_funnel_id")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Ver logs</Label>
                    <Switch
                      checked={invitePermissions.can_view_logs || false}
                      onCheckedChange={() => toggleInvitePermission("can_view_logs")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Alterar nameservers</Label>
                    <Switch
                      checked={invitePermissions.can_change_nameservers || false}
                      onCheckedChange={() => toggleInvitePermission("can_change_nameservers")}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Configurações */}
              <div>
                <h4 className="font-semibold mb-3">Configurações</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Criar filtros</Label>
                    <Switch
                      checked={invitePermissions.can_create_filters || false}
                      onCheckedChange={() => toggleInvitePermission("can_create_filters")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInvitePermissionsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendInviteWithPermissions} disabled={inviteMutation.isPending}>
              <Mail className="h-4 w-4 mr-2" />
              Enviar Convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Permissões Personalizadas (Edição) - IGUAL AO ANTERIOR */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Permissões Personalizadas</DialogTitle>
            <DialogDescription>
              Configure exatamente o que este usuário pode ver e fazer na plataforma.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-6">
              {/* Acesso por Aba */}
              <div>
                <h4 className="font-semibold mb-3">Acesso por Aba</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dashboard">Dashboard</Label>
                    <Switch
                      id="dashboard"
                      checked={customPermissions.can_access_dashboard}
                      onCheckedChange={() => togglePermission("can_access_dashboard")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="domain-search">Compra de Domínios</Label>
                    <Switch
                      id="domain-search"
                      checked={customPermissions.can_access_domain_search}
                      onCheckedChange={() => togglePermission("can_access_domain_search")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="management">Gerenciamento</Label>
                    <Switch
                      id="management"
                      checked={customPermissions.can_access_management}
                      onCheckedChange={() => togglePermission("can_access_management")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="settings">Configurações</Label>
                    <Switch
                      id="settings"
                      checked={customPermissions.can_access_settings}
                      onCheckedChange={() => togglePermission("can_access_settings")}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Dashboard */}
              <div>
                <h4 className="font-semibold mb-3">Dashboard</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Gestão de domínios críticos</Label>
                    <Switch
                      checked={customPermissions.can_view_critical_domains}
                      onCheckedChange={() => togglePermission("can_view_critical_domains")}
                      disabled={!customPermissions.can_access_dashboard}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Acesso rápido as integrações</Label>
                    <Switch
                      checked={customPermissions.can_view_integrations}
                      onCheckedChange={() => togglePermission("can_view_integrations")}
                      disabled={!customPermissions.can_access_dashboard}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Saldo</Label>
                    <Switch
                      checked={customPermissions.can_view_balance}
                      onCheckedChange={() => togglePermission("can_view_balance")}
                      disabled={!customPermissions.can_access_dashboard}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Compra de Domínios */}
              <div>
                <h4 className="font-semibold mb-3">Compra de Domínios</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Compra de domínios manual</Label>
                    <Switch
                      checked={customPermissions.can_manual_purchase}
                      onCheckedChange={() => togglePermission("can_manual_purchase")}
                      disabled={!customPermissions.can_access_domain_search}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Compra de domínios com IA</Label>
                    <Switch
                      checked={customPermissions.can_ai_purchase}
                      onCheckedChange={() => togglePermission("can_ai_purchase")}
                      disabled={!customPermissions.can_access_domain_search}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Gerenciamento */}
              <div>
                <h4 className="font-semibold mb-3">Gerenciamento</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Ver detalhes</Label>
                    <Switch
                      checked={customPermissions.can_view_domain_details}
                      onCheckedChange={() => togglePermission("can_view_domain_details")}
                      disabled={!customPermissions.can_access_management}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Mudar status de domínios</Label>
                    <Switch
                      checked={customPermissions.can_change_domain_status}
                      onCheckedChange={() => togglePermission("can_change_domain_status")}
                      disabled={!customPermissions.can_access_management}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Selecionar plataforma</Label>
                    <Switch
                      checked={customPermissions.can_select_platform}
                      onCheckedChange={() => togglePermission("can_select_platform")}
                      disabled={!customPermissions.can_access_management}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Selecionar fonte de tráfego</Label>
                    <Switch
                      checked={customPermissions.can_select_traffic_source}
                      onCheckedChange={() => togglePermission("can_select_traffic_source")}
                      disabled={!customPermissions.can_access_management}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Inserir ID</Label>
                    <Switch
                      checked={customPermissions.can_insert_funnel_id}
                      onCheckedChange={() => togglePermission("can_insert_funnel_id")}
                      disabled={!customPermissions.can_access_management}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Ver logs</Label>
                    <Switch
                      checked={customPermissions.can_view_logs}
                      onCheckedChange={() => togglePermission("can_view_logs")}
                      disabled={!customPermissions.can_access_management}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Alterar nameservers</Label>
                    <Switch
                      checked={customPermissions.can_change_nameservers}
                      onCheckedChange={() => togglePermission("can_change_nameservers")}
                      disabled={!customPermissions.can_access_management}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Configurações */}
              <div>
                <h4 className="font-semibold mb-3">Configurações</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Criação de filtros</Label>
                    <Switch
                      checked={customPermissions.can_create_filters}
                      onCheckedChange={() => togglePermission("can_create_filters")}
                      disabled={!customPermissions.can_access_settings}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label>Gerenciar usuários</Label>
                      <Badge variant="secondary" className="text-xs">
                        Apenas Admin
                      </Badge>
                    </div>
                    <Switch checked={false} disabled={true} />
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
