import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface CriticalDomainsAlertProps {
  suspendedCount: number;
  expiredCount: number;
}

// Mapeamento de sons de alerta (3 sons)
const ALERT_SOUNDS: Record<string, string> = {
  "alert-1": "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", // Alerta de Perigo - Tom Intermitente
  "alert-2": "https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3", // Atenção Máxima - Alarme Duplo
  "alert-4":
    "https://dsehaqdqnrkjrhbvkfrk.supabase.co/storage/v1/object/sign/Alert%20sound/new-notification-010-352755.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTNjYWYwMi1lNGU0LTQ4MWUtYjY5OC0yZjQxN2FiZGM2ZWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBbGVydCBzb3VuZC9uZXctbm90aWZpY2F0aW9uLTAxMC0zNTI3NTUubXAzIiwiaWF0IjoxNzYyOTU4OTk0LCJleHAiOjMxNTUzNjI5NTg5OTR9.0bVNuzd8fubejntdSG7-kzTjQ1UpKrcNmDnbYVMwmJI", // Alerta Suave - True Tone
};

// Chave para armazenar no localStorage
const LAST_ALERT_KEY = "critical_domains_last_alert";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000; // 6 horas em milissegundos

export function CriticalDomainsAlert({ suspendedCount, expiredCount }: CriticalDomainsAlertProps) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [alertSound, setAlertSound] = useState<string | null>(null);
  const [soundPlayed, setSoundPlayed] = useState(false);
  const [userDataLoaded, setUserDataLoaded] = useState(false);

  useEffect(() => {
    // Buscar nome do usuário e preferência de som
    const loadUserData = async () => {
      if (!user?.id) return;

      const { data } = await supabase
        .from("profiles")
        .select("full_name, alert_sound_preference")
        .eq("id", user.id)
        .single();

      if (data?.full_name) {
        const name = data.full_name.split(" ")[0];
        setFirstName(name);
      }

      // Definir o som preferido ou usar o padrão (True Tone)
      const soundPreference = data?.alert_sound_preference || "alert-4";
      console.log("Preferência de som carregada:", soundPreference);
      setAlertSound(soundPreference);
      setUserDataLoaded(true);
    };

    loadUserData();
  }, [user?.id]);

  useEffect(() => {
    // Só mostrar alerta e tocar som DEPOIS de carregar os dados do usuário
    if (!userDataLoaded || alertSound === null) return;

    const hasCriticalDomains = suspendedCount > 0 || expiredCount > 0;

    if (hasCriticalDomains && !soundPlayed) {
      // Verificar se deve mostrar o popup baseado no tempo
      const shouldShowAlert = checkShouldShowAlert();

      if (shouldShowAlert) {
        setOpen(true);
        playAlertSound();
        setSoundPlayed(true);
        // Salvar timestamp atual no localStorage
        saveLastAlertTime();
      }
    } else if (!hasCriticalDomains) {
      // Reset quando não houver domínios críticos
      setSoundPlayed(false);
    }
  }, [suspendedCount, expiredCount, userDataLoaded, alertSound, soundPlayed]);

  // Função para verificar se deve mostrar o alerta baseado no intervalo de 6 horas
  const checkShouldShowAlert = (): boolean => {
    try {
      const lastAlertTime = localStorage.getItem(LAST_ALERT_KEY);

      // Se nunca mostrou antes (primeira vez do dia), mostrar
      if (!lastAlertTime) {
        console.log("Primeira vez mostrando o alerta - exibindo popup");
        return true;
      }

      const lastTime = parseInt(lastAlertTime, 10);
      const currentTime = Date.now();
      const timeDifference = currentTime - lastTime;

      console.log("Último alerta:", new Date(lastTime).toLocaleString());
      console.log("Tempo desde último alerta:", Math.floor(timeDifference / 1000 / 60), "minutos");

      // Se passaram 6 horas ou mais, mostrar novamente
      if (timeDifference >= SIX_HOURS_MS) {
        console.log("6 horas passaram - exibindo popup");
        return true;
      }

      const remainingMinutes = Math.floor((SIX_HOURS_MS - timeDifference) / 1000 / 60);
      console.log("Próximo alerta em:", remainingMinutes, "minutos");
      return false;
    } catch (error) {
      console.error("Erro ao verificar tempo do último alerta:", error);
      return true; // Em caso de erro, mostrar o alerta
    }
  };

  // Função para salvar o timestamp atual no localStorage
  const saveLastAlertTime = () => {
    try {
      const currentTime = Date.now();
      localStorage.setItem(LAST_ALERT_KEY, currentTime.toString());
      console.log("Timestamp do alerta salvo:", new Date(currentTime).toLocaleString());
    } catch (error) {
      console.error("Erro ao salvar timestamp do alerta:", error);
    }
  };

  const playAlertSound = () => {
    if (!alertSound) {
      console.log("Som ainda não carregado");
      return;
    }

    const soundUrl = ALERT_SOUNDS[alertSound];
    if (!soundUrl) {
      console.error("Som não encontrado:", alertSound);
      return;
    }

    console.log("Tocando som:", alertSound, "URL:", soundUrl);
    const audio = new Audio(soundUrl);
    audio.volume = 1.0;
    audio.play().catch((error) => {
      console.error("Erro ao reproduzir som:", error);
    });
  };

  const handleClose = () => {
    setOpen(false);

    // Rolar para a tabela de domínios críticos após fechar o popup
    setTimeout(() => {
      const criticalTable = document.querySelector("[data-critical-domains-table]");
      if (criticalTable) {
        criticalTable.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } else {
        // Fallback: tentar encontrar pela classe do componente
        const fallbackTable = document.querySelector(".critical-domains-table");
        if (fallbackTable) {
          fallbackTable.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
    }, 300);
  };

  // Não renderizar nada se não houver domínios críticos
  if (suspendedCount === 0 && expiredCount === 0) {
    return null;
  }

  const totalCritical = suspendedCount + expiredCount;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[500px] p-0 gap-0 border-0 bg-white shadow-2xl overflow-hidden [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header vermelho */}
        <div className="bg-red-600 p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white text-2xl font-bold">
              <div className="bg-white rounded-full p-2">
                <AlertTriangle className="h-7 w-7 text-red-600" />
              </div>
              ALERTA URGENTE
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-6">
          {/* Mensagem principal */}
          <div className="space-y-2">
            <p className="text-lg font-semibold text-gray-900">
              {firstName && <span className="text-red-600">{firstName}</span>}
              {firstName ? ", v" : "V"}ocê tem <span className="text-red-600 font-bold">{totalCritical}</span> domínio
              {totalCritical > 1 ? "s" : ""} que {totalCritical > 1 ? "precisam" : "precisa"} de atenção imediata!
            </p>
          </div>

          {/* Contadores */}
          <div className="grid gap-3">
            {suspendedCount > 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex-shrink-0 w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-xl font-bold">{suspendedCount}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    Domínio{suspendedCount > 1 ? "s" : ""} Suspenso{suspendedCount > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-gray-600">Requer ação imediata</p>
                </div>
              </div>
            )}

            {expiredCount > 0 && (
              <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xl font-bold">{expiredCount}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    Domínio{expiredCount > 1 ? "s" : ""} Expirado{expiredCount > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-gray-600">Requer renovação urgente</p>
                </div>
              </div>
            )}
          </div>

          {/* Consequências */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="font-semibold text-sm text-gray-900">Possíveis consequências:</p>
            <ul className="space-y-1">
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-red-600 mt-0.5">•</span>
                <span>Perda de tráfego e visitantes</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-red-600 mt-0.5">•</span>
                <span>Interrupção das campanhas de marketing</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-red-600 mt-0.5">•</span>
                <span>Perda de receita imediata</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-red-600 mt-0.5">•</span>
                <span>Risco de perder o domínio permanentemente</span>
              </li>
            </ul>
          </div>

          {/* Call to action */}
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-900">
              ⚡ Verifique AGORA na <span className="font-bold">Gestão de Domínios Críticos</span> e tome ação imediata!
            </p>
          </div>

          {/* Botão de ação */}
          <Button
            onClick={handleClose}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-6 text-base shadow-lg hover:shadow-xl transition-all"
          >
            <AlertTriangle className="h-5 w-5 mr-2" />
            Entendi, vou verificar agora!
          </Button>
        </div>
      </DialogContent>

      <style jsx global>{`
        [data-radix-dialog-content] > button[aria-label*="Close"],
        [data-radix-dialog-content] > button[class*="close"],
        [role="dialog"] > button:first-of-type {
          display: none !important;
        }
      `}</style>
    </Dialog>
  );
}

// Exportar lista de sons para uso na página de configurações
export { ALERT_SOUNDS };
