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
import {
  Trash2,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Mail,
  Link as LinkIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CriticalDomainsTableProps {
  domains: any[];
  onDomainsChange: () => void;
}

// Função de tradução automática EN → PT (MELHORADA)
function translateAlert(message: string): string {
  if (!message) return "";

  const translations: Record<string, string> = {
    // Frases completas específicas (traduzir primeiro - mais específico)
    "sorry, you will not be able to access the domain": "desculpe, você não poderá acessar o domínio",
    "as the domain is currently locked": "pois o domínio está atualmente bloqueado",
    "as the domain is currently": "pois o domínio está atualmente",
    "domain locked reason:": "motivo do bloqueio:",
    "domain locked reason": "motivo do bloqueio",
    "suspended due to fraudulent activity": "suspenso devido a atividade fraudulenta",
    "suspended by the registry": "suspenso pelo registro",
    "please refer to the domain": "por favor, consulte o",
    "please refer to": "por favor, consulte",
    "please contact": "por favor, entre em contato",
    "for more information": "para mais informações",
    "contact us at": "entre em contato em",
    "you will not be able to access": "você não poderá acessar",
    "unsuspension lookup tool at": "ferramenta de reativação em",
    "unsuspension lookup tool": "ferramenta de reativação",

    // Palavras individuais (traduzir depois)
    sorry: "desculpe",
    "the domain": "o domínio",
    domain: "domínio",
    suspended: "suspenso",
    locked: "bloqueado",
    blocked: "bloqueado",
    expired: "expirado",
    pending: "pendente",
    verification: "verificação",
    required: "necessário",
    abuse: "abuso",
    fraud: "fraude",
    fraudulent: "fraudulenta",
    activity: "atividade",
    "domain name": "nome do domínio",
    registrar: "registrador",
    registry: "registro",
    "legal and abuse": "jurídico e abuso",
    legalandabuse: "jurídico e abuso",
    "lookup tool": "ferramenta de consulta",
    unsuspension: "reativação",
    "refer to": "consulte",
    please: "por favor",
    "by the": "pelo",
    tool: "ferramenta",
    currently: "atualmente",
    reason: "motivo",
  };

  let translated = message;

  // Preservar e-mails e links (não traduzir)
  const emails = message.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
  const urls = message.match(/https?:\/\/[^\s]+/g) || [];

  // Substituir temporariamente por placeholders
  emails.forEach((email, i) => {
    translated = translated.replace(email, `__EMAIL${i}__`);
  });

  urls.forEach((url, i) => {
    translated = translated.replace(url, `__URL${i}__`);
  });

  // Traduzir (frases completas primeiro, depois palavras)
  Object.entries(translations)
    .sort((a, b) => b[0].length - a[0].length) // Mais longas primeiro
    .forEach(([eng, pt]) => {
      const regex = new RegExp(eng, "gi");
      translated = translated.replace(regex, pt);
    });

  // Restaurar e-mails e links
  emails.forEach((email, i) => {
    translated = translated.replace(`__EMAIL${i}__`, email);
  });

  urls.forEach((url, i) => {
    translated = translated.replace(`__URL${i}__`, url);
  });

  // Limpar espaços duplicados
  translated = translated.replace(/\s+/g, " ").trim();

  // Capitalizar primeira letra
  translated = translated.charAt(0).toUpperCase() + translated.slice(1);

  return translated;
}

// Componente para renderizar mensagem com BOTÕES de links e e-mails
function AlertMessageRenderer({ message }: { message: string }) {
  if (!message) return null;

  // Extrair e-mails e links
  const emailRegex = /([\w.-]+@[\w.-]+\.\w+)/g;
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  const emails = message.match(emailRegex) || [];
  const urls = message.match(urlRegex) || [];

  // Remover e-mails e links do texto para exibir apenas o texto limpo
  let cleanText = message;

  // Remover URLs
  urls.forEach((url) => {
    cleanText = cleanText.replace(url, "");
  });

  // Remover e-mails
  emails.forEach((email) => {
    cleanText = cleanText.replace(email, "");
  });

  // Limpar espaços duplicados e pontuação órfã
  cleanText = cleanText
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\s+:/g, ":")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s+/g, "(")
    .trim();

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
  const [renewLoading, setRenewLoading] = useState<string | null>(null);
  const [renewalPrices, setRenewalPrices] = useState<Record<string, number>>({});
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [currentAlertMessage, setCurrentAlertMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(0);

  // Filtrar apenas domínios com status críticos
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  const criticalDomains = domains.filter((d) => {
    // Verificar status suspenso (case-insensitive e variações)
    const statusLower = d.status?.toLowerCase() || "";
    if (statusLower === "suspended" || statusLower === "suspend" || d.status === "expired") return true;

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

    if (hasAlert) {
      return <Badge className="bg-yellow-500">Alerta</Badge>;
    }
    if (statusLower === "expired") {
      return <Badge variant="destructive">Expirado</Badge>;
    }
    if (statusLower === "suspended" || statusLower === "suspend") {
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
    const alertMessage = domain.has_alert || "Status suspenso no registrador.";
    // Traduzir automaticamente a mensagem
    const translatedMessage = translateAlert(alertMessage);
    setCurrentAlertMessage(translatedMessage);
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
