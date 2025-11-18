import { useState } from "react";
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
import { Power, AlertTriangle, AlertCircle, ChevronLeft, ChevronRight, Mail, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CriticalDomainsTableProps {
  domains: any[];
  onDomainsChange: () => void;
}

// Componente para renderizar mensagem com BOTÕES de links e e-mails
// O texto já vem em português do Supabase, apenas organizamos o conteúdo
function AlertMessageRenderer({ message }: { message: string }) {
  if (!message) return null;

  // Extrair e-mails e links
  const emailRegex = /([\w.-]+@[\w.-]+\.\w+)/g;
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  const emails = message.match(emailRegex) || [];
  const urls = message.match(urlRegex) || [];

  // Remover e-mails e links do texto para exibir apenas o texto limpo
  let cleanText = message;

  // Remover URLs do texto
  urls.forEach((url) => {
    cleanText = cleanText.replace(url, "");
  });

  // Remover e-mails do texto
  emails.forEach((email) => {
    cleanText = cleanText.replace(email, "");
  });

  // Apenas remover espaços duplicados, mantendo a formatação original
  cleanText = cleanText
    .replace(/\s+/g, " ") // Remove múltiplos espaços
    .trim(); // Remove espaços no início e fim

  return (
    <div className="space-y-5">
      {/* Texto limpo sem links/emails */}
      <p className="text-yellow-800 dark:text-yellow-300 leading-relaxed text-[15px]">{cleanText}</p>

      {/* Separador visual se houver botões */}
      {(urls.length > 0 || emails.length > 0) && (
        <div className="border-t border-yellow-300 dark:border-yellow-800 pt-4 mt-4" />
      )}

      {/* Botões de links */}
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, index) => (
            <Button
              key={`url-${index}`}
              size="sm"
              className="bg-yellow-500 hover:bg-yellow-600 text-white dark:bg-yellow-600 dark:hover:bg-yellow-700"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Acessar Link de Suporte
            </Button>
          ))}
        </div>
      )}

      {/* Botões de e-mails */}
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {emails.map((email, index) => (
            <Button
              key={`email-${index}`}
              size="sm"
              className="bg-yellow-500 hover:bg-yellow-600 text-white dark:bg-yellow-600 dark:hover:bg-yellow-700"
              onClick={() => (window.location.href = `mailto:${email}`)}
            >
              <Mail className="h-4 w-4 mr-2" />
              Falar com Suporte
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CriticalDomainsTable({ domains, onDomainsChange }: CriticalDomainsTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<any>(null);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [currentAlertMessage, setCurrentAlertMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(0);

  // Filtrar apenas domínios com status críticos
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  const criticalDomains = domains.filter((d) => {
    const statusLower = d.status?.toLowerCase() || "";

    // Excluir domínios desativados (seja por status ou por flag)
    if (statusLower === "deactivated" || d.manually_deactivated === true) return false;

    // Incluir expirados e suspensos
    if (statusLower === "expired" || statusLower === "suspended" || statusLower === "suspend") return true;

    if (!d.expiration_date) return false;
    const expDate = new Date(d.expiration_date);
    const hasAlert = d.has_alert;

    return (
      d.status !== "expired" &&
      (hasAlert || (expDate > now && expDate < thirtyDaysFromNow) || (expDate > now && expDate < fifteenDaysFromNow))
    );
  });

  // Função para determinar a prioridade de ordenação
  const getDomainPriority = (domain: any): number => {
    const statusLower = domain.status?.toLowerCase() || "";

    // 1. Suspenso - Prioridade máxima
    if (statusLower === "suspended" || statusLower === "suspend") return 1;

    // 2. Alerta
    if (domain.has_alert) return 2;

    // 3. Expirado
    if (statusLower === "expired") return 3;

    // 4. Crítico (15 dias)
    if (domain.expiration_date) {
      const expDate = new Date(domain.expiration_date);
      if (expDate > now && expDate < fifteenDaysFromNow) return 4;

      // 5. Expirando em breve (30 dias)
      if (expDate > now && expDate < thirtyDaysFromNow) return 5;
    }

    // Outros casos (não deveria chegar aqui devido ao filtro)
    return 6;
  };

  // Ordenar domínios críticos pela prioridade
  const sortedCriticalDomains = [...criticalDomains].sort((a, b) => {
    const priorityA = getDomainPriority(a);
    const priorityB = getDomainPriority(b);
    return priorityA - priorityB;
  });

  const getStatusBadge = (domain: any) => {
    const hasAlert = domain.has_alert;
    const statusLower = domain.status?.toLowerCase() || "";

    // 0. DESATIVADO
    if (statusLower === "deactivated") {
      return <Badge className="bg-gray-400 dark:bg-gray-600">Desativado</Badge>;
    }

    // 1. SUSPENSO - Prioridade máxima
    if (statusLower === "suspended" || statusLower === "suspend") {
      return <Badge className="bg-orange-500">Suspenso</Badge>;
    }

    // 2. ALERTA
    if (hasAlert) {
      return <Badge className="bg-yellow-500">Alerta</Badge>;
    }

    // 3. EXPIRADO
    if (statusLower === "expired") {
      return <Badge variant="destructive">Expirado</Badge>;
    }

    // 4. CRÍTICO (15 dias)
    if (domain.expiration_date) {
      const expDate = new Date(domain.expiration_date);
      if (expDate > now && expDate < fifteenDaysFromNow) {
        return <Badge variant="destructive">Crítico (15 dias)</Badge>;
      }

      // 5. EXPIRANDO EM BREVE (30 dias)
      if (expDate > now && expDate < thirtyDaysFromNow) {
        return <Badge className="bg-yellow-500">Expirando em breve (30 dias)</Badge>;
      }
    }

    return <Badge>Ativo</Badge>;
  };

  const handleAlertClick = (domain: any) => {
    const alertMessage = domain.has_alert || "Status suspenso no registrador.";
    // Texto já vem em português do Supabase, não precisa traduzir
    setCurrentAlertMessage(alertMessage);
    setAlertDialogOpen(true);
  };

  // Paginação
  const itemsPerPage = 10;
  const totalPages = Math.ceil(sortedCriticalDomains.length / itemsPerPage);
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDomains = sortedCriticalDomains.slice(startIndex, endIndex);

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
      const { error } = await supabase
        .from("domains")
        .update({
          status: "deactivated",
          manually_deactivated: true, // Flag de proteção contra o cron
        })
        .eq("id", domainToDelete.id);

      if (error) throw error;

      toast.success("Domínio desativado com sucesso!");
      setDeleteDialogOpen(false);
      setDomainToDelete(null);
      onDomainsChange();
    } catch (error: any) {
      console.error("Erro ao desativar domínio:", error);
      toast.error("Erro ao desativar domínio");
    }
  };

  if (sortedCriticalDomains.length === 0) {
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
                          {(domain.has_alert || domain.status === "suspended") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAlertClick(domain)}
                              className="text-yellow-500 hover:text-yellow-600 h-8 w-8 p-0"
                            >
                              <AlertCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {/* Toggle On/Off visual - Azul mais forte */}
                          <button
                            onClick={() => handleDeleteClick(domain)}
                            className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 bg-blue-600 hover:bg-blue-700"
                            title="Desativar domínio"
                          >
                            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white transition-transform shadow-md"></span>
                            <span className="absolute left-2 text-[10px] font-bold text-white">ON</span>
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {sortedCriticalDomains.length > itemsPerPage && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Mostrando {startIndex + 1}-{Math.min(endIndex, sortedCriticalDomains.length)} de{" "}
                  {sortedCriticalDomains.length} domínios críticos
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
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Mensagem de Alerta
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-base">
              <p className="font-semibold">Atenção! Esta ação é irreversível.</p>
              <p>
                Você está prestes a desativar o domínio <strong>{domainToDelete?.domain_name}</strong> da sua tabela de
                gerenciamento.
              </p>
              <p>
                O domínio será marcado como desativado apenas no banco de dados interno mas continuará registrado
                normalmente no provedor da Namecheap até que seja expirado ou renovado diretamente por lá.
              </p>
              <p className="font-semibold">Deseja prosseguir com a desativação?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 text-white hover:bg-red-600">
              Desativar
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
            <DialogDescription asChild>
              <div className="pt-4">
                <AlertMessageRenderer message={currentAlertMessage} />
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
