import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Globe, Calendar, TrendingUp, Server, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
}

export default function DomainDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDomain();
  }, [id]);

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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      active: { label: "Ativo", variant: "default" },
      expired: { label: "Expirado", variant: "destructive" },
      pending: { label: "Pendente", variant: "secondary" },
      suspended: { label: "Suspenso", variant: "outline" },
    };

    const config = variants[status] || variants.active;
    return <Badge variant={config.variant}>{config.label}</Badge>;
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

            <div className="space-y-2">
              <Label>Visitas Mensais</Label>
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                {domain.monthly_visits.toLocaleString()}
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
    </div>
  );
}
