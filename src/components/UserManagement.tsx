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
import { Plus, Trash2, Settings as SettingsIcon, Mail, Check, X, Eye, Edit3, Ban } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// Tipos de permissão: none (sem acesso), read (leitura), write (escrita)
type PermissionLevel = "none" | "read" | "write";

interface UserPermission {
  id: string;
  user_id: string;
  permission_type: "total" | "personalizado";

  // Acesso por Aba
  can_access_dashboard: PermissionLevel;
  can_access_domain_search: PermissionLevel;
  can_access_management: PermissionLevel;
  can_access_settings: PermissionLevel;

  // Dashboard
  can_view_critical_domains: PermissionLevel;
  can_view_integrations: PermissionLevel;
  can_view_balance: PermissionLevel;

  // Compra de Domínios
  can_manual_purchase: PermissionLevel;
  can_ai_purchase: PermissionLevel;

  // Gerenciamento
  can_view_domain_details: PermissionLevel;
  can_change_domain_status: PermissionLevel;
  can_select_platform: PermissionLevel;
  can_select_traffic_source: PermissionLevel;
  can_insert_funnel_id: PermissionLevel;
  can_view_logs: PermissionLevel;
  can_change_nameservers: PermissionLevel;

  // Configurações
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

// Helper para obter label do nível de permissão
const getPermissionLabel = (level: PermissionLevel) => {
  switch (level) {
    case "none":
      return "Sem acesso";
    case "read":
      return "Ler";
    case "write":
      return "Editar";
    default:
      return "Sem acesso";
  }
};

// Helper para obter cor do badge
const getPermissionColor = (level: PermissionLevel) => {
  switch (level) {
    case "none":
      return "destructive";
    case "read":
      return "secondary";
    case "write":
      return "default";
    default:
      return "destructive";
  }
};

// Helper para obter ícone do nível
const getPermissionIcon = (level: PermissionLevel) => {
  switch (level) {
    case "none":
      return <Ban className="h-3 w-3" />;
    case "read":
      return <Eye className="h-3 w-3" />;
    case "write":
      return <Edit3 className="h-3 w-3" />;
    default:
      return <Ban className="h-3 w-3" />;
  }
};

export function UserManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [customPermissions, setCustomPermissions] = useState<Partial<UserPermission>>({});

