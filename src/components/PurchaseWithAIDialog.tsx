import { useState } from "react";
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
}

interface PurchaseWithAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface DomainClassification {
  domain: string;
  trafficSource: string;
}

export default function PurchaseWithAIDialog({ open, onOpenChange, onSuccess }: PurchaseWithAIDialogProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("portuguese");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<PurchaseProgress[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [foundDomains, setFoundDomains] = useState<string[]>([]);
  const [showStructureSelection, setShowStructureSelection] = useState(false);
  const [selectedStructure, setSelectedStructure] = useState<"wordpress" | "atomicat">("wordpress");
  const [purchasedDomains, setPurchasedDomains] = useState<string[]>([]);
  const [showClassification, setShowClassification] = useState(false);
  const [classifications, setClassifications] = useState<DomainClassification[]>([]);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const addProgressStep = (step: string, status: PurchaseProgress["status"], message: string) => {
    setProgress((prev) => {
      // Verificar se já existe um step com mesmo nome
      const existingIndex = prev.findIndex((p) => p.step === step);

      const newStep: PurchaseProgress = {
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        // Atualizar step existente
        const updated = [...prev];
        updated[existingIndex] = newStep;
        return updated;
      } else {
        // Adicionar novo step
        return [...prev, newStep];
      }
    });
  };

  const handleGenerate = async () => {
    if (!niche.trim()) {
      toast.error("Por favor, insira o nicho");
      return;
    }

    setLoading(true);
    setShowProgress(true);
    setProgress([]);

    // Fechar EventSource anterior se existir
    if (eventSource) {
      eventSource.close();
    }

    try {
      // Pegar o usuário atual
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      console.log("🚀 Iniciando busca de domínios...");

      // PASSO 1: Chamar a Edge Function para iniciar o processo
      const { data: initData, error: initError } = await supabase.functions.invoke("ai-domain-suggestions", {
        body: {
          keywords: niche,
          quantity,
          language,
          niche,
          structure: selectedStructure,
        },
      });

      if (initError) {
        console.error("❌ Erro ao iniciar:", initError);
        addProgressStep("init", "error", `❌ Erro ao iniciar: ${initError.message}`);
        throw initError;
      }

      if (!initData?.sessionId || !initData?.streamUrl) {
        throw new Error("Resposta inválida da Edge Function");
      }

      console.log("✅ Sessão criada:", initData.sessionId);
      console.log("🌊 Stream URL:", initData.streamUrl);

      // PASSO 2: Conectar ao SSE para receber progresso em tempo real
      const es = new EventSource(initData.streamUrl);
      setEventSource(es);

      es.onopen = () => {
        console.log("🔗 Conexão SSE estabelecida");
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📨 Progresso recebido:", data);

          // Adicionar step ao progresso
          if (data.step) {
            addProgressStep(data.step, data.status, data.message);
          }

          // Verificar se é o resultado final
          if (data.type === "final") {
            console.log("✅ Processo finalizado:", data.data);

            if (data.data.domains && data.data.domains.length > 0) {
              setFoundDomains(data.data.domains);
              toast.success(`${data.data.domains.length} domínios disponíveis encontrados!`);

              // Aguardar 1.5s para mostrar o progresso completo
              setTimeout(() => {
                setShowProgress(false);
                setShowStructureSelection(true);
                setLoading(false);
                es.close();
              }, 1500);
            } else {
              toast.error("Nenhum domínio disponível foi encontrado");
              setLoading(false);
              setTimeout(() => {
                setShowProgress(false);
                es.close();
              }, 3000);
            }
          }

          // Verificar se houve erro
          if (data.status === "error" || data.type === "error") {
            console.error("❌ Erro reportado:", data);
            toast.error(data.message || data.error || "Erro no processo");
            setLoading(false);
            setTimeout(() => {
              setShowProgress(false);
              es.close();
            }, 3000);
          }
        } catch (error) {
          console.error("❌ Erro ao processar evento SSE:", error);
        }
      };

      es.onerror = (error) => {
        console.error("❌ Erro na conexão SSE:", error);
        addProgressStep("connection", "error", "❌ Erro na conexão com o servidor");
        setLoading(false);
        setTimeout(() => {
          setShowProgress(false);
          es.close();
        }, 3000);
      };
    } catch (error: any) {
      console.error("❌ Erro ao buscar domínios:", error);
      toast.error(error.message || "Erro ao processar busca de domínios");
      addProgressStep("error", "error", `❌ Erro: ${error.message}`);
      setLoading(false);

      // Manter o progresso visível por 3s antes de fechar
      setTimeout(() => {
        setShowProgress(false);
      }, 3000);
    }
  };

  const handlePurchaseWithStructure = async () => {
    setShowStructureSelection(false);
    setShowProgress(true);
    setLoading(true);
    setProgress([]);

    // Fechar EventSource anterior se existir
    if (eventSource) {
      eventSource.close();
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      addProgressStep("purchase_init", "in_progress", `🛒 Iniciando compra de ${foundDomains.length} domínios...`);

      // Aguardar 300ms
      await new Promise((resolve) => setTimeout(resolve, 300));

      addProgressStep("purchase", "in_progress", `💳 Processando compra via Namecheap API...`);

      // Step 2: Purchase and configure domains
      const { data: purchaseResult, error: purchaseError } = await supabase.functions.invoke("purchase-domains", {
        body: {
          domains: foundDomains,
          structure: selectedStructure,
          userId: user.id,
        },
      });

      if (purchaseError) {
        console.error("Purchase error:", purchaseError);
        addProgressStep("purchase", "error", `❌ Erro na compra: ${purchaseError.message}`);
        throw purchaseError;
      }

      // Adicionar progresso do backend
      if (purchaseResult?.progress) {
        purchaseResult.progress.forEach((step: PurchaseProgress) => {
          addProgressStep(step.step, step.status, step.message);
        });
      }

      if (purchaseResult?.purchasedDomains && purchaseResult.purchasedDomains.length > 0) {
        const domains = purchaseResult.purchasedDomains.map((d: any) => d.domain);
        setPurchasedDomains(domains);

        // Inicializar classificações
        setClassifications(
          domains.map((domain: string) => ({
            domain,
            trafficSource: "Google Ads",
          })),
        );

        addProgressStep(
          "complete",
          "completed",
          `✅ Processo concluído! ${domains.length} domínios comprados e configurados.`,
        );

        toast.success(`${domains.length} domínios comprados com sucesso!`);

        // Aguardar 1s
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Mostrar dialog de classificação
        setShowProgress(false);
        setShowClassification(true);
      } else {
        throw new Error("Nenhum domínio foi comprado");
      }
    } catch (error: any) {
      console.error("Erro na compra:", error);
      toast.error(error.message || "Erro ao processar compra");
      setLoading(false);

      await new Promise((resolve) => setTimeout(resolve, 3000));
      setShowProgress(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClassifications = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      // Salvar classificações no banco
      for (const classification of classifications) {
        const { error } = await supabase
          .from("domains")
          .update({ traffic_source: classification.trafficSource })
          .eq("domain", classification.domain)
          .eq("user_id", user.id);

        if (error) {
          console.error("Erro ao salvar classificação:", error);
          throw error;
        }
      }

      toast.success("Classificações salvas com sucesso!");
      setShowClassification(false);
      onSuccess();
      onOpenChange(false);

      // Resetar estado
      setQuantity(1);
      setNiche("");
      setLanguage("portuguese");
      setFoundDomains([]);
      setPurchasedDomains([]);
      setClassifications([]);
      setProgress([]);
    } catch (error: any) {
      console.error("Erro ao salvar classificações:", error);
      toast.error(error.message || "Erro ao salvar classificações");
    }
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

  const calculateProgress = () => {
    if (progress.length === 0) return 0;
    const completed = progress.filter((p) => p.status === "completed").length;
    return Math.round((completed / progress.length) * 100);
  };

  // Cleanup ao desmontar
  useState(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  });

  // Dialog de configuração inicial
  if (!showProgress && !showStructureSelection && !showClassification) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] shadow-[0_0_40px_hsl(var(--glow-blue)_/_0.25)] border-[hsl(var(--accent-cyan)_/_0.3)]">
          <DialogHeader>
            <DialogTitle>Compra com IA</DialogTitle>
            <DialogDescription>Configure os parâmetros para buscar domínios disponíveis</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantidade de Domínios</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="niche">Nicho</Label>
              <Input
                id="niche"
                placeholder="Ex: saúde, tecnologia, finanças..."
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="language">Idioma</Label>
              <Input
                id="language"
                placeholder="Ex: português, inglês, espanhol..."
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                "Buscar Domínios"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Dialog de seleção de estrutura
  if (showStructureSelection) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[500px] shadow-[0_0_40px_hsl(var(--glow-blue)_/_0.25)] border-[hsl(var(--accent-cyan)_/_0.3)]">
          <DialogHeader>
            <DialogTitle>🎉 Domínios Encontrados!</DialogTitle>
            <DialogDescription>
              Foram encontrados {foundDomains.length} domínios disponíveis. Selecione a estrutura desejada para
              prosseguir com a compra.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-950/20">
              <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">✅ Domínios Disponíveis:</h3>
              <ul className="space-y-1">
                {foundDomains.map((domain, index) => (
                  <li key={index} className="text-sm text-green-700 dark:text-green-300">
                    • {domain}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="structure">Selecione a Estrutura</Label>
              <Select value={selectedStructure} onValueChange={(value: any) => setSelectedStructure(value)}>
                <SelectTrigger id="structure">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wordpress">WordPress</SelectItem>
                  <SelectItem value="atomicat">Atomicat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowStructureSelection(false);
                setFoundDomains([]);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handlePurchaseWithStructure}>Prosseguir com a Compra</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Dialog de progresso
  if (showProgress) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto shadow-[0_0_40px_hsl(var(--glow-blue)_/_0.25)] border-[hsl(var(--accent-cyan)_/_0.3)]">
          <DialogHeader>
            <DialogTitle>Processando</DialogTitle>
            <DialogDescription>Acompanhe o progresso da busca e compra dos domínios</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progresso geral</span>
                <span>{calculateProgress()}%</span>
              </div>
              <Progress value={calculateProgress()} />
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {progress.length === 0 ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Conectando com o servidor...</p>
                    <p className="text-xs text-muted-foreground mt-1">Aguarde enquanto iniciamos o processo</p>
                  </div>
                </div>
              ) : (
                progress.map((step, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                    {getStatusIcon(step.status)}
                    <div className="flex-1">
                      <p className="font-medium text-sm">{step.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(step.timestamp).toLocaleTimeString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Dialog de classificação
  return (
    <Dialog open={showClassification} onOpenChange={setShowClassification}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto shadow-[0_0_40px_hsl(var(--glow-blue)_/_0.25)] border-[hsl(var(--accent-cyan)_/_0.3)]">
        <DialogHeader>
          <DialogTitle>Classificar Domínios</DialogTitle>
          <DialogDescription>Selecione a fonte de tráfego para cada domínio comprado</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {classifications.map((classification, index) => (
            <div key={index} className="grid gap-2">
              <Label>{classification.domain}</Label>
              <Select
                value={classification.trafficSource}
                onValueChange={(value) => {
                  const newClassifications = [...classifications];
                  newClassifications[index].trafficSource = value;
                  setClassifications(newClassifications);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Google Ads">Google Ads</SelectItem>
                  <SelectItem value="Facebook Ads">Facebook Ads</SelectItem>
                  <SelectItem value="Native Ads">Native Ads</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setShowClassification(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSaveClassifications}>Salvar Classificações</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
