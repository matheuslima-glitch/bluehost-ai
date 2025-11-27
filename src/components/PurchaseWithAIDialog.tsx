import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Clock, Copy, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

interface PurchaseProgress {
  step: string;
  status: "in_progress" | "completed" | "error" | "canceled";
  message: string;
  error_details?: string;
  domain_name?: string;
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
  cpanel: "Adicionando ao cPanel",
  wordpress: "Instalando WordPress",
  plugins: "Configurando plugins",
  supabase: "Salvando no banco de dados",
  completed: "Compra concluída",
  canceled: "Compra cancelada",
};

const WORDPRESS_STEPS = [
  "generating",
  "checking",
  "searching",
  "purchasing",
  "nameservers",
  "cloudflare",
  "cpanel",
  "wordpress",
  "plugins",
  "supabase",
  "completed",
];
const ATOMICAT_STEPS = ["generating", "checking", "searching", "purchasing", "completed"];

const TIMEOUT_SECONDS = 180000;
const MIN_DISPLAY_TIME = 800;
const MAX_DOMAINS = 10; // LIMITE MÁXIMO

// Filtros padrão do sistema
const DEFAULT_PLATFORM_OPTIONS = ["wordpress", "atomicat"];
const DEFAULT_TRAFFIC_SOURCE_OPTIONS = ["facebook", "google", "native", "outbrain", "taboola", "revcontent"];

