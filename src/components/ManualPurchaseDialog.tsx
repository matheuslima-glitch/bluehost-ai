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
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

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
  const { user } = useAuth();
  const [platform, setPlatform] = useState<string>("wordpress");
  const [trafficSource, setTrafficSource] = useState<string>("");
  const [purchasing, setPurchasing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>(null);

  // Fetch custom filters from database
  const { data: customFilters = [] } = useQuery({
    queryKey: ["custom-filters", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_filters")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && open,
  });

  // Combine default and custom traffic sources
  const trafficSourceOptions = [
    "facebook",
    "google",
    "native",
    "outbrain",
    "taboola",
    "revcontent",
    ...customFilters.filter((f) => f.filter_type === "traffic_source").map((f) => f.filter_value),
  ];

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
      toast.error("Por favor, selecione a fonte de tráfego");
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

  // ============================================
  // NOVA FUNÇÃO ADICIONADA: Cancelar compra no backend
  // ============================================
  const cancelPurchase = async () => {
    if (!sessionId) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "https://domainhub-backend.onrender.com";

      console.log(`🛑 Solicitando cancelamento para sessão: ${sessionId}`);

      const response = await fetch(`${apiUrl}/api/purchase-domains/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log(`✅ Cancelamento confirmado pelo servidor`);
        toast.warning("🛑 Compra cancelada! Se o domínio já foi comprado, ele não será revertido.", {
          duration: 5000,
        });
      }
    } catch (error) {
      console.error("Erro ao cancelar:", error);
    }
  };

  // ============================================
  // FUNÇÃO ATUALIZADA: handleClose agora cancela no backend
  // ============================================
  const handleClose = () => {
    if (purchasing) {
      const confirmCancel = confirm(
        "⚠️ O processo de compra está em andamento.\n\n" +
          "⚠️ IMPORTANTE: Se o domínio já foi comprado, ele NÃO será revertido!\n\n" +
          "Deseja realmente cancelar?",
      );

      if (!confirmCancel) return;

      // Cancelar no backend
      cancelPurchase();
      setPurchasing(false);
    }
    onOpenChange(false);
  };

  // Função para formatar o nome da fonte de tráfego para exibição
  const formatTrafficSourceLabel = (source: string) => {
    return source.charAt(0).toUpperCase() + source.slice(1);
  };

  // Função para calcular a porcentagem do progresso baseado no step do backend
  const getProgressPercentage = (step: string | undefined): string => {
    switch (step) {
      case "generating":
        return "10%";
      case "checking":
        return "20%";
      case "purchasing":
        return "35%";
      case "cloudflare":
        return "50%";
      case "nameservers":
        return "65%";
      case "cpanel":
        return "75%";
      case "supabase":
        return "90%";
      case "completed":
        return "100%";
      case "error":
        return "0%";
      default:
        return "5%";
    }
  };

  // Função para obter o label amigável do step
  const getStepLabel = (step: string | undefined): string => {
    switch (step) {
      case "generating":
        return "Iniciando";
      case "checking":
        return "Verificando disponibilidade";
      case "purchasing":
        return "Comprando domínio";
      case "cloudflare":
        return "Configurando Cloudflare";
      case "nameservers":
        return "Atualizando nameservers";
      case "cpanel":
        return "Configurando cPanel";
      case "supabase":
        return "Salvando no banco de dados";
      case "completed":
        return "Concluído";
      case "error":
        return "Erro";
      default:
        return "Processando";
    }
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

            {/* Fonte de Tráfego - Agora com Select */}
            <div className="space-y-2">
              <Label htmlFor="trafficSource">Fonte de Tráfego *</Label>
              <Select value={trafficSource} onValueChange={setTrafficSource}>
                <SelectTrigger id="trafficSource">
                  <SelectValue placeholder="Selecione a fonte de tráfego" />
                </SelectTrigger>
                <SelectContent>
                  {trafficSourceOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {formatTrafficSourceLabel(source)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Selecione a origem do tráfego para este domínio</p>
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
                {progress?.step && (
                  <p className="text-xs text-muted-foreground">Etapa: {getStepLabel(progress.step)}</p>
                )}
              </div>
            </div>

            {/* Barra de progresso visual */}
            <div className="space-y-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{
                    width: getProgressPercentage(progress?.step),
                  }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">Este processo pode levar de 1 a 3 minutos</p>
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
