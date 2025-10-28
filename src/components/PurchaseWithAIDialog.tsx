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
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PurchaseWithAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
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

  const handleGenerate = async () => {
    if (!niche.trim()) {
      toast.error("Por favor, insira o nicho");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Generate domain suggestions with AI
      toast.info("Gerando sugestões de domínios...");
      
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
        throw suggestionsError;
      }

      if (!suggestions?.domains || suggestions.domains.length === 0) {
        throw new Error("Nenhum domínio foi gerado pela IA");
      }

      console.log("Generated domains:", suggestions.domains);
      toast.info(`${suggestions.domains.length} domínios gerados. Verificando disponibilidade...`);

      // Step 2: Send to verification webhook
      const webhookUrl = "https://webhook.institutoexperience.com/webhook/2ad42b09-808e-42b9-bbb9-6e47d828004a";
      
      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domains: suggestions.domains
        }),
      });

      if (!webhookResponse.ok) {
        throw new Error("Erro ao verificar disponibilidade dos domínios");
      }

      toast.success("Processo de compra iniciado! Você será notificado quando concluído.");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao comprar domínios:", error);
      toast.error(error.message || "Erro ao processar compra com IA");
    } finally {
      setLoading(false);
    }
  };

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
