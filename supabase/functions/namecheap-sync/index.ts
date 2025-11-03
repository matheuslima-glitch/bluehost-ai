import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Usar variáveis de ambiente para credenciais
const NAMECHEAP_API_KEY = Deno.env.get("NAMECHEAP_API_KEY") || "";
const NAMECHEAP_API_USER = Deno.env.get("NAMECHEAP_API_USER") || "";
// Usar IP público genérico ou obter dinamicamente
const CLIENT_IP = "0.0.0.0"; // Namecheap aceita qualquer IP se configurado corretamente

console.log("[Namecheap Sync] Function started");

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[Namecheap Sync] Processing sync request");

  try {
    if (!NAMECHEAP_API_KEY || !NAMECHEAP_API_USER) {
      throw new Error("Namecheap API credentials not configured");
    }

    // Criar cliente Supabase com service role key para operações de sistema
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const baseURL = "https://api.namecheap.com/xml.response";
    const syncResults = {
      balanceUpdated: false,
      domainsInserted: 0,
      domainsUpdated: 0,
      totalDomainsFound: 0,
      errors: [] as string[],
      timestamp: new Date().toISOString(),
    };

    // ============================================================
    // 1. SINCRONIZAR SALDO DA CONTA
    // ============================================================
    console.log("[Namecheap Sync] Fetching account balance...");
    try {
      const balanceParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.users.getBalances",
        ClientIp: CLIENT_IP,
      });

      const balanceResponse = await fetch(`${baseURL}?${balanceParams}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/xml",
        },
      });

      if (!balanceResponse.ok) {
        throw new Error(`Balance API error: ${balanceResponse.status}`);
      }

      const balanceXml = await balanceResponse.text();
      console.log("[Namecheap Sync] Balance XML:", balanceXml);

      // Parse balance - tentar múltiplos campos e formatos
      let balanceUSD = 0;

      // Tentar diferentes patterns de parsing
      const patterns = [
        /AvailableBalance="([^"]+)"/,
        /AccountBalance="([^"]+)"/,
        /Balance="([^"]+)"/,
        /<Balance[^>]*>([^<]+)<\/Balance>/,
        /<AvailableBalance[^>]*>([^<]+)<\/AvailableBalance>/,
        /Currency="USD"[^>]*Balance="([^"]+)"/,
      ];

      for (const pattern of patterns) {
        const match = balanceXml.match(pattern);
        if (match && match[1]) {
          // Limpar o valor e converter
          const cleanValue = match[1].replace(/[$,]/g, "").trim();
          const parsed = parseFloat(cleanValue);
          if (!isNaN(parsed) && parsed > 0) {
            balanceUSD = parsed;
            console.log(`[Namecheap Sync] Balance found with pattern ${pattern}: ${balanceUSD}`);
            break;
          }
        }
      }

      // Se ainda não encontrou, tentar parsing XML mais robusto
      if (balanceUSD === 0) {
        // Extrair todos os números que parecem ser valores monetários
        const moneyPattern = /\b\d+\.?\d{0,2}\b/g;
        const matches = balanceXml.match(moneyPattern);
        if (matches) {
          for (const match of matches) {
            const value = parseFloat(match);
            // Assumir que o saldo está entre 1 e 10000 USD
            if (value > 1 && value < 10000) {
              balanceUSD = value;
              console.log(`[Namecheap Sync] Balance found by number pattern: ${balanceUSD}`);
              break;
            }
          }
        }
      }

      const balanceBRL = balanceUSD * 5.7; // Conversão aproximada

      console.log("[Namecheap Sync] Final parsed balance:", { balanceUSD, balanceBRL });

      // Obter todos os usuários do sistema para atualizar o saldo
      const { data: users, error: usersError } = await supabaseClient.from("profiles").select("id");

      if (usersError) {
        throw usersError;
      }

      // Atualizar saldo para todos os usuários
      for (const user of users || []) {
        const { error: balanceError } = await supabaseClient.from("namecheap_balance").upsert(
          {
            user_id: user.id,
            balance_usd: balanceUSD,
            balance_brl: balanceBRL,
            last_synced_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
            ignoreDuplicates: false,
          },
        );

        if (balanceError) {
          console.error(`[Namecheap Sync] Error updating balance for user ${user.id}:`, balanceError);
          syncResults.errors.push(`Balance update failed for user ${user.id}: ${balanceError.message}`);
        }
      }

      syncResults.balanceUpdated = true;
      console.log("[Namecheap Sync] Balance updated successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[Namecheap Sync] Balance sync error:", error);
      syncResults.errors.push(`Balance sync failed: ${errorMessage}`);
    }

    // ============================================================
    // 2. SINCRONIZAR DOMÍNIOS - COM PAGINAÇÃO ROBUSTA
    // ============================================================
    console.log("[Namecheap Sync] Fetching domains from Namecheap...");
    try {
      const allNamecheapDomains: Array<{
        name: string;
        expirationDate: string;
        isExpired: boolean;
        autoRenew: boolean;
        isLocked: boolean;
      }> = [];

      let currentPage = 1;
      let totalItems = 0;
      let hasMore = true;
      const maxPages = 50; // Limite de segurança para evitar loop infinito

      // Primeira chamada para descobrir o total de itens
      const firstParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.domains.getList",
        ClientIp: CLIENT_IP,
        PageSize: "100",
        Page: "1",
      });

      const firstResponse = await fetch(`${baseURL}?${firstParams}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/xml",
        },
      });

      if (!firstResponse.ok) {
        throw new Error(`Domains API error: ${firstResponse.status}`);
      }

      const firstXml = await firstResponse.text();
      console.log(`[Namecheap Sync] First page response:`, firstXml.substring(0, 500));

      // Extrair total de items
      const totalItemsMatch = firstXml.match(/TotalItems="(\d+)"/);
      totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
      console.log(`[Namecheap Sync] Total domains in Namecheap: ${totalItems}`);

      // Processar primeira página
      const firstDomainMatches = [
        ...firstXml.matchAll(
          /<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*IsLocked="([^"]*)"[^>]*AutoRenew="([^"]*)"[^>]*IsExpired="([^"]*)"[^>]*>/g,
        ),
      ];

      const firstPageDomains = firstDomainMatches.map((match) => ({
        name: match[1],
        expirationDate: match[2],
        isLocked: match[3] === "true",
        autoRenew: match[4] === "true",
        isExpired: match[5] === "true",
      }));

      allNamecheapDomains.push(...firstPageDomains);

      // Calcular quantas páginas precisamos buscar
      const totalPages = Math.ceil(totalItems / 100);
      console.log(`[Namecheap Sync] Total pages to fetch: ${totalPages}`);

      // Buscar páginas restantes
      currentPage = 2; // Começar da página 2

      while (currentPage <= totalPages && currentPage <= maxPages) {
        console.log(`[Namecheap Sync] Fetching page ${currentPage} of ${totalPages}`);

        const domainsParams = new URLSearchParams({
          ApiUser: NAMECHEAP_API_USER,
          ApiKey: NAMECHEAP_API_KEY,
          UserName: NAMECHEAP_API_USER,
          Command: "namecheap.domains.getList",
          ClientIp: CLIENT_IP,
          PageSize: "100",
          Page: currentPage.toString(),
        });

        const domainsResponse = await fetch(`${baseURL}?${domainsParams}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/xml",
          },
        });

        if (!domainsResponse.ok) {
          console.error(`[Namecheap Sync] Error fetching page ${currentPage}: ${domainsResponse.status}`);
          // Continuar com outras páginas mesmo se uma falhar
          currentPage++;
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay maior em caso de erro
          continue;
        }

        const domainsXml = await domainsResponse.text();

        // Parse domínios do XML
        const domainMatches = [
          ...domainsXml.matchAll(
            /<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*IsLocked="([^"]*)"[^>]*AutoRenew="([^"]*)"[^>]*IsExpired="([^"]*)"[^>]*>/g,
          ),
        ];

        const pageDomains = domainMatches.map((match) => ({
          name: match[1],
          expirationDate: match[2],
          isLocked: match[3] === "true",
          autoRenew: match[4] === "true",
          isExpired: match[5] === "true",
        }));

        allNamecheapDomains.push(...pageDomains);
        console.log(
          `[Namecheap Sync] Page ${currentPage}: found ${pageDomains.length} domains (total so far: ${allNamecheapDomains.length})`,
        );

        currentPage++;

        // Delay para evitar rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      syncResults.totalDomainsFound = allNamecheapDomains.length;
      console.log(
        `[Namecheap Sync] Found ${allNamecheapDomains.length} domains in Namecheap (expected: ${totalItems})`,
      );

      // Buscar domínios existentes no banco
      const { data: existingDomains, error: existingError } = await supabaseClient
        .from("domains")
        .select("domain_name, id, status, expiration_date, auto_renew, user_id")
        .eq("integration_source", "namecheap");

      if (existingError) {
        throw existingError;
      }

      const existingDomainMap = new Map((existingDomains || []).map((d) => [d.domain_name, d]));

      console.log(`[Namecheap Sync] Found ${existingDomainMap.size} domains in database`);

      // Obter um usuário padrão para associar novos domínios
      const { data: defaultUser } = await supabaseClient.from("profiles").select("id").limit(1).single();

      const defaultUserId = defaultUser?.id || "00000000-0000-0000-0000-000000000000";

      // Processar cada domínio da Namecheap
      for (const ncDomain of allNamecheapDomains) {
        try {
          const existingDomain = existingDomainMap.get(ncDomain.name);

          // Determinar status do domínio
          let status = "active";
          if (ncDomain.isExpired) {
            status = "expired";
          } else {
            const expDate = new Date(ncDomain.expirationDate);
            const now = new Date();
            const daysUntilExpiry = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilExpiry <= 0) {
              status = "expired";
            } else if (daysUntilExpiry <= 7) {
              status = "expiring";
            }
          }

          if (existingDomain) {
            // Atualizar domínio existente se houver mudanças
            const needsUpdate =
              existingDomain.status !== status ||
              existingDomain.expiration_date !== ncDomain.expirationDate ||
              existingDomain.auto_renew !== ncDomain.autoRenew;

            if (needsUpdate) {
              const { error: updateError } = await supabaseClient
                .from("domains")
                .update({
                  status,
                  expiration_date: ncDomain.expirationDate,
                  auto_renew: ncDomain.autoRenew,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingDomain.id);

              if (updateError) {
                console.error(`[Namecheap Sync] Error updating domain ${ncDomain.name}:`, updateError);
                syncResults.errors.push(`Failed to update ${ncDomain.name}: ${updateError.message}`);
              } else {
                syncResults.domainsUpdated++;
                console.log(`[Namecheap Sync] Updated domain: ${ncDomain.name}`);

                // Registrar log de atividade da mudança de status
                if (existingDomain.status !== status) {
                  await supabaseClient
                    .from("domain_activity_logs")
                    .insert({
                      domain_id: existingDomain.id,
                      user_id: existingDomain.user_id || defaultUserId,
                      action_type: "status_changed",
                      old_value: existingDomain.status,
                      new_value: status,
                    })
                    .select()
                    .single();
                }
              }
            }
          } else {
            // INSERIR NOVO DOMÍNIO AUTOMATICAMENTE
            console.log(`[Namecheap Sync] Inserting new domain: ${ncDomain.name}`);

            const { error: insertError } = await supabaseClient.from("domains").insert({
              domain_name: ncDomain.name,
              user_id: defaultUserId,
              status,
              expiration_date: ncDomain.expirationDate,
              auto_renew: ncDomain.autoRenew,
              is_locked: ncDomain.isLocked,
              registrar: "Namecheap",
              integration_source: "namecheap",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

            if (insertError) {
              console.error(`[Namecheap Sync] Error inserting domain ${ncDomain.name}:`, insertError);
              syncResults.errors.push(`Failed to insert ${ncDomain.name}: ${insertError.message}`);
            } else {
              syncResults.domainsInserted++;
              console.log(`[Namecheap Sync] Inserted new domain: ${ncDomain.name}`);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`[Namecheap Sync] Error processing domain ${ncDomain.name}:`, error);
          syncResults.errors.push(`Failed to process ${ncDomain.name}: ${errorMessage}`);
        }
      }

      console.log("[Namecheap Sync] Domain sync completed");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[Namecheap Sync] Domain sync error:", error);
      syncResults.errors.push(`Domain sync failed: ${errorMessage}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Namecheap Sync] Sync completed in ${duration}ms`);
    console.log("[Namecheap Sync] Results:", syncResults);

    return new Response(
      JSON.stringify({
        success: true,
        results: syncResults,
        duration: `${duration}ms`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Namecheap Sync] Fatal error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
