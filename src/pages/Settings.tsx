import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Bell, Palette, Filter, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [newPlatformFilter, setNewPlatformFilter] = useState("");
  const [newTrafficSourceFilter, setNewTrafficSourceFilter] = useState("");

  // Fetch profile data
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, whatsapp_number")
        .eq("id", user?.id)
        .maybeSingle();
      
      if (error) throw error;
      if (data) {
        setFullName(data.full_name || "");
        setWhatsappNumber(data.whatsapp_number || "");
      }
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch notification settings
  const { data: notificationSettings } = useQuery({
    queryKey: ["notification-settings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch custom filters
  const { data: customFilters = [] } = useQuery({
    queryKey: ["custom-filters", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_filters")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          whatsapp_number: whatsappNumber,
        })
        .eq("id", user?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast({
        title: "Sucesso",
        description: "Perfil atualizado com sucesso!",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar perfil",
        variant: "destructive",
      });
    },
  });

  // Update notification settings mutation
  const updateNotificationMutation = useMutation({
    mutationFn: async (settings: { alert_suspended: boolean; alert_expired: boolean; alert_expiring_soon: boolean }) => {
      if (notificationSettings) {
        const { error } = await supabase
          .from("notification_settings")
          .update(settings)
          .eq("user_id", user?.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_settings")
          .insert({ user_id: user?.id, ...settings });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings", user?.id] });
      toast({
        title: "Sucesso",
        description: "Configurações de notificação atualizadas!",
      });
    },
  });

  // Add custom filter mutation
  const addFilterMutation = useMutation({
    mutationFn: async ({ filter_type, filter_value }: { filter_type: string; filter_value: string }) => {
      const { error } = await supabase
        .from("custom_filters")
        .insert({
          user_id: user?.id,
          filter_type,
          filter_value,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-filters", user?.id] });
      toast({
        title: "Sucesso",
        description: "Filtro adicionado com sucesso!",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao adicionar filtro ou filtro já existe",
        variant: "destructive",
      });
    },
  });

  // Delete custom filter mutation
  const deleteFilterMutation = useMutation({
    mutationFn: async (filterId: string) => {
      const { error } = await supabase
        .from("custom_filters")
        .delete()
        .eq("id", filterId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-filters", user?.id] });
      toast({
        title: "Sucesso",
        description: "Filtro removido com sucesso!",
      });
    },
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate();
  };

  const handleAddPlatformFilter = () => {
    if (newPlatformFilter.trim()) {
      addFilterMutation.mutate({
        filter_type: "platform",
        filter_value: newPlatformFilter.trim(),
      });
      setNewPlatformFilter("");
    }
  };

  const handleAddTrafficSourceFilter = () => {
    if (newTrafficSourceFilter.trim()) {
      addFilterMutation.mutate({
        filter_type: "traffic_source",
        filter_value: newTrafficSourceFilter.trim(),
      });
      setNewTrafficSourceFilter("");
    }
  };

  const platformFilters = customFilters.filter(f => f.filter_type === "platform");
  const trafficSourceFilters = customFilters.filter(f => f.filter_type === "traffic_source");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas preferências e integrações</p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Perfil
          </CardTitle>
          <CardDescription>
            Informações básicas da sua conta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user?.email} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo</Label>
            <Input 
              id="name" 
              placeholder="Seu nome" 
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input 
              id="whatsapp" 
              placeholder="+55 11 99999-9999" 
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
            {updateProfileMutation.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Aparência
          </CardTitle>
          <CardDescription>
            Personalize a interface do sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Modo Escuro</Label>
              <p className="text-sm text-muted-foreground">
                Alterar entre tema claro e escuro
              </p>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={toggleTheme}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações via WhatsApp
          </CardTitle>
          <CardDescription>
            Receba alertas sobre seus domínios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Domínios Suspensos</Label>
              <p className="text-sm text-muted-foreground">
                Alertas quando domínios forem suspensos
              </p>
            </div>
            <Switch 
              checked={notificationSettings?.alert_suspended || false}
              onCheckedChange={(checked) => 
                updateNotificationMutation.mutate({
                  alert_suspended: checked,
                  alert_expired: notificationSettings?.alert_expired || false,
                  alert_expiring_soon: notificationSettings?.alert_expiring_soon || false,
                })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Domínios Expirados</Label>
              <p className="text-sm text-muted-foreground">
                Alertas quando domínios expirarem
              </p>
            </div>
            <Switch 
              checked={notificationSettings?.alert_expired || false}
              onCheckedChange={(checked) => 
                updateNotificationMutation.mutate({
                  alert_suspended: notificationSettings?.alert_suspended || false,
                  alert_expired: checked,
                  alert_expiring_soon: notificationSettings?.alert_expiring_soon || false,
                })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Próximos a Expirar (15 dias)</Label>
              <p className="text-sm text-muted-foreground">
                Alertas 15 dias antes da expiração
              </p>
            </div>
            <Switch 
              checked={notificationSettings?.alert_expiring_soon || false}
              onCheckedChange={(checked) => 
                updateNotificationMutation.mutate({
                  alert_suspended: notificationSettings?.alert_suspended || false,
                  alert_expired: notificationSettings?.alert_expired || false,
                  alert_expiring_soon: checked,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Custom Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Criação de Filtros
          </CardTitle>
          <CardDescription>
            Crie filtros customizados para plataforma e fonte de tráfego
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Platform Filters */}
          <div className="space-y-3">
            <Label>Plataformas</Label>
            <div className="flex gap-2">
              <Input 
                placeholder="Nova plataforma" 
                value={newPlatformFilter}
                onChange={(e) => setNewPlatformFilter(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddPlatformFilter();
                  }
                }}
              />
              <Button 
                onClick={handleAddPlatformFilter}
                disabled={addFilterMutation.isPending || !newPlatformFilter.trim()}
              >
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {platformFilters.map((filter) => (
                <Badge key={filter.id} variant="secondary" className="gap-1">
                  {filter.filter_value}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => deleteFilterMutation.mutate(filter.id)}
                  />
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Traffic Source Filters */}
          <div className="space-y-3">
            <Label>Fontes de Tráfego</Label>
            <div className="flex gap-2">
              <Input 
                placeholder="Nova fonte de tráfego" 
                value={newTrafficSourceFilter}
                onChange={(e) => setNewTrafficSourceFilter(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddTrafficSourceFilter();
                  }
                }}
              />
              <Button 
                onClick={handleAddTrafficSourceFilter}
                disabled={addFilterMutation.isPending || !newTrafficSourceFilter.trim()}
              >
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {trafficSourceFilters.map((filter) => (
                <Badge key={filter.id} variant="secondary" className="gap-1">
                  {filter.filter_value}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => deleteFilterMutation.mutate(filter.id)}
                  />
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
