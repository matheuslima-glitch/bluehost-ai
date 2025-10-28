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
    const MAX_ATTEMPTS = 15; // Aumentado para 15 tentativas
    const DOMAINS_PER_BATCH = 10; // Gerar 10 domínios por tentativa

    let availableDomains: string[] = [];
    let attempt = 0;
    let totalGenerated = 0;
    let totalChecked = 0;

    console.log(`🚀 Starting domain search. Target: ${quantity} available domains`);

    // Loop até encontrar a quantidade necessária ou atingir máximo de tentativas
    while (availableDomains.length < quantity && attempt < MAX_ATTEMPTS) {
      attempt++;
      console.log(`\n📍 Attempt ${attempt}/${MAX_ATTEMPTS}`);
      console.log(`Current status: ${availableDomains.length}/${quantity} domains found`);

      const prompt = `Olá, preciso de ${DOMAINS_PER_BATCH} domínios do nicho ${niche || keywords} e no idioma ${languageMap[language]}. Me dê eles em .online

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

      // ETAPA 1: Chamar Gemini AI para gerar domínios
      console.log(`🤖 Calling Gemini AI to generate ${DOMAINS_PER_BATCH} domains...`);

      const geminiResponse = await fetch(
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

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("❌ Gemini AI error:", geminiResponse.status);
        continue;
      }

      const geminiData = await geminiResponse.json();

      if (!geminiData.candidates || geminiData.candidates.length === 0) {
        console.error("❌ No candidates in Gemini response");
        continue;
      }

      if (!geminiData.candidates[0].content?.parts?.[0]?.text) {
        console.error("❌ Invalid Gemini response structure");
        continue;
      }

      const textResponse = geminiData.candidates[0].content.parts[0].text;

      // Extrair domínios da resposta
      let generatedDomains: string[] = [];
      try {
        const jsonText = textResponse.replace(/```json\s*|\s*```/g, "").trim();
        const parsed = JSON.parse(jsonText);
        generatedDomains = parsed.domains || [];
      } catch (parseError) {
        console.log("⚠️  Failed to parse JSON, trying line extraction...");
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
        console.error("❌ No domains generated in this attempt");
        continue;
      }

      totalGenerated += generatedDomains.length;
      console.log(`✅ Generated ${generatedDomains.length} domains: ${generatedDomains.join(", ")}`);

      // ETAPA 2: VERIFICAÇÃO OBRIGATÓRIA VIA WEBHOOK
      console.log(`\n🔍 CHECKING AVAILABILITY via webhook...`);
      console.log(`Webhook URL: ${WEBHOOK_URL}`);

      try {
        // Preparar payload no formato correto
        const webhookPayload = {
          domains: generatedDomains.join(","),
        };

        console.log(`📤 Sending to webhook:`, JSON.stringify(webhookPayload));

        const webhookResponse = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(webhookPayload),
        });

        console.log(`📥 Webhook response status: ${webhookResponse.status}`);

        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          console.error("❌ Webhook error:", errorText);
          continue;
        }

        const webhookData = await webhookResponse.json();
        console.log(`📊 Webhook response data:`, JSON.stringify(webhookData, null, 2));

        totalChecked += generatedDomains.length;

        // Extrair domínios disponíveis
        const newAvailableDomains = webhookData.dominios_disponiveis || [];
        const unavailableDomains = webhookData.dominios_indisponiveis || [];

        console.log(`✅ Available: ${newAvailableDomains.length} domains`);
        console.log(`❌ Unavailable: ${unavailableDomains.length} domains`);

        if (newAvailableDomains.length > 0) {
          console.log(`Available domains:`, newAvailableDomains.join(", "));
        }
        if (unavailableDomains.length > 0) {
          console.log(`Unavailable domains:`, unavailableDomains.join(", "));
        }

        // Adicionar novos domínios disponíveis (evitar duplicatas)
        for (const domain of newAvailableDomains) {
          if (!availableDomains.includes(domain) && availableDomains.length < quantity) {
            availableDomains.push(domain);
            console.log(`➕ Added available domain: ${domain}`);
          }
        }

        console.log(`\n📊 Progress: ${availableDomains.length}/${quantity} available domains found`);
      } catch (webhookError) {
        console.error("❌ Critical error calling webhook:", webhookError);
        console.error("Error details:", webhookError instanceof Error ? webhookError.message : String(webhookError));
        // IMPORTANTE: Se o webhook falhar, não adicionar nenhum domínio como disponível
      }

      // Aguardar um pouco entre tentativas para não sobrecarregar as APIs
      if (availableDomains.length < quantity && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Resultado final
    console.log(`\n🏁 SEARCH COMPLETED`);
    console.log(`Total attempts: ${attempt}`);
    console.log(`Total domains generated: ${totalGenerated}`);
    console.log(`Total domains checked: ${totalChecked}`);
    console.log(`Total available found: ${availableDomains.length}`);
    console.log(`Target was: ${quantity}`);

    // Verificar se conseguimos a quantidade necessária
    if (availableDomains.length === 0) {
      throw new Error("Nenhum domínio disponível foi encontrado após verificação via webhook");
    }

    if (availableDomains.length < quantity) {
      console.warn(`⚠️  Only found ${availableDomains.length}/${quantity} domains after ${attempt} attempts`);
    }

    // Retornar apenas a quantidade solicitada
    const finalDomains = availableDomains.slice(0, quantity);

    console.log(`\n✅ Returning ${finalDomains.length} verified available domains:`);
    console.log(finalDomains.join("\n"));

    return new Response(
      JSON.stringify({
        domains: finalDomains,
        attempts: attempt,
        total_found: availableDomains.length,
        total_generated: totalGenerated,
        total_checked: totalChecked,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("❌ Error in ai-domain-suggestions function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
