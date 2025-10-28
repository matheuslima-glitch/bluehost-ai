import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ChecklistItem {
  title: string;
  description: string;
  completed: boolean;
  category: "backend" | "frontend" | "database" | "integration";
}

const checklistItems: ChecklistItem[] = [
  {
    title: "Nova Edge Function: purchase-domains",
    description: "Processa compra completa de domínios com todas as etapas",
    completed: true,
    category: "backend"
  },
  {
    title: "Edge Function: ai-domain-suggestions",
    description: "Atualizada para usar Gemini API para sugestões inteligentes",
    completed: true,
    category: "backend"
  },
  {
    title: "PurchaseWithAIDialog Reescrito",
    description: "Popup de progresso em tempo real durante a compra",
    completed: true,
    category: "frontend"
  },
  {
    title: "Migration: Purchase Tracking",
    description: "Campos de tracking de compra e tabelas de classificação",
    completed: true,
    category: "database"
  },
  {
    title: "Integração Namecheap",
    description: "Compra automática de domínios via API Namecheap",
    completed: true,
    category: "integration"
  },
  {
    title: "Integração Cloudflare",
    description: "Criação de zonas, DNS, SSL e firewall automáticos",
    completed: true,
    category: "integration"
  },
  {
    title: "Integração Z-API (WhatsApp)",
    description: "Notificação automática via WhatsApp após compra",
    completed: true,
    category: "integration"
  },
  {
    title: "Suporte WordPress",
    description: "Configuração completa de infraestrutura para WordPress",
    completed: true,
    category: "integration"
  },
  {
    title: "Suporte Atomicat",
    description: "Compra apenas, sem configuração de infraestrutura",
    completed: true,
    category: "integration"
  },
  {
    title: "Sistema de Classificação",
    description: "Domínios classificados por fonte de tráfego",
    completed: true,
    category: "database"
  },
  {
    title: "Validação de Preços",
    description: ".online/.site até $1, .com até $12",
    completed: true,
    category: "backend"
  },
  {
    title: "Logs Detalhados",
    description: "Logging de cada etapa do processo de compra",
    completed: true,
    category: "backend"
  }
];

const categoryColors = {
  backend: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  frontend: "bg-green-500/10 text-green-500 border-green-500/20",
  database: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  integration: "bg-orange-500/10 text-orange-500 border-orange-500/20"
};

const categoryLabels = {
  backend: "Backend",
  frontend: "Frontend",
  database: "Database",
  integration: "Integração"
};

export default function ImplementationChecklist() {
  const totalItems = checklistItems.length;
  const completedItems = checklistItems.filter(item => item.completed).length;
  const progressPercentage = (completedItems / totalItems) * 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Status de Implementação</CardTitle>
            <CardDescription>
              Sistema de compra e gerenciamento de domínios
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {completedItems}/{totalItems}
            </div>
            <div className="text-sm text-muted-foreground">
              {progressPercentage.toFixed(0)}% completo
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {checklistItems.map((item, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="mt-0.5">
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium leading-none">{item.title}</h4>
                  <Badge 
                    variant="outline" 
                    className={categoryColors[item.category]}
                  >
                    {categoryLabels[item.category]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
