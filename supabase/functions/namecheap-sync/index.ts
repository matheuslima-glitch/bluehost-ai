import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ==========================================
// CORREÇÃO: Usar variáveis de ambiente
// ==========================================
const NAMECHEAP_API_KEY = Deno.env.get("NAMECHEAP_API_KEY") || "";
const NAMECHEAP_API_USER = Deno.env.get("NAMECHEAP_API_USER") || "";
const CLIENT_IP = Deno.env.get("NAMECHEAP_CLIENT_IP") || "0.0.0.0";

console.log("[Namecheap Sync] Function started");
console.log("[Namecheap Sync] Using CLIENT_IP:", CLIENT_IP);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[Namecheap Sync] Processing sync request");

  try {
    if (!NAMECHEAP_API_KEY || !NAMECHEAP_API_USER) {
      throw new Error("Namecheap API credentials not configured in environment variables");
    }

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
      totalDomainsExpected: 0,
      pagesProcessed: 0,
      errors: [] as string[],
      timestamp: new Date().toISOString(),
    };

    // ==========================================
    // 1. SINCRONIZAR SALDO DA CONTA NAMECHEAP
    // ==========================================
    console.log("[Namecheap Sync] Step 1: Fetching account balance...");
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
        headers: { "Content-Type": "application/xml" },
      });

      if (!balanceResponse.ok) {
        throw new Error(`Balance API error: ${balanceResponse.status}`);
      }

      const balanceXml = await balanceResponse.text();
      console.log("[Namecheap Sync] Balance XML response received");

      // Parse balance com múltiplos padrões
      let balanceUSD = 0;

      const patterns = [
        /AvailableBalance="([^"]+)"/,
        /AccountBalance="([^"]+)"/,
        /Balance="([^"]+)"/,
        /<Balance[^>]*>([^<]+)<\/Balance>/,
        /<AvailableBalance[^>]*>([^<]+)<\/AvailableBalance>/,
        /Currency="USD"[^>]*Balance="([^"]+)"/,
        /Currency="USD"[^>]*>([^<]+)<\/Currency>/,
      ];

      for (const pattern of patterns) {
        const match = balanceXml.match(pattern);
        if (match && match[1]) {
          const cleanValue = match[1].replace(/[$,]/g, "").trim();
          const parsed = parseFloat(cleanValue);
          if (!isNaN(parsed) && parsed >= 0) {
            balanceUSD = parsed;
            console.log(`[Namecheap Sync] Balance found: ${balanceUSD} USD`);
            break;
          }
        }
      }

      // Fallback: extrair números
      if (balanceUSD === 0) {
        const moneyPattern = /\b\d+\.?\d{0,2}\b/g;
        const matches = balanceXml.match(moneyPattern);
        if (matches) {
          for (const match of matches) {
            const value = parseFloat(match);
            if (value >= 0 && value < 100000) {
              balanceUSD = value;
              console.log(`[Namecheap Sync] Balance found by fallback: ${balanceUSD}`);
              break;
            }
          }
        }
      }

      const balanceBRL = balanceUSD * 5.7;

      console.log("[Namecheap Sync] Final balance:", { balanceUSD, balanceBRL });

      // Obter todos os usuários e atualizar saldo
      const { data: users, error: usersError } = await supabaseClient.from("profiles").select("id");

      if (usersError) {
        throw usersError;
      }

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
      console.log("[Namecheap Sync] Balance updated successfully for all users");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[Namecheap Sync] Balance sync error:", error);
      syncResults.errors.push(`Balance sync failed: ${errorMessage}`);
    }

    // ==========================================
    // 2. SINCRONIZAR DOMÍNIOS - PAGINAÇÃO COMPLETA
    // ==========================================
    console.log("[Namecheap Sync] Step 2: Fetching domains from Namecheap...");
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
      const pageSize = 100;

      // ==========================================
      // CORREÇÃO CRÍTICA: BUSCAR PRIMEIRA PÁGINA
      // ==========================================
      const firstParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.domains.getList",
        ClientIp: CLIENT_IP,
        PageSize: pageSize.toString(),
        Page: "1",
      });

      const firstResponse = await fetch(`${baseURL}?${firstParams}`, {
        method: "GET",
        headers: { "Content-Type": "application/xml" },
      });

      if (!firstResponse.ok) {
        throw new Error(`Domains API error: ${firstResponse.status}`);
      }

      const firstXml = await firstResponse.text();
      console.log(`[Namecheap Sync] First page response received (${firstXml.length} bytes)`);

      // Extrair total de itens
      const totalItemsMatch = firstXml.match(/TotalItems="(\d+)"/);
      totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
      syncResults.totalDomainsExpected = totalItems;
      console.log(`[Namecheap Sync] Total domains in Namecheap: ${totalItems}`);

      // Parse primeira página
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
      syncResults.pagesProcessed = 1;

      console.log(`[Namecheap Sync] Page 1: ${firstPageDomains.length} domains`);

      // Calcular total de páginas
      const totalPages = Math.ceil(totalItems / pageSize);
      console.log(`[Namecheap Sync] Total pages to process: ${totalPages}`);

      // ==========================================
      // CORREÇÃO CRÍTICA: BUSCAR TODAS AS PÁGINAS
      // REMOVIDO LIMITE DE 50 PÁGINAS
      // ==========================================
      for (currentPage = 2; currentPage <= totalPages; currentPage++) {
        console.log(`[Namecheap Sync] Fetching page ${currentPage}/${totalPages}`);

        const domainsParams = new URLSearchParams({
          ApiUser: NAMECHEAP_API_USER,
          ApiKey: NAMECHEAP_API_KEY,
          UserName: NAMECHEAP_API_USER,
          Command: "namecheap.domains.getList",
          ClientIp: CLIENT_IP,
          PageSize: pageSize.toString(),
          Page: currentPage.toString(),
        });

        try {
          const domainsResponse = await fetch(`${baseURL}?${domainsParams}`, {
            method: "GET",
            headers: { "Content-Type": "application/xml" },
          });

          if (!domainsResponse.ok) {
            console.error(`[Namecheap Sync] Error on page ${currentPage}: ${domainsResponse.status}`);
            syncResults.errors.push(`Failed to fetch page ${currentPage}: HTTP ${domainsResponse.status}`);
            // Continuar com próxima página
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }

          const domainsXml = await domainsResponse.text();

          // Parse domínios
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
          syncResults.pagesProcessed++;

          console.log(
            `[Namecheap Sync] Page ${currentPage}: ${pageDomains.length} domains (total: ${allNamecheapDomains.length}/${totalItems})`,
          );
        } catch (pageError) {
          const errorMessage = pageError instanceof Error ? pageError.message : "Unknown error";
          console.error(`[Namecheap Sync] Error processing page ${currentPage}:`, pageError);
          syncResults.errors.push(`Page ${currentPage} processing failed: ${errorMessage}`);
        }

        // Delay entre requisições para evitar rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      syncResults.totalDomainsFound = allNamecheapDomains.length;
      console.log(
        `[Namecheap Sync] Completed fetching: ${allNamecheapDomains.length} domains found (expected: ${totalItems})`,
      );

      // ==========================================
      // 3. SINCRONIZAR COM BANCO DE DADOS
      // ==========================================
      console.log("[Namecheap Sync] Step 3: Syncing domains with database...");

      // Buscar domínios existentes
      const { data: existingDomains, error: existingError } = await supabaseClient
        .from("domains")
        .select("domain_name, id, status, expiration_date, auto_renew, user_id")
        .eq("integration_source", "namecheap");

      if (existingError) {
        throw existingError;
      }

      const existingDomainMap = new Map((existingDomains || []).map((d) => [d.domain_name, d]));
      console.log(`[Namecheap Sync] Found ${existingDomainMap.size} domains in database`);

      // Obter usuário padrão
      const { data: defaultUser } = await supabaseClient.from("profiles").select("id").limit(1).single();
      const defaultUserId = defaultUser?.id || "00000000-0000-0000-0000-000000000000";

      // Processar cada domínio
      for (const ncDomain of allNamecheapDomains) {
        try {
          const existingDomain = existingDomainMap.get(ncDomain.name);

          // Determinar status
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
            // Atualizar se houver mudanças
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
                console.error(`[Namecheap Sync] Error updating ${ncDomain.name}:`, updateError);
                syncResults.errors.push(`Failed to update ${ncDomain.name}: ${updateError.message}`);
              } else {
                syncResults.domainsUpdated++;

                // Log de atividade se status mudou
                if (existingDomain.status !== status) {
                  await supabaseClient.from("domain_activity_logs").insert({
                    domain_id: existingDomain.id,
                    user_id: existingDomain.user_id || defaultUserId,
                    action_type: "status_changed",
                    old_value: existingDomain.status,
                    new_value: status,
                  });
                }
              }
            }
          } else {
            // Inserir novo domínio
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
              console.error(`[Namecheap Sync] Error inserting ${ncDomain.name}:`, insertError);
              syncResults.errors.push(`Failed to insert ${ncDomain.name}: ${insertError.message}`);
            } else {
              syncResults.domainsInserted++;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`[Namecheap Sync] Error processing ${ncDomain.name}:`, error);
          syncResults.errors.push(`Failed to process ${ncDomain.name}: ${errorMessage}`);
        }
      }

      console.log("[Namecheap Sync] Domain sync completed");
      console.log(`[Namecheap Sync] Inserted: ${syncResults.domainsInserted}, Updated: ${syncResults.domainsUpdated}`);
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
