import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Bell, Palette, Filter, X, Volume2, Check, Clock, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { ALERT_SOUNDS } from "@/components/CriticalDomainsAlert";
import { Checkbox } from "@/components/ui/checkbox";
import { UserManagement } from "@/components/UserManagement";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// URL da API - usa variável de ambiente em produção, fallback para dev local
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
  { value: "sabado", label: "Sábado" },
  { value: "domingo", label: "Domingo" },
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

// FILTROS PADRÃO DO SISTEMA (sugestões pré-definidas)
const DEFAULT_PLATFORM_FILTERS = ["wordpress", "atomicat"];
const DEFAULT_TRAFFIC_SOURCE_FILTERS = ["facebook", "google", "native", "outbrain", "taboola", "revcontent"];

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("+55 ");
  const [newPlatformFilter, setNewPlatformFilter] = useState("");
  const [newTrafficSourceFilter, setNewTrafficSourceFilter] = useState("");
  const { hasPermission, canEdit } = usePermissions();
  const canCreateFilters = canEdit("can_create_filters");
  const [selectedSound, setSelectedSound] = useState("alert-4");
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedInterval, setSelectedInterval] = useState<number>(6);
  const [selectedFrequency, setSelectedFrequency] = useState<number>(1);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Estados para o AlertDialog de confirmação de remoção
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState<{ id: string; name: string; isDefault: boolean } | null>(null);

  // Estado para armazenar filtros padrão removidos (usando localStorage)
  const [removedDefaultFilters, setRemovedDefaultFilters] = useState<string[]>([]);

  // Carregar filtros removidos do localStorage ao iniciar
  useEffect(() => {
    const stored = localStorage.getItem(`removed_filters_${user?.id}`);
    if (stored) {
      setRemovedDefaultFilters(JSON.parse(stored));
    }
  }, [user?.id]);

  // Verificar e processar confirmação de e-mail da URL
  useEffect(() => {
    const handleEmailConfirmation = async () => {
      console.log("🔍 Verificando confirmação de e-mail...");
      console.log("URL completa:", window.location.href);
      console.log("Hash:", window.location.hash);

      // Verificar se há parâmetros de confirmação na URL (com #)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get("type");
      const accessToken = hashParams.get("access_token");

      console.log("Type:", type);
      console.log("Access Token presente:", !!accessToken);

      // Também verificar query params (com ?)
      const searchParams = new URLSearchParams(window.location.search);
      const typeQuery = searchParams.get("type");
      const accessTokenQuery = searchParams.get("access_token");

      const finalType = type || typeQuery;
      const finalToken = accessToken || accessTokenQuery;

      console.log("Type final:", finalType);
      console.log("Token final presente:", !!finalToken);

      if (finalType === "email_change" && finalToken) {
        console.log("✅ Confirmação de e-mail detectada!");

        try {
          // Aguardar um momento para o Supabase processar
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Pegar a sessão atualizada
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();

          console.log("Sessão atual:", session);
          console.log("Erro de sessão:", sessionError);

          if (sessionError) {
            throw sessionError;
          }

          if (session && session.user) {
            console.log("E-mail na sessão:", session.user.email);
            console.log("User ID:", session.user.id);

            // Atualizar o e-mail na tabela profiles
            const { data: profileData, error: profileError } = await supabase
              .from("profiles")
              .update({ email: session.user.email })
              .eq("id", session.user.id)
              .select();

            console.log("Profile atualizado:", profileData);
            console.log("Erro ao atualizar profile:", profileError);

            if (profileError) {
              console.error("❌ Erro ao atualizar perfil:", profileError);
              throw profileError;
            }

            // Invalidar queries para atualizar dados
            await queryClient.invalidateQueries({ queryKey: ["profile", session.user.id] });

            // Limpar a URL (remove os parâmetros)
            window.history.replaceState({}, document.title, "/settings");

            // Mostrar mensagem de sucesso
            toast({
              title: "✅ E-mail confirmado!",
              description: `Seu e-mail foi alterado para ${session.user.email} com sucesso!`,
            });

            // Atualizar o campo de e-mail no formulário
            setNewEmail(session.user.email || "");

            console.log("✅ Processo de confirmação concluído!");
          } else {
            console.error("❌ Sessão não encontrada");
            throw new Error("Sessão não encontrada após confirmação");
          }
        } catch (error: any) {
          console.error("❌ Erro ao processar confirmação de e-mail:", error);
          toast({
            title: "Erro na confirmação",
            description: error.message || "Erro ao processar confirmação de e-mail. Faça login novamente.",
            variant: "destructive",
          });
        }
      } else {
        console.log("ℹ️ Nenhuma confirmação de e-mail detectada");
      }
    };

    // Executar com um pequeno delay para garantir que a página carregou
    const timer = setTimeout(() => {
      handleEmailConfirmation();
    }, 500);

    return () => clearTimeout(timer);
  }, [queryClient, toast]);

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
      return data;
    },
    enabled: !!user?.id,
  });

  // useEffect para carregar dados do perfil quando profile mudar
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");

      // Garantir que sempre tenha +55
      if (profile.whatsapp_number) {
        const cleanNumber = profile.whatsapp_number.replace(/\D/g, "");
        if (cleanNumber.startsWith("55")) {
          setWhatsappNumber(`+${cleanNumber}`);
        } else {
          setWhatsappNumber(`+55${cleanNumber}`);
        }
      } else {
        setWhatsappNumber("+55 ");
      }

      setSelectedSound(profile.alert_sound_preference || "alert-4");
    }

    // Atualizar email do auth
    if (user?.email) {
      setNewEmail(user.email);
    }
  }, [profile, user?.email]);

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
      return data;
    },
    enabled: !!user?.id,
  });

  // useEffect para carregar configurações de recorrência
  useEffect(() => {
    if (notificationSettings) {
      setSelectedDays(notificationSettings.notification_days || []);
      setSelectedInterval(notificationSettings.notification_interval_hours || 6);
      setSelectedFrequency(notificationSettings.notification_frequency || 1);
    }
  }, [notificationSettings]);

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

  // Separar filtros customizados por tipo
  const customPlatformFilters = customFilters.filter((f) => f.filter_type === "platform");
  const customTrafficSourceFilters = customFilters.filter((f) => f.filter_type === "traffic_source");

  // COMBINAR FILTROS PADRÃO + CUSTOMIZADOS (todos removíveis, excluindo os removidos pelo usuário)
  const allPlatformFilters = [
    ...DEFAULT_PLATFORM_FILTERS.filter((value) => !removedDefaultFilters.includes(`platform_${value}`)).map(
      (value) => ({
        id: `default_${value}`,
        filter_value: value,
        is_default: true,
      }),
    ),
    ...customPlatformFilters.map((f) => ({
      ...f,
      is_default: false,
    })),
  ];

  const allTrafficSourceFilters = [
    ...DEFAULT_TRAFFIC_SOURCE_FILTERS.filter((value) => !removedDefaultFilters.includes(`traffic_source_${value}`)).map(
      (value) => ({
        id: `default_${value}`,
        filter_value: value,
        is_default: true,
      }),
    ),
    ...customTrafficSourceFilters.map((f) => ({
      ...f,
      is_default: false,
    })),
  ];

  // Validar número de WhatsApp em tempo real

  // Função para formatar número enquanto digita
  const formatWhatsAppNumber = (value: string): string => {
    // Manter apenas números
    const numbers = value.replace(/\D/g, "");

    // Garantir que sempre comece com 55
    let formatted = "+55";

    if (numbers.length > 2) {
      const rest = numbers.substring(2);

      // Adicionar espaço após +55
      if (rest.length > 0) {
        formatted += " ";

        // Adicionar DDD (2 dígitos)
        if (rest.length <= 2) {
          formatted += rest;
        } else {
          formatted += rest.substring(0, 2);

          // Adicionar número
          const phoneNumber = rest.substring(2);
          if (phoneNumber.length > 0) {
            formatted += " ";

            // Adicionar primeira parte (5 dígitos se celular, 4 se fixo)
            if (phoneNumber.length <= 5) {
              formatted += phoneNumber;
            } else {
              formatted += phoneNumber.substring(0, 5) + "-" + phoneNumber.substring(5, 9);
            }
          }
        }
      }
    }

    return formatted;
  };

  // Handler para mudanças no input de WhatsApp
  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Impedir que o usuário apague o +55
    if (value.length < 3) {
      setWhatsappNumber("+55 ");
      return;
    }

    // Formatar o número
    const formatted = formatWhatsAppNumber(value);
    setWhatsappNumber(formatted);
  };

  // Update profile mutation (sem WhatsApp)
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
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

  // Update WhatsApp number mutation
  const updateWhatsAppMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          whatsapp_number: whatsappNumber,
        })
        .eq("id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast({
        title: "Sucesso",
        description: "Número do WhatsApp atualizado com sucesso!",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar número do WhatsApp",
        variant: "destructive",
      });
    },
  });

  // Update email mutation
  const updateEmailMutation = useMutation({
    mutationFn: async () => {
      // Obter a URL base da aplicação (produção ou desenvolvimento)
      const siteUrl = window.location.origin;

      const { data, error: authError } = await supabase.auth.updateUser(
        {
          email: newEmail,
        },
        {
          emailRedirectTo: `${siteUrl}/settings`,
        },
      );

      if (authError) throw authError;

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Verificação enviada!",
        description: "Verifique seu NOVO e-mail para confirmar a alteração. O link de confirmação expira em 24 horas.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar e-mail",
        variant: "destructive",
      });
    },
  });

  // Update password mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async () => {
      // Validar senha atual
      if (!currentPassword) {
        throw new Error("Digite sua senha atual");
      }

      if (!newPassword || !confirmPassword) {
        throw new Error("Digite a nova senha e confirmação");
      }

      if (newPassword !== confirmPassword) {
        throw new Error("As senhas não coincidem");
      }

      if (newPassword.length < 6) {
        throw new Error("A nova senha deve ter pelo menos 6 caracteres");
      }

      // Verificar senha atual
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Senha atual incorreta");
      }

      // Atualizar senha
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Sucesso",
        description: "Senha alterada com sucesso!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao alterar senha",
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

  // Add custom filter mutation com validação de duplicatas
  const addFilterMutation = useMutation({
    mutationFn: async ({ filter_type, filter_value }: { filter_type: string; filter_value: string }) => {
      const normalizedValue = filter_value.trim().toLowerCase();

      // Verificar se já existe nos filtros padrão
      if (filter_type === "platform" && DEFAULT_PLATFORM_FILTERS.some((f) => f.toLowerCase() === normalizedValue)) {
        throw new Error("Este filtro já existe no sistema");
      }

      if (
        filter_type === "traffic_source" &&
        DEFAULT_TRAFFIC_SOURCE_FILTERS.some((f) => f.toLowerCase() === normalizedValue)
      ) {
        throw new Error("Este filtro já existe no sistema");
      }

      // Verificar se já existe nos filtros customizados
      const existingCustomFilters = customFilters.filter((f) => f.filter_type === filter_type);
      if (existingCustomFilters.some((f) => f.filter_value.toLowerCase() === normalizedValue)) {
        throw new Error("Este filtro já existe");
      }

      const { error } = await supabase.from("custom_filters").insert({
        user_id: user?.id,
        filter_type,
        filter_value: filter_value.trim(),
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
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao adicionar filtro",
        variant: "destructive",
      });
    },
  });

  // Delete filter mutation (para filtros customizados)
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
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao remover filtro",
        variant: "destructive",
      });
    },
  });

  // Função para remover filtro padrão (salvar no localStorage)
  const removeDefaultFilter = (filterName: string, filterType: string) => {
    const key = `${filterType}_${filterName}`;
    const updated = [...removedDefaultFilters, key];
    setRemovedDefaultFilters(updated);
    localStorage.setItem(`removed_filters_${user?.id}`, JSON.stringify(updated));

    toast({
      title: "Sucesso",
      description: "Filtro removido com sucesso!",
    });
  };

  const handleSaveProfile = async () => {
    await updateProfileMutation.mutateAsync();
  };

  const handleSaveWhatsApp = async () => {
    await updateWhatsAppMutation.mutateAsync();
  };

  const handleUpdateEmail = async () => {
    if (!newEmail || newEmail === user?.email) {
      toast({
        title: "Atenção",
        description: "Digite um novo e-mail diferente do atual",
        variant: "destructive",
      });
      return;
    }
    await updateEmailMutation.mutateAsync();
  };

  const handleUpdatePassword = async () => {
    await updatePasswordMutation.mutateAsync();
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

  // Função para abrir dialog de confirmação
  const openDeleteDialog = (id: string, name: string, isDefault: boolean) => {
    setFilterToDelete({ id, name, isDefault });
    setDeleteDialogOpen(true);
  };

  // Função para confirmar remoção
  const confirmDelete = () => {
    if (filterToDelete) {
      if (filterToDelete.isDefault) {
        // Remover filtro padrão (localStorage)
        const filterType = allPlatformFilters.some((f) => f.filter_value === filterToDelete.name)
          ? "platform"
          : "traffic_source";
        removeDefaultFilter(filterToDelete.name, filterType);
      } else {
        // Remover filtro customizado (banco de dados)
        deleteFilterMutation.mutate(filterToDelete.id);
      }
    }
    setDeleteDialogOpen(false);
    setFilterToDelete(null);
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

  // Salvar configurações de recorrência COM envio de notificação de teste
  const handleSaveRecurrence = async () => {
    if (selectedDays.length === 0) {
      toast({
        title: "Atenção",
        description: "Selecione pelo menos um dia da semana",
        variant: "destructive",
      });
      return;
    }

    // Salvar WhatsApp primeiro
    if (!whatsappNumber || whatsappNumber === "+55 ") {
      toast({
        title: "Atenção",
        description: "Digite um número de WhatsApp válido antes de salvar as configurações",
        variant: "destructive",
      });
      return;
    }

    try {
      // Atualizar WhatsApp
      await updateWhatsAppMutation.mutateAsync();

      // Atualizar configurações de recorrência
      await updateNotificationMutation.mutateAsync({
        alert_suspended: notificationSettings?.alert_suspended ?? false,
        alert_expired: notificationSettings?.alert_expired ?? false,
        alert_expiring_soon: notificationSettings?.alert_expiring_soon ?? false,
        notification_days: selectedDays,
        notification_interval_hours: selectedInterval,
        notification_frequency: selectedFrequency,
      });

      // Enviar notificação de teste via API Node.js
      try {
        const response = await fetch(`${API_URL}/api/test-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phoneNumber: whatsappNumber,
            userId: user?.id,
          }),
        });

        const data = await response.json();

        if (data.success) {
          toast({
            title: "✅ Configurações Salvas!",
            description: "Uma mensagem de teste foi enviada para seu WhatsApp!",
          });
        } else {
          throw new Error(data.error || "Erro ao enviar notificação");
        }
      } catch (apiError: any) {
        console.error("Erro ao enviar notificação de teste:", apiError);
        toast({
          title: "⚠️ Configurações Salvas",
          description: "Configurações salvas, mas não foi possível enviar notificação de teste",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      toast({
        title: "Erro",
        description: "Erro ao salvar configurações de recorrência",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">Gerencie suas preferências e configurações da conta</p>
        </div>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Perfil
          </CardTitle>
          <CardDescription>Informações básicas da sua conta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome Completo</Label>
            <Input
              id="fullName"
              placeholder="Seu nome completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveProfile}>Salvar Nome</Button>
        </CardContent>
      </Card>

      {/* WhatsApp Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            WhatsApp
          </CardTitle>
          <CardDescription>Número para receber notificações via WhatsApp</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsappNumber">Número do WhatsApp</Label>
            <Input
              id="whatsappNumber"
              type="tel"
              placeholder="+55 11 91234-5678"
              value={whatsappNumber}
              onChange={handleWhatsappChange}
              maxLength={20}
            />
            <p className="text-sm text-muted-foreground">Formato: +55 DDD 9XXXX-XXXX</p>
          </div>
          <Button onClick={handleSaveWhatsApp}>Salvar WhatsApp</Button>
        </CardContent>
      </Card>

      {/* Email and Password Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            E-mail e Senha
          </CardTitle>
          <CardDescription>Altere seu e-mail ou senha de acesso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentEmail">E-mail Atual</Label>
              <Input id="currentEmail" type="email" value={user?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newEmail">Novo E-mail</Label>
              <Input
                id="newEmail"
                type="email"
                placeholder="novo@email.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Você receberá um link de confirmação no NOVO e-mail. Clique no link para confirmar a alteração.
              </p>
            </div>
            <Button onClick={handleUpdateEmail}>Alterar E-mail</Button>
          </div>

          <Separator />

          {/* Password Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Senha Atual</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button onClick={handleUpdatePassword}>Alterar Senha</Button>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Aparência
          </CardTitle>
          <CardDescription>Personalize a interface do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Modo Escuro</Label>
              <p className="text-sm text-muted-foreground">Alternar entre tema claro e escuro</p>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
          </div>
        </CardContent>
      </Card>

      {/* Notifications Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações
          </CardTitle>
          <CardDescription>Configure quando deseja receber alertas de domínios</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Domínios Suspensos</Label>
                <p className="text-sm text-muted-foreground">Alerta quando um domínio for suspenso</p>
              </div>
              <Switch
                checked={notificationSettings?.alert_suspended ?? false}
                onCheckedChange={(checked) =>
                  updateNotificationMutation.mutate({
                    alert_suspended: checked,
                    alert_expired: notificationSettings?.alert_expired ?? false,
                    alert_expiring_soon: notificationSettings?.alert_expiring_soon ?? false,
                  })
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Domínios Expirados</Label>
                <p className="text-sm text-muted-foreground">Alerta quando um domínio expirar</p>
              </div>
              <Switch
                checked={notificationSettings?.alert_expired ?? false}
                onCheckedChange={(checked) =>
                  updateNotificationMutation.mutate({
                    alert_suspended: notificationSettings?.alert_suspended ?? false,
                    alert_expired: checked,
                    alert_expiring_soon: notificationSettings?.alert_expiring_soon ?? false,
                  })
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Domínios Próximos do Vencimento</Label>
                <p className="text-sm text-muted-foreground">Alerta quando faltarem 30 dias para vencer</p>
              </div>
              <Switch
                checked={notificationSettings?.alert_expiring_soon ?? false}
                onCheckedChange={(checked) =>
                  updateNotificationMutation.mutate({
                    alert_suspended: notificationSettings?.alert_suspended ?? false,
                    alert_expired: notificationSettings?.alert_expired ?? false,
                    alert_expiring_soon: checked,
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Recurrence Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recorrência de Notificações
          </CardTitle>
          <CardDescription>Configure quando e com que frequência deseja receber notificações</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-base">Dias da Semana</Label>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((day) => (
                  <Button
                    key={day.value}
                    variant={selectedDays.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDay(day.value)}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">Selecione os dias em que deseja receber notificações</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="interval" className="text-base">
                Intervalo de Notificações
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
              <p className="text-sm text-muted-foreground">
                Com que frequência deseja verificar se há domínios críticos
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="frequency" className="text-base">
                Frequência Diária
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

      {/* Custom Filters - MANTIDO O LAYOUT ORIGINAL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Criação de Filtros
          </CardTitle>
          <CardDescription>Crie filtros customizados para plataforma e fonte de tráfego</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {hasPermission("can_create_filters") && (
            <>
              {/* Platform Filters */}
              <div className="space-y-3">
                <Label>Plataformas</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova plataforma"
                    value={newPlatformFilter}
                    onChange={(e) => setNewPlatformFilter(e.target.value)}
                    disabled={!canCreateFilters}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        canCreateFilters && handleAddPlatformFilter();
                      }
                    }}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            onClick={() => canCreateFilters && handleAddPlatformFilter()}
                            disabled={addFilterMutation.isPending || !newPlatformFilter.trim() || !canCreateFilters}
                          >
                            Adicionar
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!canCreateFilters && (
                        <TooltipContent>
                          <p>Você não tem permissão para criar filtros</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allPlatformFilters.map((filter) => (
                    <Badge key={filter.id} variant="secondary" className="gap-1">
                      {filter.filter_value}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => openDeleteDialog(filter.id, filter.filter_value, filter.is_default)}
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
                    disabled={!canCreateFilters}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        canCreateFilters && handleAddTrafficSourceFilter();
                      }
                    }}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            onClick={() => canCreateFilters && handleAddTrafficSourceFilter()}
                            disabled={
                              addFilterMutation.isPending || !newTrafficSourceFilter.trim() || !canCreateFilters
                            }
                          >
                            Adicionar
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!canCreateFilters && (
                        <TooltipContent>
                          <p>Você não tem permissão para criar filtros</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allTrafficSourceFilters.map((filter) => (
                    <Badge key={filter.id} variant="secondary" className="gap-1">
                      {filter.filter_value}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => openDeleteDialog(filter.id, filter.filter_value, filter.is_default)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Gerenciamento de Usuários */}
      <UserManagement />

      {/* AlertDialog para confirmação de remoção */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Tem certeza que deseja remover o filtro <strong>"{filterToDelete?.name}"</strong>?
              {filterToDelete?.isDefault && (
                <span className="block mt-2 text-orange-600 dark:text-orange-400">
                  Este é um filtro padrão do sistema. Você poderá adicioná-lo novamente depois se necessário.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
