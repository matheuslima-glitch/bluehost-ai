import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface PurchaseProgress {
  step: string;
  status: "in_progress" | "completed" | "error";
  message: string;
  error_details?: string;
}

interface PurchaseWithAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const STEP_LABELS: { [key: string]: string } = {
  generating: "Gerando domínios com IA",
  checking: "Verificando disponibilidade",
  searching: "Buscando domínios baratos",
  purchasing: "Comprando domínio(s)",
  nameservers: "Alterando nameservers",
  cloudflare: "Configurando Cloudflare",
  completed: "Compra concluída",
};

const WORDPRESS_STEPS = ["generating", "checking", "searching", "purchasing", "nameservers", "cloudflare", "completed"];
const ATOMICAT_STEPS = ["generating", "checking", "searching", "purchasing", "completed"];

const TIMEOUT_SECONDS = 90000; // 90 segundos

export default function PurchaseWithAIDialog({ open, onOpenChange, onSuccess }: PurchaseWithAIDialogProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("portuguese");
  const [platform, setPlatform] = useState<"wordpress" | "atomicat">("wordpress");
  const [loading, setLoading] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<PurchaseProgress | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [progressPercentage, setProgressPercentage] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentProgress(null);
      setProgressPercentage(0);
      setShowProgress(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const calculateProgress = (step: string, status: string) => {
    const steps = platform === "wordpress" ? WORDPRESS_STEPS : ATOMICAT_STEPS;
    const currentStepIndex = steps.indexOf(step);

    if (currentStepIndex === -1) return 0;

    if (status === "completed") {
      return Math.round(((currentStepIndex + 1) / steps.length) * 100);
    }

    return Math.round((currentStepIndex / steps.length) * 100);
  };

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      finishProcess(false, "O processo não respondeu em 90 segundos. Verifique se há erros ou tente novamente.");
    }, TIMEOUT_SECONDS);
  };

  const finishProcess = (success: boolean, message?: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    setLoading(false);

    if (success) {
      toast.success(message || "Domínios comprados e configurados com sucesso!");
      setTimeout(() => {
        setShowProgress(false);
        onOpenChange(false);
        onSuccess();
        resetForm();
      }, 2000);
    } else {
      toast.error(message || "Erro no processo", { duration: 5000 });
    }
  };

  const handleGenerate = async () => {
    if (!niche.trim()) {
      toast.error("Por favor, insira o nicho");
      return;
    }

    setLoading(true);

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      const { data, error } = await supabase.functions.invoke("purchase-domain-hub", {
        body: { niche, quantity, language, platform },
      });

      if (error) {
        if (error.message?.includes("insufficient_balance") || error.message?.includes("Saldo insuficiente")) {
          toast.error(
            "Saldo insuficiente! Adicione saldo para continuar com a compra de domínios. Dica: U$1 dólar para .online ou U$14+ dólares para .com",
            { duration: 6000 },
          );
          setLoading(false);
          return;
        }
        throw error;
      }

      if (!data?.sessionId) {
        throw new Error("Resposta inválida");
      }

      const sessionId = data.sessionId;

      setShowProgress(true);
      setCurrentProgress(null);
      setProgressPercentage(0);

      resetTimeout();

      const channel = supabase
        .channel(`purchase-progress-${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "domain_purchase_progress",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            resetTimeout();

            const progress = payload.new as any;

            setCurrentProgress({
              step: progress.step,
              status: progress.status,
              message: progress.message,
              error_details: progress.error_details,
            });

            const percentage = calculateProgress(progress.step, progress.status);
            setProgressPercentage(percentage);

            if (progress.step === "completed" && progress.status === "completed") {
              finishProcess(true, progress.message);
            }

            if (progress.status === "error") {
              finishProcess(false, progress.message || "Erro no processo");
            }
          },
        )
        .subscribe();

      channelRef.current = channel;
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar compra");
      setLoading(false);
      setShowProgress(false);
    }
  };

  const resetForm = () => {
    setQuantity(1);
    setNiche("");
    setCurrentProgress(null);
    setProgressPercentage(0);
    setShowProgress(false);
  };

  const handleClose = () => {
    if (!loading) {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      onOpenChange(false);
      resetForm();
      return;
    }

    const confirmCancel = confirm("O processo ainda está em andamento. Deseja realmente cancelar?");

    if (confirmCancel) {
      finishProcess(false, "Processo cancelado pelo usuário");
      onOpenChange(false);
      resetForm();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-blue-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "in_progress":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compra com IA</DialogTitle>
          <DialogDescription>Configure os parâmetros para buscar e comprar domínios disponíveis</DialogDescription>
        </DialogHeader>

        {!showProgress ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade de Domínios</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={10}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="niche">Nicho</Label>
              <Input
                id="niche"
                placeholder="Ex: saúde, tecnologia, finanças..."
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Idioma</Label>
              <Select value={language} onValueChange={setLanguage} disabled={loading}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portuguese">Português</SelectItem>
                  <SelectItem value="english">Inglês</SelectItem>
                  <SelectItem value="spanish">Espanhol</SelectItem>
                  <SelectItem value="german">Alemão</SelectItem>
                  <SelectItem value="french">Francês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">Plataforma</Label>
              <Select
                value={platform}
                onValueChange={(v: "wordpress" | "atomicat") => setPlatform(v)}
                disabled={loading}
              >
                <SelectTrigger id="platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wordpress">WordPress</SelectItem>
                  <SelectItem value="atomicat">AtomiCat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleGenerate} disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  "Buscar Domínios"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Progresso Geral</span>
                <span className="font-semibold">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>

            <div className="space-y-2">
              {!currentProgress && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Aguardando início do processo...
                </div>
              )}

              {currentProgress && (
                <div
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                    currentProgress.status === "completed"
                      ? "bg-blue-50 border-blue-200"
                      : currentProgress.status === "error"
                        ? "bg-red-50 border-red-200"
                        : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div className="mt-0.5">{getStatusIcon(currentProgress.status)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{STEP_LABELS[currentProgress.step] || currentProgress.step}</p>
                    {currentProgress.message && <p className="text-xs text-gray-600 mt-1">{currentProgress.message}</p>}
                    {currentProgress.status === "error" && currentProgress.error_details && (
                      <p className="text-xs text-red-600 mt-1 font-medium">{currentProgress.error_details}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {currentProgress?.status === "error" && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="h-5 w-5" />
                  <span className="font-semibold text-sm">Erro no processo</span>
                </div>
                <p className="text-xs text-red-600 mt-1">Tente novamente ou verifique as configurações</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
