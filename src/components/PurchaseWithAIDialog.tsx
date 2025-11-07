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
  const [selectedStructure, setSelectedStructure] = useState<"wordpress" | "atomicat">("wordpress");
  const [purchasedDomains, setPurchasedDomains] = useState<string[]>([]);
  const [showClassification, setShowClassification] = useState(false);
  const [classifications, setClassifications] = useState<DomainClassification[]>([]);

  const handleGenerate = async () => {
    if (!niche.trim()) {
      toast.error("Por favor, insira o nicho");
      return;
    }

    setLoading(true);
    setShowProgress(true);
    setProgress([]);
    setFoundDomains([]);

    try {
      // Pegar o usuário atual
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      // Obter a URL da edge function do Supabase
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const functionUrl = `${supabaseUrl}/functions/v1/ai-domain-suggestions`;

      // Preparar payload
      const payload = {
        keywords: niche,
        quantity,
        language,
        niche,
        structure: selectedStructure, // wordpress ou atomicat
      };

      console.log("📤 Calling edge function with SSE:", payload);

      // Fazer requisição para edge function
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status}`);
      }

      // Processar Server-Sent Events (SSE)
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Não foi possível ler a resposta");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Processar linhas completas
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Manter última linha incompleta no buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonData = JSON.parse(line.substring(6));

              // Se for o resultado final
              if (jsonData.type === "final") {
                const finalData = jsonData.data;
                console.log("✅ Final result:", finalData);

                if (finalData.domains && finalData.domains.length > 0) {
                  setFoundDomains(finalData.domains);

                  // Se já tiver domínios comprados e configurados, ir direto para classificação
                  if (finalData.purchased_domains && finalData.purchased_domains.length > 0) {
                    setPurchasedDomains(finalData.purchased_domains);
                    setClassifications(
                      finalData.purchased_domains.map((domain: string) => ({
                        domain,
                        trafficSource: "Google Ads",
                      })),
                    );

                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    setShowProgress(false);
                    setShowClassification(true);
                    setLoading(false);
                  } else {
                    // Apenas encontrou domínios - n8n já deve ter feito a compra
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    setShowProgress(false);
                    setLoading(false);
                    toast.success(`${finalData.domains.length} domínios encontrados!`);
                  }
                }
              }
              // Se for erro
              else if (jsonData.type === "error") {
                console.error("❌ Error from edge function:", jsonData.error);
                addProgressStep("error", "error", `❌ ${jsonData.error}`);
                setLoading(false);
                await new Promise((resolve) => setTimeout(resolve, 3000));
                setShowProgress(false);
              }
              // Se for update de progresso
              else if (jsonData.step) {
                console.log("📊 Progress update:", jsonData);
                addProgressStep(jsonData.step, jsonData.status, jsonData.message);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("❌ Erro ao buscar domínios:", error);
      addProgressStep("error", "error", `❌ Erro: ${error.message}`);
      toast.error(error.message || "Erro ao processar busca de domínios");
      setLoading(false);

      await new Promise((resolve) => setTimeout(resolve, 3000));
      setShowProgress(false);
    }
  };

  const handlePurchaseWithStructure = async () => {
    setShowProgress(true);
    setLoading(true);
    setProgress([]);

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
      console.error("Erro ao comprar domínios:", error);
      toast.error(error.message || "Erro ao processar compra");

      // Aguardar 3s antes de fechar
      await new Promise((resolve) => setTimeout(resolve, 3000));
      setShowProgress(false);
    } finally {
      setLoading(false);
    }
  };

  const addProgressStep = (step: string, status: PurchaseProgress["status"], message: string) => {
    setProgress((prev) => [
      ...prev,
      {
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleSaveClassifications = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Salvar classificações no banco - atualizar apenas o campo traffic_source
      for (const classification of classifications) {
        // Buscar o domain_id
        const { data: domain } = await supabase
          .from("domains")
          .select("id")
          .eq("domain_name", classification.domain)
          .eq("user_id", user.id)
          .single();

        if (domain) {
          // Atualizar o campo traffic_source na tabela domains
          await supabase.from("domains").update({ traffic_source: classification.trafficSource }).eq("id", domain.id);
        }
      }

      toast.success("Classificações salvas com sucesso!");
      setShowClassification(false);
      onSuccess();
      onOpenChange(false);

      // Reset states
      setNiche("");
      setQuantity(1);
      setFoundDomains([]);
      setPurchasedDomains([]);
      setClassifications([]);
      setProgress([]);
    } catch (error: any) {
      console.error("Erro ao salvar classificações:", error);
      toast.error("Erro ao salvar classificações");
    }
  };

  const getStatusIcon = (status: PurchaseProgress["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "in_progress":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const calculateProgress = () => {
    const completed = progress.filter((p) => p.status === "completed").length;
    return (completed / Math.max(progress.length, 1)) * 100;
  };

  // Dialog de configuração inicial
  if (!showProgress && !showClassification) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] shadow-[0_0_40px_hsl(var(--glow-blue)_/_0.25)] border-[hsl(var(--accent-cyan)_/_0.3)]">
          <DialogHeader>
            <DialogTitle>Compra com IA</DialogTitle>
            <DialogDescription>Configure os parâmetros para buscar domínios disponíveis</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="structure">Plataforma</Label>
              <Select value={selectedStructure} onValueChange={(value: any) => setSelectedStructure(value)}>
                <SelectTrigger id="structure">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wordpress">Wordpress</SelectItem>
                  <SelectItem value="atomicat">Atomicat</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                placeholder="portuguese"
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
                <span>{Math.round(calculateProgress())}%</span>
              </div>
              <Progress value={calculateProgress()} />
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {progress.map((step, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  {getStatusIcon(step.status)}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{step.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(step.timestamp).toLocaleTimeString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
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
