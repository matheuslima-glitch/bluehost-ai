import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface CriticalDomainsAlertProps {
  suspendedCount: number;
  expiredCount: number;
}

// Mapeamento de sons de alerta
const ALERT_SOUNDS: Record<string, string> = {
  "alarm-1": "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", // Urgent alarm
  "alarm-2": "https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3", // Emergency alarm
  "alarm-3": "https://assets.mixkit.co/active_storage/sfx/2871/2871-preview.mp3", // Alert siren
  "alarm-4": "https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3", // Warning beep
  "alarm-5": "https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3", // Attention alert
  "alarm-6": "https://assets.mixkit.co/active_storage/sfx/2872/2872-preview.mp3", // Critical warning
  "alarm-7": "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3", // Danger alert
  "alarm-8": "https://assets.mixkit.co/active_storage/sfx/2866/2866-preview.mp3", // System alert
  "alarm-9": "https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3", // Security alarm
  "alarm-10": "https://assets.mixkit.co/active_storage/sfx/2875/2875-preview.mp3", // Warning siren
  "alarm-11": "https://assets.mixkit.co/active_storage/sfx/2876/2876-preview.mp3", // Alert tone
  "alarm-12": "https://assets.mixkit.co/active_storage/sfx/2877/2877-preview.mp3", // Emergency tone
  "alarm-13": "https://assets.mixkit.co/active_storage/sfx/2878/2878-preview.mp3", // Urgent beep
  "alarm-14": "https://assets.mixkit.co/active_storage/sfx/2879/2879-preview.mp3", // Critical beep
  "alarm-15": "https://assets.mixkit.co/active_storage/sfx/2880/2880-preview.mp3", // Danger siren
};

export function CriticalDomainsAlert({ suspendedCount, expiredCount }: CriticalDomainsAlertProps) {
  const [open, setOpen] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [alertSound, setAlertSound] = useState("alarm-1");

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
        const name = data.full_name.split(" ")[0]; // Pegar primeiro nome
        setFirstName(name);
      }

      if (data?.alert_sound_preference) {
        setAlertSound(data.alert_sound_preference);
      }
    };

    loadUserData();
  }, [user]);

  useEffect(() => {
    // Mostrar alerta se houver domínios suspensos OU expirados
    if ((suspendedCount > 0 || expiredCount > 0) && !audioPlayed) {
      setOpen(true);
      playAlertSound();
      setAudioPlayed(true);
    }
  }, [suspendedCount, expiredCount, audioPlayed]);

  const playAlertSound = () => {
    const soundUrl = ALERT_SOUNDS[alertSound] || ALERT_SOUNDS["alarm-1"];
    const audio = new Audio(soundUrl);
    audio.volume = 1.0; // Volume máximo
    audio.play().catch((error) => {
      console.error("Erro ao reproduzir som:", error);
    });
  };

  const handleClose = () => {
    setOpen(false);
  };

  if (suspendedCount === 0 && expiredCount === 0) {
    return null;
  }

  const totalCritical = suspendedCount + expiredCount;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md border-4 border-red-500 bg-white shadow-2xl animate-pulse-red">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl text-red-600">
            <AlertTriangle className="h-8 w-8 animate-bounce" />
            ALERTA URGENTE!
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 pt-4">
              <p className="text-lg font-semibold text-gray-900">
                {firstName ? `${firstName}, ` : ""}você tem {totalCritical} domínio
                {totalCritical > 1 ? "s" : ""} que {totalCritical > 1 ? "precisam" : "precisa"} de atenção
                <span className="text-red-600 font-bold"> IMEDIATA</span>!
              </p>

              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <div className="space-y-2">
                  {suspendedCount > 0 && (
                    <p className="text-base text-gray-900">
                      🔴 <span className="font-bold text-red-600">{suspendedCount}</span> domínio
                      {suspendedCount > 1 ? "s suspensos" : " suspenso"}
                    </p>
                  )}
                  {expiredCount > 0 && (
                    <p className="text-base text-gray-900">
                      ⚠️ <span className="font-bold text-orange-600">{expiredCount}</span> domínio
                      {expiredCount > 1 ? "s expirados" : " expirado"}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-base text-gray-700 leading-relaxed">
                <span className="font-semibold">Domínios suspensos e expirados podem resultar em:</span>
              </p>

              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-2">
                <li>Perda de tráfego e visitantes</li>
                <li>Queda nas campanhas de marketing</li>
                <li>Perda de receita imediata</li>
                <li>Risco de perder o domínio permanentemente</li>
              </ul>

              <div className="bg-yellow-50 border border-yellow-300 p-3 rounded">
                <p className="text-sm font-semibold text-yellow-800">
                  ⚡ Verifique AGORA na tabela de <span className="underline">Gestão de Domínios Críticos</span> e
                  tome ação imediata para evitar prejuízos!
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleClose}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6"
            size="lg"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Entendi, vou verificar agora!
          </Button>
        </div>
      </DialogContent>

      <style jsx>{`
        @keyframes pulse-red {
          0%,
          100% {
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
          }
          50% {
            box-shadow: 0 0 40px rgba(239, 68, 68, 1), 0 0 60px rgba(239, 68, 68, 0.8);
          }
        }

        .animate-pulse-red {
          animation: pulse-red 1.5s ease-in-out infinite;
        }
      `}</style>
    </Dialog>
  );
}

// Exportar lista de sons para uso na página de configurações
export { ALERT_SOUNDS };
