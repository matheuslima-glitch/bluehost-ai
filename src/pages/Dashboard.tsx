import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Globe,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wallet,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CriticalDomainsTable } from "@/components/CriticalDomainsTable";
import { CriticalDomainsAlert } from "@/components/CriticalDomainsAlert";
import { usePermissions } from "@/hooks/usePermissions";

export default function Dashboard() {
  const { user } = useAuth();
  const { hasPermission, canEdit } = usePermissions();

  // ⭐ Variáveis de permissão para modo leitura
  const canEditIntegrations = canEdit("can_view_integrations");

  const [firstName, setFirstName] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    expiring: 0,
    expired: 0,
    suspended: 0,
    critical: 0,
  });
  const [integrations, setIntegrations] = useState({
    namecheap: 0,
    cloudflare: 0,
    cpanel: 0,
  });
  const [balance, setBalance] = useState<{ usd: number; brl: number } | null>(null);
  const [totalVisits, setTotalVisits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [balanceCurrency, setBalanceCurrency] = useState<"usd" | "brl">("usd");
  const [expiredDomains, setExpiredDomains] = useState(0);
  const [expiringDomains, setExpiringDomains] = useState(0);
  const [criticalDomains, setCriticalDomains] = useState(0);
  const [suspendedDomains, setSuspendedDomains] = useState(0);
  const [monthlyVisitsData, setMonthlyVisitsData] = useState<Array<{ mes: string; visitas: number }>>([]);
  const [integrationStatus, setIntegrationStatus] = useState({
    namecheap: false,
    cpanel: false,
    cloudflare: false,
  });
  const [domains, setDomains] = useState<any[]>([]);
  const [alertDomains, setAlertDomains] = useState(0);

  useEffect(() => {
    loadDashboardData();
    loadUserName();
  }, []);

  // Buscar nome do usuário
  const loadUserName = async () => {
    if (!user?.id) return;

    const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();

    if (data?.full_name) {
      const name = data.full_name.split(" ")[0]; // Pegar primeiro nome
      setFirstName(name);
    }
  };

  // CORREÇÃO 1: Função para verificar se as integrações estão configuradas
  const checkIntegrationsStatus = async () => {
    const status = {
      namecheap: false,
      cpanel: false,
      cloudflare: false,
    };

    // Verificar Namecheap: se existe saldo, está configurado
    try {
      const { data: balanceData } = await supabase
        .from("namecheap_balance")
        .select("*")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      status.namecheap = !!balanceData;
    } catch (error) {
      // Silenciar erro
    }

    // Verificar Cloudflare: verificar se existem domínios com dns_provider = cloudflare
    try {
      const { count } = await supabase
        .from("domains")
        .select("id", { count: "exact", head: true })
        .eq("dns_provider", "cloudflare");

      status.cloudflare = (count || 0) > 0;
    } catch (error) {
      // Se der erro, assumir que não está configurado
      status.cloudflare = false;
    }

    // Verificar cPanel: verificar se existem domínios com hosting_provider = cpanel
    try {
      const { count } = await supabase
        .from("domains")
        .select("id", { count: "exact", head: true })
        .eq("hosting_provider", "cpanel");

      status.cpanel = (count || 0) > 0;
    } catch (error) {
      // Se der erro, assumir que não está configurado
      status.cpanel = false;
    }

    return status;
  };

  const loadDashboardData = async () => {
    try {
      // CORREÇÃO 2: Função para buscar TODOS os domínios sem limite usando paginação recursiva
      const fetchAllDomains = async () => {
        let allDomains: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from("domains")
            .select("*")
            .range(from, from + pageSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allDomains = [...allDomains, ...data];
            from += pageSize;

            // Se retornou menos que o pageSize, chegamos ao fim
            if (data.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        return allDomains;
      };

      // Busca todos os domínios
      const domainsData = await fetchAllDomains();
      setDomains(domainsData || []);

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      const stats = {
        total: domainsData?.length || 0,
        active: domainsData?.filter((d) => d.status === "active").length || 0,
        expiring:
          domainsData?.filter((d) => {
            if (!d.expiration_date) return false;
            const expDate = new Date(d.expiration_date);
            return expDate > now && expDate < thirtyDaysFromNow;
          }).length || 0,
        expired: domainsData?.filter((d) => d.status === "expired").length || 0,
        suspended: domainsData?.filter((d) => d.status === "suspended").length || 0,
        critical:
          domainsData?.filter((d) => {
            if (!d.expiration_date) return false;
            const expDate = new Date(d.expiration_date);
            return expDate > now && expDate < fifteenDaysFromNow;
          }).length || 0,
      };

      const integrationCounts = {
        namecheap: domainsData?.filter((d) => d.integration_source === "namecheap").length || 0,
        cloudflare: domainsData?.filter((d) => d.integration_source === "cloudflare").length || 0,
        cpanel: domainsData?.filter((d) => d.integration_source === "cpanel").length || 0,
      };

      setStats(stats);
      setIntegrations(integrationCounts);

      // CORREÇÃO: Buscar dados de analytics_geral (soma de todos os domínios)
      const { data: analyticsGeralData, error: analyticsGeralError } = await supabase
        .from("analytics_geral")
        .select("*")
        .eq("current_year", new Date().getFullYear())
        .single();

      if (!analyticsGeralError && analyticsGeralData) {
        // Calcular total de visitas (converter bigint para number)
        const totalVisitsFromDB = Number(analyticsGeralData.annual_visits) || 0;
        setTotalVisits(totalVisitsFromDB);

        // Gerar dados dos últimos 12 meses (mix de _py e _cy)
        const currentMonth = new Date().getMonth(); // 0-11
        const currentYear = new Date().getFullYear();
        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const monthKeys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

        const last12Months = [];

        // Gerar últimos 12 meses (de 11 meses atrás até mês atual)
        for (let i = 11; i >= 0; i--) {
          const monthIndex = (currentMonth - i + 12) % 12;
          const monthKey = monthKeys[monthIndex];
          const monthName = monthNames[monthIndex];

          // Determinar se usa _py (ano anterior) ou _cy (ano atual)
          const isPreviousYear = i > currentMonth;
          const suffix = isPreviousYear ? "_py" : "_cy";
          const fieldName = `${monthKey}${suffix}`;

          // Calcular o ano correto para exibição
          const displayYear = isPreviousYear ? currentYear - 1 : currentYear;
          const yearShort = displayYear.toString().slice(-2);

          // Pegar valor JÁ SOMADO de analytics_geral
          const visits = Number(analyticsGeralData[fieldName]) || 0;

          last12Months.push({
            mes: `${monthName}/${yearShort}`,
            visitas: visits,
          });
        }

        setMonthlyVisitsData(last12Months);
      } else {
        // Se não houver dados, zerar tudo
        setTotalVisits(0);
        setMonthlyVisitsData([]);
      }

      // [INÍCIO DA LÓGICA IMPLEMENTADA]
      // Atualiza o saldo da Namecheap em tempo real
      try {
        await fetch("https://domainhub-backend.onrender.com/api/balance/sync", {
          method: "POST", // Webhooks geralmente usam POST
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "dashboard_reload" }), // Corpo opcional
        });

        // Se a chamada foi bem-sucedida, o n8n (em tese) já atualizou o banco.
      } catch (webhookError: any) {
        // Se o webhook falhar, apenas registra o aviso no console e continua.
        // O sistema irá carregar o último saldo salvo no banco.
        console.warn("Aviso: O webhook de atualização de saldo do n8n falhou.", webhookError.message);
        toast.warning("Não foi possível atualizar o saldo em tempo real. Carregando último valor salvo.");
      }
      // [FIM DA LÓGICA IMPLEMENTADA]

      // Load Namecheap balance from database (agora atualizado pelo n8n)
      const { data: balanceData, error: balanceError } = await supabase
        .from("namecheap_balance")
        .select("*")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!balanceError && balanceData) {
        setBalance({
          usd: balanceData.balance_usd,
          brl: balanceData.balance_brl,
        });
      }

      // Usar dados do banco de dados (já carregados acima via domainsData)
      // Os dados são sincronizados pelo backend no Render

      // Domínios expirados - usar dados do banco
      const expiredCount = domainsData?.filter((d) => d.status === "expired").length || 0;
      setExpiredDomains(expiredCount);

      // Domínios expirando - usar dados do banco (reutilizando variáveis já declaradas acima)
      const expiringCount =
        domainsData?.filter((d) => {
          if (!d.expiration_date) return false;
          const expDate = new Date(d.expiration_date);
          return expDate > now && expDate < thirtyDaysFromNow;
        }).length || 0;
      setExpiringDomains(expiringCount);

      // Domínios críticos (expirando em 15 dias)
      const criticalCount =
        domainsData?.filter((d) => {
          if (!d.expiration_date) return false;
          const expDate = new Date(d.expiration_date);
          return expDate > now && expDate < fifteenDaysFromNow;
        }).length || 0;
      setCriticalDomains(criticalCount);

      // Domínios suspensos - usar dados do banco
      const suspendedCount = domainsData?.filter((d) => d.status === "suspended").length || 0;
      setSuspendedDomains(suspendedCount);

      // Domínios com alerta - considerar expirados + suspensos
      const alertCount = expiredCount + suspendedCount;
      setAlertDomains(alertCount);

      // CORREÇÃO 3: Verificar status das integrações de forma correta
      const integrationsStatus = await checkIntegrationsStatus();
      setIntegrationStatus(integrationsStatus);
    } catch (error: any) {
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  };

  const pieData = [
    { name: "Ativos", value: stats.active, color: "#22c55e" },
    { name: "Expirando", value: stats.expiring, color: "#eab308" },
    { name: "Expirados", value: stats.expired, color: "#ef4444" },
    { name: "Suspensos", value: stats.suspended, color: "#f97316" },
  ];

  const barData = [
    { name: "Atomicat", dominios: domains?.filter((d) => d.platform === "atomicat").length || 0 },
    { name: "Wordpress", dominios: domains?.filter((d) => d.platform === "wordpress").length || 0 },
  ];

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Alerta de Domínios Críticos */}
      <CriticalDomainsAlert suspendedCount={stats.suspended} expiredCount={stats.expired} />

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Olá{firstName ? `, ${firstName}` : ""}!</h1>
          <p className="text-muted-foreground mt-2">Visão completa de todos os seus domínios</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Domínios</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.active} ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expirados</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expired}</div>
            <p className="text-xs text-muted-foreground mt-1">Domínios expirados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expirando em Breve</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiring}</div>
            <p className="text-xs text-muted-foreground mt-1">Próximos 30 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Críticos</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.critical}</div>
            <p className="text-xs text-muted-foreground mt-1">Próximos 15 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Suspensos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.suspended}</div>
            <p className="text-xs text-muted-foreground mt-1">Verificar pendências</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Integration Status */}
        {hasPermission("can_view_integrations") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Status das Integrações
                {/* ⭐ Badge de somente leitura */}
                {!canEditIntegrations && (
                  <Badge variant="secondary" className="ml-2 gap-1">
                    <Lock className="h-3 w-3" />
                    Somente Leitura
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {integrationStatus.namecheap ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      {/* ⭐ Nome sempre visível, link só se tiver permissão */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p
                              className={`text-sm font-medium ${
                                canEditIntegrations
                                  ? "cursor-pointer hover:text-blue-500 hover:underline"
                                  : "cursor-default"
                              }`}
                              onClick={() =>
                                canEditIntegrations &&
                                window.open("https://www.namecheap.com/myaccount/login/?ReturnUrl=%2f", "_blank")
                              }
                            >
                              {!canEditIntegrations && <Lock className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                              Namecheap
                            </p>
                          </TooltipTrigger>
                          {!canEditIntegrations && (
                            <TooltipContent>
                              <p>Você não tem permissão para acessar links externos</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <Badge variant={integrationStatus.namecheap ? "default" : "destructive"}>
                    {integrationStatus.namecheap ? "Ativa" : "Inativa"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {integrationStatus.cpanel ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      {/* ⭐ Nome sempre visível, link só se tiver permissão */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p
                              className={`text-sm font-medium ${
                                canEditIntegrations
                                  ? "cursor-pointer hover:text-blue-500 hover:underline"
                                  : "cursor-default"
                              }`}
                              onClick={() =>
                                canEditIntegrations && window.open("https://nexus.servidor.net.br:2083/", "_blank")
                              }
                            >
                              {!canEditIntegrations && <Lock className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                              cPanel
                            </p>
                          </TooltipTrigger>
                          {!canEditIntegrations && (
                            <TooltipContent>
                              <p>Você não tem permissão para acessar links externos</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <Badge variant={integrationStatus.cpanel ? "default" : "destructive"}>
                    {integrationStatus.cpanel ? "Ativa" : "Inativa"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {integrationStatus.cloudflare ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      {/* ⭐ Nome sempre visível, link só se tiver permissão */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p
                              className={`text-sm font-medium ${
                                canEditIntegrations
                                  ? "cursor-pointer hover:text-blue-500 hover:underline"
                                  : "cursor-default"
                              }`}
                              onClick={() =>
                                canEditIntegrations && window.open("https://dash.cloudflare.com/login", "_blank")
                              }
                            >
                              {!canEditIntegrations && <Lock className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                              Cloudflare
                            </p>
                          </TooltipTrigger>
                          {!canEditIntegrations && (
                            <TooltipContent>
                              <p>Você não tem permissão para acessar links externos</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <Badge variant={integrationStatus.cloudflare ? "default" : "destructive"}>
                    {integrationStatus.cloudflare ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Namecheap Balance */}
        {hasPermission("can_view_balance") && (
          <Card className="shadow-md border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Saldo Namecheap
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {balance ? (
                <>
                  <div>
                    {balance.usd === 0 && balance.brl === 0 ? (
                      <>
                        <div className="text-3xl font-bold text-muted-foreground">
                          {balanceCurrency === "usd" ? "$0.00" : "R$ 0,00"}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">Adicione créditos para começar</p>
                      </>
                    ) : (
                      <>
                        <div className="text-4xl font-bold text-blue-500">
                          {balanceCurrency === "usd" ? `$${balance.usd.toFixed(2)}` : `R$ ${balance.brl.toFixed(2)}`}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">Saldo disponível para compras</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={balanceCurrency === "usd" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setBalanceCurrency("usd")}
                      className={`${balanceCurrency === "usd" ? "bg-primary text-primary-foreground" : ""}`}
                    >
                      USD
                    </Button>
                    <Button
                      variant={balanceCurrency === "brl" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setBalanceCurrency("brl")}
                      className={`${balanceCurrency === "brl" ? "bg-primary text-primary-foreground" : ""}`}
                    >
                      BRL
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-4">
                  <p className="text-lg font-semibold text-muted-foreground">Indisponível</p>
                  <p className="text-sm text-muted-foreground mt-1">Verifique as credenciais</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Critical Domains Management Table */}
      {hasPermission("can_view_critical_domains") && (
        <div data-critical-domains-table className="critical-domains-table scroll-mt-4">
          <CriticalDomainsTable domains={domains} onDomainsChange={loadDashboardData} />
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status dos Domínios</CardTitle>
            <CardDescription>Distribuição por status</CardDescription>
          </CardHeader>
          <CardContent className="[&_*]:!outline-none">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "white",
                    color: "black",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                  }}
                  itemStyle={{ color: "black" }}
                  labelStyle={{ color: "black", fontWeight: "bold" }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Domínios por Integração</CardTitle>
            <CardDescription>Distribuição por plataforma</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "white",
                    color: "black",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                  }}
                  itemStyle={{ color: "black" }}
                  labelStyle={{ color: "black", fontWeight: "bold" }}
                  cursor={{ fill: "transparent" }}
                />
                <Legend />
                <Bar dataKey="dominios" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Visitas Mensais</CardTitle>
            <CardDescription>Histórico mensal de acessos</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyVisitsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis
                  tickFormatter={(value) => {
                    // Formatar números grandes de forma legível
                    if (value >= 1000000) {
                      return `${(value / 1000000).toFixed(1)}M`;
                    } else if (value >= 1000) {
                      return `${(value / 1000).toFixed(0)}k`;
                    }
                    return value.toString();
                  }}
                  domain={["auto", "auto"]}
                  scale="linear"
                />
                <RechartsTooltip
                  formatter={(value: number) => [value.toLocaleString("pt-BR") + " visitas", "Visitas"]}
                  labelFormatter={(label) => `Mês: ${label}`}
                  contentStyle={{
                    backgroundColor: "white",
                    color: "black",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                  }}
                  itemStyle={{ color: "black" }}
                  labelStyle={{ color: "black", fontWeight: "bold" }}
                />
                <Legend />
                <Line type="monotone" dataKey="visitas" stroke="hsl(var(--primary))" strokeWidth={2} name="Visitas" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
