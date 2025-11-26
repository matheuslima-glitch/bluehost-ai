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

// FILTROS PADRÃO DO SISTEMA (sugestões pré-definidas - removíveis)
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
  const { data: profile, isLoading: profileLoading } = useQuery({
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
    staleTime: 5 * 60 * 1000, // 5 minutos
    refetchOnWindowFocus: false,
  });

  // useEffect para carregar dados do perfil quando profile mudar
  useEffect(() => {
    // Só atualizar se profile realmente existir (evita limpar dados na primeira renderização)
    if (profile && typeof profile === "object") {
      // Só atualizar fullName se o profile tiver um valor diferente do estado atual
      if (profile.full_name !== undefined) {
        setFullName(profile.full_name || "");
      }

      // Só atualizar whatsappNumber se o profile tiver um valor
      // IMPORTANTE: Usar o valor DIRETO do banco (já vem formatado: "+55 11 99999-9999")
      if (profile.whatsapp_number && profile.whatsapp_number !== "+55 ") {
        setWhatsappNumber(profile.whatsapp_number);
      }

      // Só atualizar selectedSound se o profile tiver um valor
      if (profile.alert_sound_preference) {
        setSelectedSound(profile.alert_sound_preference);
      }
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

  // Para compatibilidade com o código existente que usa platformFilters e trafficSourceFilters
  const platformFilters = customPlatformFilters;
  const trafficSourceFilters = customTrafficSourceFilters;

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

      // Não invalida as queries ainda, isso será feito após a confirmação
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
      // Validações
      if (!currentPassword) {
        throw new Error("Por favor, digite sua senha atual");
      }

      if (!newPassword || !confirmPassword) {
        throw new Error("Por favor, preencha todos os campos de senha");
      }

      if (newPassword !== confirmPassword) {
        throw new Error("As senhas não coincidem");
      }

      if (newPassword.length < 6) {
        throw new Error("A senha deve ter pelo menos 6 caracteres");
      }

      // Primeiro, validar a senha atual fazendo login
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Senha atual incorreta");
      }

      // Se a senha atual estiver correta, atualizar para a nova senha
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
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

  // Add custom filter mutation
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
    try {
      await updateWhatsAppMutation.mutateAsync();
    } catch (error) {
      console.error("Erro ao salvar WhatsApp:", error);
      return;
    }

    // Salvar configurações de recorrência
    updateNotificationMutation.mutate({
      alert_suspended: notificationSettings?.alert_suspended || false,
      alert_expired: notificationSettings?.alert_expired || false,
      alert_expiring_soon: notificationSettings?.alert_expiring_soon || false,
      notification_days: selectedDays,
      notification_interval_hours: selectedInterval,
      notification_frequency: selectedFrequency,
    });

    // Enviar notificação de teste se tem WhatsApp configurado
    if (whatsappNumber && whatsappNumber.length > 10) {
      toast({
        title: "Enviando notificação de teste...",
        description: "Aguarde alguns instantes",
      });

      try {
        const response = await fetch(`${API_URL}/api/whatsapp/send-test-alert`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user?.id,
          }),
        });

        const data = await response.json();

        if (data.success) {
          toast({
            title: "✅ Notificação enviada!",
            description: `Verifique seu WhatsApp! ${data.alertsSent || 0} alerta(s) enviado(s)`,
          });
        } else {
          toast({
            title: "Erro ao enviar notificação",
            description: data.message || "Tente novamente mais tarde",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Erro ao enviar notificação de teste:", error);
        toast({
          title: "Erro ao enviar notificação",
          description: "Verifique se o número está correto e tente novamente",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="container max-w-5xl mx-auto py-10 space-y-6">
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
              value={fullName || profile?.full_name || ""}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
            {updateProfileMutation.isPending ? "Salvando..." : "Salvar Nome"}
          </Button>

          <Separator className="my-6" />

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="Digite seu novo e-mail"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <Button onClick={handleUpdateEmail} disabled={updateEmailMutation.isPending}>
            {updateEmailMutation.isPending ? "Atualizando..." : "Atualizar E-mail"}
          </Button>

          <Separator className="my-6" />

          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Redefinir Senha</h3>
              <p className="text-sm text-muted-foreground">
                Para sua segurança, insira sua senha atual antes de definir uma nova senha.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="current-password">Senha Atual</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  placeholder="Digite sua senha atual"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onMouseDown={() => setShowCurrentPassword(true)}
                  onMouseUp={() => setShowCurrentPassword(false)}
                  onMouseLeave={() => setShowCurrentPassword(false)}
                  onTouchStart={() => setShowCurrentPassword(true)}
                  onTouchEnd={() => setShowCurrentPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Digite sua nova senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onMouseDown={() => setShowNewPassword(true)}
                  onMouseUp={() => setShowNewPassword(false)}
                  onMouseLeave={() => setShowNewPassword(false)}
                  onTouchStart={() => setShowNewPassword(true)}
                  onTouchEnd={() => setShowNewPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirme sua nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onMouseDown={() => setShowConfirmPassword(true)}
                  onMouseUp={() => setShowConfirmPassword(false)}
                  onMouseLeave={() => setShowConfirmPassword(false)}
                  onTouchStart={() => setShowConfirmPassword(true)}
                  onTouchEnd={() => setShowConfirmPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button onClick={handleUpdatePassword} disabled={updatePasswordMutation.isPending}>
              {updatePasswordMutation.isPending ? "Alterando..." : "Alterar Senha"}
            </Button>
          </div>
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
          {/* Campo de WhatsApp dentro do card de notificações */}
          <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
            <Label htmlFor="whatsapp">Número do WhatsApp</Label>
            <Input
              id="whatsapp"
              placeholder="+55 19 98932-0129"
              value={whatsappNumber && whatsappNumber !== "+55 " ? whatsappNumber : profile?.whatsapp_number || "+55 "}
              onChange={handleWhatsappChange}
              maxLength={19}
            />
            <p className="text-sm text-muted-foreground">
              💡 Ao salvar, você receberá uma mensagem de teste com os alertas dos seus domínios
            </p>
          </div>

          <Separator />

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
