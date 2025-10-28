import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ShoppingCart, CheckCircle2, XCircle, Loader2, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PurchaseWithAIDialog from "@/components/PurchaseWithAIDialog";
import ClassificationDialog from "@/components/ClassificationDialog";

export default function DomainSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [classificationDialogOpen, setClassificationDialogOpen] = useState(false);
  const [purchasedDomains, setPurchasedDomains] = useState<any[]>([]);
  const [balance, setBalance] = useState<{ usd: number; brl: number } | null>(null);

  // Load balance on mount
  useEffect(() => {
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("namecheap-domains", {
        body: { action: "balance" }
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

    setSearching(true);
    setSearchResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("namecheap-domains", {
        body: { action: "check", domain: searchQuery }
      });

      if (error) throw error;

      setSearchResult(data);
      
      if (data.available) {
        toast.success(`Domínio disponível! Preço: $${data.price}`);
      } else {
        toast.info("Domínio já está registrado");
      }
    } catch (error: any) {
      toast.error("Erro ao verificar disponibilidade");
    } finally {
      setSearching(false);
    }
  };

  const handlePurchaseDomain = async () => {
    if (!searchResult?.available) return;

    setPurchasing(true);

    try {
      const { data, error } = await supabase.functions.invoke("namecheap-domains", {
        body: {
          action: "purchase",
          domain: searchResult.domain,
          structure: "wordpress"
        }
      });

      if (error) throw error;

      toast.success("Domínio comprado com sucesso!");
      setPurchasedDomains([data.domain]);
      setClassificationDialogOpen(true);
      setSearchResult(null);
      setSearchQuery("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao comprar domínio");
    } finally {
      setPurchasing(false);
    }
  };

  const handleAISuccess = () => {
    loadBalance();
  };

  const handleClassificationSuccess = () => {
    loadBalance();
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Compra de Domínios</h1>
            <p className="text-muted-foreground">Pesquise e registre novos domínios</p>
          </div>
          {balance && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Saldo Namecheap</p>
                    <p className="text-2xl font-bold flex items-center gap-1">
                      <DollarSign className="h-5 w-5" />
                      {balance.usd.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">R$ {balance.brl.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Pesquisar Domínio</CardTitle>
          <CardDescription>
            Digite o nome do domínio que deseja verificar ou palavras-chave para sugestões
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="exemplo.com ou palavras-chave"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAiDialogOpen(true)}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Compra com IA
            </Button>
          </div>

          {searchResult && (
            <Card className={searchResult.available ? "border-success" : "border-destructive"}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {searchResult.available ? (
                      <CheckCircle2 className="h-8 w-8 text-success" />
                    ) : (
                      <XCircle className="h-8 w-8 text-destructive" />
                    )}
                    <div>
                      <p className="font-bold text-lg">{searchResult.domain}</p>
                      <p className="text-sm text-muted-foreground">
                        {searchResult.message}
                      </p>
                    </div>
                  </div>
                  {searchResult.available && (
                    <div className="flex gap-2">
                      <div className="text-right">
                        <p className="text-lg font-bold">${searchResult.price}</p>
                        <p className="text-xs text-muted-foreground">preço anual</p>
                      </div>
                      <Button onClick={handlePurchaseDomain} disabled={purchasing}>
                        {purchasing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Comprando...
                          </>
                        ) : (
                          "Comprar Domínio"
                        )}
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

      <PurchaseWithAIDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        onSuccess={handleAISuccess}
      />

      <ClassificationDialog
        open={classificationDialogOpen}
        onOpenChange={setClassificationDialogOpen}
        domains={purchasedDomains}
        onSuccess={handleClassificationSuccess}
      />
    </>
  );
}
