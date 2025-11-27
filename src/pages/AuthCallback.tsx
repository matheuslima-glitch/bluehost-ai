import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Verificar se há parâmetros de convite na URL
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        // Se for um convite, redirecionar para a página de aceitar convite
        if (type === "invite" && tokenHash) {
          // Passar os parâmetros para a página de aceitar convite
          navigate(`/accept-invite?token_hash=${tokenHash}&type=invite`, { replace: true });
          return;
        }

        // Para outros tipos de callback (login normal, confirmação de email, etc.)
        // Verificar se há uma sessão válida
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          navigate("/auth", { replace: true });
          return;
        }

        if (session) {
          // Verificar se o usuário já completou o setup (tem perfil)
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("id", session.user.id)
            .single();

          // Se não tem perfil ou não tem nome, pode ser um usuário convidado que precisa completar setup
          if (!profile?.full_name && type === "invite") {
            navigate(`/accept-invite?token_hash=${tokenHash}&type=invite`, { replace: true });
            return;
          }

          // Usuário normal com sessão válida
          navigate("/dashboard", { replace: true });
        } else {
          // Sem sessão, redirecionar para login
          navigate("/auth", { replace: true });
        }
      } catch (error) {
        console.error("Erro no callback de autenticação:", error);
        navigate("/auth", { replace: true });
      } finally {
        setProcessing(false);
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Processando autenticação...</p>
      </div>
    </div>
  );
}
