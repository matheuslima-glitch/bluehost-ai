import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, quantity = 5, language = "portuguese", structure, niche } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("Gemini API key not configured");
    }

    const languageMap: Record<string, string> = {
      portuguese: "Português",
      english: "Inglês",
      spanish: "Espanhol",
    };

    const WEBHOOK_URL = "https://webhook.institutoexperience.com/webhook/2ad42b09-808e-42b9-bbb9-6e47d828004a";
    const MAX_ATTEMPTS = 10; // Máximo de tentativas
    const BATCH_SIZE = quantity * 3; // Gerar 3x mais domínios para ter opções

    let availableDomains: string[] = [];
    let attempt = 0;

    console.log(`Starting domain generation. Target: ${quantity} domains`);

    // Loop até encontrar a quantidade necessária ou atingir máximo de tentativas
    while (availableDomains.length < quantity && attempt < MAX_ATTEMPTS) {
      attempt++;
      console.log(`Attempt ${attempt}/${MAX_ATTEMPTS} - Currently have ${availableDomains.length}/${quantity} domains`);

      // Calcular quantos domínios ainda precisamos
      const needed = quantity - availableDomains.length;
      const toGenerate = Math.max(needed * 2, BATCH_SIZE); // Gerar pelo menos o dobro do necessário

      const prompt = `Olá, preciso de ${toGenerate} domínios do nicho ${niche || keywords} e no idioma ${languageMap[language]}. Me dê eles em .online

- Lembre-se de SEMPRE usar .online
- Lembre-se de NUNCA usar acentos.
- Lembre-se de NUNCA usar traços.
- Retorne APENAS um objeto JSON válido no seguinte formato, sem nenhum texto adicional:
{
  "domains": [
    "primeirodominio.online",
    "segundodominio.online"
  ]
}`;

      // Chamar Gemini AI
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini AI error:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(`Gemini AI error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("Gemini AI response received");

      if (!data.candidates || data.candidates.length === 0) {
        console.error("No candidates in response:", data);
        continue; // Tentar novamente
      }

      if (
        !data.candidates[0].content ||
        !data.candidates[0].content.parts ||
        data.candidates[0].content.parts.length === 0
      ) {
        console.error("Invalid response structure:", data);
        continue; // Tentar novamente
      }

      const textResponse = data.candidates[0].content.parts[0].text;

      // Extrair domínios da resposta
      let generatedDomains = [];
      try {
        const jsonText = textResponse.replace(/```json\s*|\s*```/g, "").trim();
        const parsed = JSON.parse(jsonText);
        generatedDomains = parsed.domains || [];
      } catch (parseError) {
        console.error("Failed to parse JSON, falling back to line extraction");
        generatedDomains = textResponse
          .split("\n")
          .map((line: string) => line.trim())
          .filter((line: string) => line.includes(".online"))
          .map((line: string) => {
            const match = line.match(/([a-z0-9]+\.online)/i);
            return match ? match[1].toLowerCase() : null;
          })
          .filter((domain: string | null): domain is string => domain !== null);
      }

      if (generatedDomains.length === 0) {
        console.error("No domains generated in this attempt");
        continue;
      }

      console.log(`Generated ${generatedDomains.length} domains, checking availability...`);

      // Verificar disponibilidade via webhook
      try {
        const webhookResponse = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            domains: generatedDomains.join(","),
          }),
        });

        if (!webhookResponse.ok) {
          console.error("Webhook error:", webhookResponse.status);
          continue;
        }

        const webhookData = await webhookResponse.json();
        console.log("Webhook response:", JSON.stringify(webhookData));

        // Extrair domínios disponíveis da resposta
        const newAvailableDomains = webhookData.dominios_disponiveis || [];

        // Adicionar novos domínios disponíveis (evitar duplicatas)
        for (const domain of newAvailableDomains) {
          if (!availableDomains.includes(domain) && availableDomains.length < quantity) {
            availableDomains.push(domain);
          }
        }

        console.log(`After check: ${availableDomains.length}/${quantity} available domains found`);
      } catch (webhookError) {
        console.error("Error calling webhook:", webhookError);
        // Continuar tentando mesmo se o webhook falhar
      }
    }

    // Verificar se conseguimos a quantidade necessária
    if (availableDomains.length < quantity) {
      console.warn(`Only found ${availableDomains.length}/${quantity} domains after ${attempt} attempts`);
    }

    // Retornar apenas a quantidade solicitada
    const finalDomains = availableDomains.slice(0, quantity);

    console.log(`Returning ${finalDomains.length} domains: ${finalDomains.join(", ")}`);

    return new Response(
      JSON.stringify({
        domains: finalDomains,
        attempts: attempt,
        total_found: availableDomains.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in ai-domain-suggestions function:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