export default function PurchaseWithAIDialog({ open, onOpenChange, onSuccess }: PurchaseWithAIDialogProps) {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState<number>(1);
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("portuguese");
  const [platform, setPlatform] = useState<"wordpress" | "atomicat">("wordpress");
  const [trafficSource, setTrafficSource] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<PurchaseProgress | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [progressPercentage, setProgressPercentage] = useState(0);

  // MUDANÇA: Armazenar TODOS os domínios comprados
  const [purchasedDomains, setPurchasedDomains] = useState<string[]>([]);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateQueueRef = useRef<PurchaseProgress[]>([]);
  const processingRef = useRef<boolean>(false);
  const lastUpdateTimeRef = useRef<number>(0);
  const purchasedDomainsRef = useRef<string[]>([]); // Ref para manter domínios atualizados

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

  // Combinar filtros padrão e customizados para plataformas
  const platformOptions = [
    ...DEFAULT_PLATFORM_OPTIONS,
    ...customFilters.filter((f) => f.filter_type === "platform").map((f) => f.filter_value),
  ];

  // Combinar filtros padrão e customizados para fontes de tráfego
  const trafficSourceOptions = [
    ...DEFAULT_TRAFFIC_SOURCE_OPTIONS,
    ...customFilters.filter((f) => f.filter_type === "traffic_source").map((f) => f.filter_value),
  ];

  useEffect(() => {
    if (open) {
      setCurrentProgress(null);
      setProgressPercentage(0);
      setShowProgress(false);
      setPurchasedDomains([]); // Limpar lista
      purchasedDomainsRef.current = []; // Limpar ref também
      setShowSuccessDialog(false);
      setTrafficSource(""); // Limpar fonte de tráfego
      updateQueueRef.current = [];
      processingRef.current = false;
      lastUpdateTimeRef.current = 0;
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

  const calculateProgress = (step: string) => {
    const steps = platform === "wordpress" ? WORDPRESS_STEPS : ATOMICAT_STEPS;
    const currentStepIndex = steps.indexOf(step);

    if (currentStepIndex === -1) return 0;

    const percentage = Math.round(((currentStepIndex + 1) / steps.length) * 100);
    return percentage;
  };

  const processUpdateQueue = async () => {
    if (processingRef.current || updateQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;

    while (updateQueueRef.current.length > 0) {
      const update = updateQueueRef.current.shift();

      if (update) {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

        if (timeSinceLastUpdate < MIN_DISPLAY_TIME) {
          await new Promise((resolve) => setTimeout(resolve, MIN_DISPLAY_TIME - timeSinceLastUpdate));
        }

        setCurrentProgress(update);
        setProgressPercentage(calculateProgress(update.step));
        lastUpdateTimeRef.current = Date.now();

        // ADICIONAR DOMÍNIO À LISTA quando comprado
        if (update.status === "completed" && update.domain_name) {
          setPurchasedDomains((prev) => {
            if (!prev.includes(update.domain_name!)) {
              const newList = [...prev, update.domain_name!];
              purchasedDomainsRef.current = newList; // Atualizar ref também
              return newList;
            }
            return prev;
          });
        }

        if (update.status === "completed" && update.step === "completed") {
          setTimeout(() => finishProcess(true), 1000);
        }

        if (update.status === "error") {
          setTimeout(() => finishProcess(false, update.error_details || "Erro desconhecido"), 2000);
        }

        if (update.status === "canceled") {
          setTimeout(() => finishProcess(false, "Compra cancelada pelo usuário"), 1000);
        }
      }
    }

    processingRef.current = false;
  };

  const finishProcess = (success: boolean, errorMessage?: string) => {
    setLoading(false);

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Usar a ref para verificar domínios (evita problema de estado assíncrono)
    if (success && purchasedDomainsRef.current.length > 0) {
      setShowSuccessDialog(true);
      setShowProgress(false);
    } else {
      if (errorMessage) {
        toast.error(errorMessage, { duration: 5000 });
      }
      setShowProgress(false);
    }
  };

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      finishProcess(false, "Tempo esgotado. O processo pode ainda estar em andamento no servidor.");
    }, TIMEOUT_SECONDS);
  };

  const handleGenerate = async () => {
    if (!niche.trim()) {
      toast.error("Por favor, insira o nicho");
      return;
    }

    if (!trafficSource) {
      toast.error("Por favor, selecione a fonte de tráfego");
      return;
    }

    // Validar quantidade
    if (quantity > MAX_DOMAINS) {
      toast.error(`Máximo de ${MAX_DOMAINS} domínios por compra`);
      return;
    }

    if (quantity < 1) {
      toast.error("Quantidade mínima é 1 domínio");
      return;
    }

    // ✅ CORREÇÃO: Verificar se o usuário está autenticado
    if (!user?.id) {
      toast.error("Usuário não autenticado. Faça login novamente.");
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

    setShowProgress(true);
    setCurrentProgress(null);
    setProgressPercentage(0);
    setPurchasedDomains([]); // Limpar lista ao iniciar
    purchasedDomainsRef.current = []; // Limpar ref também
    updateQueueRef.current = [];
    processingRef.current = false;
    lastUpdateTimeRef.current = Date.now();

    try {
      // CHAMAR API REST DO BACKEND DIRETAMENTE
      const apiUrl = import.meta.env.VITE_API_URL || "https://domainhub-backend.onrender.com";

      console.log(`📡 Chamando API: ${apiUrl}/api/purchase-domains`);
      console.log(`👤 User ID: ${user.id}`); // Log para debug

      const response = await fetch(`${apiUrl}/api/purchase-domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nicho: niche,
          quantidade: quantity,
          idioma: language,
          plataforma: platform,
          trafficSource: trafficSource,
          userId: user.id, // ✅ CORREÇÃO: Agora envia o userId do usuário logado
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao iniciar a compra");
      }

      const purchaseData = await response.json();

      if (!purchaseData?.sessionId) {
        throw new Error("Resposta inválida do servidor ao iniciar a compra.");
      }

      const sessionId = purchaseData.sessionId;
      setCurrentSessionId(sessionId);

      // ETAPA 3: INSCREVER NO REALTIME
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

            updateQueueRef.current.push({
              step: progress.step,
              status: progress.status,
              message: progress.message,
              error_details: progress.error_details,
              domain_name: progress.domain_name,
            });

            processUpdateQueue();
          },
        )
        .subscribe();

      channelRef.current = channel;
    } catch (error: any) {
      console.error("Erro fatal no handleGenerate:", error);
      toast.error(error.message || "Erro ao processar compra");
      setLoading(false);
      setShowProgress(false);
    }
  };

  const resetForm = () => {
    setQuantity(1);
    setNiche("");
    setTrafficSource(""); // Limpar fonte de tráfego
    setCurrentProgress(null);
    setProgressPercentage(0);
    setShowProgress(false);
    setPurchasedDomains([]);
    purchasedDomainsRef.current = []; // Limpar ref também
    setShowSuccessDialog(false);
    setCurrentSessionId(null);
  };

  // FUNÇÃO DE CANCELAMENTO PODEROSA
  const cancelPurchase = async () => {
    if (!currentSessionId) return;

    try {
      // Chamar endpoint de cancelamento no backend
      const apiUrl = import.meta.env.VITE_API_URL || "https://domainhub-backend.onrender.com";

      console.log(`🛑 Solicitando cancelamento para sessão: ${currentSessionId}`);

      const response = await fetch(`${apiUrl}/api/purchase-domains/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log(`✅ Cancelamento confirmado pelo servidor`);
        toast.warning("🛑 Compra cancelada! Domínios já comprados não serão revertidos.", {
          duration: 5000,
        });
      }
    } catch (error) {
      console.error("Erro ao cancelar:", error);
    }
  };

  const handleClose = () => {
    if (loading) {
      const confirmCancel = confirm(
        "⚠️ O processo ainda está em andamento.\n\n" +
          "⚠️ IMPORTANTE: Domínios já comprados NÃO serão revertidos!\n\n" +
          "Deseja realmente cancelar as compras pendentes?",
      );

      if (!confirmCancel) return;

      // Cancelar no backend
      cancelPurchase();

      finishProcess(false, "Processo cancelado pelo usuário");
    }

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
  };

  const handleSuccessClose = () => {
    setShowSuccessDialog(false);
    onOpenChange(false);
    onSuccess();
    resetForm();
  };

  const copyDomain = (domain: string) => {
    navigator.clipboard.writeText(domain);
    toast.success("Domínio copiado!");
  };

  const copyAllDomains = () => {
    const allDomains = purchasedDomains.join("\n");
    navigator.clipboard.writeText(allDomains);
    toast.success(`${purchasedDomains.length} domínios copiados!`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "canceled":
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case "in_progress":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  // Validar input de quantidade - PERMITE digitar > 10 mas mostra erro
  const handleQuantityChange = (value: string) => {
    const num = parseInt(value) || 1;
    const clamped = Math.max(1, num); // Remove limite superior aqui
    setQuantity(clamped);
  };

  // Verificar se quantidade é válida
  const isQuantityValid = quantity >= 1 && quantity <= MAX_DOMAINS;

  // Função para formatar labels
  const formatLabel = (value: string) => {
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  return (
    <>
      {/* POPUP DE CONFIGURAÇÃO E PROGRESSO */}
      <Dialog open={open && !showSuccessDialog} onOpenChange={handleClose}>
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
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  disabled={loading}
                  className={quantity > MAX_DOMAINS ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {quantity > MAX_DOMAINS && (
                  <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <p className="text-xs font-medium">Máximo de {MAX_DOMAINS} domínios por compra</p>
                  </div>
                )}
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
                    {platformOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {formatLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trafficSource">Fonte de Tráfego *</Label>
                <Select value={trafficSource} onValueChange={setTrafficSource} disabled={loading}>
                  <SelectTrigger id="trafficSource">
                    <SelectValue placeholder="Selecione a fonte de tráfego" />
                  </SelectTrigger>
                  <SelectContent>
                    {trafficSourceOptions.map((source) => (
                      <SelectItem key={source} value={source}>
                        {formatLabel(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Origem do tráfego para os domínios</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={loading || !isQuantityValid || !trafficSource}
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
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progresso Geral</span>
                  <span className="font-semibold">{progressPercentage}%</span>
                </div>
                <Progress value={progressPercentage} className="h-3" />
              </div>

              {/* MOSTRAR DOMÍNIOS JÁ COMPRADOS */}
              {purchasedDomains.length > 0 && (
                <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                      {purchasedDomains.length} de {quantity} domínio(s) comprado(s)
                    </span>
                  </div>
                  <div className="space-y-1">
                    {purchasedDomains.map((domain, index) => (
                      <div key={index} className="text-xs text-green-600 dark:text-green-400 font-mono">
                        ✓ {domain}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {!currentProgress && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Aguardando início do processo...
                  </div>
                )}

                {currentProgress && (
                  <div
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      currentProgress.status === "completed"
                        ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                        : currentProgress.status === "error"
                          ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
                          : currentProgress.status === "canceled"
                            ? "bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800"
                            : "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
                    }`}
                  >
                    <div className="mt-0.5">{getStatusIcon(currentProgress.status)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">
                        {STEP_LABELS[currentProgress.step] || currentProgress.step}
                      </p>
                      {currentProgress.message && (
                        <p className="text-xs text-muted-foreground mt-1">{currentProgress.message}</p>
                      )}
                      {currentProgress.status === "error" && currentProgress.error_details && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                          {currentProgress.error_details}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {currentProgress?.status === "error" && (
                <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <XCircle className="h-5 w-5" />
                    <span className="font-semibold text-sm">Erro no processo</span>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Tente novamente ou verifique as configurações
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* POPUP DE SUCESSO - REDESENHADO */}
      <Dialog open={showSuccessDialog} onOpenChange={handleSuccessClose}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <DialogTitle className="text-2xl">
                  {purchasedDomains.length === 1
                    ? "Domínio Comprado!"
                    : `${purchasedDomains.length} Domínios Comprados!`}
                </DialogTitle>
                <DialogDescription>
                  {purchasedDomains.length === 1
                    ? "Seu novo domínio está pronto para uso"
                    : "Seus novos domínios estão prontos para uso"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* LISTA DE DOMÍNIOS */}
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
              {purchasedDomains.map((domain, index) => (
                <div
                  key={index}
                  className="group flex items-center gap-3 p-3 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">#{index + 1}</span>
                      <code className="text-base font-mono font-semibold text-foreground break-all">{domain}</code>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => copyDomain(domain)}
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copiar domínio"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>

                    <Button
                      onClick={() => window.open(`https://${domain}`, "_blank")}
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Abrir domínio"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* AÇÕES */}
            <div className="flex gap-3 pt-2 border-t">
              {purchasedDomains.length > 1 && (
                <Button onClick={copyAllDomains} variant="outline" className="flex-1">
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar Todos
                </Button>
              )}

              <Button onClick={handleSuccessClose} className="flex-1">
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
