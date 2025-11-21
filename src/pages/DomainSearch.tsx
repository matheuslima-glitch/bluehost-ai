import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ShoppingCart, CheckCircle2, XCircle, Loader2, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PurchaseWithAIDialog from "@/components/PurchaseWithAIDialog";
import ManualPurchaseDialog from "@/components/ManualPurchaseDialog";

export default function DomainSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [manualPurchaseDialogOpen, setManualPurchaseDialogOpen] = useState(false);
  const [balance, setBalance] = useState<{ usd: number; brl: number } | null>(null);

  // Load balance on mount
  useEffect(() => {
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("namecheap-domains", {
        body: { action: "balance" },
      });

      if (error) throw error;
      setBalance(data.balance);
    } catch (error: any) {
      console.error("Erro ao carregar saldo:", error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Digite um domínio para pesquisar");
      return;
    }

    // Validar formato do domínio (deve ter extensão como .com, .online, .org, etc)
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(searchQuery.trim())) {
      toast.error("Digite um domínio válido (exemplo: meusite.online, exemplo.com)");
      return;
    }

    setSearching(true);
    setSearchResult(null);

    try {
      // Usar o endpoint do backend para verificar disponibilidade
      const apiUrl = import.meta.env.VITE_API_URL || "https://domainhub-backend.onrender.com";
      const response = await fetch(`${apiUrl}/api/purchase-domains/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: searchQuery.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao verificar disponibilidade");
      }

      const data = await response.json();

      if (data.success) {
        setSearchResult(data);

        if (data.available) {
          toast.success(`Domínio disponível! Preço: $${data.price}`);
        } else {
          toast.info("Domínio já está registrado");
        }
      } else {
        throw new Error(data.error || "Erro ao verificar disponibilidade");
      }
    } catch (error: any) {
      console.error("Erro ao verificar disponibilidade:", error);
      toast.error(error.message || "Erro ao verificar disponibilidade");
    } finally {
      setSearching(false);
    }
  };

  const handlePurchaseDomain = () => {
    if (!searchResult?.available) return;

    // Apenas abrir o dialog de compra manual
    setManualPurchaseDialogOpen(true);
  };

  const handleAISuccess = () => {
    loadBalance();
  };

  const handleManualPurchaseSuccess = () => {
    // Limpar resultado da busca
    setSearchResult(null);
    setSearchQuery("");
    // Recarregar saldo
    loadBalance();
  };

  return (
    <>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background gradient with floating glows */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9] via-[#3B82F6] to-[#1E40AF] opacity-[0.08]"></div>

        {/* Floating blue glows */}
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#0EA5E9] rounded-full blur-[100px] opacity-20 animate-float"></div>
        <div className="absolute bottom-40 right-32 w-80 h-80 bg-[#3B82F6] rounded-full blur-[120px] opacity-15 animate-float-slow"></div>
        <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-[#22D3EE] rounded-full blur-[110px] opacity-10 animate-float-slower"></div>
        <div className="absolute bottom-20 left-1/4 w-56 h-56 bg-[#1E40AF] rounded-full blur-[90px] opacity-25 animate-float"></div>

        {/* Centered content */}
        <div className="relative z-10 w-full max-w-2xl space-y-8 animate-fade-slide-up">
          {/* Header */}
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[hsl(199,89%,48%)] via-[hsl(217,91%,60%)] to-[hsl(224,76%,48%)] bg-clip-text text-transparent">
              Compra de Domínios
            </h1>
            <p className="text-muted-foreground text-lg">
              Pesquise e registre novos domínios com inteligência artificial
            </p>
          </div>

          {/* Main Card */}
          <Card className="border-[hsl(var(--accent-cyan)_/_0.2)] shadow-xl backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl">Pesquisar Domínio</CardTitle>
              <CardDescription className="text-base">
                Digite o domínio completo com extensão (ex: meusite.online, exemplo.com)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-3">
                <Input
                  placeholder="meusite.online, exemplo.com, dominio.org"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 h-12 text-base border-[hsl(var(--accent-cyan)_/_0.3)] focus-visible:border-[hsl(var(--accent-cyan))] transition-all duration-300"
                />
                <Button
                  onClick={handleSearch}
                  disabled={searching}
                  size="lg"
                  className="px-6 transition-all duration-300 hover:scale-105"
                >
                  {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setAiDialogOpen(true)}
                  className="px-6 bg-gradient-to-r from-[hsl(199,89%,48%)] to-[hsl(217,91%,60%)] text-white hover:opacity-90 animate-pulse-glow transition-all duration-300 hover:scale-105 border-none"
                >
                  <ShoppingCart className="h-5 w-5 mr-2 animate-pulse" />
                  Compra com IA
                </Button>
              </div>

              {searchResult && (
                <Card
                  className={`border-2 transition-all duration-300 animate-fade-slide-up ${searchResult.available ? "border-success bg-success/5" : "border-destructive bg-destructive/5"}`}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {searchResult.available ? (
                          <CheckCircle2 className="h-10 w-10 text-success" />
                        ) : (
                          <XCircle className="h-10 w-10 text-destructive" />
                        )}
                        <div>
                          <p className="font-bold text-xl">{searchResult.domain}</p>
                          <p className="text-sm text-muted-foreground mt-1">{searchResult.message}</p>
                        </div>
                      </div>
                      {searchResult.available && (
                        <div className="flex gap-3">
                          <div className="text-right">
                            <p className="text-2xl font-bold">${searchResult.price}</p>
                            <p className="text-xs text-muted-foreground">preço anual</p>
                          </div>
                          <Button
                            onClick={handlePurchaseDomain}
                            size="lg"
                            className="transition-all duration-300 hover:scale-105"
                          >
                            Comprar Domínio
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <PurchaseWithAIDialog open={aiDialogOpen} onOpenChange={setAiDialogOpen} onSuccess={handleAISuccess} />

      <ManualPurchaseDialog
        open={manualPurchaseDialogOpen}
        onOpenChange={setManualPurchaseDialogOpen}
        domain={searchResult?.domain || ""}
        price={searchResult?.price || "0"}
        onSuccess={handleManualPurchaseSuccess}
      />
    </>
  );
}
