import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, TrendingUp, AlertCircle, Clock, CheckCircle2, AlertTriangle, XCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

export default function Dashboard() {
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
  const [syncing, setSyncing] = useState(false);
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
  }, []);

  // CORREÇÃO 1: Função para verificar se as integrações estão configuradas
  const checkIntegrationsStatus = async () => {
    const status = {
      namecheap: false,
      cpanel: false,
      cloudflare: false,
    };

    // Verificar Namecheap: se existe saldo, está configurado
    const { data: balanceData, error: balanceError } = await supabase
      .from("namecheap_balance")
      .select("balance_usd")
      .limit(1);

    if (balanceData && balanceData.length > 0) {
      status.namecheap = true;
    }

    // Verificar cPanel e Cloudflare: se existe algum domínio com essa fonte
    const { data: domainsData, error: domainsError } = await supabase
      .from("domains")
      .select("integration_source")
      .in("integration_source", ["cpanel", "cloudflare"]);

    if (domainsData) {
      if (domainsData.some((d) => d.integration_source === "cpanel")) {
        status.cpanel = true;
      }
      if (domainsData.some((d) => d.integration_source === "cloudflare")) {
        status.cloudflare = true;
      }
    }

    setIntegrationStatus(status);
  };

  const loadDashboardData = async () => {
    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      toast.error("Erro de autenticação");
      setLoading(false);
      return;
    }
    const userId = authData.user.id;

    // Carregar status das integrações
    checkIntegrationsStatus();

    // Carregar todos os domínios (para a tabela)
    const { data: allDomains, error: allDomainsError } = await supabase
      .from("domains")
      .select("*")
      .order("expiration_date", { ascending: true });

    if (allDomainsError) {
      toast.error("Erro ao carregar domínios: " + allDomainsError.message);
    } else {
      setDomains(allDomains || []);
    }

    // Carregar stats (contagem de status)
    const { data: statsData, error: statsError } = await supabase.rpc("get_domain_stats").single();

    if (statsData) {
      setStats({
        total: statsData.total_domains || 0,
        active: statsData.active_domains || 0,
        expiring: statsData.expiring_soon_domains || 0,
        expired: statsData.expired_domains || 0,
        suspended: statsData.suspended_domains || 0,
        critical: statsData.critical_domains || 0,
      });
      // Atualizar os estados individuais para os cards
      setExpiredDomains(statsData.expired_domains || 0);
      setExpiringDomains(statsData.expiring_soon_domains || 0);
      setCriticalDomains(statsData.critical_domains || 0);
      setSuspendedDomains(statsData.suspended_domains || 0);
    } else {
      toast.error("Erro ao carregar estatísticas: " + statsError?.message);
    }

    // Carregar saldo Namecheap
    const { data: balanceData, error: balanceError } = await supabase
      .from("namecheap_balance")
      .select("balance_usd, balance_brl")
      .limit(1)
      .single();

    if (balanceData) {
      setBalance({
        usd: balanceData.balance_usd || 0,
        brl: balanceData.balance_brl || 0,
      });
    }

    // Carregar dados de integração (Gráfico de Pizza)
    const integrationData = await getIntegrationData();
    setIntegrations(integrationData);

    // Carregar dados de visitas (Gráfico de Linha)
    const visitsData = await getMonthlyVisitsData();
    setMonthlyVisitsData(visitsData);

    // Carregar contagem de alertas (Card de Alerta)
    const alertCount = await getAlertDomains();
    setAlertDomains(alertCount);

    setLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    toast.info("Sincronização iniciada...", {
      description: "Buscando novos dados das integrações. Isso pode levar alguns minutos.",
    });

    const { data, error } = await supabase.functions.invoke("n8n-webhook-namecheap-domains");

    if (error) {
      toast.error("Falha ao iniciar a sincronização", {
        description: error.message,
      });
    } else {
      toast.success("Sincronização concluída!", {
        description: "Os dados do seu dashboard foram atualizados.",
      });
      // Recarregar os dados após a sincronização
      loadDashboardData();
    }
    setSyncing(false);
  };

  const toggleCurrency = () => {
    setBalanceCurrency(balanceCurrency === "usd" ? "brl" : "usd");
  };

  const formatBRL = (value: number) => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // Função para buscar dados de integração (Gráfico de Pizza)
  const getIntegrationData = async () => {
    const { data, error } = await supabase.from("domains").select("integration_source");

    if (error) {
      toast.error("Erro ao carregar dados de integração: " + error.message);
      return { namecheap: 0, cloudflare: 0, cpanel: 0 };
    }

    const counts = {
      namecheap: 0,
      cloudflare: 0,
      cpanel: 0,
    };

    data.forEach((domain) => {
      if (domain.integration_source === "namecheap") counts.namecheap++;
      if (domain.integration_source === "cloudflare") counts.cloudflare++;
      if (domain.integration_source === "cpanel") counts.cpanel++;
    });

    return counts;
  };

  // Função para buscar dados de visitas (Gráfico de Linha)
  const getMonthlyVisitsData = async () => {
    const { data, error } = await supabase.rpc("get_monthly_visits");
    if (error) {
      toast.error("Erro ao carregar dados de visitas: " + error.message);
      return [];
    }
    return (data || []).map((item: any) => ({
      mes: item.mes,
      visitas: item.total_visitas,
    }));
  };

  // Função para buscar domínios com problemas (Card de Alerta)
  const getAlertDomains = async () => {
    const { count, error } = await supabase
      .from("domains")
      .select("*", { count: "exact", head: true })
      .in("status", ["expired", "suspended"]);
    // Adicionar lógica para 'problemas de integração' se necessário

    if (error) {
      toast.error("Erro ao verificar domínios com problemas: " + error.message);
      return 0;
    }

    return count || 0;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  // Dados para o gráfico de pizza de Integrações
  const integrationPieData = [
    { name: "Namecheap", value: integrations.namecheap },
    { name: "Cloudflare", value: integrations.cloudflare },
    { name: "cPanel", value: integrations.cpanel },
  ].filter((entry) => entry.value > 0);

  const PIE_COLORS = ["#FF8042", "#0088FE", "#FFBB28"];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? <LoadingSpinner className="mr-2 h-4 w-4" /> : <Globe className="mr-2 h-4 w-4" />}
            Sincronizar Agora
          </Button>
        </div>
      </div>

      {/* Grid principal de stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Card Total */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Domínios</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Todos os domínios gerenciados</p>
          </CardContent>
        </Card>
        {/* Card Ativos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Domínios Ativos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Status "active" e "pending"</p>
          </CardContent>
        </Card>
        {/* Card Vencendo */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencendo em 30 dias</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiring}</div>
            <p className="text-xs text-muted-foreground">Domínios que expiram em breve</p>
          </CardContent>
        </Card>
        {/* Card Saldo Namecheap */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Namecheap</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {balance ? (
              <>
                <div className="text-2xl font-bold" onClick={toggleCurrency} style={{ cursor: "pointer" }}>
                  {balanceCurrency === "usd" ? `$${balance.usd.toFixed(2)}` : formatBRL(balance.brl)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {balanceCurrency === "usd"
                    ? `Equivalente a ${formatBRL(balance.brl)}`
                    : `Equivalente a $${balance.usd.toFixed(2)}`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Integração não configurada.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grid de gráficos */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Gráfico de Visitas (Gráfico de Linha) */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Visitas Mensais</CardTitle>
            <CardDescription>Total de visitas nos últimos 6 meses (cPanel).</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyVisitsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="visitas" stroke="#10b981" activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {/* Gráfico de Integrações (Gráfico de Pizza) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Domínios por Integração</CardTitle>
            <CardDescription>Distribuição dos domínios pelas fontes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={integrationPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {integrationPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Domínios Críticos */}
      <div className="grid gap-4">
        <CriticalDomainsTable
          domains={domains}
          isLoading={loading}
          expiredCount={expiredDomains}
          expiringCount={expiringDomains}
          suspendedCount={suspendedDomains}
        />
      </div>
    </div>
  );
}
