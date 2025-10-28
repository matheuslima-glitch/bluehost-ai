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

    
    const WEBHOOK_URL = Deno.env.get("N8N_PROXY_URL") || 
      "https://dsehaqdqnrkjrhbvkfrk.supabase.co/functions/v1/check-domain-proxy";
    
    const MAX_ATTEMPTS = 15;
    const DOMAINS_PER_BATCH = 10;

    let availableDomains: string[] = [];
    let attempt = 0;
    let totalGenerated = 0;
    let totalChecked = 0;

    console.log(`🚀 Starting domain search. Target: ${quantity} available domains`);
    console.log(`🔗 Using proxy: ${WEBHOOK_URL}`);

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

      console.log(`\n🔍 CHECKING AVAILABILITY via proxy...`);
      console.log(`Proxy URL: ${WEBHOOK_URL}`);

      try {
        const webhookPayload = {
          domains: generatedDomains.join(","),
        };

        console.log(`📤 Sending to proxy:`, JSON.stringify(webhookPayload));

        const webhookResponse = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(webhookPayload),
        });

        console.log(`📥 Proxy response status: ${webhookResponse.status}`);

        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          console.error("❌ Proxy error:", errorText);
          continue;
        }

        const webhookData = await webhookResponse.json();
        console.log(`📊 Proxy response data:`, JSON.stringify(webhookData, null, 2));

        totalChecked += generatedDomains.length;

        // 🔧 CORREÇÃO: Ler resposta do proxy corretamente
        // Proxy retorna: { success: true, data: { dados_originais: {...} } }
        const proxyData = webhookData.data || webhookData;
        const dadosOriginais = proxyData.dados_originais || proxyData;
        
        const newAvailableDomains = dadosOriginais.dominios_disponiveis || [];
        const unavailableDomains = dadosOriginais.dominios_indisponiveis || [];

        console.log(`✅ Available: ${newAvailableDomains.length} domains`);
        console.log(`❌ Unavailable: ${unavailableDomains.length} domains`);

        if (newAvailableDomains.length > 0) {
          console.log(`Available domains:`, newAvailableDomains.join(", "));
        }
        if (unavailableDomains.length > 0) {
          console.log(`Unavailable domains:`, unavailableDomains.join(", "));
        }

        for (const domain of newAvailableDomains) {
          if (!availableDomains.includes(domain) && availableDomains.length < quantity) {
            availableDomains.push(domain);
            console.log(`➕ Added available domain: ${domain}`);
          }
        }

        console.log(`\n📊 Progress: ${availableDomains.length}/${quantity} available domains found`);
      } catch (webhookError) {
        console.error("❌ Critical error calling proxy:", webhookError);
        console.error("Error details:", webhookError instanceof Error ? webhookError.message : String(webhookError));
      }

      if (availableDomains.length < quantity && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n🏁 SEARCH COMPLETED`);
    console.log(`Total attempts: ${attempt}`);
    console.log(`Total domains generated: ${totalGenerated}`);
    console.log(`Total domains checked: ${totalChecked}`);
    console.log(`Total available found: ${availableDomains.length}`);
    console.log(`Target was: ${quantity}`);

    if (availableDomains.length === 0) {
      throw new Error("Nenhum domínio disponível foi encontrado após verificação via webhook");
    }

    if (availableDomains.length < quantity) {
      console.warn(`⚠️  Only found ${availableDomains.length}/${quantity} domains after ${attempt} attempts`);
    }

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