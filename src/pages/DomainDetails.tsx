import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Globe, Calendar, TrendingUp, Server, Wifi, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
}

export default function DomainDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingNamecheap, setFetchingNamecheap] = useState(false);
  const [funnelIdInput, setFunnelIdInput] = useState("");
  const [funnelIdTags, setFunnelIdTags] = useState<string[]>([]);

  // Generate mock monthly visits data
  const generateMonthlyData = (monthlyVisits: number) => {
    const data = [];
    const currentDate = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = subMonths(currentDate, i);
      const monthName = format(date, "MMM/yy", { locale: ptBR });
      const variation = 0.7 + Math.random() * 0.6; // 70% to 130% variation
      const visits = Math.round(monthlyVisits * variation);
      
      data.push({
        month: monthName,
        visits: visits,
      });
    }
    
    return data;
  };

  useEffect(() => {
    loadDomain();
  }, [id]);

  useEffect(() => {
    if (domain?.funnel_id) {
      setFunnelIdTags(domain.funnel_id.split(',').filter(tag => tag.trim() !== ''));
    }
  }, [domain]);

  const loadDomain = async () => {
    try {
      const { data, error } = await supabase
        .from("domains")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setDomain(data);
    } catch (error: any) {
      toast.error("Erro ao carregar domínio");
      console.error("Error loading domain:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNamecheapInfo = async () => {
    if (!domain) return;

    setFetchingNamecheap(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('namecheap-domains', {
        body: { 
          action: 'get_domain_info',
          domainName: domain.domain_name
        }
      });

      if (error) throw error;

      if (data?.domainInfo?.createdDate) {
        // Update domain with purchase date from Namecheap
        const { error: updateError } = await supabase
          .from("domains")
          .update({ purchase_date: data.domainInfo.createdDate })
          .eq("id", domain.id);

        if (updateError) throw updateError;

        setDomain({ ...domain, purchase_date: data.domainInfo.createdDate });
        toast.success("Data de compra atualizada com sucesso!");
      } else {
        toast.info("Informações não disponíveis na Namecheap");
      }
    } catch (error: any) {
      toast.error("Erro ao buscar informações da Namecheap");
      console.error("Error fetching Namecheap info:", error);
    } finally {
      setFetchingNamecheap(false);
    }
  };

  const updateDomain = async (field: string, value: string) => {
    if (!domain) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("domains")
        .update({ [field]: value })
        .eq("id", domain.id);

      if (error) throw error;

      setDomain({ ...domain, [field]: value });
      toast.success("Informação atualizada com sucesso");
    } catch (error: any) {
      toast.error("Erro ao atualizar informação");
      console.error("Error updating domain:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleFunnelIdKeyPress = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && funnelIdInput.trim() !== '') {
      e.preventDefault();
      const newTags = [...funnelIdTags, funnelIdInput.trim()];
      setFunnelIdTags(newTags);
      setFunnelIdInput("");
      await updateDomain("funnel_id", newTags.join(','));
    }
  };

  const removeFunnelIdTag = async (tagToRemove: string) => {
    const newTags = funnelIdTags.filter(tag => tag !== tagToRemove);
    setFunnelIdTags(newTags);
    await updateDomain("funnel_id", newTags.join(','));
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      active: { label: "Ativo", className: "bg-green-500 hover:bg-green-600 text-white" },
      expired: { label: "Expirado", className: "bg-red-500 hover:bg-red-600 text-white" },
      pending: { label: "Pendente", className: "bg-blue-500 hover:bg-blue-600 text-white" },
      suspended: { label: "Suspenso", className: "bg-yellow-500 hover:bg-yellow-600 text-white" },
    };

    const config = statusConfig[status] || statusConfig.active;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse">Carregando detalhes do domínio...</div>
      </div>
    );
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/domains")}>
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
            <CardDescription>Status e dados principais do domínio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Status do Domínio</Label>
              <div>{getStatusBadge(domain.status)}</div>
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
              <Label>Acesso Rápido</Label>
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    const wordpressUrl = `https://${domain.domain_name}/wordpanel124`;
                    window.open(wordpressUrl, '_blank');
                    toast.info("Abrindo painel WordPress. Faça login com as credenciais fornecidas.");
                  }}
                  className="flex items-center gap-2 bg-[#21759b] hover:bg-[#1e6a8d] text-white flex-1"
                >
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/9/93/Wordpress_Blue_logo.png" 
                    alt="WordPress" 
                    className="h-5 w-5 object-contain"
                  />
                  <span className="text-sm">Login WordPress</span>
                </Button>

                <Button
                  onClick={() => {
                    const atomicatUrl = "https://app.atomicat.com.br/login";
                    window.open(atomicatUrl, '_blank');
                    toast.info("Abrindo painel Atomicat. Faça login com as credenciais fornecidas.");
                  }}
                  className="flex items-center gap-2 bg-gradient-to-r from-gray-900 to-gray-600 hover:from-gray-800 hover:to-gray-500 text-white flex-1"
                >
                  <img 
                    src="https://hotmart.s3.amazonaws.com/product_pictures/27c9db33-412c-4683-b79f-562016a33220/imagemavatardegradedark.png" 
                    alt="Atomicat" 
                    className="h-5 w-5 object-contain rounded"
                  />
                  <span className="text-sm">Login Atomicat</span>
                </Button>
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
                disabled={saving}
              >
                <SelectTrigger id="platform">
                  <Server className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Selecione uma plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wordpress">WordPress</SelectItem>
                  <SelectItem value="atomicat">AtomiCat</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {domain.purchase_date
                  ? "Informação preenchida automaticamente"
                  : "Configure manualmente a plataforma"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="traffic_source">Fonte de Tráfego</Label>
              <Select
                value={domain.traffic_source || ""}
                onValueChange={(value) => updateDomain("traffic_source", value)}
                disabled={saving}
              >
                <SelectTrigger id="traffic_source">
                  <Wifi className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Selecione uma fonte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="native">Native</SelectItem>
                  <SelectItem value="outbrain">Outbrain</SelectItem>
                  <SelectItem value="taboola">Taboola</SelectItem>
                  <SelectItem value="revcontent">RevContent</SelectItem>
                </SelectContent>
              </Select>
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
                disabled={saving}
              />
              {funnelIdTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {funnelIdTags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeFunnelIdTag(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Pressione Enter para adicionar uma tag
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Data e Hora da Compra</Label>
                {domain.registrar === 'Namecheap' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchNamecheapInfo}
                    disabled={fetchingNamecheap}
                  >
                    <RefreshCw className={`h-4 w-4 ${fetchingNamecheap ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {domain.purchase_date
                  ? format(new Date(domain.purchase_date), "dd/MM/yyyy HH:mm", { locale: ptBR })
                  : "Domínio não foi comprado no sistema"}
              </div>
              {domain.registrar === 'Namecheap' && !domain.purchase_date && (
                <p className="text-xs text-muted-foreground">
                  Clique no botão de atualizar para buscar data da Namecheap
                </p>
              )}
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
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={generateMonthlyData(domain.monthly_visits)}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--foreground))' }}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [value.toLocaleString() + ' visitas', 'Visitas']}
              />
              <Line 
                type="monotone" 
                dataKey="visits" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
