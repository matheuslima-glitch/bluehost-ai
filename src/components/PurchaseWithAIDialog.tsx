import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

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

// Steps em português
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

export default function PurchaseWithAIDialog({ open, onOpenChange, onSuccess }: PurchaseWithAIDialogProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("portuguese");
  const [platform, setPlatform] = useState<"wordpress" | "atomicat">("wordpress");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Map<string, PurchaseProgress>>(new Map());
  const [showProgress, setShowProgress] = useState(false);
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  useEffect(() => {
    if (open) {
      setProgress(new Map());
      setProgressPercentage(0);
      setShowProgress(false);
    }
  }, [open]);

  // 🎯 CALCULAR PORCENTAGEM CORRETAMENTE
  const calculateProgress = (currentProgress: Map<string, PurchaseProgress>) => {
    const steps = platform === "wordpress" ? WORDPRESS_STEPS : ATOMICAT_STEPS;
    const totalSteps = steps.length;

    // Contar quantos steps foram completados
    let completedSteps = 0;
    steps.forEach((stepKey) => {
      const stepProgress = currentProgress.get(stepKey);
      if (stepProgress?.status === "completed") {
        completedSteps++;
      }
    });

    // Calcular porcentagem: (completados / total) * 100
    const percentage = Math.round((completedSteps / totalSteps) * 100);
    console.log(`📊 Progresso: ${completedSteps}/${totalSteps} = ${percentage}%`);

    setProgressPercentage(percentage);
  };

  const addProgressStep = (
    step: string,
    status: PurchaseProgress["status"],
    message: string,
    errorDetails?: string,
  ) => {
    console.log(`📊 ✅ Atualizando: ${step} = ${status}`);

    setProgress((prev) => {
      const newProgress = new Map(prev);
      newProgress.set(step, {
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
        errorDetails,
      });

      // Calcular progresso após atualizar
      calculateProgress(newProgress);

      return newProgress;
    });
  };

  const handleGenerate = async () => {
    if (!niche.trim()) {
      toast.error("Por favor, insira o nicho");
      return;
    }

    setLoading(true);

    // Fechar EventSource anterior
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
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
        },
      });

      // Verificar erro de saldo
      if (error) {
        console.error("❌ Erro:", error);

        if (error.message?.includes("insufficient_balance") || error.message?.includes("Saldo insuficiente")) {
          toast.error(
            "Saldo insuficiente! Adicione saldo para continuar com a compra de domínios. Dica: U$1 dólar para .online ou U$14+ dólares para .com",
            {
              duration: 6000,
              style: {
                background: "#FEE2E2",
                border: "1px solid #FCA5A5",
                color: "#991B1B",
              },
            },
          );
          setLoading(false);
          return;
        }

        throw error;
      }

      if (!data?.sessionId || !data?.streamUrl) {
        console.error("❌ Resposta inválida:", data);
        throw new Error("Resposta inválida da Edge Function");
      }

      console.log("✅ Sessão criada:", data.sessionId);
      console.log("🔗 Stream URL:", data.streamUrl);

      // Mostrar popup de progresso
      setShowProgress(true);
      setProgress(new Map());
      setProgressPercentage(0);

      // 🔥 CONECTAR AO SSE
      console.log("🔗 Conectando ao SSE...");
      const es = new EventSource(data.streamUrl);
      setEventSource(es);

      es.onopen = () => {
        console.log("✅ ✅ ✅ CONEXÃO SSE ESTABELECIDA!");
      };

      es.onmessage = (event) => {
        console.log("📨 📨 📨 EVENTO SSE RECEBIDO:", event.data);

        try {
          // Ignorar keep-alive
          if (event.data.startsWith(":")) {
            console.log("⏭️ Keep-alive ignorado");
            return;
          }

          const eventData = JSON.parse(event.data);
          console.log("📊 Dados parseados:", JSON.stringify(eventData, null, 2));

          // 🎯 ATUALIZAR PROGRESSO
          if (eventData.step && eventData.status && eventData.message) {
            console.log(`✅ Atualizando step: ${eventData.step} → ${eventData.status}`);

            addProgressStep(eventData.step, eventData.status, eventData.message, eventData.errorDetails);
          } else {
            console.warn("⚠️ Evento sem step/status/message:", eventData);
          }

          // Verificar conclusão
          if (eventData.step === "completed" && eventData.status === "completed") {
            console.log("🎉 🎉 🎉 PROCESSO FINALIZADO!");
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

          // Verificar erro
          if (eventData.status === "error") {
            console.error("❌ Erro no processo:", eventData);
            toast.error(eventData.message || "Erro no processo");
            setLoading(false);
          }
        } catch (error) {
          console.error("❌ Erro ao processar evento:", error);
          console.error("Dados brutos:", event.data);
        }
      };

      es.onerror = (error) => {
        console.error("❌ ❌ ❌ ERRO SSE:", error);
        toast.error("Erro na conexão com o servidor");
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
    setProgress(new Map());
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
      setEventSource(null);
    }

    onOpenChange(false);
    resetForm();
  };

  const getStatusIcon = (status: PurchaseProgress["status"]) => {
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

  const steps = platform === "wordpress" ? WORDPRESS_STEPS : ATOMICAT_STEPS;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compra com IA</DialogTitle>
          <DialogDescription>Configure os parâmetros para buscar e comprar domínios disponíveis</DialogDescription>
        </DialogHeader>

        {!showProgress ? (
          <div className="space-y-4 py-4">
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
                  <SelectItem value="german">Alemão</SelectItem>
                  <SelectItem value="french">Francês</SelectItem>
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
                  <SelectItem value="wordpress">WordPress</SelectItem>
                  <SelectItem value="atomicat">AtomiCat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botões */}
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
            {/* Barra de progresso com cálculo correto */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Progresso Geral</span>
                <span className="font-semibold">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>

            {/* Lista de steps - em português */}
            <div className="space-y-2">
              {steps.map((stepKey) => {
                const progressItem = progress.get(stepKey);

                // Só renderiza se já recebeu
                if (!progressItem) return null;

                const status = progressItem.status;
                const stepLabel = STEP_LABELS[stepKey] || stepKey;

                return (
                  <div
                    key={stepKey}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      status === "completed"
                        ? "bg-blue-50 border-blue-200"
                        : status === "error"
                          ? "bg-red-50 border-red-200"
                          : status === "in_progress"
                            ? "bg-blue-50 border-blue-200"
                            : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="mt-0.5">{getStatusIcon(status)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{stepLabel}</p>
                      {progressItem.message && <p className="text-xs text-gray-600 mt-1">{progressItem.message}</p>}
                      {status === "error" && progressItem.errorDetails && (
                        <p className="text-xs text-red-600 mt-1 font-medium">{progressItem.errorDetails}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mensagem de erro */}
            {Array.from(progress.values()).some((p) => p.status === "error") && (
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
