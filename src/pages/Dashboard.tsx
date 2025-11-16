import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, TrendingUp, AlertCircle, Clock, CheckCircle2, AlertTriangle, XCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
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
import { CriticalDomainsAlert } from "@/components/CriticalDomainsAlert";

export default function Dashboard() {
  const { user } = useAuth();
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

  const loadUserName = async () => {
    if (!user?.id) return;

    const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();

    if (data?.full_name) {
      const name = data.full_name.split(" ")[0];
      setFirstName(name);
    }
  };

  const checkIntegrationsStatus = async () => {
    const status = {
      namecheap: false,
      cpanel: false,
      cloudflare: false,
    };

    try {
      const { data: balanceData } = await supabase
        .from("namecheap_balance")
        .select("*")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      status.namecheap = !!balanceData;
    } catch (error) {
      console.error("Erro ao verificar status Namecheap:", error);
    }

    try {
      const { data, error } = await supabase.functions.invoke("cloudflare-integration", {
        body: { action: "zones" },
      });

      status.cloudflare = !error || (error && !error.message.includes("credentials not configured"));
    } catch (error: any) {
      status.cloudflare = !error?.message?.includes("credentials not configured");
    }

    try {
      const { data, error } = await supabase.functions.invoke("cpanel-integration", {
        body: { action: "domains" },
      });

      status.cpanel = !error || (error && !error.message.includes("credentials not configured"));
    } catch (error: any) {
      status.cpanel = !error?.message?.includes("credentials not configured");
    }

    return status;
  };

  const loadDashboardData = async () => {
    try {
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

            if (data.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        return allDomains;
      };

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

      const { data: analyticsGeralData, error: analyticsGeralError } = await supabase
        .from("analytics_geral")
        .select("*")
        .eq("current_year", new Date().getFullYear())
        .single();

      if (!analyticsGeralError && analyticsGeralData) {
        const totalVisitsFromDB = Number(analyticsGeralData.annual_visits) || 0;
        setTotalVisits(totalVisitsFromDB);

        const monthsMapping: { [key: string]: string } = {
          jan: "Jan",
          feb: "Fev",
          mar: "Mar",
          apr: "Abr",
          may: "Mai",
          jun: "Jun",
          jul: "Jul",
          aug: "Ago",
          sep: "Set",
          oct: "Out",
          nov: "Nov",
          dec: "Dez",
        };

        const monthlyData = [];
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();

        for (let i = 11; i >= 0; i--) {
          const targetDate = new Date(currentYear, currentMonth - i, 1);
          const monthIndex = targetDate.getMonth();
          const year = targetDate.getFullYear();
          const isCurrentYear = year === currentYear;

          const monthKey = Object.keys(monthsMapping)[monthIndex];
          const suffix = isCurrentYear ? "_cy" : "_py";
          const columnName = `${monthKey}${suffix}`;

          const visits = Number(analyticsGeralData[columnName]) || 0;

          monthlyData.push({
            mes: `${monthsMapping[monthKey]}/${year.toString().slice(-2)}`,
            visitas: visits,
          });
        }

        setMonthlyVisitsData(monthlyData);
      }

      const statusCheck = await checkIntegrationsStatus();
      setIntegrationStatus(statusCheck);

      try { //BUSCAR O SALDO
        await fetch("https://domainhub-backend.onrender.com/api/balance/sync", {
          method: "POST"
          headers: { "Content-Type": "application/json" },
        });
      } catch (webhookError: any) {
        console.warn("Aviso: Falha ao atualizar saldo.", webhookError.message);
        toast.warning("Não foi possível atualizar o saldo em tempo real. Carregando último valor salvo.");
      }

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

      const { count: expiredCount } = await supabase
        .from("domains")
        .select("*", { count: "exact", head: true })
        .eq("status", "expired");
      setExpiredDomains(expiredCount || 0);

      const { count: expiringCount } = await supabase
        .from("domains")
        .select("*", { count: "exact", head: true })
        .gte("expiration_date", now.toISOString())
        .lte("expiration_date", thirtyDaysFromNow.toISOString());
      setExpiringDomains(expiringCount || 0);

      const { count: criticalCount } = await supabase
        .from("domains")
        .select("*", { count: "exact", head: true })
        .gte("expiration_date", now.toISOString())
        .lte("expiration_date", fifteenDaysFromNow.toISOString());
      setCriticalDomains(criticalCount || 0);

      const { count: suspendedCount } = await supabase
        .from("domains")
        .select("*", { count: "exact", head: true })
        .eq("status", "suspended");
      setSuspendedDomains(suspendedCount || 0);

      const totalAlerts = (expiredCount || 0) + (criticalCount || 0) + (suspendedCount || 0);
      setAlertDomains(totalAlerts);
    } catch (error: any) {
      toast.error("Erro ao carregar dados do dashboard");
      console.error("Dashboard error:", error);
    } finally {
      setLoading(false);
    }
  };

  const pieData = [
    { name: "Ativos", value: stats.active, color: "#10b981" },
    { name: "Expirando", value: stats.expiring, color: "#f59e0b" },
    { name: "Expirados", value: stats.expired, color: "#ef4444" },
    { name: "Suspensos", value: stats.suspended, color: "#8b5cf6" },
  ];

  const barData = [
    { name: "Namecheap", dominios: integrations.namecheap },
    { name: "Cloudflare", dominios: integrations.cloudflare },
    { name: "cPanel", dominios: integrations.cpanel },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{firstName ? `Olá, ${firstName}!` : "Dashboard"}</h1>
          <p className="text-muted-foreground">Visão geral dos seus domínios e integrações</p>
        </div>
        <Button onClick={loadDashboardData} variant="outline">
          Atualizar Dados
        </Button>
      </div>

      {alertDomains > 0 && <CriticalDomainsAlert count={alertDomains} />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Domínios</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Todos os domínios cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Domínios Ativos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Operacionais e validados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expirando em Breve</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{stats.expiring}</div>
            <p className="text-xs text-muted-foreground">Próximos 30 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Visitas Totais</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVisits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">No ano atual</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Status das Integrações
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
                    <p className="text-sm font-medium">Namecheap</p>
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
                    <p className="text-sm font-medium">cPanel</p>
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
                    <p className="text-sm font-medium">Cloudflare</p>
                  </div>
                </div>
                <Badge variant={integrationStatus.cloudflare ? "default" : "destructive"}>
                  {integrationStatus.cloudflare ? "Ativa" : "Inativa"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

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
      </div>

      <div data-critical-domains-table className="critical-domains-table scroll-mt-4">
        <CriticalDomainsTable domains={domains} onDomainsChange={loadDashboardData} />
      </div>

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
                <Tooltip />
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
                <Tooltip />
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
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString("pt-BR") + " visitas", "Visitas"]}
                  labelFormatter={(label) => `Mês: ${label}`}
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
