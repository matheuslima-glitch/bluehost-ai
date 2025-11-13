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

// Traduções
const TRANSLATIONS = {
  portuguese: {
    title: "Compra com IA",
    description: "Configure os parâmetros para buscar e comprar domínios disponíveis",
    quantity: "Quantidade de Domínios",
    niche: "Nicho",
    nichePlaceholder: "Ex: saúde, tecnologia, finanças...",
    language: "Idioma",
    platform: "Plataforma",
    wordpress: "WordPress",
    wordpressDesc: "Com Cloudflare e nameservers",
    atomicat: "AtomiCat",
    atomicatDesc: "Configuração simplificada",
    cancel: "Cancelar",
    search: "Buscar Domínios",
    processing: "Processando...",
    progress: "Progresso Geral",
    errorTitle: "Erro no processo",
    errorDesc: "Tente novamente ou verifique as configurações",
    enterNiche: "Por favor, insira o nicho",
    successMsg: "Domínios comprados e configurados com sucesso!",
    steps: {
      generating: "Gerando domínios com IA",
      checking: "Verificando disponibilidade",
      searching: "Buscando domínios baratos",
      purchasing: "Comprando domínio(s)",
      nameservers: "Alterando nameservers",
      cloudflare: "Configurando Cloudflare",
      completed: "Compra concluída",
    },
  },
  english: {
    title: "AI Purchase",
    description: "Configure parameters to search and buy available domains",
    quantity: "Number of Domains",
    niche: "Niche",
    nichePlaceholder: "Ex: health, technology, finance...",
    language: "Language",
    platform: "Platform",
    wordpress: "WordPress",
    wordpressDesc: "With Cloudflare and nameservers",
    atomicat: "AtomiCat",
    atomicatDesc: "Simplified setup",
    cancel: "Cancel",
    search: "Search Domains",
    processing: "Processing...",
    progress: "Overall Progress",
    errorTitle: "Process Error",
    errorDesc: "Please try again or check settings",
    enterNiche: "Please enter the niche",
    successMsg: "Domains purchased and configured successfully!",
    steps: {
      generating: "Generating domains with AI",
      checking: "Checking availability",
      searching: "Searching for cheap domains",
      purchasing: "Purchasing domain(s)",
      nameservers: "Changing nameservers",
      cloudflare: "Configuring Cloudflare",
      completed: "Purchase completed",
    },
  },
  spanish: {
    title: "Compra con IA",
    description: "Configure los parámetros para buscar y comprar dominios disponibles",
    quantity: "Cantidad de Dominios",
    niche: "Nicho",
    nichePlaceholder: "Ej: salud, tecnología, finanzas...",
    language: "Idioma",
    platform: "Plataforma",
    wordpress: "WordPress",
    wordpressDesc: "Con Cloudflare y nameservers",
    atomicat: "AtomiCat",
    atomicatDesc: "Configuración simplificada",
    cancel: "Cancelar",
    search: "Buscar Dominios",
    processing: "Procesando...",
    progress: "Progreso General",
    errorTitle: "Error en el proceso",
    errorDesc: "Inténtelo de nuevo o verifique la configuración",
    enterNiche: "Por favor, ingrese el nicho",
    successMsg: "¡Dominios comprados y configurados con éxito!",
    steps: {
      generating: "Generando dominios con IA",
      checking: "Verificando disponibilidad",
      searching: "Buscando dominios baratos",
      purchasing: "Comprando dominio(s)",
      nameservers: "Cambiando nameservers",
      cloudflare: "Configurando Cloudflare",
      completed: "Compra completada",
    },
  },
  german: {
    title: "KI-Kauf",
    description: "Konfigurieren Sie Parameter zum Suchen und Kaufen verfügbarer Domains",
    quantity: "Anzahl der Domains",
    niche: "Nische",
    nichePlaceholder: "Z.B.: Gesundheit, Technologie, Finanzen...",
    language: "Sprache",
    platform: "Plattform",
    wordpress: "WordPress",
    wordpressDesc: "Mit Cloudflare und Nameservern",
    atomicat: "AtomiCat",
    atomicatDesc: "Vereinfachte Einrichtung",
    cancel: "Abbrechen",
    search: "Domains suchen",
    processing: "Wird verarbeitet...",
    progress: "Gesamtfortschritt",
    errorTitle: "Prozessfehler",
    errorDesc: "Bitte versuchen Sie es erneut oder überprüfen Sie die Einstellungen",
    enterNiche: "Bitte geben Sie die Nische ein",
    successMsg: "Domains erfolgreich gekauft und konfiguriert!",
    steps: {
      generating: "Domains mit KI generieren",
      checking: "Verfügbarkeit prüfen",
      searching: "Günstige Domains suchen",
      purchasing: "Domain(s) kaufen",
      nameservers: "Nameserver ändern",
      cloudflare: "Cloudflare konfigurieren",
      completed: "Kauf abgeschlossen",
    },
  },
  french: {
    title: "Achat avec IA",
    description: "Configurez les paramètres pour rechercher et acheter des domaines disponibles",
    quantity: "Nombre de Domaines",
    niche: "Niche",
    nichePlaceholder: "Ex: santé, technologie, finance...",
    language: "Langue",
    platform: "Plateforme",
    wordpress: "WordPress",
    wordpressDesc: "Avec Cloudflare et serveurs de noms",
    atomicat: "AtomiCat",
    atomicatDesc: "Configuration simplifiée",
    cancel: "Annuler",
    search: "Rechercher des Domaines",
    processing: "Traitement...",
    progress: "Progrès Global",
    errorTitle: "Erreur de processus",
    errorDesc: "Veuillez réessayer ou vérifier les paramètres",
    enterNiche: "Veuillez saisir la niche",
    successMsg: "Domaines achetés et configurés avec succès!",
    steps: {
      generating: "Génération de domaines avec IA",
      checking: "Vérification de disponibilité",
      searching: "Recherche de domaines bon marché",
      purchasing: "Achat de domaine(s)",
      nameservers: "Changement des serveurs de noms",
      cloudflare: "Configuration de Cloudflare",
      completed: "Achat terminé",
    },
  },
};

