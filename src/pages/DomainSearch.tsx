import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Sparkles, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function DomainSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

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
        toast.success("Domínio disponível!");
      } else {
        toast.info("Domínio já está registrado");
      }
    } catch (error: any) {
      toast.error("Erro ao verificar disponibilidade");
    } finally {
      setSearching(false);
    }
  };

  const generateSuggestions = async () => {
    if (!searchQuery.trim()) {
      toast.error("Digite palavras-chave para gerar sugestões");
      return;
    }

    setGeneratingSuggestions(true);
    setSuggestions([]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-domain-suggestions", {
        body: { keywords: searchQuery }
      });

      if (error) throw error;

      setSuggestions(data.suggestions || []);
      toast.success("Sugestões geradas com IA!");
    } catch (error: any) {
      toast.error("Erro ao gerar sugestões");
    } finally {
      setGeneratingSuggestions(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Compra de Domínios</h1>
        <p className="text-muted-foreground">Pesquise e registre novos domínios</p>
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
              onClick={generateSuggestions}
              disabled={generatingSuggestions}
            >
              {generatingSuggestions ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  IA
                </>
              )}
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
                    <Button>
                      Registrar Domínio
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Sugestões Geradas por IA
            </CardTitle>
            <CardDescription>
              Domínios criativos baseados nas suas palavras-chave
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {suggestions.map((domain, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{domain}</p>
                      <Button size="sm" variant="ghost">
                        Verificar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
