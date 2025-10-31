import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, RefreshCw, AlertTriangle } from "lucide-react";
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

  // Filtrar apenas domínios com status críticos
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  const criticalDomains = domains.filter(d => {
    if (d.status === "expired" || d.status === "suspended") return true;
    if (!d.expiration_date) return false;
    const expDate = new Date(d.expiration_date);
    return (
      d.status !== "expired" &&
      ((expDate > now && expDate < thirtyDaysFromNow) || // Expirando em breve
      (expDate > now && expDate < fifteenDaysFromNow)) // Críticos
    );
  });

  const getStatusBadge = (domain: any) => {
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

  const handleDeleteClick = (domain: any) => {
    setDomainToDelete(domain);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!domainToDelete) return;

    try {
      const { error } = await supabase
        .from("domains")
        .delete()
        .eq("id", domainToDelete.id);

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
          domainName: domain.domain_name
        }
      });

      if (error) throw error;

      if (data?.price) {
        setRenewalPrices(prev => ({
          ...prev,
          [domain.id]: data.price
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
          <CardDescription>
            Domínios expirados, expirando em breve, críticos e suspensos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              Nenhum domínio crítico encontrado
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Todos os seus domínios estão em boas condições
            </p>
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
          <CardDescription>
            Domínios expirados, expirando em breve, críticos e suspensos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domínio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data de Expiração</TableHead>
                <TableHead>Registrador</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {criticalDomains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell className="font-medium">{domain.domain_name}</TableCell>
                  <TableCell>{getStatusBadge(domain)}</TableCell>
                  <TableCell>
                    {domain.expiration_date
                      ? format(new Date(domain.expiration_date), "dd/MM/yyyy", { locale: ptBR })
                      : "N/A"}
                  </TableCell>
                  <TableCell>{domain.registrar || "N/A"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {domain.registrar === "Namecheap" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRenewClick(domain)}
                          disabled={renewLoading === domain.id}
                        >
                          <RefreshCw className={`h-4 w-4 mr-1 ${renewLoading === domain.id ? 'animate-spin' : ''}`} />
                          {renewalPrices[domain.id] 
                            ? `$${renewalPrices[domain.id].toFixed(2)}`
                            : "Renovar"}
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClick(domain)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ⚠️ Mensagem de Alerta
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-base">
              <p className="font-semibold">Atenção! Esta ação é irreversível.</p>
              <p>
                Você está prestes a excluir o domínio <strong>{domainToDelete?.domain_name}</strong> da sua tabela de gerenciamento.
              </p>
              <p>
                O domínio será removido apenas do banco de dados interno mas continuará registrado normalmente no provedor da Namecheap até que seja expirado ou renovado diretamente por lá.
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
    </>
  );
}