// Mapeamento dos steps de progresso
const WORDPRESS_STEPS = ["generating", "checking", "searching", "purchasing", "nameservers", "cloudflare", "completed"];
const ATOMICAT_STEPS = ["generating", "checking", "searching", "purchasing", "completed"];

export default function PurchaseWithAIDialog({ open, onOpenChange, onSuccess }: PurchaseWithAIDialogProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState<keyof typeof TRANSLATIONS>("portuguese");
  const [platform, setPlatform] = useState<"wordpress" | "atomicat">("wordpress");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Map<string, PurchaseProgress>>(new Map());
  const [showProgress, setShowProgress] = useState(false);
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const t = TRANSLATIONS[language];

  // Resetar progresso quando abre o dialog
  useEffect(() => {
    if (open) {
      setProgress(new Map());
      setProgressPercentage(0);
      setShowProgress(false);
    }
  }, [open]);

  const addProgressStep = (
    step: string,
    status: PurchaseProgress["status"],
    message: string,
    errorDetails?: string,
  ) => {
    console.log(`📊 Atualizando progresso: ${step} = ${status}`);

    setProgress((prev) => {
      const newProgress = new Map(prev);
      newProgress.set(step, {
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
        errorDetails,
      });
      return newProgress;
    });

    // Atualizar percentual de progresso
    updateProgressPercentage(step, status);
  };

  const updateProgressPercentage = (step: string, status: PurchaseProgress["status"]) => {
    const steps = platform === "wordpress" ? WORDPRESS_STEPS : ATOMICAT_STEPS;
    const currentStepIndex = steps.findIndex((s) => s === step);

    if (currentStepIndex === -1) return;

    if (status === "completed") {
      const percentage = ((currentStepIndex + 1) / steps.length) * 100;
      setProgressPercentage(Math.round(percentage));
    } else if (status === "in_progress") {
      const percentage = (currentStepIndex / steps.length) * 100;
      setProgressPercentage(Math.round(percentage));
    }
  };

  const handleGenerate = async () => {
    // Validações
    if (!niche.trim()) {
      toast.error(t.enterNiche);
      return;
    }

    setLoading(true);
    setShowProgress(true);
    setProgress(new Map());
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
      console.log("🔗 URL do Stream:", data.streamUrl);

      // Conectar ao SSE
      const es = new EventSource(data.streamUrl);
      setEventSource(es);

      es.onopen = () => {
        console.log("✅ Conexão SSE estabelecida");
      };

      es.onmessage = (event) => {
        try {
          console.log("📨 Evento SSE recebido:", event.data);

          const eventData = JSON.parse(event.data);
          console.log("📊 Dados parseados:", eventData);

          // Atualizar progresso EM TEMPO REAL
          if (eventData.step && eventData.status && eventData.message) {
            addProgressStep(eventData.step, eventData.status, eventData.message, eventData.errorDetails);

            console.log(`✅ Step ${eventData.step} atualizado para ${eventData.status}`);
          }

          // Verificar se é o resultado final
          if (eventData.step === "completed" && eventData.status === "completed") {
            console.log("🎉 Processo finalizado com sucesso!");
            toast.success(t.successMsg);

            setTimeout(() => {
              setShowProgress(false);
              setLoading(false);
              onOpenChange(false);
              onSuccess();
              resetForm();
              es.close();
            }, 2000);
          }

          // Verificar se houve erro
          if (eventData.status === "error") {
            console.error("❌ Erro no processo:", eventData);
            toast.error(eventData.message || "Erro no processo");
            setLoading(false);
          }
        } catch (error) {
          console.error("❌ Erro ao processar evento SSE:", error);
        }
      };

      es.onerror = (error) => {
        console.error("❌ Erro SSE:", error);
        toast.error("Erro na conexão");
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        {!showProgress ? (
          <div className="space-y-6 py-4">
            {/* Quantidade */}
            <div className="space-y-2">
              <Label htmlFor="quantity">{t.quantity}</Label>
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
              <Label htmlFor="niche">{t.niche}</Label>
              <Input
                id="niche"
                placeholder={t.nichePlaceholder}
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Idioma */}
            <div className="space-y-2">
              <Label htmlFor="language">{t.language}</Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as keyof typeof TRANSLATIONS)}
                disabled={loading}
              >
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
              <Label htmlFor="platform">{t.platform}</Label>
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
                      <span className="font-medium">{t.wordpress}</span>
                      <span className="text-xs text-gray-500">{t.wordpressDesc}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="atomicat">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{t.atomicat}</span>
                      <span className="text-xs text-gray-500">{t.atomicatDesc}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botões */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
                {t.cancel}
              </Button>
              <Button onClick={handleGenerate} disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.processing}
                  </>
                ) : (
                  t.search
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Barra de progresso geral */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t.progress}</span>
                <span className="font-semibold">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>

            {/* Lista de steps - MOSTRA APENAS OS QUE JÁ FORAM RECEBIDOS */}
            <div className="space-y-3">
              {steps.map((stepKey) => {
                const progressItem = progress.get(stepKey);

                // Só mostra o step se já foi recebido pelo SSE
                if (!progressItem) return null;

                const status = progressItem.status;
                const stepLabel = (t.steps as any)[stepKey] || stepKey;

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

            {/* Mensagem de erro geral */}
            {Array.from(progress.values()).some((p) => p.status === "error") && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="h-5 w-5" />
                  <span className="font-semibold">{t.errorTitle}</span>
                </div>
                <p className="text-sm text-red-600 mt-1">{t.errorDesc}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
