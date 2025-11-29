import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Server,
  Cloud,
  Database,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// URL base da API - ajuste conforme necessário
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://domainhub-backend.onrender.com";

interface DomainIntegrations {
  wordpress: { exists: boolean; insid: string | null; details: any };
  cpanel: { exists: boolean; subdomain: string | null; details: any };
  cloudflare: { exists: boolean; zoneId: string | null; details: any };
}

interface DeactivationStep {
  id: string;
  name: string;
  icon: React.ReactNode;
  status: "pending" | "running" | "success" | "error" | "skipped";
  message?: string;
}

interface DomainDeactivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: {
    id: string;
    domain_name: string;
  } | null;
  onDeactivationComplete: () => void;
}

export function DomainDeactivationDialog({
  open,
  onOpenChange,
  domain,
  onDeactivationComplete,
}: DomainDeactivationDialogProps) {
  // Hook de autenticação para obter o usuário atual
  const { user } = useAuth();

  // Estados do fluxo
  const [currentStep, setCurrentStep] = useState<"warning" | "confirmation" | "detecting" | "executing" | "complete">(
    "warning",
  );

  // Estado da confirmação por texto
  const [confirmationText, setConfirmationText] = useState("");
  const expectedText = domain ? `quero desinstalar o ${domain.domain_name}` : "";

  // Estado das integrações detectadas
  const [integrations, setIntegrations] = useState<DomainIntegrations | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Estado da execução
  const [steps, setSteps] = useState<DeactivationStep[]>([]);
  const [currentExecutingStep, setCurrentExecutingStep] = useState<number>(-1);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionComplete, setExecutionComplete] = useState(false);
  const [hasErrors, setHasErrors] = useState(false);

  // Reset ao fechar/abrir
  useEffect(() => {
    if (open) {
      setCurrentStep("warning");
      setConfirmationText("");
      setIntegrations(null);
      setSteps([]);
      setCurrentExecutingStep(-1);
      setExecutionProgress(0);
      setIsExecuting(false);
      setExecutionComplete(false);
      setHasErrors(false);
    }
  }, [open]);

  // Bloquear paste no input de confirmação
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    toast.error("Colagem não permitida. Digite o texto manualmente.");
  }, []);

  // Bloquear drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Função para registrar log de atividade
  const logActivity = async (actionType: string, oldValue: string | null, newValue: string | null) => {
    if (!domain?.id || !user?.id) return;

    try {
      const { error } = await supabase.from("domain_activity_logs").insert({
        domain_id: domain.id,
        user_id: user.id,
        action_type: actionType,
        old_value: oldValue,
        new_value: newValue,
      });

      if (error) {
        console.error("Erro ao registrar log de atividade:", error);
      }
    } catch (error: any) {
      console.error("Erro ao registrar log de atividade:", error);
    }
  };

  // Detectar integrações
  const detectIntegrations = async () => {
    if (!domain) return;

    setIsDetecting(true);
    setCurrentStep("detecting");

    try {
      const response = await fetch(`${API_BASE_URL}/api/domains/deactivation/detect/${domain.domain_name}`);

      if (!response.ok) {
        throw new Error("Erro ao detectar integrações");
      }

      const data = await response.json();
      setIntegrations(data.integrations);

      // Configurar steps baseado nas integrações
      const newSteps: DeactivationStep[] = [];

      if (data.integrations.wordpress.exists) {
        newSteps.push({
          id: "wordpress",
          name: "Desinstalar WordPress",
          icon: <Globe className="h-4 w-4" />,
          status: "pending",
        });
      }

      if (data.integrations.cpanel.exists) {
        newSteps.push({
          id: "cpanel",
          name: "Remover do cPanel",
          icon: <Server className="h-4 w-4" />,
          status: "pending",
        });
      }

      if (data.integrations.cloudflare.exists) {
        newSteps.push({
          id: "cloudflare",
          name: "Remover do Cloudflare",
          icon: <Cloud className="h-4 w-4" />,
          status: "pending",
        });
      }

      // Sempre adicionar Supabase
      newSteps.push({
        id: "supabase",
        name: "Desativar no banco de dados",
        icon: <Database className="h-4 w-4" />,
        status: "pending",
      });

      setSteps(newSteps);
      setCurrentStep("executing");
    } catch (error: any) {
      console.error("Erro ao detectar integrações:", error);
      toast.error("Erro ao detectar integrações do domínio");
      onOpenChange(false);
    } finally {
      setIsDetecting(false);
    }
  };

  // Executar desativação
  const executeDeactivation = async () => {
    if (!domain || steps.length === 0) return;

    setIsExecuting(true);
    let errorOccurred = false;

    // Lista para armazenar integrações removidas com sucesso (para o log consolidado)
    const removedIntegrations: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      setCurrentExecutingStep(i);
      setExecutionProgress((i / steps.length) * 100);

      // Atualizar status para "running"
      setSteps((prev) => prev.map((step, idx) => (idx === i ? { ...step, status: "running" } : step)));

      try {
        const step = steps[i];
        let result;

        switch (step.id) {
          case "wordpress":
            result = await fetch(`${API_BASE_URL}/api/domains/deactivation/step/wordpress`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domainName: domain.domain_name }),
            });
            break;

          case "cpanel":
            result = await fetch(`${API_BASE_URL}/api/domains/deactivation/step/cpanel`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domainName: domain.domain_name }),
            });
            break;

          case "cloudflare":
            result = await fetch(`${API_BASE_URL}/api/domains/deactivation/step/cloudflare`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domainName: domain.domain_name }),
            });
            break;

          case "supabase":
            result = await fetch(`${API_BASE_URL}/api/domains/deactivation/step/supabase`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domainId: domain.id }),
            });
            break;
        }

        if (result) {
          const data = await result.json();

          if (data.success) {
            setSteps((prev) =>
              prev.map((s, idx) =>
                idx === i
                  ? {
                      ...s,
                      status: data.skipped ? "skipped" : "success",
                      message: data.message,
                    }
                  : s,
              ),
            );

            // Adicionar à lista de integrações removidas (se não foi pulado)
            if (!data.skipped) {
              const integrationNames: Record<string, string> = {
                wordpress: "WordPress",
                cpanel: "cPanel",
                cloudflare: "Cloudflare",
                supabase: "Banco de dados",
              };
              removedIntegrations.push(integrationNames[step.id] || step.id);
            }
          } else {
            throw new Error(data.error || data.message || "Erro desconhecido");
          }
        }
      } catch (error: any) {
        console.error(`Erro na etapa ${steps[i].name}:`, error);
        errorOccurred = true;

        setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "error", message: error.message } : s)));

        // Continuar para a próxima etapa mesmo com erro
      }

      // Pequeno delay entre etapas
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setExecutionProgress(100);
    setCurrentExecutingStep(-1);
    setIsExecuting(false);
    setExecutionComplete(true);
    setHasErrors(errorOccurred);
    setCurrentStep("complete");

    // Registrar log de atividade consolidado
    if (removedIntegrations.length > 0) {
      const integrationsText = removedIntegrations.join(", ");
      await logActivity(
        "integrations_removed",
        `Integrações ativas: ${integrationsText}`,
        `Integrações removidas: ${integrationsText}. Domínio desativado.`,
      );
    }

    if (!errorOccurred) {
      toast.success("Domínio desativado com sucesso!");
    } else {
      toast.warning("Desativação concluída com alguns erros");
    }
  };

  // Handler para confirmar aviso inicial
  const handleWarningConfirm = () => {
    setCurrentStep("confirmation");
  };

  // Handler para confirmar texto e iniciar processo
  const handleConfirmationSubmit = () => {
    if (confirmationText.toLowerCase() === expectedText.toLowerCase()) {
      detectIntegrations();
    } else {
      toast.error("Texto de confirmação incorreto");
    }
  };

  // Handler para iniciar execução
  const handleStartExecution = () => {
    executeDeactivation();
  };

  // Handler para fechar ao completar
  const handleComplete = () => {
    onOpenChange(false);
    onDeactivationComplete();
  };

  // Renderizar status do step
  const renderStepStatus = (status: DeactivationStep["status"]) => {
    switch (status) {
      case "pending":
        return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-gray-400" />;
    }
  };

  if (!domain) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {/* ETAPA 1: Aviso inicial */}
        {currentStep === "warning" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Atenção! Ação Irreversível
              </DialogTitle>
              <DialogDescription className="space-y-4 pt-4">
                <p className="text-base">Você está prestes a desativar permanentemente o domínio:</p>
                <p className="text-lg font-bold text-foreground text-center py-2 bg-muted rounded-md">
                  {domain.domain_name}
                </p>
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-4 space-y-2">
                  <p className="font-semibold text-red-700 dark:text-red-300">Esta ação irá:</p>
                  <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 space-y-1">
                    <li>Excluir o domínio do sistema permanentemente</li>
                    <li>Remover todas as integrações com sistemas de terceiros</li>
                    <li>Desinstalar WordPress (se houver)</li>
                    <li>Remover configurações do cPanel</li>
                    <li>Excluir zona do Cloudflare</li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  O domínio continuará registrado na Namecheap até expirar ou ser renovado diretamente por lá.
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleWarningConfirm}>
                Entendi, continuar
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ETAPA 2: Confirmação por texto */}
        {currentStep === "confirmation" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Confirme sua ação
              </DialogTitle>
              <DialogDescription className="space-y-4 pt-4">
                <p>Para confirmar a desativação, digite exatamente o texto abaixo:</p>
                <div className="bg-muted p-3 rounded-md">
                  <code className="text-sm font-mono text-foreground">{expectedText}</code>
                </div>
                <Input
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  onPaste={handlePaste}
                  onDrop={handleDrop}
                  placeholder="Digite o texto de confirmação..."
                  className="font-mono"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                <p className="text-xs text-muted-foreground">* Copiar e colar está desabilitado. Digite manualmente.</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setCurrentStep("warning")}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmationSubmit}
                disabled={confirmationText.toLowerCase() !== expectedText.toLowerCase()}
              >
                Confirmar desativação
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ETAPA 3: Detectando integrações */}
        {currentStep === "detecting" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                Analisando domínio...
              </DialogTitle>
              <DialogDescription className="pt-4">
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin" />
                  </div>
                  <p className="text-center">
                    Detectando integrações do domínio
                    <br />
                    <span className="font-semibold">{domain.domain_name}</span>
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
          </>
        )}

        {/* ETAPA 4: Executando desativação */}
        {currentStep === "executing" && !executionComplete && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isExecuting ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                {isExecuting ? "Desativando domínio..." : "Pronto para desativar"}
              </DialogTitle>
              <DialogDescription className="pt-4 space-y-4">
                {!isExecuting && integrations && (
                  <div className="space-y-2">
                    <p className="text-sm">Integrações detectadas:</p>
                    <div className="flex flex-wrap gap-2">
                      {integrations.wordpress.exists && (
                        <Badge variant="secondary" className="gap-1">
                          <Globe className="h-3 w-3" />
                          WordPress
                        </Badge>
                      )}
                      {integrations.cpanel.exists && (
                        <Badge variant="secondary" className="gap-1">
                          <Server className="h-3 w-3" />
                          cPanel
                        </Badge>
                      )}
                      {integrations.cloudflare.exists && (
                        <Badge variant="secondary" className="gap-1">
                          <Cloud className="h-3 w-3" />
                          Cloudflare
                        </Badge>
                      )}
                      <Badge variant="secondary" className="gap-1">
                        <Database className="h-3 w-3" />
                        Banco de dados
                      </Badge>
                    </div>
                  </div>
                )}

                <Progress value={executionProgress} className="h-2" />

                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                        index === currentExecutingStep
                          ? "bg-blue-50 dark:bg-blue-950"
                          : step.status === "success"
                            ? "bg-green-50 dark:bg-green-950"
                            : step.status === "error"
                              ? "bg-red-50 dark:bg-red-950"
                              : step.status === "skipped"
                                ? "bg-gray-50 dark:bg-gray-900"
                                : ""
                      }`}
                    >
                      {renderStepStatus(step.status)}
                      <span className="flex items-center gap-2 flex-1">
                        {step.icon}
                        <span className={step.status === "skipped" ? "text-gray-400" : ""}>{step.name}</span>
                      </span>
                      {step.message && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground truncate max-w-[150px] cursor-help">
                                {step.message}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px]">
                              <p className="text-xs">{step.message}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  ))}
                </div>
              </DialogDescription>
            </DialogHeader>
            {!isExecuting && (
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleStartExecution}>
                  Iniciar desativação
                </Button>
              </DialogFooter>
            )}
          </>
        )}

        {/* ETAPA 5: Completo */}
        {currentStep === "complete" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {hasErrors ? (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {hasErrors ? "Desativação concluída com avisos" : "Desativação concluída!"}
              </DialogTitle>
              <DialogDescription className="pt-4 space-y-4">
                <p>
                  O domínio <strong>{domain.domain_name}</strong> foi desativado
                  {hasErrors ? " com alguns erros." : " com sucesso."}
                </p>

                <div className="space-y-2">
                  {steps.map((step) => (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 p-2 rounded-md ${
                        step.status === "success"
                          ? "bg-green-50 dark:bg-green-950"
                          : step.status === "error"
                            ? "bg-red-50 dark:bg-red-950"
                            : step.status === "skipped"
                              ? "bg-gray-50 dark:bg-gray-900"
                              : ""
                      }`}
                    >
                      {renderStepStatus(step.status)}
                      <span className="flex items-center gap-2 flex-1">
                        {step.icon}
                        <span className={step.status === "skipped" ? "text-gray-400" : ""}>{step.name}</span>
                      </span>
                      {step.status === "error" && step.message && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-red-500 truncate max-w-[150px] cursor-help">
                                {step.message}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px]">
                              <p className="text-xs">{step.message}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {step.status === "skipped" && <span className="text-xs text-gray-400">Pulado</span>}
                    </div>
                  ))}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleComplete}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
