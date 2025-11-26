import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const initialized = useRef(false);

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
          console.error("AuthContext: Erro ao buscar sessão:", error);
        } else {
          console.log("AuthContext: Sessão inicial:", currentSession?.user?.email || "Nenhuma");
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
        }
      } catch (err) {
        console.error("AuthContext: Erro na inicialização:", err);
      } finally {
        console.log("AuthContext: Carregamento inicial completo");
        setLoading(false);
      }
    };

    initializeAuth();

    // DEPOIS: Configurar listener para mudanças futuras
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log("AuthContext: Estado de auth mudou:", event, newSession?.user?.email || "Nenhum");

      // IGNORAR evento PASSWORD_RECOVERY - não deve logar o usuário automaticamente
      // O usuário só deve ser logado após redefinir a senha na página /reset-password
      if (event === "PASSWORD_RECOVERY") {
        console.log("AuthContext: Evento PASSWORD_RECOVERY ignorado - redirecionando para reset");
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
          console.log("AuthContext: USER_UPDATED na página de reset - ignorando login automático");
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
      console.log("AuthContext: Limpando subscription");
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log("AuthContext: Tentando login para:", email);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      console.log("AuthContext: Login bem-sucedido, redirecionando...");
      navigate("/dashboard");
    } else {
      console.error("AuthContext: Erro no login:", error);
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
    console.log("AuthContext: Fazendo logout...");
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    navigate("/auth");
  };

  // Log do estado atual para debug
  console.log("AuthContext render - loading:", loading, "user:", user?.email || "null");

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
