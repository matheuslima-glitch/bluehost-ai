import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";

interface PurchaseProgress {
  step: string;
  status: "pending" | "in_progress" | "completed" | "error";
  message: string;
  timestamp: string;
  errorDetails?: string;
}

interface PurchaseWithAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Mapeamento dos steps de progresso
const WORDPRESS_STEPS = [
  { key: "generating", label: "Gerando domínios com IA" },
  { key: "checking", label: "Verificando disponibilidade" },
  { key: "searching", label: "Buscando domínios baratos" },
  { key: "purchasing", label: "Comprando domínio(s)" },
  { key: "nameservers", label: "Alterando nameservers" },
  { key: "cloudflare", label: "Configurando Cloudflare" },
  { key: "completed", label: "Compra concluída" },
];

const ATOMICAT_STEPS = [
  { key: "generating", label: "Gerando domínios com IA" },
  { key: "checking", label: "Verificando disponibilidade" },
  { key: "searching", label: "Buscando domínios baratos" },
  { key: "purchasing", label: "Comprando domínio(s)" },
  { key: "completed", label: "Compra concluída" },
];

export default function PurchaseWithAIDialog({ open, onOpenChange, onSuccess }: PurchaseWithAIDialogProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("portuguese");
  const [platform, setPlatform] = useState<"wordpress" | "atomicat">("wordpress");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<PurchaseProgress[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [checkingBalance, setCheckingBalance] = useState(false);

  // Carregar saldo ao abrir o diálogo
  useEffect(() => {
    if (open) {
      loadBalance();
    }
  }, [open]);

  // Calcular custo estimado
  useEffect(() => {
    // Custo médio por domínio: $8.88 (Namecheap .com)
    const avgCost = 8.88;
    setEstimatedCost(quantity * avgCost);
  }, [quantity]);

  const loadBalance = async () => {
    setCheckingBalance(true);
    try {
      const { data, error } = await supabase
        .from("namecheap_balance")
        .select("balance_usd")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setBalance(data.balance_usd || 0);
      }
    } catch (error) {
      console.error("Erro ao carregar saldo:", error);
      toast.error("Erro ao verificar saldo");
    } finally {
      setCheckingBalance(false);
    }
  };

  const addProgressStep = (
    step: string,
    status: PurchaseProgress["status"],
    message: string,
    errorDetails?: string,
  ) => {
    setProgress((prev) => {
      const existingIndex = prev.findIndex((p) => p.step === step);

      const newStep: PurchaseProgress = {
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
        errorDetails,
      };

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newStep;
        return updated;
      } else {
        return [...prev, newStep];
      }
    });

    // Atualizar percentual de progresso
    updateProgressPercentage(step, status);
  };

  const updateProgressPercentage = (step: string, status: PurchaseProgress["status"]) => {
    const steps = platform === "wordpress" ? WORDPRESS_STEPS : ATOMICAT_STEPS;
    const currentStepIndex = steps.findIndex((s) => s.key === step);

    if (currentStepIndex === -1) return;

    if (status === "completed") {
      const percentage = ((currentStepIndex + 1) / steps.length) * 100;
      setProgressPercentage(Math.round(percentage));
    } else if (status === "in_progress") {
      const percentage = (currentStepIndex / steps.length) * 100;
      setProgressPercentage(Math.round(percentage));
    } else if (status === "error") {
      // Manter progresso atual em caso de erro
    }
  };

  const handleGenerate = async () => {
    // Validações
    if (!niche.trim()) {
      toast.error("Por favor, insira o nicho");
      return;
    }

    // Validação 1: Saldo mínimo de $1
    if (balance < 1) {
      toast.error("Saldo insuficiente. Por favor, adicione pelo menos $1.00 para continuar.");
      return;
    }

    // Validação 2: Verificar se o saldo estimado é suficiente
    if (balance < estimatedCost) {
      const missingAmount = (estimatedCost - balance).toFixed(2);
      toast.error(`Saldo insuficiente. Adicione pelo menos $${missingAmount} para continuar.`);
      return;
    }

    setLoading(true);
    setShowProgress(true);
    setProgress([]);
    setProgressPercentage(0);

    // Fechar EventSource anterior se existir
    if (eventSource) {
      eventSource.close();
    }

    try {
      console.log("🚀 Iniciando compra de domínios...");

      // Chamar Edge Function
      const { data, error } = await supabase.functions.invoke("purchase-domain-hub", {
        body: {
          niche,
          quantity,
          language,
          platform,
          balance,
        },
      });

      if (error) {
        console.error("❌ Erro ao iniciar:", error);
        addProgressStep("init", "error", "Erro ao iniciar processo", error.message);
        throw error;
      }

      if (!data?.sessionId || !data?.streamUrl) {
        throw new Error("Resposta inválida da Edge Function");
      }

      console.log("✅ Sessão criada:", data.sessionId);

      // Conectar ao SSE
      const es = new EventSource(data.streamUrl);
      setEventSource(es);

      es.onopen = () => {
        console.log("🔗 Conexão SSE estabelecida");
      };

      es.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data);
          console.log("📨 Progresso recebido:", eventData);

          // Atualizar progresso
          if (eventData.step && eventData.status && eventData.message) {
            addProgressStep(eventData.step, eventData.status, eventData.message, eventData.errorDetails);
          }

          // Verificar se houve erro de saldo insuficiente durante a compra
          if (eventData.type === "insufficient_balance") {
            const missingAmount = eventData.missingAmount?.toFixed(2) || "0.00";
            toast.error(`Saldo insuficiente. Adicione pelo menos $${missingAmount} para continuar.`);
            addProgressStep("purchasing", "error", "Saldo insuficiente", `Faltam $${missingAmount}`);
            setLoading(false);
            es.close();
            return;
          }

          // Verificar se é o resultado final
          if (eventData.type === "final" || eventData.step === "completed") {
            console.log("✅ Processo finalizado");

            if (eventData.status === "completed") {
              toast.success("Domínios comprados e configurados com sucesso!");

              setTimeout(() => {
                setShowProgress(false);
                setLoading(false);
                onOpenChange(false);
                onSuccess();
                resetForm();
                es.close();
              }, 2000);
            }
          }

          // Verificar se houve erro
          if (eventData.status === "error" && eventData.type !== "insufficient_balance") {
            console.error("❌ Erro no processo:", eventData);
            setLoading(false);
          }
        } catch (error) {
          console.error("Erro ao processar evento SSE:", error);
        }
      };

      es.onerror = (error) => {
        console.error("❌ Erro SSE:", error);
        addProgressStep("connection", "error", "Erro na conexão", "Falha na comunicação com o servidor");
        setLoading(false);
        es.close();
      };
    } catch (error: any) {
      console.error("❌ Erro geral:", error);
      toast.error(error.message || "Erro ao processar compra");
      setLoading(false);
      setShowProgress(false);
    }
  };

  const resetForm = () => {
    setQuantity(1);
    setNiche("");
    setLanguage("portuguese");
    setPlatform("wordpress");
    setProgress([]);
    setProgressPercentage(0);
    setShowProgress(false);
  };

  const handleClose = () => {
    if (loading) {
      toast.error("Aguarde o processo finalizar");
      return;
    }

    if (eventSource) {
      eventSource.close();
    }

    onOpenChange(false);
    resetForm();
  };

  const getStatusIcon = (status: PurchaseProgress["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "in_progress":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const steps = platform === "wordpress" ? WORDPRESS_STEPS : ATOMICAT_STEPS;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compra com IA</DialogTitle>
          <DialogDescription>Configure os parâmetros para buscar e comprar domínios disponíveis</DialogDescription>
        </DialogHeader>

        {!showProgress ? (
          <div className="space-y-6 py-4">
            {/* Saldo disponível */}
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Saldo Disponível</p>
                  <p className="text-2xl font-bold text-blue-600">${balance.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Custo Estimado</p>
                  <p className="text-xl font-semibold text-gray-700">${estimatedCost.toFixed(2)}</p>
                </div>
              </div>
              {balance < estimatedCost && (
                <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>Saldo insuficiente para esta compra</span>
                </div>
              )}
            </Card>

            {/* Quantidade */}
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

            {/* Nicho */}
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

            {/* Idioma */}
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
                </SelectContent>
              </Select>
            </div>

            {/* Plataforma */}
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
                  <SelectItem value="wordpress">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">WordPress</span>
                      <span className="text-xs text-gray-500">Com Cloudflare e nameservers</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="atomicat">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">AtomiCat</span>
                      <span className="text-xs text-gray-500">Configuração simplificada</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botões */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || checkingBalance || balance < 1 || balance < estimatedCost}
                className="flex-1"
              >
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
          <div className="space-y-6 py-4">
            {/* Barra de progresso geral */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Progresso Geral</span>
                <span className="font-semibold">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>

            {/* Lista de steps */}
            <div className="space-y-3">
              {steps.map((step, index) => {
                const progressItem = progress.find((p) => p.step === step.key);
                const status = progressItem?.status || "pending";

                return (
                  <div
                    key={step.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      status === "completed"
                        ? "bg-green-50 border-green-200"
                        : status === "error"
                          ? "bg-red-50 border-red-200"
                          : status === "in_progress"
                            ? "bg-blue-50 border-blue-200"
                            : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="mt-0.5">{getStatusIcon(status)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{step.label}</p>
                      {progressItem?.message && <p className="text-xs text-gray-600 mt-1">{progressItem.message}</p>}
                      {status === "error" && progressItem?.errorDetails && (
                        <p className="text-xs text-red-600 mt-1 font-medium">ERRO! {progressItem.errorDetails}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mensagem de erro geral */}
            {progress.some((p) => p.status === "error") && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="h-5 w-5" />
                  <span className="font-semibold">ERRO!</span>
                </div>
                <p className="text-sm text-red-600 mt-1">Tente novamente ou verifique as configurações</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
