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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
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
    ...customFilters.filter((f) => f.filter_type === "platform").map((f) => f.filter_value),
  ];

  const trafficSourceOptions = [
    "facebook",
    "google",
    "native",
    "outbrain",
    "taboola",
    "revcontent",
    ...customFilters.filter((f) => f.filter_type === "traffic_source").map((f) => f.filter_value),
  ];

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      setRefreshing(true);

      // CORREÇÃO: Buscar TODOS os domínios usando paginação recursiva
      const fetchAllDomains = async () => {
        let allDomains: Domain[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from("domains")
            .select("*")
            .range(from, from + pageSize - 1)
            .order("created_at", { ascending: false });

          if (error) throw error;

          if (data && data.length > 0) {
            allDomains = [...allDomains, ...data];
            from += pageSize;

            // Se retornou menos que o pageSize, chegamos ao fim
            if (data.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        return allDomains;
      };

      const data = await fetchAllDomains();
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
      filtered = filtered.filter((d) => d.domain_name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    if (filters.status) {
      filtered = filtered.filter((d) => d.status === filters.status);
    }

    if (filters.platform) {
      if (filters.platform === "empty") {
        filtered = filtered.filter((d) => d.platform === null);
      } else {
        filtered = filtered.filter((d) => d.platform === filters.platform);
      }
    }

    if (filters.traffic_source) {
      if (filters.traffic_source === "empty") {
        filtered = filtered.filter((d) => d.traffic_source === null);
      } else {
        filtered = filtered.filter((d) => d.traffic_source === filters.traffic_source);
      }
    }

    if (filters.purchase_date_start) {
      filtered = filtered.filter(
        (d) => d.purchase_date && new Date(d.purchase_date) >= new Date(filters.purchase_date_start),
      );
    }

    if (filters.purchase_date_end) {
      filtered = filtered.filter(
        (d) => d.purchase_date && new Date(d.purchase_date) <= new Date(filters.purchase_date_end),
      );
    }

    if (filters.funnel_id) {
      filtered = filtered.filter((d) => d.funnel_id === filters.funnel_id);
    }

    // Apply sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Domain];
        const bValue = b[sortConfig.key as keyof Domain];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    setFilteredDomains(filtered);
    setCurrentPage(1);
  };

  useEffect(() => {
    applyFilters();
  }, [searchQuery, filters, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "asc" };
    });
  };

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
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
    setSearchQuery("");
    setSortConfig(null);
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || "";

    if (["active", "ativo"].includes(statusLower)) {
      return <Badge className="bg-green-500 hover:bg-green-600">Ativo</Badge>;
    }
    if (["inactive", "inativo"].includes(statusLower)) {
      return <Badge className="bg-gray-500 hover:bg-gray-600">Inativo</Badge>;
    }
    if (["suspended", "suspenso"].includes(statusLower)) {
      return <Badge className="bg-red-500 hover:bg-red-600">Suspenso</Badge>;
    }
    if (["expired", "expirado"].includes(statusLower)) {
      return <Badge className="bg-orange-500 hover:bg-orange-600">Expirado</Badge>;
    }
    if (["deactivated", "desativado"].includes(statusLower)) {
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">Desativado</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  const totalPages = Math.ceil(filteredDomains.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentDomains = filteredDomains.slice(startIndex, endIndex);

  const stats = {
    total: domains.length,
    active: domains.filter((d) => ["active", "ativo"].includes(d.status?.toLowerCase())).length,
    expiringSoon: domains.filter((d) => {
      if (!d.expiration_date) return false;
      const daysUntilExpiration = Math.floor(
        (new Date(d.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
      );
      return daysUntilExpiration <= 30 && daysUntilExpiration > 0;
    }).length,
    totalVisits: domains.reduce((sum, d) => sum + (d.monthly_visits || 0), 0),
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-[1800px]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5" />
              <CardTitle>Gerenciamento de Domínios</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadDomains} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
          <CardDescription>
            Gerencie seus {domains.length} domínios registrados. {stats.active} ativos, {stats.expiringSoon} expirando
            em breve
          </CardDescription>

          {domains.length === 0 && !loading && (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum domínio encontrado</p>
            </div>
          )}
        </CardHeader>

        <CardContent>
          <div className="mb-6">
            <div className="flex gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar domínio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={filters.status} onValueChange={(value) => handleFilterChange("status", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                      <SelectItem value="suspended">Suspenso</SelectItem>
                      <SelectItem value="expired">Expirado</SelectItem>
                      <SelectItem value="deactivated">Desativado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Select value={filters.platform} onValueChange={(value) => handleFilterChange("platform", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas</SelectItem>
                      <SelectItem value="empty">Vazio</SelectItem>
                      {platformOptions.map((platform) => (
                        <SelectItem key={platform} value={platform}>
                          {platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fonte de Tráfego</Label>
                  <Select
                    value={filters.traffic_source}
                    onValueChange={(value) => handleFilterChange("traffic_source", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas</SelectItem>
                      <SelectItem value="empty">Vazio</SelectItem>
                      {trafficSourceOptions.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source.charAt(0).toUpperCase() + source.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Data de Compra - Início</Label>
                  <Input
                    type="date"
                    value={filters.purchase_date_start}
                    onChange={(e) => handleFilterChange("purchase_date_start", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Data de Compra - Fim</Label>
                  <Input
                    type="date"
                    value={filters.purchase_date_end}
                    onChange={(e) => handleFilterChange("purchase_date_end", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>ID Funil</Label>
                  <Input
                    placeholder="ID do Funil"
                    value={filters.funnel_id}
                    onChange={(e) => handleFilterChange("funnel_id", e.target.value)}
                  />
                </div>

                <div className="md:col-span-3 flex justify-end">
                  <Button variant="outline" onClick={clearFilters}>
                    Limpar Filtros
                  </Button>
                </div>
              </div>
            )}
          </div>

          {filteredDomains.length === 0 && !loading && (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum domínio encontrado com os filtros aplicados</p>
            </div>
          )}

          {filteredDomains.length > 0 && (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("domain_name")}
                        className="flex items-center gap-1 p-0 h-auto font-semibold hover:bg-transparent hover:text-black dark:hover:text-white"
                      >
                        Domínio
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("status")}
                        className="flex items-center gap-1 p-0 h-auto font-semibold mx-auto hover:bg-transparent hover:text-black dark:hover:text-white"
                      >
                        Status
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("platform")}
                        className="flex items-center gap-1 p-0 h-auto font-semibold mx-auto hover:bg-transparent hover:text-black dark:hover:text-white"
                      >
                        Plataforma
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("traffic_source")}
                        className="flex items-center gap-1 p-0 h-auto font-semibold mx-auto hover:bg-transparent hover:text-black dark:hover:text-white"
                      >
                        Fonte de Tráfego
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">ID Funil</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("expiration_date")}
                        className="flex items-center gap-1 p-0 h-auto font-semibold hover:bg-transparent hover:text-black dark:hover:text-white"
                      >
                        Expiração
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("monthly_visits")}
                        className="flex items-center gap-1 p-0 h-auto font-semibold hover:bg-transparent hover:text-black dark:hover:text-white"
                      >
                        Visitas/Mês
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentDomains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Globe
                            className={`h-4 w-4 ${
                              ["deactivated", "suspended", "expired"].includes(domain.status?.toLowerCase())
                                ? "text-muted-foreground"
                                : "text-[rgb(8,34,255)] dark:text-[#338BFF]"
                            }`}
                          />
                          {domain.domain_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">{getStatusBadge(domain.status)}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        {domain.platform ? (
                          <div className="flex items-center justify-center">
                            {domain.platform.toLowerCase() === "wordpress" && (
                              <img
                                src="https://upload.wikimedia.org/wikipedia/commons/9/93/Wordpress_Blue_logo.png"
                                alt="WordPress"
                                className="h-6 w-6 rounded-full"
                                title="WordPress"
                              />
                            )}
                            {domain.platform.toLowerCase() === "atomicat" && (
                              <img
                                src="https://hotmart.s3.amazonaws.com/product_pictures/27c9db33-412c-4683-b79f-562016a33220/imagemavatardegradedark.png"
                                alt="AtomiCat"
                                className="h-6 w-6 rounded"
                                title="AtomiCat"
                              />
                            )}
                            {domain.platform.toLowerCase() !== "wordpress" &&
                              domain.platform.toLowerCase() !== "atomicat" && (
                                <Badge variant="outline">{domain.platform}</Badge>
                              )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {domain.traffic_source ? (
                          <Badge variant="secondary">
                            {domain.traffic_source.charAt(0).toUpperCase() + domain.traffic_source.slice(1)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
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
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/domains/${domain.id}`)}>
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
                    if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
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

          <div className="mt-4 text-xs text-muted-foreground">Total: {domains.length} domínios</div>
        </CardContent>
      </Card>
    </div>
  );
}
