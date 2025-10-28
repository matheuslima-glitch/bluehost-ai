import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface PurchaseProgress {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
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

export default function PurchaseWithAIDialog({
  open,
  onOpenChange,
  onSuccess,
}: PurchaseWithAIDialogProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("portuguese");
  const [structure, setStructure] = useState<"wordpress" | "atomicat">("wordpress");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<PurchaseProgress[]>([]);
  const [showProgress, setShowProgress] = useState(false);
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

    try {
      // Pegar o usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      // Step 1: Generate domain suggestions with AI
      addProgressStep('generation', 'in_progress', 'Gerando sugestões de domínios com IA...');
      
      const { data: suggestions, error: suggestionsError } = await supabase.functions.invoke(
        "ai-domain-suggestions",
        {
          body: {
            keywords: niche,
            quantity,
            language,
            structure,
            niche,
          },
        }
      );

      if (suggestionsError) {
        console.error("AI suggestions error:", suggestionsError);
        addProgressStep('generation', 'error', `Erro ao gerar domínios: ${suggestionsError.message}`);
        throw suggestionsError;
      }

      if (!suggestions?.domains || suggestions.domains.length === 0) {
        addProgressStep('generation', 'error', 'Nenhum domínio foi gerado pela IA');
        throw new Error("Nenhum domínio foi gerado pela IA");
      }

      addProgressStep('generation', 'completed', `${suggestions.domains.length} domínios gerados com sucesso`);

      // Step 2: Purchase and configure domains
      addProgressStep('purchase', 'in_progress', 'Iniciando processo de compra...');

      const { data: purchaseResult, error: purchaseError } = await supabase.functions.invoke(
        "purchase-domains",
        {
          body: {
            domains: suggestions.domains,
            structure,
            userId: user.id
          },
        }
      );

      if (purchaseError) {
        console.error("Purchase error:", purchaseError);
        addProgressStep('purchase', 'error', `Erro na compra: ${purchaseError.message}`);
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
            trafficSource: 'Google Ads'
          }))
        );

        addProgressStep('complete', 'completed', `Processo concluído! ${domains.length} domínios comprados e configurados.`);
        
        // Mostrar dialog de classificação
        setShowProgress(false);
        setShowClassification(true);
      } else {
        throw new Error("Nenhum domínio foi comprado");
      }

    } catch (error: any) {
      console.error("Erro ao comprar domínios:", error);
      toast.error(error.message || "Erro ao processar compra com IA");
    } finally {
      setLoading(false);
    }
  };

  const addProgressStep = (step: string, status: PurchaseProgress['status'], message: string) => {
    setProgress(prev => [...prev, {
      step,
      status,
      message,
      timestamp: new Date().toISOString()
    }]);
  };

  const handleSaveClassifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Salvar classificações no banco
      for (const classification of classifications) {
        // Buscar o domain_id
        const { data: domain } = await supabase
          .from('domains')
          .select('id')
          .eq('domain_name', classification.domain)
          .eq('user_id', user.id)
          .single();

        if (domain) {
          // TODO: Descomentar após executar a migration
          // await supabase.from('domain_classifications').insert({
          //   domain_id: domain.id,
          //   classification_type: 'traffic_source',
          //   classification_value: classification.trafficSource,
          //   created_by: user.id
          // });

          // Atualizar o campo traffic_source na tabela domains
          await supabase
            .from('domains')
            .update({ traffic_source: classification.trafficSource })
            .eq('id', domain.id);
        }
      }

      toast.success("Classificações salvas com sucesso!");
      setShowClassification(false);
      onSuccess();
      onOpenChange(false);
      
      // Reset states
      setNiche("");
      setQuantity(1);
      setPurchasedDomains([]);
      setClassifications([]);
      setProgress([]);
      
    } catch (error: any) {
      console.error("Erro ao salvar classificações:", error);
      toast.error("Erro ao salvar classificações");
    }
  };

  const getStatusIcon = (status: PurchaseProgress['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const calculateProgress = () => {
    const completed = progress.filter(p => p.status === 'completed').length;
    return (completed / Math.max(progress.length, 1)) * 100;
  };

  // Dialog de configuração inicial
  if (!showProgress && !showClassification) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Compra com IA</DialogTitle>
            <DialogDescription>
              Configure os parâmetros para gerar e comprar domínios automaticamente
            </DialogDescription>
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
              <Select value={language} onValueChange={setLanguage}>
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

            <div className="grid gap-2">
              <Label htmlFor="structure">Estrutura</Label>
              <Select value={structure} onValueChange={(value: any) => setStructure(value)}>
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
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                "Gerar e Comprar"
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
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Processando Compra</DialogTitle>
            <DialogDescription>
              Acompanhe o progresso da compra e configuração dos domínios
            </DialogDescription>
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
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg border">
                  {getStatusIcon(step.status)}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{step.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(step.timestamp).toLocaleTimeString('pt-BR')}
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
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Classificar Domínios</DialogTitle>
          <DialogDescription>
            Selecione a fonte de tráfego para cada domínio comprado
          </DialogDescription>
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
          <Button onClick={handleSaveClassifications}>
            Salvar Classificações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}