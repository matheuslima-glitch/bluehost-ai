import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Globe,
  Calendar,
  TrendingUp,
  Server,
  Wifi,
  X,
  Plus,
  Trash2,
  Edit2,
  Info,
  AlertTriangle,
  Lock,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { usePermissions } from "@/hooks/usePermissions";

interface Domain {
  id: string;
  domain_name: string;
  status: string;
  platform: string | null;
  traffic_source: string | null;
  purchase_date: string | null;
  expiration_date: string | null;
  monthly_visits: number;
  registrar: string | null;
  funnel_id: string | null;
  zone_id: string | null;
  nameservers: string[] | null;
  manually_deactivated?: boolean | null;
}

interface ActivityLog {
  id: string;
  action_type: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
}

export default function DomainDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { hasPermission, canEdit } = usePermissions();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [funnelIdInput, setFunnelIdInput] = useState("");
  const [funnelIdTags, setFunnelIdTags] = useState<string[]>([]);
  const [isEditingNameservers, setIsEditingNameservers] = useState(false);
  const [nameserversList, setNameserversList] = useState<string[]>(["", ""]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

  // Fetch custom filters from database
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

  // Combine default and custom filters
  const platformOptions = [
    "wordpress",
    "atomicat",
    ...customFilters.filter((f) => f.filter_type === "platform").map((f) => f.filter_value),
  ];

  const trafficSourceOptions = [
    "facebook",
    "google",
    "native",
    "outbrain",
    "taboola",
    "revcontent",
    ...customFilters.filter((f) => f.filter_type === "traffic_source").map((f) => f.filter_value),
  ];

  // Carregar dados de analytics do Supabase
  const loadAnalyticsData = async () => {
    if (!domain?.domain_name && !domain?.zone_id) return;

    setLoadingAnalytics(true);
    try {
      let data = null;
      let error = null;

      // Tentar buscar por domain_name primeiro
      if (domain.domain_name) {
        const result = await supabase
          .from("domain_analytics")
          .select("*")
          .eq("domain_name", domain.domain_name)
          .maybeSingle();

        data = result.data;
        error = result.error;
      }

      // Se não encontrou por domain_name, tentar por zone_id
      if (!data && domain.zone_id) {
        const result = await supabase.from("domain_analytics").select("*").eq("zone_id", domain.zone_id).maybeSingle();

        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error("Error loading analytics:", error);
        setAnalyticsData([]);
        return;
      }

      if (data) {
        // Obter mês e ano atual
        const now = new Date();
        const currentMonth = now.getMonth(); // 0-11
        const currentYear = now.getFullYear();

        // Nomes dos meses em INGLÊS (como estão no Supabase)
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

        const chartData = [];

        // Gerar os últimos 12 meses
        for (let i = 11; i >= 0; i--) {
          const targetDate = new Date(currentYear, currentMonth - i, 1);
          const targetMonth = targetDate.getMonth(); // 0-11
          const targetYear = targetDate.getFullYear();
          const monthKey = monthNames[targetMonth];

          // Determinar se é do ano anterior (PY) ou ano atual (CY)
          const isCurrentYear = targetYear === currentYear;
          const columnSuffix = isCurrentYear ? "cy" : "py";
          const columnName = `${monthKey}_${columnSuffix}`;

          // Label com mês/ano
          const label = `${monthLabels[targetMonth]}/${String(targetYear).slice(-2)}`;

          chartData.push({
            month: label,
            visitas: data[columnName] || 0,
          });
        }

        setAnalyticsData(chartData);
      }
    } catch (error: any) {
      console.error("Error loading analytics:", error);
      toast.error("Erro ao carregar dados de analytics");
      setAnalyticsData([]);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    loadDomain();
  }, [id]);

  useEffect(() => {
    if (domain?.funnel_id) {
      setFunnelIdTags(domain.funnel_id.split(",").filter((tag) => tag.trim() !== ""));
    }
  }, [domain]);

  useEffect(() => {
    if (domain) {
      loadAnalyticsData();
    }
  }, [domain]);

  const loadActivityLogs = async () => {
    if (!id) return;

    setLoadingLogs(true);
    try {
      // Buscar logs primeiro
      const { data: logsData, error: logsError } = await supabase
        .from("domain_activity_logs")
        .select("*")
        .eq("domain_id", id)
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;

      // Buscar informações dos usuários (apenas para user_ids não nulos)
      const userIds = [...new Set(logsData?.map((log) => log.user_id).filter((id) => id !== null) || [])];

      let profilesData: any[] = [];
      if (userIds.length > 0) {
        const { data, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        if (profilesError) throw profilesError;
        profilesData = data || [];
      }

      // Combinar dados - usar user_name salvo quando user_id é NULL (usuário excluído)
      const logsWithProfiles =
        logsData?.map((log) => {
          const profile = log.user_id ? profilesData?.find((p) => p.id === log.user_id) : null;

          return {
            ...log,
            profiles: profile || (log.user_name ? { full_name: log.user_name, email: null } : null),
          };
        }) || [];

      setActivityLogs(logsWithProfiles);
    } catch (error: any) {
      console.error("Error loading activity logs:", error);
      toast.error("Erro ao carregar logs de atividade");
    } finally {
      setLoadingLogs(false);
    }
  };

  const logActivity = async (actionType: string, oldValue: string | null, newValue: string | null) => {
    if (!id || !user?.id) return;

    try {
      const { error } = await supabase.from("domain_activity_logs").insert({
        domain_id: id,
        user_id: user.id,
        action_type: actionType,
        old_value: oldValue,
        new_value: newValue,
      });

      if (error) throw error;
    } catch (error: any) {
      console.error("Error logging activity:", error);
    }
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      nameservers_updated: "Nameservers atualizados",
      platform_updated: "Plataforma alterada",
      traffic_source_updated: "Fonte de tráfego alterada",
      funnel_id_added: "ID do funil adicionado",
      funnel_id_removed: "ID do funil removido",
      status_changed: "Status alterado",
    };
    return labels[actionType] || actionType;
  };

  const loadDomain = async () => {
    try {
      const { data, error } = await supabase.from("domains").select("*").eq("id", id).single();

      if (error) throw error;

      setDomain(data);

      // Inicializar nameservers input quando carregar o domínio
      if (data?.nameservers && data.nameservers.length > 0) {
        setNameserversList(data.nameservers);
      } else {
        setNameserversList(["", ""]);
      }
    } catch (error: any) {
      toast.error("Erro ao carregar domínio");
      console.error("Error loading domain:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateNameservers = useMutation({
    mutationFn: async (nameservers: string[]) => {
      const oldNameservers = domain?.nameservers?.join(", ") || null;
      const newNameservers = nameservers.join(", ");

      // ═══════════════════════════════════════════════════════════════
      // ETAPA 1: Atualizar na Namecheap via Backend
      // ═══════════════════════════════════════════════════════════════

      console.log("📤 Atualizando nameservers na Namecheap...");

      const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://domainhub-backend.onrender.com";

      const namecheapResponse = await fetch(`${backendUrl}/api/domains/nameservers/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domainName: domain?.domain_name,
          nameservers: nameservers,
        }),
      });

      const namecheapData = await namecheapResponse.json();

      if (!namecheapData.success) {
        throw new Error(namecheapData.error || "Erro ao atualizar nameservers na Namecheap");
      }

      console.log("✅ Nameservers atualizados na Namecheap:", namecheapData.data);

      // ═══════════════════════════════════════════════════════════════
      // ETAPA 2: Atualizar no Supabase (banco de dados local)
      // ═══════════════════════════════════════════════════════════════

      console.log("💾 Salvando no banco de dados...");

      const { error } = await supabase.from("domains").update({ nameservers }).eq("id", id);

      if (error) throw error;

      // Log da atividade
      await logActivity("nameservers_updated", oldNameservers, newNameservers);

      console.log("✅ Nameservers salvos no banco de dados");
    },
    onSuccess: () => {
      loadDomain();
      toast.success("Nameservers atualizados com sucesso na Namecheap e no banco de dados!");
      toast.info("⏰ A mudança de nameservers pode levar até 48 horas para propagar completamente.", {
        duration: 6000,
      });
      setIsEditingNameservers(false);
    },
    onError: (error: any) => {
      console.error("❌ Erro ao atualizar nameservers:", error);
      toast.error("Erro ao atualizar nameservers: " + error.message);
    },
  });

  const handleSaveNameservers = () => {
    // Verificar permissão antes de salvar
    if (!canEdit("can_change_nameservers")) {
      toast.error("Você não tem permissão para alterar nameservers");
      return;
    }

    const nameservers = nameserversList.map((ns) => ns.trim()).filter((ns) => ns.length > 0);

    if (nameservers.length < 2) {
      toast.error("Adicione pelo menos 2 nameservers");
      return;
    }

    if (nameservers.length > 12) {
      toast.error("Máximo de 12 nameservers permitidos");
      return;
    }

    updateNameservers.mutate(nameservers);
  };

  const handleAddNameserver = () => {
    if (nameserversList.length < 12) {
      setNameserversList([...nameserversList, ""]);
    } else {
      toast.warning("Máximo de 12 nameservers atingido");
    }
  };

  const handleRemoveNameserver = (index: number) => {
    if (nameserversList.length > 2) {
      const newList = nameserversList.filter((_, i) => i !== index);
      setNameserversList(newList);
    } else {
      toast.warning("Mínimo de 2 nameservers necessário");
    }
  };

  const handleNameserverChange = (index: number, value: string) => {
    const newList = [...nameserversList];
    newList[index] = value;
    setNameserversList(newList);
  };

  /**
   * Define DNS predefinido da Namecheap (BasicDNS)
   */
  const handleSetNamecheapDNS = async (dnsType: "BasicDNS") => {
    if (!domain) return;

    // Verificar permissão antes de executar
    if (!canEdit("can_change_nameservers")) {
      toast.error("Você não tem permissão para alterar nameservers");
      return;
    }

    const dnsTypeLabel = "Namecheap BasicDNS";

    try {
      console.log(`📤 Configurando ${dnsTypeLabel} para ${domain.domain_name}...`);

      const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://domainhub-backend.onrender.com";

      const response = await fetch(`${backendUrl}/api/domains/nameservers/set-default`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domainName: domain.domain_name,
          dnsType: dnsType,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || `Erro ao configurar ${dnsTypeLabel}`);
      }

      console.log(`✅ ${dnsTypeLabel} configurado:`, data.data);

      toast.success(`${dnsTypeLabel} configurado com sucesso!`);
      toast.info("A mudança de nameservers pode levar até 48 horas para propagar completamente.", {
        duration: 6000,
      });

      // Registrar log de atividade
      const oldNameservers = domain?.nameservers?.join(", ") || null;
      await logActivity("nameservers_updated", oldNameservers, dnsTypeLabel);

      // Recarregar domínio para atualizar nameservers
      await loadDomain();
    } catch (error: any) {
      console.error(`❌ Erro ao configurar ${dnsTypeLabel}:`, error);
      toast.error(`Erro ao configurar ${dnsTypeLabel}: ${error.message}`);
    }
  };

  const handleDeactivateDomain = async () => {
    if (!domain) return;

    // Verificar permissão antes de desativar
    if (!canEdit("can_change_domain_status")) {
      toast.error("Você não tem permissão para alterar o status do domínio");
      return;
    }

    try {
      const oldStatus = domain.status;

      const { error } = await supabase
        .from("domains")
        .update({
          status: "deactivated",
          manually_deactivated: true,
        })
        .eq("id", domain.id);

      if (error) throw error;

      // Atualizar o estado local
      setDomain({ ...domain, status: "deactivated", manually_deactivated: true });
      setDeactivateDialogOpen(false);

      // Log da atividade
      await logActivity("status_changed", oldStatus, "deactivated");

      toast.success("Domínio desativado com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao desativar domínio: " + error.message);
    }
  };

  const updateDomain = async (field: string, value: string) => {
    if (!domain) return;

    // Verificar permissões específicas por campo
    if (field === "platform" && !canEdit("can_select_platform")) {
      toast.error("Você não tem permissão para alterar a plataforma");
      return;
    }

    if (field === "traffic_source" && !canEdit("can_select_traffic_source")) {
      toast.error("Você não tem permissão para alterar a fonte de tráfego");
      return;
    }

    if (field === "status" && !canEdit("can_change_domain_status")) {
      toast.error("Você não tem permissão para alterar o status");
      return;
    }

    const oldValue = domain[field as keyof Domain] as string | null;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("domains")
        .update({ [field]: value })
        .eq("id", domain.id);

      if (error) throw error;

      setDomain({ ...domain, [field]: value });
      toast.success("Informação atualizada com sucesso");

      // Log da atividade
      let actionType = "";
      if (field === "platform") actionType = "platform_updated";
      else if (field === "traffic_source") actionType = "traffic_source_updated";
      else if (field === "status") actionType = "status_changed";

      if (actionType) {
        await logActivity(actionType, oldValue, value);
      }
    } catch (error: any) {
      toast.error("Erro ao atualizar informação");
      console.error("Error updating domain:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleFunnelIdKeyPress = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && funnelIdInput.trim() !== "") {
      // Verificar permissão antes de adicionar
      if (!canEdit("can_insert_funnel_id")) {
        toast.error("Você não tem permissão para adicionar IDs de funil");
        return;
      }

      e.preventDefault();
      const newTag = funnelIdInput.trim();
      const newTags = [...funnelIdTags, newTag];
      setFunnelIdTags(newTags);
      setFunnelIdInput("");
      await updateDomain("funnel_id", newTags.join(","));

      // Log da atividade
      await logActivity("funnel_id_added", null, newTag);
    }
  };

  const removeFunnelIdTag = async (tagToRemove: string) => {
    // Verificar permissão antes de remover
    if (!canEdit("can_insert_funnel_id")) {
      toast.error("Você não tem permissão para remover IDs de funil");
      return;
    }

    const newTags = funnelIdTags.filter((tag) => tag !== tagToRemove);
    setFunnelIdTags(newTags);
    await updateDomain("funnel_id", newTags.join(","));

    // Log da atividade
    await logActivity("funnel_id_removed", tagToRemove, null);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      active: { label: "Ativo", className: "bg-green-500 text-white hover:bg-green-600 transition-colors" },
      expired: { label: "Expirado", className: "bg-red-500 text-white hover:bg-red-600 transition-colors" },
      pending: { label: "Pendente", className: "bg-blue-500 text-white hover:bg-blue-600 transition-colors" },
      suspended: { label: "Suspenso", className: "bg-orange-500 text-white hover:bg-orange-600 transition-colors" },
      deactivated: { label: "Desativado", className: "bg-gray-400 text-white dark:bg-gray-600" },
    };

    const config = statusConfig[status.toLowerCase()] || statusConfig.active;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!domain) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Domínio não encontrado</p>
        <Button onClick={() => navigate("/domains")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Gerenciamento
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate("/domains")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Globe className="h-8 w-8" />
                {domain.domain_name}
              </h1>
              <p className="text-muted-foreground">Detalhes do domínio</p>
            </div>
          </div>

          {hasPermission("can_view_logs") && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10" onClick={loadActivityLogs}>
                  <Info className="h-5 w-5 text-blue-500" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Logs de Atividade</DialogTitle>
                  <DialogDescription>Histórico de alterações realizadas neste domínio</DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[500px] pr-4">
                  {loadingLogs ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : activityLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma atividade registrada para este domínio
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activityLogs.map((log) => (
                        <div
                          key={log.id}
                          className="border rounded-lg p-4 space-y-2 bg-card hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <p className="font-medium text-sm">{getActionLabel(log.action_type)}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {log.profiles?.full_name || "Usuário desconhecido"}
                            </Badge>
                          </div>
                          {(log.old_value || log.new_value) && (
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t text-xs">
                              {log.old_value && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Valor anterior:</p>
                                  <p className="font-mono bg-muted p-2 rounded">{log.old_value}</p>
                                </div>
                              )}
                              {log.new_value && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Novo valor:</p>
                                  <p className="font-mono bg-muted p-2 rounded">{log.new_value}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
              <CardDescription>Status e dados principais do domínio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Status do Domínio</Label>
                <div
                  className={
                    domain.manually_deactivated || !canEdit("can_change_domain_status") ? "" : "cursor-pointer"
                  }
                  onClick={() => {
                    if (!domain.manually_deactivated && canEdit("can_change_domain_status")) {
                      setDeactivateDialogOpen(true);
                    } else if (!canEdit("can_change_domain_status")) {
                      toast.error("Você não tem permissão para alterar o status do domínio");
                    }
                  }}
                  title={
                    domain.manually_deactivated
                      ? "Domínio Desativado Permanentemente"
                      : canEdit("can_change_domain_status")
                        ? "Clique para desativar o domínio"
                        : "Você não tem permissão para alterar o status"
                  }
                >
                  {getStatusBadge(domain.status)}
                </div>
                {domain.manually_deactivated && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Lock className="h-3 w-3 text-gray-500" />
                    Domínio Desativado Permanentemente
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Registrador</Label>
                <p className="text-sm">{domain.registrar || "Não informado"}</p>
              </div>

              <div className="space-y-2">
                <Label>Data de Expiração</Label>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {domain.expiration_date
                    ? format(new Date(domain.expiration_date), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : "Não informado"}
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Nameservers:</span>
                  </div>
                  {!isEditingNameservers ? (
                    <div className="flex items-center gap-1">
                      {/* Dropdown de Opções DNS */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={
                              domain.registrar?.toLowerCase() !== "namecheap" || !canEdit("can_change_nameservers")
                            }
                            title={
                              domain.registrar?.toLowerCase() !== "namecheap"
                                ? "Apenas domínios Namecheap"
                                : !canEdit("can_change_nameservers")
                                  ? "Você não tem permissão para alterar nameservers"
                                  : "Opções de DNS"
                            }
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuItem
                            onClick={() => handleSetNamecheapDNS("BasicDNS")}
                            disabled={updateNameservers.isPending}
                            className="cursor-pointer [&[data-highlighted]_.description]:text-accent-foreground"
                          >
                            <Server className="h-4 w-4 mr-2 flex-shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-medium">Namecheap BasicDNS</span>
                              <span className="description text-xs text-muted-foreground transition-colors">
                                DNS padrão da Namecheap
                              </span>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Botão de Editar (mantido para compatibilidade) */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!canEdit("can_change_nameservers")) {
                            toast.error("Você não tem permissão para editar nameservers");
                            return;
                          }
                          if (domain.registrar?.toLowerCase() !== "namecheap") {
                            toast.error("Apenas domínios registrados na Namecheap podem ter nameservers editados aqui");
                            return;
                          }
                          setIsEditingNameservers(true);
                        }}
                        disabled={domain.registrar?.toLowerCase() !== "namecheap"}
                        title={
                          domain.registrar?.toLowerCase() !== "namecheap"
                            ? "Apenas domínios Namecheap"
                            : !canEdit("can_change_nameservers")
                              ? "Você não tem permissão para editar nameservers"
                              : "Editar nameservers"
                        }
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditingNameservers(false);
                          if (domain.nameservers && domain.nameservers.length > 0) {
                            setNameserversList(domain.nameservers);
                          } else {
                            setNameserversList(["", ""]);
                          }
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveNameservers} disabled={updateNameservers.isPending}>
                        {updateNameservers.isPending ? "Salvando..." : "Salvar"}
                      </Button>
                    </div>
                  )}
                </div>
                {domain.registrar?.toLowerCase() !== "namecheap" && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    ⚠️ Edição de nameservers disponível apenas para domínios Namecheap
                  </p>
                )}
                <div className="ml-6">
                  {!isEditingNameservers ? (
                    domain.nameservers && domain.nameservers.length > 0 ? (
                      <ul className="list-disc list-inside text-sm text-muted-foreground">
                        {domain.nameservers.map((ns, index) => (
                          <li key={index}>{ns}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Não configurado</p>
                    )
                  ) : (
                    <div className="space-y-3">
                      {nameserversList.map((ns, index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Label htmlFor={`ns-${index}`} className="text-xs text-muted-foreground">
                                Nameserver {index + 1}
                              </Label>
                              <Input
                                id={`ns-${index}`}
                                value={ns}
                                onChange={(e) => handleNameserverChange(index, e.target.value)}
                                placeholder={`ns${index + 1}.example.com`}
                                className="mt-1"
                              />
                            </div>
                            {nameserversList.length > 2 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveNameserver(index)}
                                className="mt-5"
                                title="Remover nameserver"
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                          {index === nameserversList.length - 1 && nameserversList.length < 12 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleAddNameserver}
                              className="w-full"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Adicionar Nameserver
                            </Button>
                          )}
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        {nameserversList.filter((ns) => ns.trim()).length} de 12 nameservers • Mínimo: 2 nameservers
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label>Acesso Rápido</Label>
                <div className="flex gap-3">
                  {domain.platform?.toLowerCase() === "wordpress" && (
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1">
                            <Button
                              onClick={() => {
                                if (!canEdit("can_view_domain_details")) {
                                  toast.error("Você não tem permissão para acessar links externos");
                                  return;
                                }
                                const wordpressUrl = `https://${domain.domain_name}/wordpanel124`;
                                window.open(wordpressUrl, "_blank");
                                toast.info("Abrindo painel WordPress. Faça login com as credenciais fornecidas.");
                              }}
                              disabled={!canEdit("can_view_domain_details")}
                              className={`flex items-center gap-2 w-full ${
                                canEdit("can_view_domain_details")
                                  ? "bg-[#21759b] hover:bg-[#1e6a8d] text-white"
                                  : "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600"
                              }`}
                            >
                              {!canEdit("can_view_domain_details") && <Lock className="h-4 w-4" />}
                              <img
                                src="https://upload.wikimedia.org/wikipedia/commons/9/93/Wordpress_Blue_logo.png"
                                alt="WordPress"
                                className="h-5 w-5 object-contain"
                              />
                              <span className="text-sm">Login WordPress</span>
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!canEdit("can_view_domain_details") && (
                          <TooltipContent>
                            <p>Você não tem permissão para acessar links externos</p>
                          </TooltipContent>
                        )}
                      </UITooltip>
                    </TooltipProvider>
                  )}

                  {domain.platform?.toLowerCase() === "atomicat" && (
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1">
                            <Button
                              onClick={() => {
                                if (!canEdit("can_view_domain_details")) {
                                  toast.error("Você não tem permissão para acessar links externos");
                                  return;
                                }
                                const atomicatUrl = "https://app.atomicat.com.br/login";
                                window.open(atomicatUrl, "_blank");
                                toast.info("Abrindo painel Atomicat. Faça login com as credenciais fornecidas.");
                              }}
                              disabled={!canEdit("can_view_domain_details")}
                              className={`flex items-center gap-2 w-full ${
                                canEdit("can_view_domain_details")
                                  ? "bg-gradient-to-r from-gray-900 to-gray-600 hover:from-gray-800 hover:to-gray-500 text-white"
                                  : "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600"
                              }`}
                            >
                              {!canEdit("can_view_domain_details") && <Lock className="h-4 w-4" />}
                              <img
                                src="https://hotmart.s3.amazonaws.com/product_pictures/27c9db33-412c-4683-b79f-562016a33220/imagemavatardegradedark.png"
                                alt="Atomicat"
                                className="h-5 w-5 object-contain rounded"
                              />
                              <span className="text-sm">Login Atomicat</span>
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!canEdit("can_view_domain_details") && (
                          <TooltipContent>
                            <p>Você não tem permissão para acessar links externos</p>
                          </TooltipContent>
                        )}
                      </UITooltip>
                    </TooltipProvider>
                  )}

                  {!domain.platform && (
                    <p className="text-sm text-muted-foreground">
                      Selecione uma plataforma para ver as opções de login
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configurações</CardTitle>
              <CardDescription>Configure plataforma e fonte de tráfego</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="platform">Plataforma</Label>
                <Select
                  value={domain.platform || ""}
                  onValueChange={(value) => updateDomain("platform", value)}
                  disabled={saving || !canEdit("can_select_platform")}
                >
                  <SelectTrigger id="platform">
                    <Server className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Selecione uma plataforma" />
                  </SelectTrigger>
                  <SelectContent>
                    {platformOptions.map((platform) => (
                      <SelectItem key={platform} value={platform}>
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canEdit("can_select_platform") && (
                  <p className="text-xs text-muted-foreground">Você não tem permissão para alterar a plataforma</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="traffic_source">Fonte de Tráfego</Label>
                <Select
                  value={domain.traffic_source || ""}
                  onValueChange={(value) => updateDomain("traffic_source", value)}
                  disabled={saving || !canEdit("can_select_traffic_source")}
                >
                  <SelectTrigger id="traffic_source">
                    <Wifi className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Selecione uma fonte" />
                  </SelectTrigger>
                  <SelectContent>
                    {trafficSourceOptions.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source.charAt(0).toUpperCase() + source.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canEdit("can_select_traffic_source") && (
                  <p className="text-xs text-muted-foreground">
                    Você não tem permissão para alterar a fonte de tráfego
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="funnel_id">ID do Funil</Label>
                <Input
                  id="funnel_id"
                  type="text"
                  placeholder="Digite o ID e pressione Enter"
                  value={funnelIdInput}
                  onChange={(e) => setFunnelIdInput(e.target.value)}
                  onKeyPress={handleFunnelIdKeyPress}
                  disabled={saving || !canEdit("can_insert_funnel_id")}
                />
                {funnelIdTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {funnelIdTags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {tag}
                        {canEdit("can_insert_funnel_id") && (
                          <X className="h-3 w-3 cursor-pointer" onClick={() => removeFunnelIdTag(tag)} />
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
                {!canEdit("can_insert_funnel_id") && (
                  <p className="text-xs text-muted-foreground">
                    Você não tem permissão para adicionar ou remover IDs de funil
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Data e Hora da Compra</Label>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {domain.purchase_date
                    ? format(new Date(domain.purchase_date), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : "Domínio não foi comprado no sistema"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dashboard de Visitas Mensais</CardTitle>
            <CardDescription>Histórico de visitas nos últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAnalytics ? (
              <div className="flex justify-center items-center h-[300px]">
                <LoadingSpinner />
              </div>
            ) : analyticsData.length === 0 ? (
              <div className="flex justify-center items-center h-[300px] text-muted-foreground">
                Nenhum dado de analytics encontrado para este domínio
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analyticsData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--foreground))" }} />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: "hsl(var(--foreground))" }}
                      tickFormatter={(value) => value.toLocaleString()}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => [value.toLocaleString() + " visitas", "Visitas"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="visitas"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
                  <div className="text-center">
                    <p className="text-3xl font-bold">
                      {analyticsData.reduce((sum, item) => sum + item.visitas, 0).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Total Anual</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold">
                      {Math.round(
                        analyticsData.reduce((sum, item) => sum + item.visitas, 0) / analyticsData.length,
                      ).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Média Mensal</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold">
                      {Math.max(...analyticsData.map((item) => item.visitas)).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Pico Mensal</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AlertDialog de Desativação */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Atenção!
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-base">
              <p className="font-semibold">Essa ação é irreversível.</p>
              <p>
                Alterar o status do domínio <strong>{domain?.domain_name}</strong> para <strong>DESATIVADO</strong> fará
                com que ele seja removido/desativado permanentemente.
              </p>
              <p>
                O domínio será marcado como desativado apenas no banco de dados interno mas continuará registrado
                normalmente no provedor da Namecheap até que seja expirado ou renovado diretamente por lá.
              </p>
              <p className="font-semibold text-red-600">Tem certeza de que deseja continuar?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivateDomain} className="bg-red-600 text-white hover:bg-red-700">
              Sim, Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
