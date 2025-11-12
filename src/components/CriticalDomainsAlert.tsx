import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface CriticalDomainsAlertProps {
  suspendedCount: number;
  expiredCount: number;
}

// Mapeamento de sons de alerta (apenas 4 sons)
const ALERT_SOUNDS: Record<string, string> = {
  "ios-1": "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", // Alerta de Perigo - Tom Intermitente
  "ios-2": "https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3", // Atenção Máxima - Alarme Duplo
  "ios-3": "https://assets.mixkit.co/active_storage/sfx/2871/2871-preview.mp3", // Alerta de Sistema - Bipe Eletrônico
  "ios-4": "https://assets.mixkit.co/active_storage/sfx/2872/2872-preview.mp3", // Urgência - Bipe Rápido
};

export function CriticalDomainsAlert({ suspendedCount, expiredCount }: CriticalDomainsAlertProps) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [alertSound, setAlertSound] = useState("ios-1");

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

      if (data?.alert_sound_preference) {
        setAlertSound(data.alert_sound_preference);
      }
    };

    loadUserData();
  }, [user?.id]);

  useEffect(() => {
    // Mostrar alerta SEMPRE que houver domínios críticos
    const hasCriticalDomains = suspendedCount > 0 || expiredCount > 0;

    if (hasCriticalDomains) {
      setOpen(true);
      playAlertSound();
    }
  }, [suspendedCount, expiredCount, alertSound]);

  const playAlertSound = () => {
    const soundUrl = ALERT_SOUNDS[alertSound] || ALERT_SOUNDS["ios-1"];
    const audio = new Audio(soundUrl);
    audio.volume = 1.0;
    audio.play().catch((error) => {
      console.error("Erro ao reproduzir som:", error);
    });
  };

  const handleClose = () => {
    setOpen(false);
  };

  // Não renderizar nada se não houver domínios críticos
  if (suspendedCount === 0 && expiredCount === 0) {
    return null;
  }

  const totalCritical = suspendedCount + expiredCount;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 border-0 bg-white shadow-2xl overflow-hidden">
        {/* Header vermelho */}
        <div className="bg-red-600 p-6 relative">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white hover:text-red-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

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
    </Dialog>
  );
}

// Exportar lista de sons para uso na página de configurações
export { ALERT_SOUNDS };
