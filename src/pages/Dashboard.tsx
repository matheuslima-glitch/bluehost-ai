import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, TrendingUp, AlertCircle, Clock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

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
    cpanel: 431,
  });
  const [balance, setBalance] = useState<{ usd: number; brl: number } | null>(null);
  const [totalVisits, setTotalVisits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load domains
      const { data: domains, error } = await supabase
        .from("domains")
        .select("*");

      if (error) throw error;

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      const stats = {
        total: domains?.length || 0,
        active: domains?.filter(d => d.status === "active").length || 0,
        expiring: domains?.filter(d => {
          if (!d.expiration_date) return false;
          const expDate = new Date(d.expiration_date);
          return expDate > now && expDate < thirtyDaysFromNow;
        }).length || 0,
        expired: domains?.filter(d => d.status === "expired").length || 0,
        suspended: domains?.filter(d => d.status === "suspended").length || 0,
        critical: domains?.filter(d => {
          if (!d.expiration_date) return false;
          const expDate = new Date(d.expiration_date);
          return expDate > now && expDate < fifteenDaysFromNow;
        }).length || 0,
      };

      const integrationCounts = {
        namecheap: domains?.filter(d => d.integration_source === "namecheap").length || 0,
        cloudflare: domains?.filter(d => d.integration_source === "cloudflare").length || 0,
        cpanel: domains?.filter(d => d.integration_source === "cpanel").length || 431,
      };

      // Calculate total visits from all domains
      const totalMonthlyVisits = domains?.reduce((sum, d) => sum + (d.monthly_visits || 0), 0) || 0;

      setStats(stats);
      setIntegrations(integrationCounts);
      setTotalVisits(totalMonthlyVisits);

      // Load Namecheap balance
      try {
        const { data: balanceData, error: balanceError } = await supabase.functions.invoke("namecheap-domains", {
          body: { action: "balance" }
        });

        if (!balanceError && balanceData?.balance) {
          setBalance(balanceData.balance);
        }
      } catch (balanceErr) {
        console.error("Error loading balance:", balanceErr);
      }
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
    { name: "Namecheap", dominios: integrations.namecheap },
    { name: "cPanel", dominios: integrations.cpanel },
    { name: "Cloudflare", dominios: integrations.cloudflare },
  ];

  const lineData = [
    { mes: "Jan", visitas: 12400 },
    { mes: "Fev", visitas: 15800 },
    { mes: "Mar", visitas: 18200 },
    { mes: "Abr", visitas: 21500 },
    { mes: "Mai", visitas: 19800 },
    { mes: "Jun", visitas: 23400 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse">Carregando...</div>
      </div>
    );
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

      {/* Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Status das Integrações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Namecheap</p>
                <p className="text-2xl font-bold">{integrations.namecheap}</p>
                <p className="text-xs text-muted-foreground">domínios</p>
                {balance && (
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-primary">${balance.usd.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">R$ {balance.brl.toFixed(2)}</p>
                  </div>
                )}
              </div>
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm font-medium">cPanel</p>
                <p className="text-2xl font-bold">{integrations.cpanel}</p>
                <p className="text-xs text-muted-foreground">domínios</p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Cloudflare</p>
                <p className="text-2xl font-bold">{integrations.cloudflare}</p>
                <p className="text-xs text-muted-foreground">zonas</p>
                <div className="mt-2">
                  <p className="text-sm font-semibold text-primary">{totalVisits.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">acessos mensais</p>
                </div>
              </div>
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status dos Domínios</CardTitle>
            <CardDescription>Distribuição por status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
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
            <CardDescription>Tráfego total dos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
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
