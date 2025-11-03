import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";

export default function Layout() {
  useEffect(() => {
    // Atualizar saldo da Namecheap ao carregar a página
    const updateNamecheapBalance = async () => {
      try {
        console.log("[Layout] Iniciando atualização do saldo da Namecheap...");

        const { data, error } = await supabase.functions.invoke("update-namecheap-balance");

        if (error) {
          console.error("[Layout] Erro ao atualizar saldo:", error);
        } else {
          console.log("[Layout] Saldo atualizado com sucesso:", data);
        }
      } catch (err) {
        console.error("[Layout] Erro na atualização do saldo:", err);
      }
    };

    // Chamar a função imediatamente ao carregar
    updateNamecheapBalance();

    // Opcional: Atualizar periodicamente a cada 5 minutos (300000ms)
    // Descomente as linhas abaixo se quiser atualização automática periódica
    // const intervalId = setInterval(updateNamecheapBalance, 300000);
    // return () => clearInterval(intervalId);
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b bg-background px-6">
            <SidebarTrigger />
            <ThemeToggle />
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
