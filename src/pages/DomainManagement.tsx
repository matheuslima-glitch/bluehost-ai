import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Globe, Calendar, TrendingUp, RefreshCw, LayoutDashboard, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Domain {
  id: string;
  domain_name: string;
  status: string;
  registrar: string | null;
  expiration_date: string | null;
  monthly_visits: number;
  integration_source: string | null;
  created_at: string;
  platform: string | null;
  traffic_source: string | null;
  purchase_date: string | null;
}

interface Filters {
  status: string;
  platform: string;
  traffic_source: string;
  purchase_date_start: string;
  purchase_date_end: string;
}

export default function DomainManagement() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [filteredDomains, setFilteredDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    status: "",
    platform: "",
    traffic_source: "",
    purchase_date_start: "",
    purchase_date_end: "",
  });

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      setRefreshing(true);
      const { data, error } = await supabase
        .from("domains")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setDomains(data || []);
      applyFilters(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar domínios");
      console.error("Error loading domains:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = (domainsToFilter: Domain[] = domains) => {
    let filtered = [...domainsToFilter];

    if (filters.status) {
      filtered = filtered.filter((d) => d.status === filters.status);
    }

    if (filters.platform) {
      filtered = filtered.filter((d) => d.platform === filters.platform);
    }

    if (filters.traffic_source) {
      filtered = filtered.filter((d) => d.traffic_source === filters.traffic_source);
    }

    if (filters.purchase_date_start) {
      filtered = filtered.filter(
        (d) => d.purchase_date && new Date(d.purchase_date) >= new Date(filters.purchase_date_start)
      );
    }

    if (filters.purchase_date_end) {
      filtered = filtered.filter(
        (d) => d.purchase_date && new Date(d.purchase_date) <= new Date(filters.purchase_date_end)
      );
    }

    setFilteredDomains(filtered);
    setCurrentPage(1);
  };

  const handleFilterChange = (key: keyof Filters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
  };

  const clearFilters = () => {
    setFilters({
      status: "",
      platform: "",
      traffic_source: "",
      purchase_date_start: "",
      purchase_date_end: "",
    });
    setFilteredDomains(domains);
    setCurrentPage(1);
  };

  useEffect(() => {
    applyFilters();
  }, [filters, domains]);

  const totalPages = Math.ceil(filteredDomains.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentDomains = filteredDomains.slice(startIndex, endIndex);

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
        <div className="animate-pulse">Carregando domínios...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gerenciamento de Domínios</h1>
          <p className="text-muted-foreground">Visualize e gerencie todos os seus domínios</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button onClick={loadDomains} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Filtre os domínios por critérios específicos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="filter-status">Status</Label>
                <Select value={filters.status} onValueChange={(value) => handleFilterChange("status", value)}>
                  <SelectTrigger id="filter-status">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="expired">Expirado</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-platform">Plataforma</Label>
                <Select value={filters.platform} onValueChange={(value) => handleFilterChange("platform", value)}>
                  <SelectTrigger id="filter-platform">
                    <SelectValue placeholder="Todas as plataformas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
                    <SelectItem value="wordpress">WordPress</SelectItem>
                    <SelectItem value="atomicat">AtomiCat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-traffic">Fonte de Tráfego</Label>
                <Select
                  value={filters.traffic_source}
                  onValueChange={(value) => handleFilterChange("traffic_source", value)}
                >
                  <SelectTrigger id="filter-traffic">
                    <SelectValue placeholder="Todas as fontes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
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
                <Label htmlFor="filter-date-start">Data de Compra (Início)</Label>
                <Input
                  id="filter-date-start"
                  type="date"
                  value={filters.purchase_date_start}
                  onChange={(e) => handleFilterChange("purchase_date_start", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-date-end">Data de Compra (Fim)</Label>
                <Input
                  id="filter-date-end"
                  type="date"
                  value={filters.purchase_date_end}
                  onChange={(e) => handleFilterChange("purchase_date_end", e.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Button variant="outline" onClick={clearFilters} className="w-full">
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Seus Domínios ({filteredDomains.length} de {domains.length})
          </CardTitle>
          <CardDescription>
            {filteredDomains.length === domains.length
              ? "Todos os domínios das suas integrações"
              : `Mostrando ${filteredDomains.length} domínios filtrados`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredDomains.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {domains.length === 0 ? "Nenhum domínio encontrado" : "Nenhum domínio corresponde aos filtros"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {domains.length === 0
                  ? "Sincronize suas integrações ou adicione novos domínios"
                  : "Tente ajustar os filtros para ver mais resultados"}
              </p>
              {domains.length === 0 ? (
                <Button>Adicionar Domínio</Button>
              ) : (
                <Button onClick={clearFilters}>Limpar Filtros</Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domínio</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plataforma</TableHead>
                    <TableHead>Fonte de Tráfego</TableHead>
                    <TableHead>Expiração</TableHead>
                    <TableHead>Visitas/Mês</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentDomains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          {domain.domain_name}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(domain.status)}</TableCell>
                      <TableCell>
                        {domain.platform ? (
                          <Badge variant="outline">{domain.platform}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {domain.traffic_source ? (
                          <Badge variant="secondary">{domain.traffic_source}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {domain.expiration_date ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(domain.expiration_date), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          {domain.monthly_visits.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/domains/${domain.id}`)}
                        >
                          <LayoutDashboard className="h-4 w-4 mr-2" />
                          Ver Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredDomains.length > 0 && totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <PaginationItem key={page}>
                          <span className="px-4">...</span>
                        </PaginationItem>
                      );
                    }
                    return null;
                  })}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
