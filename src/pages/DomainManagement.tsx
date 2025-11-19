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

  // fetchDomains function
  const fetchDomains = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("domains").select("*").order("created_at", { ascending: false });

      if (error) throw error;
      setDomains(data || []);
      setFilteredDomains(data || []);
    } catch (error: any) {
      console.error("Error fetching domains:", error);
      toast.error("Erro ao carregar domínios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDomains();
    }
  }, [user]);

  // Filter and search logic
  useEffect(() => {
    let result = [...domains];

    // Apply search
    if (searchQuery) {
      result = result.filter((domain) => domain.domain_name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Apply filters
    if (filters.status) {
      result = result.filter((domain) => domain.status === filters.status);
    }
    if (filters.platform) {
      result = result.filter((domain) => domain.platform === filters.platform);
    }
    if (filters.traffic_source) {
      result = result.filter((domain) => domain.traffic_source === filters.traffic_source);
    }
    if (filters.funnel_id) {
      result = result.filter((domain) => domain.funnel_id === filters.funnel_id);
    }
    if (filters.purchase_date_start) {
      result = result.filter((domain) => domain.purchase_date && domain.purchase_date >= filters.purchase_date_start);
    }
    if (filters.purchase_date_end) {
      result = result.filter((domain) => domain.purchase_date && domain.purchase_date <= filters.purchase_date_end);
    }

    // Apply sorting
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Domain];
        const bValue = b[sortConfig.key as keyof Domain];

        if (aValue === null) return 1;
        if (bValue === null) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    setFilteredDomains(result);
    setCurrentPage(1);
  }, [domains, searchQuery, filters, sortConfig]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDomains();
    setRefreshing(false);
    toast.success("Domínios atualizados!");
  };

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const resetFilters = () => {
    setFilters({
      status: "",
      platform: "",
      traffic_source: "",
      purchase_date_start: "",
      purchase_date_end: "",
      funnel_id: "",
    });
    setSearchQuery("");
  };

  // Pagination
  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredDomains.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentDomains = filteredDomains.slice(startIndex, endIndex);

  // Stats
  const stats = {
    total: domains.length,
    active: domains.filter((d) => d.status === "active").length,
    totalVisits: domains.reduce((acc, d) => acc + (d.monthly_visits || 0), 0),
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-8 w-8" />
            Gestão de Domínios
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie e monitore todos os seus domínios</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Domínios</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground dark:text-[#338BFF]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Domínios Ativos</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Visitas Mensais</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVisits.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Filtros</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? "Ocultar" : "Mostrar"} Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar domínios..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Advanced Filters */}
            {showFilters && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="expired">Expirado</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform">Plataforma</Label>
                  <Select
                    value={filters.platform}
                    onValueChange={(value) => setFilters({ ...filters, platform: value })}
                  >
                    <SelectTrigger id="platform">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas</SelectItem>
                      <SelectItem value="namecheap">Namecheap</SelectItem>
                      <SelectItem value="cloudflare">Cloudflare</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="traffic_source">Fonte de Tráfego</Label>
                  <Select
                    value={filters.traffic_source}
                    onValueChange={(value) => setFilters({ ...filters, traffic_source: value })}
                  >
                    <SelectTrigger id="traffic_source">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas</SelectItem>
                      <SelectItem value="organic">Orgânico</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purchase_date_start">Data de Compra (Início)</Label>
                  <Input
                    id="purchase_date_start"
                    type="date"
                    value={filters.purchase_date_start}
                    onChange={(e) => setFilters({ ...filters, purchase_date_start: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purchase_date_end">Data de Compra (Fim)</Label>
                  <Input
                    id="purchase_date_end"
                    type="date"
                    value={filters.purchase_date_end}
                    onChange={(e) => setFilters({ ...filters, purchase_date_end: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="funnel_id">ID do Funil</Label>
                  <Input
                    id="funnel_id"
                    placeholder="ID do Funil"
                    value={filters.funnel_id}
                    onChange={(e) => setFilters({ ...filters, funnel_id: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Reset Filters */}
            {(searchQuery || Object.values(filters).some((f) => f !== "")) && (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Limpar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Domains Table */}
      <Card>
        <CardHeader>
          <CardTitle>Domínios ({filteredDomains.length})</CardTitle>
          <CardDescription>
            Mostrando {startIndex + 1}-{Math.min(endIndex, filteredDomains.length)} de {filteredDomains.length} domínios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("domain_name")}
                      className="flex items-center gap-1"
                    >
                      Domínio
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plataforma</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("monthly_visits")}
                      className="flex items-center gap-1"
                    >
                      Visitas/Mês
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("expiration_date")}
                      className="flex items-center gap-1"
                    >
                      Expiração
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Data de Compra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentDomains.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum domínio encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  currentDomains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">{domain.domain_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            domain.status === "active"
                              ? "default"
                              : domain.status === "expired"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {domain.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{domain.platform || "N/A"}</Badge>
                      </TableCell>
                      <TableCell>{domain.monthly_visits?.toLocaleString() || "0"}</TableCell>
                      <TableCell>
                        {domain.expiration_date
                          ? format(new Date(domain.expiration_date), "dd/MM/yyyy", {
                              locale: ptBR,
                            })
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {domain.purchase_date
                          ? format(new Date(domain.purchase_date), "dd/MM/yyyy", {
                              locale: ptBR,
                            })
                          : "N/A"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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