  // Verificar se o usuário atual é admin
  const { data: currentUserProfile } = useQuery({
    queryKey: ["current-user-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("is_admin").eq("id", user?.id).single();

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

  // Mutation para enviar convite
  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error } = await supabase.from("invitations").insert({
        invited_by: user?.id,
        email: email,
        token: token,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;
      return { email, token };
    },
    onSuccess: () => {
      toast({
        title: "Convite enviado!",
        description: "Um email foi enviado com o link de convite.",
      });
      setInviteEmail("");
      setInviteDialogOpen(false);
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
    }: {
      userId: string;
      type: "total" | "personalizado";
      permissions?: Partial<UserPermission>;
    }) => {
      if (type === "total") {
        const { error } = await supabase
          .from("user_permissions")
          .upsert({
            user_id: userId,
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
      const { error } = await supabase.from("user_permissions").delete().eq("user_id", userId);

      if (error) throw error;
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

    inviteMutation.mutate(inviteEmail);
  };

  const handleChangePermissionType = (userId: string, type: "total" | "personalizado") => {
    if (type === "total") {
      updatePermissionsMutation.mutate({ userId, type });
    } else {
      // Abrir dialog de permissões personalizadas
      const member = teamMembers.find((m) => m.id === userId);
      if (member?.permissions) {
        setCustomPermissions(member.permissions);
      } else {
        // Inicializar com valores padrão
        setCustomPermissions({
          can_access_dashboard: "read",
          can_access_domain_search: "none",
          can_access_management: "read",
          can_access_settings: "none",
          can_view_critical_domains: "read",
          can_view_integrations: "read",
          can_view_balance: "read",
          can_manual_purchase: "none",
          can_ai_purchase: "none",
          can_view_domain_details: "read",
          can_change_domain_status: "none",
          can_select_platform: "none",
          can_select_traffic_source: "none",
          can_insert_funnel_id: "none",
          can_view_logs: "read",
          can_change_nameservers: "none",
          can_create_filters: "none",
          can_manage_users: "none",
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

  const updatePermission = (key: keyof UserPermission, value: PermissionLevel) => {
    setCustomPermissions((prev) => ({
      ...prev,
      [key]: value,
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
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleInviteUser} disabled={inviteMutation.isPending}>
                    <Mail className="h-4 w-4 mr-2" />
                    Enviar Convite
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
                    <Badge>Admin</Badge>
                  ) : (
                    <>
                      <Select
                        value={member.permissions?.permission_type || "total"}
                        onValueChange={(value: "total" | "personalizado") =>
                          handleChangePermissionType(member.id, value)
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="total">Acesso Total</SelectItem>
                          <SelectItem value="personalizado">Acesso Personalizado</SelectItem>
                        </SelectContent>
                      </Select>

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
                              Tem certeza que deseja remover este usuário? Essa ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeUserMutation.mutate(member.id)}
                              className="bg-destructive"
                            >
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
        </CardContent>
      </Card>

      {/* Dialog de Permissões Personalizadas */}
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
                    <Select
                      value={customPermissions.can_access_dashboard || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_access_dashboard", value)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("none")}
                            Sem acesso
                          </div>
                        </SelectItem>
                        <SelectItem value="read">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("read")}
                            Ler
                          </div>
                        </SelectItem>
                        <SelectItem value="write">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("write")}
                            Editar
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="domain-search">Compra de Domínios</Label>
                    <Select
                      value={customPermissions.can_access_domain_search || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_access_domain_search", value)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("none")}
                            Sem acesso
                          </div>
                        </SelectItem>
                        <SelectItem value="read">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("read")}
                            Ler
                          </div>
                        </SelectItem>
                        <SelectItem value="write">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("write")}
                            Editar
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="management">Gerenciamento</Label>
                    <Select
                      value={customPermissions.can_access_management || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_access_management", value)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("none")}
                            Sem acesso
                          </div>
                        </SelectItem>
                        <SelectItem value="read">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("read")}
                            Ler
                          </div>
                        </SelectItem>
                        <SelectItem value="write">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("write")}
                            Editar
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="settings">Configurações</Label>
                    <Select
                      value={customPermissions.can_access_settings || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_access_settings", value)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("none")}
                            Sem acesso
                          </div>
                        </SelectItem>
                        <SelectItem value="read">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("read")}
                            Ler
                          </div>
                        </SelectItem>
                        <SelectItem value="write">
                          <div className="flex items-center gap-2">
                            {getPermissionIcon("write")}
                            Editar
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Select
                      value={customPermissions.can_view_critical_domains || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_view_critical_domains", value)}
                      disabled={customPermissions.can_access_dashboard === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="read">Ler</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Acesso rápido às integrações</Label>
                    <Select
                      value={customPermissions.can_view_integrations || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_view_integrations", value)}
                      disabled={customPermissions.can_access_dashboard === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="read">Ler</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Saldo</Label>
                    <Select
                      value={customPermissions.can_view_balance || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_view_balance", value)}
                      disabled={customPermissions.can_access_dashboard === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="read">Ler</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Select
                      value={customPermissions.can_manual_purchase || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_manual_purchase", value)}
                      disabled={customPermissions.can_access_domain_search === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Compra de domínios com IA</Label>
                    <Select
                      value={customPermissions.can_ai_purchase || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_ai_purchase", value)}
                      disabled={customPermissions.can_access_domain_search === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Select
                      value={customPermissions.can_view_domain_details || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_view_domain_details", value)}
                      disabled={customPermissions.can_access_management === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="read">Ler</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Mudar status de domínios</Label>
                    <Select
                      value={customPermissions.can_change_domain_status || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_change_domain_status", value)}
                      disabled={customPermissions.can_access_management === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Selecionar plataforma</Label>
                    <Select
                      value={customPermissions.can_select_platform || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_select_platform", value)}
                      disabled={customPermissions.can_access_management === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Selecionar fonte de tráfego</Label>
                    <Select
                      value={customPermissions.can_select_traffic_source || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_select_traffic_source", value)}
                      disabled={customPermissions.can_access_management === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Inserir ID</Label>
                    <Select
                      value={customPermissions.can_insert_funnel_id || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_insert_funnel_id", value)}
                      disabled={customPermissions.can_access_management === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Ver logs</Label>
                    <Select
                      value={customPermissions.can_view_logs || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_view_logs", value)}
                      disabled={customPermissions.can_access_management === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="read">Ler</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Alterar nameservers</Label>
                    <Select
                      value={customPermissions.can_change_nameservers || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_change_nameservers", value)}
                      disabled={customPermissions.can_access_management === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Select
                      value={customPermissions.can_create_filters || "none"}
                      onValueChange={(value: PermissionLevel) => updatePermission("can_create_filters", value)}
                      disabled={customPermissions.can_access_settings === "none"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                        <SelectItem value="write">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label>Gerenciar usuários</Label>
                      <Badge variant="secondary" className="text-xs">
                        Apenas Admin
                      </Badge>
                    </div>
                    <Select value="none" disabled>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem acesso</SelectItem>
                      </SelectContent>
                    </Select>
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
