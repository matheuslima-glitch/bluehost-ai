import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Bell, Palette, Filter, X, Volume2, Check, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { ALERT_SOUNDS } from "@/components/CriticalDomainsAlert";
import { Checkbox } from "@/components/ui/checkbox";

// URL da API do backend
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Nomes dos sons de alerta (3 sons)
const SOUND_NAMES: Record<string, string> = {
  "alert-1": "Alerta de Perigo - Tom Intermitente",
  "alert-2": "Atenção Máxima - Alarme Duplo",
  "alert-4": "Alerta Suave - True Tone",
};

// Dias da semana
const WEEK_DAYS = [
  { value: "segunda", label: "Segunda" },
  { value: "terca", label: "Terça" },
  { value: "quarta", label: "Quarta" },
  { value: "quinta", label: "Quinta" },
  { value: "sexta", label: "Sexta" },
];

// Intervalos de horário
const TIME_INTERVALS = [
  { value: 1, label: "Cada 1 hora" },
  { value: 3, label: "Cada 3 horas" },
  { value: 6, label: "Cada 6 horas" },
];

// Frequência diária
const DAILY_FREQUENCIES = [
  { value: 1, label: "1x por dia" },
  { value: 2, label: "2x por dia" },
  { value: 3, label: "3x por dia" },
];

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappValidation, setWhatsappValidation] = useState<{
    isValidating: boolean;
    isValid: boolean | null;
    message: string;
  }>({ isValidating: false, isValid: null, message: "" });
  const [newPlatformFilter, setNewPlatformFilter] = useState("");
  const [newTrafficSourceFilter, setNewTrafficSourceFilter] = useState("");
  const [selectedSound, setSelectedSound] = useState("alert-4");
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedInterval, setSelectedInterval] = useState<number>(6);
  const [selectedFrequency, setSelectedFrequency] = useState<number>(1);

  // Fetch profile data
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, whatsapp_number, alert_sound_preference")
        .eq("id", user?.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setFullName(data.full_name || "");
        setWhatsappNumber(data.whatsapp_number || "");
        setSelectedSound(data.alert_sound_preference || "alert-4");
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

      if (error && error.code !== "PGRST116") throw error;

      // Carregar configurações de recorrência
      if (data) {
        setSelectedDays(data.notification_days || []);
        setSelectedInterval(data.notification_interval_hours || 6);
        setSelectedFrequency(data.notification_frequency || 1);
      }

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

  // Separar filtros por tipo
  const platformFilters = customFilters.filter((f) => f.filter_type === "platform");
  const trafficSourceFilters = customFilters.filter((f) => f.filter_type === "traffic_source");

  // Validar número de WhatsApp em tempo real
  const validateWhatsAppNumber = async (number: string) => {
    // Limpar número
    const cleanNumber = number.replace(/\D/g, "");

    // Validar formato básico
    if (cleanNumber.length < 10) {
      setWhatsappValidation({
        isValidating: false,
        isValid: false,
        message: "Número muito curto",
      });
      return;
    }

    setWhatsappValidation({ isValidating: true, isValid: null, message: "Validando..." });

    try {
      const response = await fetch(`${API_URL}/api/whatsapp/check-number`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber: cleanNumber,
        }),
      });

      const data = await response.json();

      if (data.exists) {
        setWhatsappValidation({
          isValidating: false,
          isValid: true,
          message: "Número verificado no WhatsApp",
        });
      } else {
        setWhatsappValidation({
          isValidating: false,
          isValid: false,
          message: "Número não está cadastrado no WhatsApp",
        });
      }
    } catch (error) {
      setWhatsappValidation({
        isValidating: false,
        isValid: false,
        message: "Erro ao validar número",
      });
    }
  };

  // Efeito para validar número quando usuário para de digitar
  useEffect(() => {
    if (whatsappNumber) {
      const timeoutId = setTimeout(() => {
        validateWhatsAppNumber(whatsappNumber);
      }, 1000);

      return () => clearTimeout(timeoutId);
    } else {
      setWhatsappValidation({ isValidating: false, isValid: null, message: "" });
    }
  }, [whatsappNumber]);

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
    mutationFn: async (settings: {
      alert_suspended: boolean;
      alert_expired: boolean;
      alert_expiring_soon: boolean;
      notification_days?: string[];
      notification_interval_hours?: number;
      notification_frequency?: number;
    }) => {
      if (notificationSettings) {
        const { error } = await supabase.from("notification_settings").update(settings).eq("user_id", user?.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_settings").insert({ user_id: user?.id, ...settings });
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
      const { error } = await supabase.from("custom_filters").insert({
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
      const { error } = await supabase.from("custom_filters").delete().eq("id", filterId);

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
    // Validar se o número está no WhatsApp antes de salvar
    if (whatsappNumber && whatsappValidation.isValid === false) {
      toast({
        title: "Atenção",
        description: "O número informado não está cadastrado no WhatsApp",
        variant: "destructive",
      });
      return;
    }

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

  // Funções para gerenciar sons de alerta
  const previewSound = (soundId: string) => {
    // Parar qualquer som que esteja tocando
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    const soundUrl = ALERT_SOUNDS[soundId];
    if (soundUrl) {
      const audio = new Audio(soundUrl);
      audio.volume = 1.0;
      audio.play().catch((error) => {
        console.error("Erro ao reproduzir som:", error);
      });

      setCurrentAudio(audio);
    }
  };

  const handleSoundChange = (soundId: string) => {
    setSelectedSound(soundId);
    previewSound(soundId);
  };

  const saveSoundPreference = async () => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ alert_sound_preference: selectedSound })
        .eq("id", user?.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });

      toast({
        title: "✅ Som salvo com sucesso!",
        description: `Você escolheu: ${SOUND_NAMES[selectedSound]}`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar preferência de som",
        variant: "destructive",
      });
    }
  };

  // Funções para gerenciar dias da semana
  const toggleDay = (day: string) => {
    const newDays = selectedDays.includes(day) ? selectedDays.filter((d) => d !== day) : [...selectedDays, day];

    setSelectedDays(newDays);
  };

  // Salvar configurações de recorrência
  const handleSaveRecurrence = () => {
    if (selectedDays.length === 0) {
      toast({
        title: "Atenção",
        description: "Selecione pelo menos um dia da semana",
        variant: "destructive",
      });
      return;
    }

    updateNotificationMutation.mutate({
      alert_suspended: notificationSettings?.alert_suspended || false,
      alert_expired: notificationSettings?.alert_expired || false,
      alert_expiring_soon: notificationSettings?.alert_expiring_soon || false,
      notification_days: selectedDays,
      notification_interval_hours: selectedInterval,
      notification_frequency: selectedFrequency,
    });
  };

  return (
    <div className="container max-w-3xl mx-auto py-10 space-y-6">
      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Perfil
          </CardTitle>
          <CardDescription>Gerencie suas informações pessoais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo</Label>
            <Input
              id="name"
              placeholder="Digite seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp">Número do WhatsApp</Label>
            <div className="relative">
              <Input
                id="whatsapp"
                placeholder="+55 11 99999-9999"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
              />
              {whatsappValidation.isValidating && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Clock className="h-4 w-4 text-muted-foreground animate-spin" />
                </div>
              )}
              {!whatsappValidation.isValidating && whatsappValidation.isValid === true && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
              )}
              {!whatsappValidation.isValidating && whatsappValidation.isValid === false && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                </div>
              )}
            </div>
            {whatsappValidation.message && (
              <p className={`text-sm ${whatsappValidation.isValid ? "text-green-600" : "text-red-600"}`}>
                {whatsappValidation.message}
              </p>
            )}
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
          <CardDescription>Personalize a interface do sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Modo Escuro</Label>
              <p className="text-sm text-muted-foreground">Alterar entre tema claro e escuro</p>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
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
          <CardDescription>Receba alertas sobre seus domínios</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Domínios Suspensos</Label>
              <p className="text-sm text-muted-foreground">Alertas quando domínios forem suspensos</p>
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
              <p className="text-sm text-muted-foreground">Alertas quando domínios expirarem</p>
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
              <p className="text-sm text-muted-foreground">Alertas 15 dias antes da expiração</p>
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

          <Separator className="my-6" />

          {/* Configurações de Recorrência */}
          <div className="space-y-4 bg-muted/50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4" />
              <Label className="text-base font-semibold">Recorrência de Alertas</Label>
            </div>

            {/* Dias da Semana */}
            <div className="space-y-2">
              <Label className="text-sm">Dias da Semana</Label>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((day) => (
                  <label
                    key={day.value}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors
                      ${
                        selectedDays.includes(day.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border"
                      }
                    `}
                  >
                    <Checkbox
                      checked={selectedDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{day.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Intervalo de Horário */}
            <div className="space-y-2">
              <Label htmlFor="interval" className="text-sm">
                Intervalo de Horário
              </Label>
              <Select value={selectedInterval.toString()} onValueChange={(value) => setSelectedInterval(Number(value))}>
                <SelectTrigger id="interval">
                  <SelectValue placeholder="Selecione o intervalo" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_INTERVALS.map((interval) => (
                    <SelectItem key={interval.value} value={interval.value.toString()}>
                      {interval.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frequência Diária */}
            <div className="space-y-2">
              <Label htmlFor="frequency" className="text-sm">
                Frequência Máxima Diária
              </Label>
              <Select
                value={selectedFrequency.toString()}
                onValueChange={(value) => setSelectedFrequency(Number(value))}
              >
                <SelectTrigger id="frequency">
                  <SelectValue placeholder="Selecione a frequência" />
                </SelectTrigger>
                <SelectContent>
                  {DAILY_FREQUENCIES.map((freq) => (
                    <SelectItem key={freq.value} value={freq.value.toString()}>
                      {freq.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSaveRecurrence} className="w-full mt-4">
              <Check className="h-4 w-4 mr-2" />
              Salvar Configurações de Recorrência
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alert Sounds Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Sons de Alerta
          </CardTitle>
          <CardDescription>
            Escolha o som que será reproduzido quando houver domínios críticos (suspensos ou expirados)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="alert-sound" className="text-base">
              Som de Alerta de Domínios Críticos
            </Label>
            <Select value={selectedSound} onValueChange={handleSoundChange}>
              <SelectTrigger id="alert-sound" className="w-full">
                <SelectValue placeholder="Selecione um som de alerta" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {Object.entries(SOUND_NAMES).map(([soundId, soundName]) => (
                  <SelectItem key={soundId} value={soundId}>
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      {soundName}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Ao selecionar um som, ele será reproduzido automaticamente para você ouvir um preview.
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>💡 Dica:</strong> Escolha um som que chame sua atenção imediatamente. Ele será reproduzido toda
              vez que o alerta aparecer e houver domínios suspensos ou expirados na tabela de domínios críticos.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => previewSound(selectedSound)}>
              <Volume2 className="h-4 w-4 mr-2" />
              Ouvir Preview
            </Button>

            <Button onClick={saveSoundPreference}>
              <Check className="h-4 w-4 mr-2" />
              Salvar Preferência de Som
            </Button>
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
          <CardDescription>Crie filtros customizados para plataforma e fonte de tráfego</CardDescription>
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
                  if (e.key === "Enter") {
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
                  <X className="h-3 w-3 cursor-pointer" onClick={() => deleteFilterMutation.mutate(filter.id)} />
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
                  if (e.key === "Enter") {
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
                  <X className="h-3 w-3 cursor-pointer" onClick={() => deleteFilterMutation.mutate(filter.id)} />
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
