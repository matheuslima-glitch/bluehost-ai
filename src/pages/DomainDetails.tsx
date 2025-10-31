import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Globe, Calendar, TrendingUp, Server, Wifi, X, Plus, Trash2, Edit2 } from "lucide-react";
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
  const [newDnsRecord, setNewDnsRecord] = useState({ type: 'A', name: '', content: '', ttl: 3600 });
  const [isEditingNameservers, setIsEditingNameservers] = useState(false);
  const [nameserversInput, setNameserversInput] = useState("");

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
    ...customFilters.filter(f => f.filter_type === "platform").map(f => f.filter_value)
  ];

  const trafficSourceOptions = [
    "facebook",
    "google",
    "native",
    "outbrain",
    "taboola",
    "revcontent",
    ...customFilters.filter(f => f.filter_type === "traffic_source").map(f => f.filter_value)
  ];

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

  useEffect(() => {
    if (domain?.zone_id) {
      loadDnsRecords();
    }
  }, [domain?.zone_id]);

  const loadDnsRecords = async () => {
    if (!domain?.zone_id) return;

    setLoadingDns(true);
    try {
      const { data, error } = await supabase.functions.invoke('cloudflare-integration', {
        body: {
          action: 'list_dns_records',
          zoneId: domain.zone_id
        }
      });

      if (error) throw error;
      if (data?.records) {
        setDnsRecords(data.records);
      }
    } catch (error: any) {
      console.error("Error loading DNS records:", error);
      toast.error("Erro ao carregar registros DNS");
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
      const { data, error } = await supabase.functions.invoke('cloudflare-integration', {
        body: {
          action: 'create_dns_record',
          zoneId: domain.zone_id,
          type: newDnsRecord.type,
          name: newDnsRecord.name,
          content: newDnsRecord.content,
          ttl: newDnsRecord.ttl
        }
      });

      if (error) throw error;
      
      toast.success("Registro DNS adicionado com sucesso");
      setNewDnsRecord({ type: 'A', name: '', content: '', ttl: 3600 });
      loadDnsRecords();
    } catch (error: any) {
      console.error("Error adding DNS record:", error);
      toast.error("Erro ao adicionar registro DNS");
    }
  };

  const deleteDnsRecord = async (recordId: string) => {
    if (!domain?.zone_id) return;

    try {
      const { error } = await supabase.functions.invoke('cloudflare-integration', {
        body: {
          action: 'delete_dns_record',
          zoneId: domain.zone_id,
          recordId
        }
      });

      if (error) throw error;
      
      toast.success("Registro DNS removido com sucesso");
      loadDnsRecords();
    } catch (error: any) {
      console.error("Error deleting DNS record:", error);
      toast.error("Erro ao remover registro DNS");
    }
  };

  const loadDomain = async () => {
    try {
      const { data, error } = await supabase
        .from("domains")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setDomain(data);
      
      // Inicializar nameservers input quando carregar o domínio
      if (data?.nameservers) {
        setNameserversInput(data.nameservers.join("\n"));
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
      const { error } = await supabase
        .from("domains")
        .update({ nameservers })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      loadDomain();
      toast.success("Nameservers atualizados com sucesso!");
      setIsEditingNameservers(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar nameservers: " + error.message);
    },
  });

  const handleSaveNameservers = () => {
    const nameservers = nameserversInput
      .split("\n")
      .map(ns => ns.trim())
      .filter(ns => ns.length > 0);
    
    if (nameservers.length === 0) {
      toast.error("Adicione pelo menos um nameserver");
      return;
    }
    
    updateNameservers.mutate(nameservers);
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
    <div className="space-y-6">
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Nameservers:</span>
                  </div>
                  {!isEditingNameservers ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingNameservers(true)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditingNameservers(false);
                          setNameserversInput(domain.nameservers?.join("\n") || "");
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveNameservers}
                        disabled={updateNameservers.isPending}
                      >
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>
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
                    <textarea
                      value={nameserversInput}
                      onChange={(e) => setNameserversInput(e.target.value)}
                      placeholder="Digite um nameserver por linha&#10;Exemplo:&#10;ns1.example.com&#10;ns2.example.com"
                      className="w-full min-h-[120px] p-2 text-sm border rounded-md bg-background"
                    />
                  )}
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
                  {platformOptions.map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </SelectItem>
                  ))}
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
                  {trafficSourceOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source.charAt(0).toUpperCase() + source.slice(1)}
                    </SelectItem>
                  ))}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDnsRecord(record.id)}
                          >
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
    </div>
  );
}
