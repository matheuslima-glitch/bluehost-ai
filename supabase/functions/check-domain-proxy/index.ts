import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * FUNÇÃO PROXY PARA N8N WEBHOOK
 * 
 * Esta função age como intermediário entre Supabase e N8N quando o domínio
 * do N8N está bloqueado pelas restrições de rede do Supabase.
 * 
 * FLUXO:
 * ai-domain-suggestions → check-domain-proxy → N8N Webhook → Namecheap
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log("🔄 PROXY: Nova requisição recebida");

    // Validar método
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        { 
          status: 405, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Extrair payload
    const payload = await req.json();
    console.log("📦 PROXY: Payload recebido:", JSON.stringify(payload));

    // Validar payload
    if (!payload.domains) {
      return new Response(
        JSON.stringify({ 
          error: "Missing 'domains' field in payload",
          expected_format: { domains: "domain1.online,domain2.online" }
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // URL do webhook N8N (pode vir de variável de ambiente)
    const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL") || 
      "https://webhook.institutoexperience.com/webhook/2ad42b09-808e-42b9-bbb9-6e47d828004a";
    
    console.log("🎯 PROXY: Encaminhando para N8N:", N8N_WEBHOOK_URL);
    console.log("📤 PROXY: Domínios a verificar:", payload.domains);

    // Fazer requisição para N8N com timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos

    let n8nResponse;
    try {
      n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      console.error("❌ PROXY: Erro ao conectar com N8N:", fetchError.message);
      
      // Erro de timeout
      if (fetchError.name === "AbortError") {
        return new Response(
          JSON.stringify({ 
            error: "N8N webhook timeout (30s)",
            details: "O N8N demorou muito para responder. Verifique se está ativo."
          }),
          { 
            status: 504, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }
      
      // Outros erros de rede
      return new Response(
        JSON.stringify({ 
          error: "Failed to connect to N8N webhook",
          details: fetchError.message,
          webhook_url: N8N_WEBHOOK_URL
        }),
        { 
          status: 502, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    clearTimeout(timeoutId);

    console.log("📥 PROXY: Resposta do N8N - Status:", n8nResponse.status);

    // Verificar se N8N respondeu com sucesso
    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error("❌ PROXY: N8N retornou erro:", errorText);
      
      return new Response(
        JSON.stringify({ 
          error: `N8N webhook returned error: ${n8nResponse.status}`,
          details: errorText,
          webhook_url: N8N_WEBHOOK_URL
        }),
        { 
          status: n8nResponse.status, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Extrair dados da resposta
    const n8nData = await n8nResponse.json();
    console.log("✅ PROXY: Dados recebidos do N8N:", JSON.stringify(n8nData, null, 2));

    // Validar estrutura da resposta
    const dadosOriginais = n8nData.dados_originais || n8nData;
    const dominiosDisponiveis = dadosOriginais.dominios_disponiveis || [];
    const dominiosIndisponiveis = dadosOriginais.dominios_indisponiveis || [];

    console.log(`📊 PROXY: ${dominiosDisponiveis.length} disponíveis, ${dominiosIndisponiveis.length} indisponíveis`);

    // Calcular tempo de processamento
    const processingTime = Date.now() - startTime;
    console.log(`⏱️  PROXY: Processado em ${processingTime}ms`);

    // Retornar resposta padronizada
    return new Response(
      JSON.stringify({
        success: true,
        data: n8nData,
        metadata: {
          processing_time_ms: processingTime,
          domains_checked: (payload.domains as string).split(",").length,
          domains_available: dominiosDisponiveis.length,
          domains_unavailable: dominiosIndisponiveis.length,
          timestamp: new Date().toISOString()
        }
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error("❌ PROXY: Erro interno:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown proxy error",
        details: error instanceof Error ? error.stack : String(error),
        metadata: {
          processing_time_ms: processingTime,
          timestamp: new Date().toISOString()
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
