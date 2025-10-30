import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, TrendingUp, AlertCircle, Clock, CheckCircle2, AlertTriangle, XCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

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

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load domains
      const { data: domainsData, error } = await supabase
        .from("domains")
        .select("*");

      if (error) throw error;
      
      setDomains(domainsData || []);

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      const stats = {
        total: domainsData?.length || 0,
        active: domainsData?.filter(d => d.status === "active").length || 0,
        expiring: domainsData?.filter(d => {
          if (!d.expiration_date) return false;
          const expDate = new Date(d.expiration_date);
          return expDate > now && expDate < thirtyDaysFromNow;
        }).length || 0,
        expired: domainsData?.filter(d => d.status === "expired").length || 0,
        suspended: domainsData?.filter(d => d.status === "suspended").length || 0,
        critical: domainsData?.filter(d => {
          if (!d.expiration_date) return false;
          const expDate = new Date(d.expiration_date);
          return expDate > now && expDate < fifteenDaysFromNow;
        }).length || 0,
      };

      const integrationCounts = {
        namecheap: domainsData?.filter(d => d.integration_source === "namecheap").length || 0,
        cloudflare: domainsData?.filter(d => d.integration_source === "cloudflare").length || 0,
        cpanel: domainsData?.filter(d => d.integration_source === "cpanel").length || 0,
      };

      setStats(stats);
      setIntegrations(integrationCounts);

      // Load analytics data from database
      const { data: analyticsData, error: analyticsError } = await supabase
        .from("domain_analytics")
        .select("*");

      if (!analyticsError && analyticsData) {
        // Calculate total visits from database
        const totalVisitsFromDB = analyticsData.reduce((sum, record) => sum + (record.visits || 0), 0);
        setTotalVisits(totalVisitsFromDB);

        // Generate monthly visits data
        const monthlyVisitsMap = new Map<string, number>();
        const today = new Date();
        
        // Initialize last 12 months with 0
        for (let i = 11; i >= 0; i--) {
          const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyVisitsMap.set(monthKey, 0);
        }

        // Aggregate visits by month
        analyticsData.forEach(record => {
          if (record.date) {
            const recordDate = new Date(record.date);
            const monthKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
            if (monthlyVisitsMap.has(monthKey)) {
              monthlyVisitsMap.set(monthKey, (monthlyVisitsMap.get(monthKey) || 0) + (record.visits || 0));
            }
          }
        });

        // Convert to array format for chart
        const last12Months: Array<{ mes: string; visitas: number }> = [];
        for (let i = 11; i >= 0; i--) {
          const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const monthLabel = `${date.toLocaleString('pt-BR', { month: 'short' })}/${date.getFullYear()}`;
          
          last12Months.push({
            mes: monthLabel,
            visitas: monthlyVisitsMap.get(monthKey) || 0
          });
        }
        
        setMonthlyVisitsData(last12Months);
      }

      // Load Namecheap balance from database
      const { data: balanceData, error: balanceError } = await supabase
        .from("namecheap_balance")
        .select("*")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!balanceError && balanceData) {
        setBalance({
          usd: balanceData.balance_usd,
          brl: balanceData.balance_brl
        });
        setIntegrationStatus(prev => ({ ...prev, namecheap: true }));
      } else {
        setIntegrationStatus(prev => ({ ...prev, namecheap: false }));
      }

      // Load expired domains from Namecheap API
      try {
        const { data: expiredData, error: expiredError } = await supabase.functions.invoke("namecheap-domains", {
          body: { action: "list_domains", listType: "EXPIRED" }
        });

        if (!expiredError && expiredData?.domains) {
          console.log("Domínios expirados:", expiredData.domains);
          setExpiredDomains(expiredData.domains.length);
        } else {
          console.error("Erro ao carregar domínios expirados:", expiredError);
        }
      } catch (expiredErr) {
        console.error("Error loading expired domains:", expiredErr);
      }

      // Load expiring domains from Namecheap API
      try {
        const { data: expiringData, error: expiringError } = await supabase.functions.invoke("namecheap-domains", {
          body: { action: "list_domains", listType: "EXPIRING" }
        });

        if (!expiringError && expiringData?.domains) {
          console.log("Domínios expirando:", expiringData.domains);
          setExpiringDomains(expiringData.domains.length);
          
          // Filter critical domains (expiring in 15 days)
          const now = new Date();
          const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
          
          const critical = expiringData.domains.filter((d: any) => {
            const expDate = new Date(d.expirationDate);
            return expDate <= fifteenDaysFromNow;
          });
          
          console.log("Domínios críticos (15 dias):", critical);
          setCriticalDomains(critical.length);
        } else {
          console.error("Erro ao carregar domínios expirando:", expiringError);
        }
      } catch (expiringErr) {
        console.error("Error loading expiring domains:", expiringErr);
      }

      // Load suspended domains from Namecheap API (they might be in the all domains list)
      try {
        const { data: allDomainsData, error: allDomainsError } = await supabase.functions.invoke("namecheap-domains", {
          body: { action: "list" }
        });

        if (!allDomainsError && allDomainsData?.domains) {
          // Namecheap doesn't have a direct "suspended" status
          // We need to check the domains in the database that have suspended status
          const suspendedCount = domainsData?.filter(d => d.status === "suspended").length || 0;
          console.log("Domínios suspensos:", suspendedCount);
          setSuspendedDomains(suspendedCount);
        }
      } catch (suspendedErr) {
        console.error("Error loading suspended domains:", suspendedErr);
        // Fallback to database count
        const suspendedCount = domainsData?.filter(d => d.status === "suspended").length || 0;
        setSuspendedDomains(suspendedCount);
      }

      // Set cPanel and Cloudflare integration status
      setIntegrationStatus(prev => ({
        ...prev,
        cpanel: integrationCounts.cpanel > 0,
        cloudflare: integrationCounts.cloudflare > 0,
      }));
    } catch (error: any) {
      console.error("Dashboard load error:", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  };

  const syncIntegrations = async () => {
    setSyncing(true);
    toast.info("Sincronizando integrações...");

    try {
      // Sync Namecheap
      const { error: ncError } = await supabase.functions.invoke("namecheap-domains", {
        body: { action: "list" }
      });

      // Sync Cloudflare
      const { error: cfError } = await supabase.functions.invoke("cloudflare-integration", {
        body: { action: "zones" }
      });

      // Sync cPanel
      const { error: cpError } = await supabase.functions.invoke("cpanel-integration", {
        body: { action: "domains" }
      });

      if (!ncError && !cfError && !cpError) {
        toast.success("Integrações sincronizadas com sucesso!");
        await loadDashboardData();
      } else {
        toast.warning("Algumas integrações falharam ao sincronizar");
      }
    } catch (error: any) {
      toast.error("Erro ao sincronizar integrações");
    } finally {
      setSyncing(false);
    }
  };

  const pieData = [
    { name: "Ativos", value: stats.active, color: "#22c55e" },
    { name: "Expirando", value: stats.expiring, color: "#eab308" },
    { name: "Expirados", value: stats.expired, color: "#ef4444" },
    { name: "Suspensos", value: stats.suspended, color: "#f97316" },
  ];

  const barData = [
    { name: "Atomicat", dominios: domains?.filter(d => d.platform === "atomicat").length || 0 },
    { name: "Wordpress", dominios: domains?.filter(d => d.platform === "wordpress").length || 0 },
  ];

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Geral</h1>
          <p className="text-muted-foreground">Visão completa de todos os seus domínios</p>
        </div>
        <Button onClick={syncIntegrations} disabled={syncing}>
          {syncing ? "Sincronizando..." : "Sincronizar"}
        </Button>
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
            <p className="text-xs text-muted-foreground mt-1">
              {stats.active} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expirados</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expired}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Domínios expirados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expirando em Breve</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiring}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Próximos 30 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Críticos</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.critical}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Próximos 15 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Suspensos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.suspended}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Verificar pendências
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Integration Status */}
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
                    <p className="text-xs text-muted-foreground">
                      {integrations.cpanel} domínios
                    </p>
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
                    <p className="text-xs text-muted-foreground">
                      {integrations.cloudflare} zonas
                    </p>
                  </div>
                </div>
                <Badge variant={integrationStatus.cloudflare ? "default" : "destructive"}>
                  {integrationStatus.cloudflare ? "Ativa" : "Inativa"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Namecheap Balance */}
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
                  {(balance.usd === 0 && balance.brl === 0) ? (
                    <>
                      <div className="text-3xl font-bold text-muted-foreground">
                        {balanceCurrency === "usd" ? "$0.00" : "R$ 0,00"}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        Adicione créditos para começar
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-4xl font-bold text-blue-500">
                        {balanceCurrency === "usd" 
                          ? `$${balance.usd.toFixed(2)}`
                          : `R$ ${balance.brl.toFixed(2)}`
                        }
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        Saldo disponível para compras
                      </p>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={balanceCurrency === "usd" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setBalanceCurrency("usd")}
                    className={`flex items-center gap-2 ${
                      balanceCurrency === "usd" 
                        ? "bg-primary text-primary-foreground" 
                        : ""
                    }`}
                  >
                    <span className="text-base">🇺🇸</span>
                    USD
                  </Button>
                  <Button
                    variant={balanceCurrency === "brl" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setBalanceCurrency("brl")}
                    className={`flex items-center gap-2 ${
                      balanceCurrency === "brl" 
                        ? "bg-primary text-primary-foreground" 
                        : ""
                    }`}
                  >
                    <span className="text-base">🇧🇷</span>
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
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
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
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="visitas" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
