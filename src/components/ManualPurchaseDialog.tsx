import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ManualPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  price: string;
  onSuccess?: () => void;
}

export default function ManualPurchaseDialog({
  open,
  onOpenChange,
  domain,
  price,
  onSuccess,
}: ManualPurchaseDialogProps) {
  const [platform, setPlatform] = useState<string>("wordpress");
  const [trafficSource, setTrafficSource] = useState<string>("");
  const [purchasing, setPurchasing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>(null);

  // Limpar estados ao abrir/fechar
  useEffect(() => {
    if (!open) {
      setPlatform("wordpress");
      setTrafficSource("");
      setPurchasing(false);
      setSessionId(null);
      setProgress(null);
    }
  }, [open]);

  // Polling de progresso
  useEffect(() => {
    if (!sessionId || !purchasing) return;

    const pollProgress = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "https://domainhub-backend.onrender.com";
        const response = await fetch(`${apiUrl}/api/purchase-domains/status/${sessionId}`);

        if (response.ok) {
          const data = await response.json();
          setProgress(data.progress);

          // Se completou ou deu erro, parar polling
          if (data.progress?.status === "completed" || data.progress?.status === "error") {
            setPurchasing(false);

            if (data.progress?.status === "completed") {
              toast.success("Domínio comprado com sucesso!");
              onOpenChange(false);
              if (onSuccess) onSuccess();
            } else {
              toast.error(data.progress?.message || "Erro ao comprar domínio");
            }
          }
        }
      } catch (error) {
        console.error("Erro ao verificar progresso:", error);
      }
    };

    // Polling a cada 3 segundos
    const interval = setInterval(pollProgress, 3000);

    // Primeira verificação imediata
    pollProgress();

    return () => clearInterval(interval);
  }, [sessionId, purchasing, onOpenChange, onSuccess]);

  const handlePurchase = async () => {
    if (!trafficSource.trim()) {
      toast.error("Por favor, informe a fonte de tráfego");
      return;
    }

    setPurchasing(true);

    try {
      // Obter userId
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      // Usar o endpoint do backend para compra manual
      const apiUrl = import.meta.env.VITE_API_URL || "https://domainhub-backend.onrender.com";
      const response = await fetch(`${apiUrl}/api/purchase-domains/manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain: domain,
          userId: user.id,
          platform: platform,
          trafficSource: trafficSource.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao comprar domínio");
      }

      const data = await response.json();

      if (data.success) {
        setSessionId(data.sessionId);
        toast.success("Compra iniciada! Acompanhando progresso...");
        // O polling vai cuidar do resto
      } else {
        throw new Error(data.error || "Erro ao comprar domínio");
      }
    } catch (error: any) {
      console.error("Erro ao comprar domínio:", error);
      toast.error(error.message || "Erro ao comprar domínio");
      setPurchasing(false);
    }
  };

  const handleClose = () => {
    if (purchasing) {
      toast.info("Compra em andamento. Aguarde a finalização.");
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Confirmar Compra de Domínio</DialogTitle>
          <DialogDescription>
            Configure as opções para comprar <strong>{domain}</strong> por <strong>${price}</strong>
          </DialogDescription>
        </DialogHeader>

        {!purchasing ? (
          <div className="space-y-4 py-4">
            {/* Seleção de Plataforma */}
            <div className="space-y-2">
              <Label htmlFor="platform">Plataforma</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="platform">
                  <SelectValue placeholder="Selecione a plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wordpress">WordPress</SelectItem>
                  <SelectItem value="atomicat">AtomiCat</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Estrutura do site que será criado após a compra</p>
            </div>

            {/* Fonte de Tráfego */}
            <div className="space-y-2">
              <Label htmlFor="trafficSource">Fonte de Tráfego *</Label>
              <Input
                id="trafficSource"
                placeholder="Ex: Google Ads, Facebook, Orgânico..."
                value={trafficSource}
                onChange={(e) => setTrafficSource(e.target.value)}
                disabled={purchasing}
              />
              <p className="text-xs text-muted-foreground">Informe a origem do tráfego para este domínio</p>
            </div>

            {/* Resumo */}
            <div className="rounded-lg border p-4 space-y-2 bg-muted/50">
              <h4 className="font-semibold text-sm">Resumo da Compra</h4>
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Domínio:</span> <strong>{domain}</strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Preço:</span> <strong>${price}</strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Plataforma:</span>{" "}
                  <strong>{platform === "wordpress" ? "WordPress" : "AtomiCat"}</strong>
                </p>
              </div>
            </div>
          </div>
        ) : (
          // Estado de processamento
          <div className="py-8 space-y-4">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div className="text-center space-y-2">
                <h3 className="font-semibold">Processando compra...</h3>
                <p className="text-sm text-muted-foreground">{progress?.message || "Iniciando processo de compra"}</p>
                {progress?.step && <p className="text-xs text-muted-foreground">Etapa: {progress.step}</p>}
              </div>
            </div>

            {/* Barra de progresso visual */}
            <div className="space-y-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{
                    width:
                      progress?.step === "checking"
                        ? "25%"
                        : progress?.step === "purchasing"
                          ? "50%"
                          : progress?.step === "creating_wordpress"
                            ? "75%"
                            : progress?.step === "completed"
                              ? "100%"
                              : "10%",
                  }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">Este processo pode levar de 2 a 5 minutos</p>
            </div>
          </div>
        )}

        {!purchasing && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={purchasing}>
              Cancelar
            </Button>
            <Button onClick={handlePurchase} disabled={purchasing || !trafficSource.trim()}>
              Confirmar Compra
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
