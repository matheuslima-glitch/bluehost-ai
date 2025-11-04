import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, RefreshCw, AlertTriangle, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CriticalDomainsTableProps {
  domains: any[];
  onDomainsChange: () => void;
}

export function CriticalDomainsTable({ domains, onDomainsChange }: CriticalDomainsTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<any>(null);
  const [renewLoading, setRenewLoading] = useState<string | null>(null);
  const [renewalPrices, setRenewalPrices] = useState<Record<string, number>>({});
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [currentAlertMessage, setCurrentAlertMessage] = useState("");
  const [namecheapAlerts, setNamecheapAlerts] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(0);

  // Load alert domains from Namecheap
  useEffect(() => {
    const loadAlertDomains = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("namecheap-domains", {
          body: { action: "list_domains", listType: "ALERT" },
        });

        if (!error && data?.domains) {
          const alertMap: Record<string, string> = {};
          data.domains.forEach((domain: any) => {
            alertMap[domain.name] = domain.alertMessage;
          });
          setNamecheapAlerts(alertMap);
        }
      } catch (err) {
        console.error("Error loading alert domains:", err);
      }
    };

    loadAlertDomains();
  }, []);

  // Filtrar apenas domínios com status críticos
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  const criticalDomains = domains.filter((d) => {
    if (d.status === "expired" || d.status === "suspended") return true;
    if (!d.expiration_date) return false;
    const expDate = new Date(d.expiration_date);
    const hasAlert = namecheapAlerts[d.domain_name];
    return (
      d.status !== "expired" &&
      (hasAlert || (expDate > now && expDate < thirtyDaysFromNow) || (expDate > now && expDate < fifteenDaysFromNow))
    );
  });

  const getStatusBadge = (domain: any) => {
    const hasAlert = namecheapAlerts[domain.domain_name];

    if (hasAlert) {
      return <Badge className="bg-yellow-500">Alerta</Badge>;
    }
    if (domain.status === "expired") {
      return <Badge variant="destructive">Expirado</Badge>;
    }
    if (domain.status === "suspended") {
      return <Badge className="bg-orange-500">Suspenso</Badge>;
    }
    if (domain.expiration_date) {
      const expDate = new Date(domain.expiration_date);
      if (expDate > now && expDate < fifteenDaysFromNow) {
        return <Badge variant="destructive">Crítico (15 dias)</Badge>;
      }
      if (expDate > now && expDate < thirtyDaysFromNow) {
        return <Badge className="bg-yellow-500">Expirando em breve (30 dias)</Badge>;
      }
    }
    return <Badge>Ativo</Badge>;
  };

  const handleAlertClick = (domain: any) => {
    const alertMessage = namecheapAlerts[domain.domain_name] || "Status suspenso no registrador.";
    setCurrentAlertMessage(alertMessage);
    setAlertDialogOpen(true);
  };

  // Paginação
  const itemsPerPage = 10;
  const totalPages = Math.ceil(criticalDomains.length / itemsPerPage);
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDomains = criticalDomains.slice(startIndex, endIndex);

  // Altura dinâmica baseada no número de domínios (max 10 por página)
  const dynamicHeight = Math.min(paginatedDomains.length, 10) * 60 + 45; // 60px por linha + 45px do header

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  };

  const handleDeleteClick = (domain: any) => {
    setDomainToDelete(domain);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!domainToDelete) return;

    try {
      const { error } = await supabase.from("domains").delete().eq("id", domainToDelete.id);

      if (error) throw error;

      toast.success("Domínio excluído com sucesso!");
      setDeleteDialogOpen(false);
      setDomainToDelete(null);
      onDomainsChange();
    } catch (error: any) {
      console.error("Erro ao excluir domínio:", error);
      toast.error("Erro ao excluir domínio");
    }
  };

  const handleRenewClick = async (domain: any) => {
    setRenewLoading(domain.id);

    try {
      // Buscar preço de renovação da Namecheap
      const { data, error } = await supabase.functions.invoke("namecheap-domains", {
        body: {
          action: "get_renewal_price",
          domainName: domain.domain_name,
        },
      });

      if (error) throw error;

      if (data?.price) {
        setRenewalPrices((prev) => ({
          ...prev,
          [domain.id]: data.price,
        }));
        toast.success(`Preço de renovação: $${data.price.toFixed(2)}`);
      } else {
        toast.error("Não foi possível obter o preço de renovação");
      }
    } catch (error: any) {
      console.error("Erro ao buscar preço de renovação:", error);
      toast.error("Erro ao buscar preço de renovação");
    } finally {
      setRenewLoading(null);
    }
  };

  if (criticalDomains.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Gestão de Domínios Críticos
          </CardTitle>
          <CardDescription>Domínios expirados, expirando em breve, críticos e suspensos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhum domínio crítico encontrado</p>
            <p className="text-sm text-muted-foreground mt-2">Todos os seus domínios estão em boas condições</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Gestão de Domínios Críticos
          </CardTitle>
          <CardDescription>Domínios expirados, expirando em breve, críticos e suspensos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <ScrollArea className="rounded-md border" style={{ height: `${dynamicHeight}px` }}>
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Domínio</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expiração</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDomains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium text-sm">{domain.domain_name}</TableCell>
                      <TableCell>{getStatusBadge(domain)}</TableCell>
                      <TableCell className="text-sm">
                        {domain.expiration_date
                          ? format(new Date(domain.expiration_date), "dd/MM/yy", { locale: ptBR })
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(namecheapAlerts[domain.domain_name] || domain.status === "suspended") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAlertClick(domain)}
                              className="text-yellow-500 hover:text-yellow-600 h-8 w-8 p-0"
                            >
                              <AlertCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {domain.registrar === "Namecheap" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRenewClick(domain)}
                              disabled={renewLoading === domain.id}
                              className="h-8 px-2"
                            >
                              <RefreshCw className={`h-3 w-3 ${renewLoading === domain.id ? "animate-spin" : ""}`} />
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteClick(domain)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {criticalDomains.length > itemsPerPage && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Mostrando {startIndex + 1}-{Math.min(endIndex, criticalDomains.length)} de {criticalDomains.length}{" "}
                  domínios críticos
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage === 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {currentPage + 1} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Mensagem de Alerta
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-base">
              <p className="font-semibold">Atenção! Esta ação é irreversível.</p>
              <p>
                Você está prestes a excluir o domínio <strong>{domainToDelete?.domain_name}</strong> da sua tabela de
                gerenciamento.
              </p>
              <p>
                O domínio será removido apenas do banco de dados interno mas continuará registrado normalmente no
                provedor da Namecheap até que seja expirado ou renovado diretamente por lá.
              </p>
              <p className="font-semibold">Deseja realmente prosseguir com a exclusão?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogContent className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
              <AlertCircle className="h-5 w-5" />
              Alerta do Domínio
            </DialogTitle>
            <DialogDescription className="text-yellow-600 dark:text-yellow-400 text-base pt-4">
              {currentAlertMessage}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
