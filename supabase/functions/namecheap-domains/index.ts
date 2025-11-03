import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NAMECHEAP_API_KEY = Deno.env.get("NAMECHEAP_API_KEY") || "";
const NAMECHEAP_API_USER = Deno.env.get("NAMECHEAP_API_USER") || "";
const NAMECHEAP_BASE_URL = "https://api.namecheap.com/xml.response";
const WHITELIST_NAME = "DomainHub";

console.log("[Namecheap Domains] Function started");

/**
 * Detecta o IP atual do servidor Supabase
 */
async function detectCurrentIP(): Promise<string> {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    console.log("[Namecheap Domains] Detected IP:", data.ip);
    return data.ip;
  } catch (error) {
    console.error("[Namecheap Domains] Error detecting IP:", error);
    throw new Error("Failed to detect current IP");
  }
}

/**
 * Gerencia a whitelist do Namecheap: adiciona ou atualiza o IP atual
 */
async function ensureIPWhitelisted(currentIP: string): Promise<void> {
  try {
    console.log("[Namecheap Domains] Ensuring IP is whitelisted:", currentIP);

    // Listar IPs na whitelist
    const listParams = new URLSearchParams({
      ApiUser: NAMECHEAP_API_USER,
      ApiKey: NAMECHEAP_API_KEY,
      UserName: NAMECHEAP_API_USER,
      Command: "namecheap.users.address.getList",
      ClientIp: currentIP,
    });

    const listResponse = await fetch(`${NAMECHEAP_BASE_URL}?${listParams}`);
    const listXml = await listResponse.text();
    console.log("[Namecheap Domains] Whitelist response:", listXml.substring(0, 500));

    // Verificar se já existe um IP com o nome DomainHub
    const addressIdMatch = listXml.match(new RegExp(`<List[^>]*AddressId="(\\d+)"[^>]*AddressName="${WHITELIST_NAME}"`));
    
    if (addressIdMatch) {
      // Atualizar IP existente
      const addressId = addressIdMatch[1];
      console.log("[Namecheap Domains] Updating existing whitelist entry:", addressId);

      const updateParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.users.address.update",
        ClientIp: currentIP,
        AddressId: addressId,
        AddressName: WHITELIST_NAME,
        IpAddress: currentIP,
      });

      const updateResponse = await fetch(`${NAMECHEAP_BASE_URL}?${updateParams}`);
      const updateXml = await updateResponse.text();
      
      if (updateXml.includes('Status="OK"')) {
        console.log("[Namecheap Domains] IP whitelist updated successfully");
      } else {
        console.error("[Namecheap Domains] Failed to update whitelist:", updateXml);
      }
    } else {
      // Criar novo registro na whitelist
      console.log("[Namecheap Domains] Creating new whitelist entry");

      const createParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.users.address.create",
        ClientIp: currentIP,
        AddressName: WHITELIST_NAME,
        IpAddress: currentIP,
      });

      const createResponse = await fetch(`${NAMECHEAP_BASE_URL}?${createParams}`);
      const createXml = await createResponse.text();
      
      if (createXml.includes('Status="OK"')) {
        console.log("[Namecheap Domains] IP whitelist created successfully");
      } else {
        console.error("[Namecheap Domains] Failed to create whitelist:", createXml);
      }
    }
  } catch (error) {
    console.error("[Namecheap Domains] Error managing whitelist:", error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, domain, domains, structure, language, niche } = body;

    console.log("[Namecheap Domains] Request action:", action);

    if (!NAMECHEAP_API_KEY || !NAMECHEAP_API_USER) {
      throw new Error("Namecheap API credentials not configured in environment variables");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabaseClient.auth.getUser(token);

    if (!user) {
      throw new Error("Unauthorized");
    }

    // PASSO 1: Detectar IP atual
    const currentIP = await detectCurrentIP();

    // PASSO 2: Garantir que o IP está na whitelist
    await ensureIPWhitelisted(currentIP);

    // ==========================================
    // AÇÃO: BALANCE - Obter saldo da conta
    // ==========================================
    if (action === "balance") {
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.users.getBalances",
        ClientIp: currentIP,
      });

      const response = await fetch(`${NAMECHEAP_BASE_URL}?${params}`);
      const xmlText = await response.text();
      console.log("[Namecheap Domains] Balance response:", xmlText);

      // Parse balance com múltiplos padrões
      let balance = 0;

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
        const match = xmlText.match(pattern);
        if (match && match[1]) {
          const cleanValue = match[1].replace(/[$,]/g, "").trim();
          const parsed = parseFloat(cleanValue);
          if (!isNaN(parsed) && parsed > 0) {
            balance = parsed;
            console.log(`[Namecheap Domains] Balance found: ${balance} USD`);
            break;
          }
        }
      }

      // Fallback: extrair números que parecem ser valores monetários
      if (balance === 0) {
        const moneyPattern = /\b\d+\.?\d{0,2}\b/g;
        const matches = xmlText.match(moneyPattern);
        if (matches) {
          for (const match of matches) {
            const value = parseFloat(match);
            if (value > 1 && value < 10000) {
              balance = value;
              console.log(`[Namecheap Domains] Balance found by fallback: ${balance}`);
              break;
            }
          }
        }
      }

      const balanceBRL = balance * 5.7; // Conversão aproximada USD -> BRL

      // Salvar no banco de dados
      await supabaseClient.from("namecheap_balance").upsert(
        {
          user_id: user.id,
          balance_usd: balance,
          balance_brl: balanceBRL,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      return new Response(JSON.stringify({ balance: { usd: balance, brl: balanceBRL } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // AÇÃO: LIST_DOMAINS - Listar domínios com filtros
    // ==========================================
    if (action === "list_domains") {
      const { listType } = body;

      // Função para buscar TODOS os domínios com paginação robusta
      // CORREÇÃO: Removido limite de 50 páginas
      const fetchAllDomains = async () => {
        let allDomains: any[] = [];
        let currentPage = 1;
        let totalItems = 0;
        const pageSize = 100;
        let hasMorePages = true;

        // Primeira requisição para obter total
        const firstParams = new URLSearchParams({
          ApiUser: NAMECHEAP_API_USER,
          ApiKey: NAMECHEAP_API_KEY,
          UserName: NAMECHEAP_API_USER,
          Command: "namecheap.domains.getList",
          ClientIp: currentIP,
          PageSize: pageSize.toString(),
          Page: "1",
          ...(listType && listType !== "ALERT" && { ListType: listType }),
        });

        const firstResponse = await fetch(`${NAMECHEAP_BASE_URL}?${firstParams}`);
        const firstXml = await firstResponse.text();
        console.log(`[Namecheap Domains] First page response (${firstXml.length} bytes)`);

        // Extrair total de itens
        const totalItemsMatch = firstXml.match(/TotalItems="(\d+)"/);
        totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
        console.log(`[Namecheap Domains] Total domains: ${totalItems}`);

        // Parse primeira página
        const firstDomainMatches = [
          ...firstXml.matchAll(
            /<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*IsLocked="([^"]*)"[^>]*AutoRenew="([^"]*)"[^>]*IsExpired="([^"]*)"[^>]*IsPremium="([^"]*)"[^>]*>/g,
          ),
        ];
        const firstPageDomains = firstDomainMatches.map((match) => ({
          name: match[1],
          expirationDate: match[2],
          isLocked: match[3] === "true",
          autoRenew: match[4] === "true",
          isExpired: match[5] === "true",
          isPremium: match[6] === "true",
        }));

        // Processar filtro ALERT na primeira página
        if (listType === "ALERT") {
          const domainsWithAlerts = [];
          for (const domain of firstPageDomains) {
            if (!domain.autoRenew && !domain.isExpired) {
              const expDate = new Date(domain.expirationDate);
              const now = new Date();
              const daysUntilExpiry = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

              if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
                domainsWithAlerts.push({
                  ...domain,
                  alertMessage: `Atenção: Domínio sem renovação automática. Expira em ${daysUntilExpiry} dias.`,
                });
              }
            }
          }
          allDomains.push(...domainsWithAlerts);
        } else {
          allDomains.push(...firstPageDomains);
        }

        // Calcular total de páginas
        const totalPages = Math.ceil(totalItems / pageSize);
        console.log(`[Namecheap Domains] Total pages to fetch: ${totalPages}`);

        // CORREÇÃO CRÍTICA: Buscar TODAS as páginas restantes, sem limite artificial
        for (currentPage = 2; currentPage <= totalPages; currentPage++) {
          console.log(`[Namecheap Domains] Fetching page ${currentPage}/${totalPages}`);

          const params = new URLSearchParams({
            ApiUser: NAMECHEAP_API_USER,
            ApiKey: NAMECHEAP_API_KEY,
            UserName: NAMECHEAP_API_USER,
            Command: "namecheap.domains.getList",
            ClientIp: currentIP,
            PageSize: pageSize.toString(),
            Page: currentPage.toString(),
            ...(listType && listType !== "ALERT" && { ListType: listType }),
          });

          try {
            const response = await fetch(`${NAMECHEAP_BASE_URL}?${params}`);
            if (!response.ok) {
              console.error(`[Namecheap Domains] Error on page ${currentPage}: ${response.status}`);
              continue;
            }

            const xmlText = await response.text();

            // Parse domínios
            const domainMatches = [
              ...xmlText.matchAll(
                /<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*IsLocked="([^"]*)"[^>]*AutoRenew="([^"]*)"[^>]*IsExpired="([^"]*)"[^>]*IsPremium="([^"]*)"[^>]*>/g,
              ),
            ];

            const pageDomains = domainMatches.map((match) => ({
              name: match[1],
              expirationDate: match[2],
              isLocked: match[3] === "true",
              autoRenew: match[4] === "true",
              isExpired: match[5] === "true",
              isPremium: match[6] === "true",
            }));

            // Aplicar filtro ALERT se necessário
            if (listType === "ALERT") {
              const domainsWithAlerts = [];
              for (const domain of pageDomains) {
                if (!domain.autoRenew && !domain.isExpired) {
                  const expDate = new Date(domain.expirationDate);
                  const now = new Date();
                  const daysUntilExpiry = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                  if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
                    domainsWithAlerts.push({
                      ...domain,
                      alertMessage: `Atenção: Domínio sem renovação automática. Expira em ${daysUntilExpiry} dias.`,
                    });
                  }
                }
              }
              allDomains.push(...domainsWithAlerts);
            } else {
              allDomains.push(...pageDomains);
            }

            console.log(`[Namecheap Domains] Page ${currentPage}: ${pageDomains.length} domains (total: ${allDomains.length})`);
          } catch (pageError) {
            console.error(`[Namecheap Domains] Error processing page ${currentPage}:`, pageError);
          }

          // Delay entre requisições para evitar rate limiting
          if (currentPage < totalPages) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        return { domains: allDomains, totalExpected: totalItems };
      };

      const result = await fetchAllDomains();

      return new Response(
        JSON.stringify({
          domains: result.domains,
          count: result.domains.length,
          totalExpected: result.totalExpected,
          message: `Fetched ${result.domains.length} of ${result.totalExpected} domains`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ==========================================
    // AÇÃO: CHECK - Verificar disponibilidade de domínio
    // ==========================================
    if (action === "check" && domain) {
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.domains.check",
        ClientIp: currentIP,
        DomainList: domain,
      });

      const response = await fetch(`${NAMECHEAP_BASE_URL}?${params}`);
      const xmlText = await response.text();

      const available = xmlText.includes('Available="true"');

      return new Response(JSON.stringify({ available }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // AÇÃO: PURCHASE - Comprar domínio
    // ==========================================
    if (action === "purchase" && domain) {
      const purchaseParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.domains.create",
        ClientIp: currentIP,
        DomainName: domain,
        Years: "1",
        AuxBillingFirstName: "Lerricke",
        AuxBillingLastName: "Nunes",
        AuxBillingAddress1: "Rua Exemplo 123",
        AuxBillingCity: "São Paulo",
        AuxBillingStateProvince: "SP",
        AuxBillingPostalCode: "01000-000",
        AuxBillingCountry: "BR",
        AuxBillingPhone: "+55.1199999999",
        AuxBillingEmailAddress: "admin@example.com",
        TechFirstName: "Lerricke",
        TechLastName: "Nunes",
        TechAddress1: "Rua Exemplo 123",
        TechCity: "São Paulo",
        TechStateProvince: "SP",
        TechPostalCode: "01000-000",
        TechCountry: "BR",
        TechPhone: "+55.1199999999",
        TechEmailAddress: "admin@example.com",
        AdminFirstName: "Lerricke",
        AdminLastName: "Nunes",
        AdminAddress1: "Rua Exemplo 123",
        AdminCity: "São Paulo",
        AdminStateProvince: "SP",
        AdminPostalCode: "01000-000",
        AdminCountry: "BR",
        AdminPhone: "+55.1199999999",
        AdminEmailAddress: "admin@example.com",
        RegistrantFirstName: "Lerricke",
        RegistrantLastName: "Nunes",
        RegistrantAddress1: "Rua Exemplo 123",
        RegistrantCity: "São Paulo",
        RegistrantStateProvince: "SP",
        RegistrantPostalCode: "01000-000",
        RegistrantCountry: "BR",
        RegistrantPhone: "+55.1199999999",
        RegistrantEmailAddress: "admin@example.com",
      });

      const purchaseResponse = await fetch(`${NAMECHEAP_BASE_URL}?${purchaseParams}`);
      const purchaseXml = await purchaseResponse.text();
      console.log("[Namecheap Domains] Purchase response:", purchaseXml);

      // Verificar sucesso
      if (purchaseXml.includes('Status="OK"') || purchaseXml.includes("ChargedAmount")) {
        // Salvar no banco
        const { data: domainData, error: insertError } = await supabaseClient
          .from("domains")
          .insert({
            user_id: user.id,
            domain_name: domain,
            status: "active",
            registrar: "Namecheap",
            integration_source: "namecheap",
            site_structure: structure || "wordpress",
            auto_renew: true,
            purchase_date: new Date().toISOString(),
            expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          console.error("[Namecheap Domains] Error saving domain:", insertError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            domain,
            message: `Domain ${domain} purchased successfully!`,
            domainId: domainData?.id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Parse erro
      const errorMatch = purchaseXml.match(/<Error[^>]*>(.*?)<\/Error>/);

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMatch ? errorMatch[1] : "Purchase failed",
          details: purchaseXml.substring(0, 500),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ==========================================
    // AÇÃO: LIST - Listar todos os domínios
    // ==========================================
    if (action === "list") {
      const fetchAllDomains = async () => {
        let allDomains: any[] = [];
        let currentPage = 1;
        let totalItems = 0;
        const pageSize = 100;

        // Primeira requisição
        const firstParams = new URLSearchParams({
          ApiUser: NAMECHEAP_API_USER,
          ApiKey: NAMECHEAP_API_KEY,
          UserName: NAMECHEAP_API_USER,
          Command: "namecheap.domains.getList",
          ClientIp: currentIP,
          PageSize: pageSize.toString(),
          Page: "1",
        });

        const firstResponse = await fetch(`${NAMECHEAP_BASE_URL}?${firstParams}`);
        const firstXml = await firstResponse.text();

        const totalItemsMatch = firstXml.match(/TotalItems="(\d+)"/);
        totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
        console.log(`[Namecheap Domains] Total domains in account: ${totalItems}`);

        // Parse primeira página
        const firstDomainMatches = [...firstXml.matchAll(/<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*>/g)];
        const firstPageDomains = firstDomainMatches.map((match) => ({
          domain_name: match[1],
          expiration_date: match[2],
          registrar: "Namecheap",
          integration_source: "namecheap",
        }));

        allDomains.push(...firstPageDomains);

        const totalPages = Math.ceil(totalItems / pageSize);
        console.log(`[Namecheap Domains] Total pages: ${totalPages}`);

        // CORREÇÃO: Buscar TODAS as páginas restantes
        for (currentPage = 2; currentPage <= totalPages; currentPage++) {
          console.log(`[Namecheap Domains] Fetching page ${currentPage}/${totalPages}`);

          const params = new URLSearchParams({
            ApiUser: NAMECHEAP_API_USER,
            ApiKey: NAMECHEAP_API_KEY,
            UserName: NAMECHEAP_API_USER,
            Command: "namecheap.domains.getList",
            ClientIp: currentIP,
            PageSize: pageSize.toString(),
            Page: currentPage.toString(),
          });

          try {
            const response = await fetch(`${NAMECHEAP_BASE_URL}?${params}`);
            if (!response.ok) {
              console.error(`[Namecheap Domains] Error on page ${currentPage}: ${response.status}`);
              continue;
            }

            const xmlText = await response.text();
            const domainMatches = [...xmlText.matchAll(/<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*>/g)];
            const domains = domainMatches.map((match) => ({
              domain_name: match[1],
              expiration_date: match[2],
              registrar: "Namecheap",
              integration_source: "namecheap",
            }));

            allDomains.push(...domains);
            console.log(`[Namecheap Domains] Page ${currentPage}: ${domains.length} domains (total: ${allDomains.length})`);
          } catch (pageError) {
            console.error(`[Namecheap Domains] Error processing page ${currentPage}:`, pageError);
          }

          if (currentPage < totalPages) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        return { domains: allDomains, totalExpected: totalItems };
      };

      const result = await fetchAllDomains();

      // Sincronizar com banco de dados
      for (const domainData of result.domains) {
        await supabaseClient.from("domains").upsert(
          {
            user_id: user.id,
            domain_name: domainData.domain_name,
            expiration_date: domainData.expiration_date,
            registrar: domainData.registrar,
            integration_source: domainData.integration_source,
            status: "active",
          },
          {
            onConflict: "user_id,domain_name",
          },
        );
      }

      return new Response(
        JSON.stringify({
          domains: result.domains,
          count: result.domains.length,
          totalExpected: result.totalExpected,
          message: `Successfully fetched ${result.domains.length} of ${result.totalExpected} domains`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Invalid action: ${action}. Valid actions: balance, check, purchase, list_domains, list`);
  } catch (error) {
    console.error("[Namecheap Domains] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
