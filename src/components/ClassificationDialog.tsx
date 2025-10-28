import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Domain {
  domain_name: string;
  id?: string;
}

interface ClassificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: Domain[];
  onSuccess: () => void;
}

const defaultSources = [
  "Google Ads",
  "Facebook Ads",
  "Native Ads",
  "Outros",
];

export default function ClassificationDialog({
  open,
  onOpenChange,
  domains,
  onSuccess,
}: ClassificationDialogProps) {
  const [classifications, setClassifications] = useState<Record<string, string>>({});
  const [customSources, setCustomSources] = useState<string[]>([]);
  const [newSource, setNewSource] = useState("");
  const [loading, setLoading] = useState(false);

  const allSources = [...defaultSources, ...customSources];

  const handleAddCustomSource = () => {
    if (newSource.trim() && !allSources.includes(newSource.trim())) {
      setCustomSources([...customSources, newSource.trim()]);
      setNewSource("");
    }
  };

  const handleRemoveCustomSource = (source: string) => {
    setCustomSources(customSources.filter((s) => s !== source));
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      const updates = domains.map((domain) => ({
        id: domain.id,
        traffic_source: classifications[domain.domain_name] || null,
      }));

      for (const update of updates) {
        if (update.id && update.traffic_source) {
          const { error } = await supabase
            .from("domains")
            .update({ traffic_source: update.traffic_source })
            .eq("id", update.id);

          if (error) throw error;
        }
      }

      toast.success("Classificações salvas com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar classificações:", error);
      toast.error("Erro ao salvar classificações");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Classificar Domínios</DialogTitle>
          <DialogDescription>
            Selecione a fonte de tráfego para cada domínio comprado
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Custom Source Input */}
          <div className="flex gap-2 items-end pb-4 border-b">
            <div className="flex-1">
              <Label htmlFor="custom-source">Adicionar Fonte Personalizada</Label>
              <Input
                id="custom-source"
                placeholder="Nome da fonte..."
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddCustomSource()}
              />
            </div>
            <Button type="button" size="icon" onClick={handleAddCustomSource}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Custom Sources List */}
          {customSources.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-4 border-b">
              {customSources.map((source) => (
                <div
                  key={source}
                  className="flex items-center gap-2 bg-secondary px-3 py-1 rounded-full"
                >
                  <span className="text-sm">{source}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomSource(source)}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Domain Classifications */}
          <div className="space-y-3">
            {domains.map((domain) => (
              <div key={domain.domain_name} className="grid gap-2">
                <Label htmlFor={`source-${domain.domain_name}`}>
                  {domain.domain_name}
                </Label>
                <Select
                  value={classifications[domain.domain_name] || ""}
                  onValueChange={(value) =>
                    setClassifications({
                      ...classifications,
                      [domain.domain_name]: value,
                    })
                  }
                >
                  <SelectTrigger id={`source-${domain.domain_name}`}>
                    <SelectValue placeholder="Selecione a fonte de tráfego" />
                  </SelectTrigger>
                  <SelectContent>
                    {allSources.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Classificações"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
