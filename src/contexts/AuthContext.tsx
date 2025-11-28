import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Intervalo de verificação: 10 segundos
const USER_CHECK_INTERVAL = 10000;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const initialized = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Função para forçar logout quando usuário foi deletado
  const forceLogout = useCallback(async () => {
    console.log("AuthContext: Usuário foi removido do sistema. Forçando logout...");
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    navigate("/auth");
  }, [navigate]);

  // Função para verificar se o usuário ainda existe no banco
  const checkUserExists = useCallback(
    async (userId: string) => {
      try {
        const { data, error } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();

        // Se não encontrou o profile, usuário foi deletado
        if (!data && !error) {
          await forceLogout();
          return false;
        }

        // Se deu erro de permissão (RLS), também pode indicar que foi removido
        if (error && error.code === "PGRST116") {
          await forceLogout();
          return false;
        }

        return true;
      } catch (err) {
        console.error("AuthContext: Erro ao verificar usuário:", err);
        return true; // Em caso de erro de rede, não deslogar
      }
    },
    [forceLogout],
  );

  // Configurar verificação periódica
  useEffect(() => {
    if (user?.id) {
      // Verificar imediatamente ao montar/mudar usuário
      checkUserExists(user.id);

      // Configurar verificação periódica
      checkIntervalRef.current = setInterval(() => {
        checkUserExists(user.id);
      }, USER_CHECK_INTERVAL);
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [user?.id, checkUserExists]);

  useEffect(() => {
    // Evitar inicialização dupla
    if (initialized.current) return;
    initialized.current = true;

    console.log("AuthContext: Iniciando verificação de sessão...");

    // PRIMEIRO: Verificar sessão existente de forma síncrona
    const initializeAuth = async () => {
      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("AuthContext: Erro ao buscar sessão");
        } else {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
        }
      } catch (err) {
        console.error("AuthContext: Erro na inicialização");
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // DEPOIS: Configurar listener para mudanças futuras
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // IGNORAR evento PASSWORD_RECOVERY - não deve logar o usuário automaticamente
      // O usuário só deve ser logado após redefinir a senha na página /reset-password
      if (event === "PASSWORD_RECOVERY") {
        // Não atualizar sessão/usuário aqui
        // O usuário será redirecionado pela URL do email
        return;
      }

      // IGNORAR evento USER_UPDATED durante recuperação de senha
      // Isso evita login automático quando a senha é atualizada
      if (event === "USER_UPDATED") {
        // Verificar se estamos na página de reset
        const isResetPage = window.location.pathname === "/reset-password";
        if (isResetPage) {
          return;
        }
      }

      // Para outros eventos, atualizar estado normalmente
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // Se o loading ainda estiver true, setar para false
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      navigate("/dashboard");
    }

    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/dashboard`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    if (!error) {
      navigate("/dashboard");
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    navigate("/auth");
  };

  return (
    <AuthContext.Provider value={{ user, session, signIn, signUp, signOut, loading }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
