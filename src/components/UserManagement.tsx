import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Trash2, Settings as SettingsIcon, Mail, Check, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [customPermissions, setCustomPermissions] = useState<Partial<UserPermission>>({});

  // Verificar se o usuário atual é admin
  const { data: currentUserProfile } = useQuery({
    queryKey: ["current-user-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user?.id)
        .single();
      
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

      const { data: permissions, error: permissionsError } = await supabase
        .from("user_permissions")
        .select("*");

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
      // Gerar token único
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expira em 7 dias

      const { error } = await supabase.from("invitations").insert({
        invited_by: user?.id,
        email: email,
        token: token,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      // TODO: Enviar email de convite via API
      // const inviteUrl = `${window.location.origin}/accept-invite/${token}`;
      
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
    mutationFn: async ({ userId, type, permissions }: { 
      userId: string; 
      type: "total" | "personalizado";
      permissions?: Partial<UserPermission>;
    }) => {
      if (type === "total") {
        // Acesso total - todas as permissões ativadas
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
            can_manage_users: false, // Só admin pode gerenciar usuários
          })
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        // Acesso personalizado
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

  // Mutation para excluir usuário
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Deletar permissões
      await supabase.from("user_permissions").delete().eq("user_id", userId);
      
      // Deletar perfil
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;

      // TODO: Deletar do auth.users via admin API
    },
    onSuccess: () => {
      toast({
        title: "Usuário removido",
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

  const handleSendInvite = () => {
    if (!inviteEmail || !inviteEmail.includes("@")) {
      toast({
        title: "Email inválido",
        description: "Por favor, insira um email válido.",
        variant: "destructive",
      });
      return;
    }
    inviteMutation.mutate(inviteEmail);
  };

  const handlePermissionTypeChange = (userId: string, type: "total" | "personalizado") => {
    if (type === "total") {
      updatePermissionsMutation.mutate({ userId, type });
    } else {
      // Abrir modal de permissões personalizadas
      setSelectedUserId(userId);
      const member = teamMembers.find((m) => m.id === userId);
      setCustomPermissions(member?.permissions || {});
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

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso Restrito</CardTitle>
          <CardDescription>
            Apenas administradores podem gerenciar usuários.
          </CardDescription>
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
              <CardDescription>
                Crie contas de equipe e gerencie o que os usuários podem ver ou fazer
              </CardDescription>
            </div>
            
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar novo membro</DialogTitle>
                  <DialogDescription>
                    Envie um convite por email para adicionar um novo membro à equipe.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email do convidado</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="nome@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                </div>
                
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setInviteDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleSendInvite}
                    disabled={inviteMutation.isPending}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Enviar Convite
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando membros da equipe...
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum membro na equipe ainda. Clique em "Adicionar" para convidar.
            </div>
          ) : (
            <div className="space-y-3">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {member.full_name
                          ? member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                          : member.email.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex-1">
                      <p className="font-medium">
                        {member.full_name || member.email}
                        {member.is_admin && (
                          <Badge variant="secondary" className="ml-2">
                            Admin
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!member.is_admin && (
                      <>
                        <Select
                          value={member.permissions?.permission_type || "total"}
                          onValueChange={(value) => 
                            handlePermissionTypeChange(member.id, value as "total" | "personalizado")
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
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover membro</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja remover {member.full_name || member.email} da equipe?
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUserMutation.mutate(member.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
          )}
        </CardContent>
      </Card>

      {/* Modal de Permissões Personalizadas */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
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
                    <Label>Gerenciar usuários</Label>
                    <Switch
                      checked={false}
                      disabled={true}
                    />
                    <span className="text-xs text-muted-foreground">(Apenas Admin)</span>
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
