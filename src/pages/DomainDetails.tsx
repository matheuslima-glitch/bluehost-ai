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
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Globe, Calendar, TrendingUp, Server, Wifi, X, Plus, Trash2, Edit2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

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
  const [domain, setDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingNamecheap, setFetchingNamecheap] = useState(false);
  const [funnelIdInput, setFunnelIdInput] = useState("");
  const [funnelIdTags, setFunnelIdTags] = useState<string[]>([]);
  const [dnsRecords, setDnsRecords] = useState<Array<{ type: string; name: string; content: string; ttl: number }>>([]);
  const [loadingDns, setLoadingDns] = useState(false);
  const [newDnsRecord, setNewDnsRecord] = useState({ type: "A", name: "", content: "", ttl: 3600 });
  const [isEditingNameservers, setIsEditingNameservers] = useState(false);
  const [nameserversInput, setNameserversInput] = useState("");
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Estados para analytics reais do Supabase
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);

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

  // ============================================
  // BUSCAR ANALYTICS COM LÓGICA PY/CY
  // ============================================
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!domain?.domain_name) {
        setLoadingAnalytics(false);
        return;
      }

      setLoadingAnalytics(true);

      try {
        // Buscar por domain_name primeiro
        let { data, error } = await supabase
          .from("domain_analytics")
          .select("*")
          .eq("domain_name", domain.domain_name)
          .single();

        // Se não encontrar, tentar por zone_id
        if (error && domain.zone_id) {
          const result = await supabase.from("domain_analytics").select("*").eq("zone_id", domain.zone_id).single();

          data = result.data;
          error = result.error;
        }

        if (error || !data) {
          setAnalyticsData(null);
          setChartData([]);
          setLoadingAnalytics(false);
          return;
        }

        setAnalyticsData(data);

        // ========== LÓGICA PY/CY ==========
        const now = new Date();
        const currentMonth = now.getMonth(); // 0-11
        const currentYear = now.getFullYear();

        // Calcular os últimos 12 meses (rolling)
        const last12Months = [];

        for (let i = 11; i >= 0; i--) {
          const targetDate = new Date(currentYear, currentMonth - i, 1);
          const targetMonth = targetDate.getMonth(); // 0-11
          const targetYear = targetDate.getFullYear();

          // Determinar sufixo (py ou cy)
          const isPreviousYear = targetYear < currentYear;
          const suffix = isPreviousYear ? "_py" : "_cy";

          // Nomes dos meses em inglês (igual ao Supabase)
          const monthKeys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
          const monthKey = monthKeys[targetMonth];

          // Construir nome da coluna: ex: "jan_py" ou "jan_cy"
          const columnName = `${monthKey}${suffix}`;

          // Formatar label para display: "jan/25", "fev/25", etc
          const monthNamesDisplay = [
            "jan",
            "fev",
            "mar",
            "abr",
            "mai",
            "jun",
            "jul",
            "ago",
            "set",
            "out",
            "nov",
            "dez",
          ];
          const monthLabel = `${monthNamesDisplay[targetMonth]}/${targetYear.toString().slice(-2)}`;

          // Pegar visits da coluna correta
          const visits = data[columnName] || 0;

          last12Months.push({
            month: monthLabel,
            visits: visits,
          });
        }

        setChartData(last12Months);
      } catch (error) {
        console.error("Erro ao buscar analytics:", error);
        setAnalyticsData(null);
        setChartData([]);
      } finally {
        setLoadingAnalytics(false);
      }
    };

    fetchAnalytics();
  }, [domain?.domain_name, domain?.zone_id]);

  useEffect(() => {
    loadDomain();
  }, [id]);

  useEffect(() => {
    if (domain?.funnel_id) {
      setFunnelIdTags(domain.funnel_id.split(",").filter((tag) => tag.trim() !== ""));
    }
  }, [domain]);

  useEffect(() => {
    if (domain?.zone_id) {
      loadDnsRecords();
    }
  }, [domain?.zone_id]);

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

      // Buscar informações dos usuários
      const userIds = [...new Set(logsData?.map((log) => log.user_id) || [])];
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      // Combinar dados
      const logsWithProfiles =
        logsData?.map((log) => ({
          ...log,
          profiles: profilesData?.find((p) => p.id === log.user_id) || null,
        })) || [];

      setActivityLogs(logsWithProfiles);
    } catch (error: any) {
      toast.error("Erro ao carregar logs de atividade");
      console.error("Erro:", error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadDomain = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase.from("domains").select("*").eq("id", id).single();

      if (error) throw error;

      setDomain(data);

      // Carregar logs de atividade automaticamente
      await loadActivityLogs();
    } catch (error: any) {
      toast.error("Erro ao carregar detalhes do domínio");
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!domain || !id) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("domains").update(domain).eq("id", id);

      if (error) throw error;

      // Log the update
      await supabase.from("domain_activity_logs").insert({
        domain_id: id,
        action_type: "domain_updated",
        user_id: user?.id,
        old_value: null,
        new_value: JSON.stringify(domain),
      });

      toast.success("Domínio atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["domains"] });

      // Reload logs after update
      await loadActivityLogs();
    } catch (error: any) {
      toast.error("Erro ao atualizar domínio");
      console.error("Erro:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleFetchFromNamecheap = async () => {
    if (!domain?.domain_name) return;

    setFetchingNamecheap(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-namecheap-domain", {
        body: { domain: domain.domain_name },
      });

      if (error) throw error;

      if (data?.success && data?.domainData) {
        setDomain({
          ...domain,
          purchase_date: data.domainData.purchase_date || domain.purchase_date,
          expiration_date: data.domainData.expiration_date || domain.expiration_date,
          registrar: data.domainData.registrar || domain.registrar,
        });

        toast.success("Informações do Namecheap carregadas com sucesso!");
      } else {
        toast.error(data?.message || "Erro ao buscar informações do Namecheap");
      }
    } catch (error: any) {
      toast.error("Erro ao buscar informações do Namecheap");
      console.error("Erro:", error);
    } finally {
      setFetchingNamecheap(false);
    }
  };

  const addFunnelIdTag = () => {
    if (!funnelIdInput.trim()) return;

    const newTag = funnelIdInput.trim();
    if (!funnelIdTags.includes(newTag)) {
      const updatedTags = [...funnelIdTags, newTag];
      setFunnelIdTags(updatedTags);
      if (domain) {
        setDomain({ ...domain, funnel_id: updatedTags.join(",") });
      }
    }
    setFunnelIdInput("");
  };

  const removeFunnelIdTag = (tagToRemove: string) => {
    const updatedTags = funnelIdTags.filter((tag) => tag !== tagToRemove);
    setFunnelIdTags(updatedTags);
    if (domain) {
      setDomain({ ...domain, funnel_id: updatedTags.join(",") });
    }
  };

  const loadDnsRecords = async () => {
    if (!domain?.zone_id) return;

    setLoadingDns(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-cloudflare-dns", {
        body: { zoneId: domain.zone_id },
      });

      if (error) throw error;

      if (data?.success && data?.records) {
        setDnsRecords(data.records);
      }
    } catch (error: any) {
      toast.error("Erro ao carregar registros DNS");
      console.error("Erro:", error);
    } finally {
      setLoadingDns(false);
    }
  };

  const addDnsRecord = async () => {
    if (!domain?.zone_id || !newDnsRecord.name || !newDnsRecord.content) {
      toast.error("Preencha todos os campos");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("create-cloudflare-dns", {
        body: {
          zoneId: domain.zone_id,
          type: newDnsRecord.type,
          name: newDnsRecord.name,
          content: newDnsRecord.content,
          ttl: newDnsRecord.ttl,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Registro DNS adicionado com sucesso!");
        setNewDnsRecord({ type: "A", name: "", content: "", ttl: 3600 });
        await loadDnsRecords();

        // Log DNS change
        await supabase.from("domain_activity_logs").insert({
          domain_id: id,
          action_type: "dns_record_created",
          user_id: user?.id,
          old_value: null,
          new_value: JSON.stringify(newDnsRecord),
        });

        await loadActivityLogs();
      }
    } catch (error: any) {
      toast.error("Erro ao adicionar registro DNS");
      console.error("Erro:", error);
    }
  };

  const deleteDnsRecord = async (recordId: string) => {
    if (!domain?.zone_id) return;

    try {
      const recordToDelete = dnsRecords.find((r: any) => r.id === recordId);

      const { data, error } = await supabase.functions.invoke("delete-cloudflare-dns", {
        body: {
          zoneId: domain.zone_id,
          recordId: recordId,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Registro DNS removido com sucesso!");
        await loadDnsRecords();

        // Log DNS deletion
        await supabase.from("domain_activity_logs").insert({
          domain_id: id,
          action_type: "dns_record_deleted",
          user_id: user?.id,
          old_value: JSON.stringify(recordToDelete),
          new_value: null,
        });

        await loadActivityLogs();
      }
    } catch (error: any) {
      toast.error("Erro ao remover registro DNS");
      console.error("Erro:", error);
    }
  };

  const updateNameservers = async () => {
    if (!domain?.id || !nameserversInput.trim()) {
      toast.error("Preencha os nameservers");
      return;
    }

    try {
      const nameserversArray = nameserversInput.split(",").map((ns) => ns.trim());

      const { error } = await supabase.from("domains").update({ nameservers: nameserversArray }).eq("id", domain.id);

      if (error) throw error;

      setDomain({ ...domain, nameservers: nameserversArray });
      setIsEditingNameservers(false);
      toast.success("Nameservers atualizados com sucesso!");

      // Log nameserver change
      await supabase.from("domain_activity_logs").insert({
        domain_id: id,
        action_type: "nameservers_updated",
        user_id: user?.id,
        old_value: domain.nameservers ? JSON.stringify(domain.nameservers) : null,
        new_value: JSON.stringify(nameserversArray),
      });

      await loadActivityLogs();
    } catch (error: any) {
      toast.error("Erro ao atualizar nameservers");
      console.error("Erro:", error);
    }
  };

  const getActionLabel = (actionType: string) => {
    const labels: { [key: string]: string } = {
      domain_created: "Domínio Criado",
      domain_updated: "Domínio Atualizado",
      domain_deleted: "Domínio Deletado",
      dns_record_created: "Registro DNS Criado",
      dns_record_updated: "Registro DNS Atualizado",
      dns_record_deleted: "Registro DNS Deletado",
      nameservers_updated: "Nameservers Atualizados",
      status_changed: "Status Alterado",
    };
    return labels[actionType] || actionType;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground mb-4">Domínio não encontrado</p>
        <Button onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Globe className="h-8 w-8" />
              {domain.domain_name}
            </h1>
            <p className="text-muted-foreground">Gerencie as configurações do seu domínio</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleFetchFromNamecheap} disabled={fetchingNamecheap} variant="outline">
            <Server className="h-4 w-4 mr-2" />
            {fetchingNamecheap ? "Buscando..." : "Buscar Namecheap"}
          </Button>
          <Button onClick={handleUpdate} disabled={saving}>
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
            <CardDescription>Detalhes principais do domínio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={domain.status} onValueChange={(value) => setDomain({ ...domain, status: value })}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="em_configuracao">Em Configuração</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">Plataforma</Label>
              <Select
                value={domain.platform || ""}
                onValueChange={(value) => setDomain({ ...domain, platform: value })}
              >
                <SelectTrigger id="platform">
                  <SelectValue placeholder="Selecione uma plataforma" />
                </SelectTrigger>
                <SelectContent>
                  {platformOptions.map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="traffic_source">Fonte de Tráfego</Label>
              <Select
                value={domain.traffic_source || ""}
                onValueChange={(value) => setDomain({ ...domain, traffic_source: value })}
              >
                <SelectTrigger id="traffic_source">
                  <SelectValue placeholder="Selecione uma fonte" />
                </SelectTrigger>
                <SelectContent>
                  {trafficSourceOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="registrar">Registrador</Label>
              <Input
                id="registrar"
                value={domain.registrar || ""}
                onChange={(e) => setDomain({ ...domain, registrar: e.target.value })}
                placeholder="Ex: Namecheap, GoDaddy..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="zone_id">Zone ID (Cloudflare)</Label>
              <Input
                id="zone_id"
                value={domain.zone_id || ""}
                onChange={(e) => setDomain({ ...domain, zone_id: e.target.value })}
                placeholder="ID da zona no Cloudflare"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configurações Adicionais</CardTitle>
            <CardDescription>Funil IDs e outras configurações</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Funnel IDs</Label>
              <div className="flex gap-2">
                <Input
                  value={funnelIdInput}
                  onChange={(e) => setFunnelIdInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && addFunnelIdTag()}
                  placeholder="Digite um ID e pressione Enter"
                />
                <Button onClick={addFunnelIdTag} size="icon" variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {funnelIdTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {funnelIdTags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="gap-1">
                      {tag}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeFunnelIdTag(tag)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Nameservers</Label>
                {!isEditingNameservers && (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingNameservers(true)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {isEditingNameservers ? (
                <div className="space-y-2">
                  <Input
                    value={nameserversInput}
                    onChange={(e) => setNameserversInput(e.target.value)}
                    placeholder="ns1.example.com, ns2.example.com"
                  />
                  <div className="flex gap-2">
                    <Button onClick={updateNameservers} size="sm">
                      Salvar
                    </Button>
                    <Button onClick={() => setIsEditingNameservers(false)} size="sm" variant="outline">
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm space-y-1">
                  {domain.nameservers && domain.nameservers.length > 0 ? (
                    domain.nameservers.map((ns, index) => (
                      <div key={index} className="font-mono text-muted-foreground">
                        {ns}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">Nenhum nameserver configurado</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data de Expiração</Label>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {domain.expiration_date
                  ? format(new Date(domain.expiration_date), "dd/MM/yyyy", { locale: ptBR })
                  : "Não definida"}
              </div>
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
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle>Dashboard de Visitas Mensais</CardTitle>
              <CardDescription>Histórico de visitas nos últimos 12 meses</CardDescription>
            </div>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {loadingAnalytics ? (
            <div className="flex items-center justify-center h-[300px]">
              <LoadingSpinner />
            </div>
          ) : chartData.length === 0 || !analyticsData ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum dado de analytics encontrado para este domínio</p>
              <p className="text-sm text-muted-foreground mt-2">
                Os dados serão atualizados automaticamente via n8n (cloudflare-analytics)
              </p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--foreground))" }} />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--foreground))" }}
                    tickFormatter={(value) => value.toLocaleString("pt-BR")}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [value.toLocaleString("pt-BR") + " visitas", "Visitas"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="visits"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* Estatísticas resumidas */}
              {analyticsData && (
                <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{analyticsData.annual_visits?.toLocaleString("pt-BR") || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Anual</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      {Math.round((analyticsData.annual_visits || 0) / 12).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-sm text-muted-foreground">Média Mensal</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      {Math.max(...chartData.map((m: any) => m.visits)).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-sm text-muted-foreground">Pico Mensal</p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {domain.zone_id && (
        <Card>
          <CardHeader>
            <CardTitle>Zonas DNS</CardTitle>
            <CardDescription>Gerencie os registros DNS do seu domínio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="dns-type">Tipo</Label>
                <Select
                  value={newDnsRecord.type}
                  onValueChange={(value) => setNewDnsRecord({ ...newDnsRecord, type: value })}
                >
                  <SelectTrigger id="dns-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="AAAA">AAAA</SelectItem>
                    <SelectItem value="CNAME">CNAME</SelectItem>
                    <SelectItem value="TXT">TXT</SelectItem>
                    <SelectItem value="MX">MX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dns-name">Nome</Label>
                <Input
                  id="dns-name"
                  placeholder="@, www, etc"
                  value={newDnsRecord.name}
                  onChange={(e) => setNewDnsRecord({ ...newDnsRecord, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dns-content">Conteúdo</Label>
                <Input
                  id="dns-content"
                  placeholder="IP ou valor"
                  value={newDnsRecord.content}
                  onChange={(e) => setNewDnsRecord({ ...newDnsRecord, content: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dns-ttl">TTL</Label>
                <Input
                  id="dns-ttl"
                  type="number"
                  value={newDnsRecord.ttl}
                  onChange={(e) => setNewDnsRecord({ ...newDnsRecord, ttl: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <Button onClick={addDnsRecord} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Registro DNS
            </Button>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead>TTL</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingDns ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">
                        <LoadingSpinner />
                      </TableCell>
                    </TableRow>
                  ) : dnsRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhum registro DNS encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    dnsRecords.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Badge variant="outline">{record.type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono">{record.name}</TableCell>
                        <TableCell className="font-mono text-sm">{record.content}</TableCell>
                        <TableCell>{record.ttl}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => deleteDnsRecord(record.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Histórico de Atividades</CardTitle>
              <CardDescription>Registro de todas as alterações realizadas neste domínio</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadActivityLogs} disabled={loadingLogs}>
              {loadingLogs ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : activityLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma atividade registrada ainda</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {activityLogs.map((log) => (
                  <div key={log.id} className="flex gap-4 p-4 border rounded-lg">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Info className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{getActionLabel(log.action_type)}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Por: {log.profiles?.full_name || log.profiles?.email || "Usuário desconhecido"}
                      </p>
                      {(log.old_value || log.new_value) && (
                        <div className="mt-2 text-xs">
                          {log.old_value && (
                            <div className="bg-muted p-2 rounded mb-1">
                              <span className="font-medium">Valor anterior:</span>
                              <pre className="mt-1 overflow-x-auto">{log.old_value}</pre>
                            </div>
                          )}
                          {log.new_value && (
                            <div className="bg-muted p-2 rounded">
                              <span className="font-medium">Novo valor:</span>
                              <pre className="mt-1 overflow-x-auto">{log.new_value}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
