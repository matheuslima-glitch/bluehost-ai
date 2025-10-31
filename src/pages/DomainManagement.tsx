import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
import { Globe, Calendar, TrendingUp, RefreshCw, LayoutDashboard, Filter, Search, ArrowUpDown } from "lucide-react";
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
  funnel_id: string | null;
}

interface Filters {
  status: string;
  platform: string;
  traffic_source: string;
  purchase_date_start: string;
  purchase_date_end: string;
  funnel_id: string;
}

export default function DomainManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [filteredDomains, setFilteredDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<Filters>({
    status: "",
    platform: "",
    traffic_source: "",
    purchase_date_start: "",
    purchase_date_end: "",
    funnel_id: "",
  });

  const ITEMS_PER_PAGE = 20;

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

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((d) =>
        d.domain_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

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

    if (filters.funnel_id) {
      filtered = filtered.filter((d) => d.funnel_id === filters.funnel_id);
    }

    // Apply sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Domain];
        let bValue: any = b[sortConfig.key as keyof Domain];

        // Handle null values
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        // Sort by date
        if (sortConfig.key === 'expiration_date') {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        }

        // Sort alphabetically or numerically
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredDomains(filtered);
    setCurrentPage(1);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
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
      funnel_id: "",
    });
    setFilteredDomains(domains);
    setCurrentPage(1);
  };

  useEffect(() => {
    applyFilters();
  }, [filters, domains, searchQuery, sortConfig]);

  const totalPages = Math.ceil(filteredDomains.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentDomains = filteredDomains.slice(startIndex, endIndex);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "secondary" }> = {
      active: { label: "Ativo", variant: "success" },
      expired: { label: "Expirado", variant: "destructive" },
      pending: { label: "Pendente", variant: "secondary" },
      suspended: { label: "Suspenso", variant: "warning" },
    };

    const config = variants[status] || variants.active;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
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
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar domínio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
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
                <Select value={filters.status || "all"} onValueChange={(value) => handleFilterChange("status", value === "all" ? "" : value)}>
                  <SelectTrigger id="filter-status">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="expired">Expirado</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-platform">Plataforma</Label>
                <Select value={filters.platform || "all"} onValueChange={(value) => handleFilterChange("platform", value === "all" ? "" : value)}>
                  <SelectTrigger id="filter-platform">
                    <SelectValue placeholder="Todas as plataformas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {platformOptions.map((platform) => (
                      <SelectItem key={platform} value={platform}>
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-traffic">Fonte de Tráfego</Label>
                <Select
                  value={filters.traffic_source || "all"}
                  onValueChange={(value) => handleFilterChange("traffic_source", value === "all" ? "" : value)}
                >
                  <SelectTrigger id="filter-traffic">
                    <SelectValue placeholder="Todas as fontes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {trafficSourceOptions.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source.charAt(0).toUpperCase() + source.slice(1)}
                      </SelectItem>
                    ))}
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

              <div className="space-y-2">
                <Label htmlFor="filter-funnel">ID Funil</Label>
                <Input
                  id="filter-funnel"
                  type="text"
                  placeholder="Digite o ID do funil"
                  value={filters.funnel_id}
                  onChange={(e) => handleFilterChange("funnel_id", e.target.value)}
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
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('domain_name')}
                        className="flex items-center gap-1 p-0 h-auto font-semibold"
                      >
                        Domínio
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 p-0 h-auto font-semibold"
                      >
                        Status
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('platform')}
                        className="flex items-center gap-1 p-0 h-auto font-semibold"
                      >
                        Plataforma
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('traffic_source')}
                        className="flex items-center gap-1 p-0 h-auto font-semibold"
                      >
                        Fonte de Tráfego
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>ID Funil</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('expiration_date')}
                        className="flex items-center gap-1 p-0 h-auto font-semibold"
                      >
                        Expiração
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
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
                        {domain.funnel_id ? (
                          <Badge variant="outline">{domain.funnel_id}</Badge>
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
