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