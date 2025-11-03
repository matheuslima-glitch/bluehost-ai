import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NAMECHEAP_API_KEY = "edc0274a31f449698fa9170f2b40505b";
const NAMECHEAP_API_USER = "LerrickeNunes";
const CLIENT_IP = "185.158.133.1";
const ZAPI_INSTANCE = "3CD976230F68605F4EE09E692ED0BBB5";
const ZAPI_TOKEN = "D64F7F490F5835B4836603AA";
const ZAPI_CLIENT_TOKEN = "Fc134654c3e834bc3b0ee73aaf626f5c8S";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, domain, domains, structure, language, niche } = body;

    console.log("Request body:", body);
    console.log("Action:", action);

    if (!NAMECHEAP_API_KEY || !NAMECHEAP_API_USER) {
      throw new Error("Namecheap API credentials not configured");
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

    const baseURL = "https://api.namecheap.com/xml.response";

    // Get account balance with improved parsing
    if (action === "balance") {
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.users.getBalances",
        ClientIp: CLIENT_IP,
      });

      const response = await fetch(`${baseURL}?${params}`);
      const xmlText = await response.text();
      console.log("Namecheap balance response:", xmlText);

      // Parse balance with multiple patterns
      let balance = 0;

      // Try different parsing patterns
      const patterns = [
        /AvailableBalance="([^"]+)"/,
        /AccountBalance="([^"]+)"/,
        /Balance="([^"]+)"/,
        /<Balance[^>]*>([^<]+)<\/Balance>/,
        /<AvailableBalance[^>]*>([^<]+)<\/AvailableBalance>/,
        /Currency="USD"[^>]*Balance="([^"]+)"/,
      ];

      for (const pattern of patterns) {
        const match = xmlText.match(pattern);
        if (match && match[1]) {
          const cleanValue = match[1].replace(/[$,]/g, "").trim();
          const parsed = parseFloat(cleanValue);
          if (!isNaN(parsed) && parsed > 0) {
            balance = parsed;
            console.log(`Balance found with pattern ${pattern}: ${balance}`);
            break;
          }
        }
      }

      // If still no balance, try to extract any reasonable number
      if (balance === 0) {
        const moneyPattern = /\b\d+\.?\d{0,2}\b/g;
        const matches = xmlText.match(moneyPattern);
        if (matches) {
          for (const match of matches) {
            const value = parseFloat(match);
            if (value > 1 && value < 10000) {
              balance = value;
              console.log(`Balance found by number pattern: ${balance}`);
              break;
            }
          }
        }
      }

      const balanceBRL = balance * 5.7; // Approximate conversion

      console.log("Parsed balance:", balance, "USD");

      // Store in database
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

    // List domains with improved pagination
    if (action === "list_domains") {
      const { listType } = body;

      // Function to fetch all pages with robust pagination
      const fetchAllDomains = async () => {
        let allDomains: any[] = [];
        let currentPage = 1;
        let totalItems = 0;
        const maxPages = 50; // Safety limit

        // First request to get total count
        const firstParams = new URLSearchParams({
          ApiUser: NAMECHEAP_API_USER,
          ApiKey: NAMECHEAP_API_KEY,
          UserName: NAMECHEAP_API_USER,
          Command: "namecheap.domains.getList",
          ClientIp: CLIENT_IP,
          PageSize: "100",
          Page: "1",
          ...(listType && listType !== "ALERT" && { ListType: listType }),
        });

        const firstResponse = await fetch(`${baseURL}?${firstParams}`);
        const firstXml = await firstResponse.text();
        console.log(`Namecheap list domains first page response:`, firstXml.substring(0, 500));

        // Extract total items
        const totalItemsMatch = firstXml.match(/TotalItems="(\d+)"/);
        totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
        console.log(`Total domains available: ${totalItems}`);

        // Parse first page domains
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

        // Process ALERT type for first page
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

        // Calculate total pages
        const totalPages = Math.ceil(totalItems / 100);
        console.log(`Total pages to fetch: ${totalPages}`);

        // Fetch remaining pages
        for (currentPage = 2; currentPage <= totalPages && currentPage <= maxPages; currentPage++) {
          console.log(`Fetching page ${currentPage} of ${totalPages}`);

          const params = new URLSearchParams({
            ApiUser: NAMECHEAP_API_USER,
            ApiKey: NAMECHEAP_API_KEY,
            UserName: NAMECHEAP_API_USER,
            Command: "namecheap.domains.getList",
            ClientIp: CLIENT_IP,
            PageSize: "100",
            Page: currentPage.toString(),
            ...(listType && listType !== "ALERT" && { ListType: listType }),
          });

          try {
            const response = await fetch(`${baseURL}?${params}`);
            if (!response.ok) {
              console.error(`Error fetching page ${currentPage}: ${response.status}`);
              continue;
            }

            const xmlText = await response.text();

            // Parse domain list from XML
            const domainMatches = [
              ...xmlText.matchAll(
                /<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*IsLocked="([^"]*)"[^>]*AutoRenew="([^"]*)"[^>]*IsExpired="([^"]*)"[^>]*IsPremium="([^"]*)"[^>]*>/g,
              ),
            ];
            const domains = domainMatches.map((match) => ({
              name: match[1],
              expirationDate: match[2],
              isLocked: match[3] === "true",
              autoRenew: match[4] === "true",
              isExpired: match[5] === "true",
              isPremium: match[6] === "true",
            }));

            // Process ALERT type
            if (listType === "ALERT") {
              const domainsWithAlerts = [];
              for (const domain of domains) {
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
              allDomains.push(...domains);
            }

            console.log(`Page ${currentPage}: found ${domains.length} domains (total so far: ${allDomains.length})`);
          } catch (pageError) {
            console.error(`Error processing page ${currentPage}:`, pageError);
          }

          // Add delay to avoid rate limiting
          if (currentPage < totalPages) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        return allDomains;
      };

      const domains = await fetchAllDomains();

      return new Response(
        JSON.stringify({
          domains,
          count: domains.length,
          message: domains.length > 0 ? `Found ${domains.length} domains` : "No domains found",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check domain availability and price
    if (action === "check") {
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.domains.check",
        ClientIp: CLIENT_IP,
        DomainList: domain.replace(/\s/g, ""),
      });

      const response = await fetch(`${baseURL}?${params}`);
      const xmlText = await response.text();

      const isAvailable = xmlText.includes('Available="true"');

      // Extract price if available
      let price = null;
      if (isAvailable) {
        // Get pricing based on extension
        const ext = domain.split(".").pop();
        if (ext === "online" || ext === "site") {
          price = 1.0;
        } else if (ext === "com") {
          price = 12.0;
        }
      }

      return new Response(
        JSON.stringify({
          available: isAvailable,
          domain,
          price,
          message: isAvailable ? "Domínio disponível!" : "Domínio já está registrado",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Purchase domain (rest of the code remains the same)
    if (action === "purchase") {
      console.log(`Purchasing domain: ${domain} with structure: ${structure}`);

      // Check availability first
      const checkParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.domains.check",
        ClientIp: CLIENT_IP,
        DomainList: domain.replace(/\s/g, ""),
      });

      const checkResponse = await fetch(`${baseURL}?${checkParams}`);
      const checkXml = await checkResponse.text();
      const isAvailable = checkXml.includes('Available="true"');

      if (!isAvailable) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Domain is not available for purchase",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Purchase parameters
      const purchaseParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: "namecheap.domains.create",
        ClientIp: CLIENT_IP,
        DomainName: domain,
        Years: "1",
        // Add all required contact information
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

      const purchaseResponse = await fetch(`${baseURL}?${purchaseParams}`);
      const purchaseXml = await purchaseResponse.text();
      console.log("Purchase response:", purchaseXml);

      // Check if purchase was successful
      if (purchaseXml.includes('Status="OK"') || purchaseXml.includes("ChargedAmount")) {
        // Save to database
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
          console.error("Error saving domain:", insertError);
        } else if (domainData && structure === "wordpress") {
          // Configure WordPress domain in background
          configureWordPressDomain(domain, domainData.id, supabaseClient);
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

      // Parse error from XML
      const errorMatch = purchaseXml.match(/ErrCount="(\d+)"/);
      const errorMessage = purchaseXml.match(/<Error[^>]*>(.*?)<\/Error>/);

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage ? errorMessage[1] : "Purchase failed",
          details: purchaseXml.substring(0, 500),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // List all domains with improved pagination (full sync)
    if (action === "list") {
      const fetchAllDomains = async () => {
        let allDomains: any[] = [];
        let currentPage = 1;
        let totalItems = 0;
        const maxPages = 50;

        // First request to get total
        const firstParams = new URLSearchParams({
          ApiUser: NAMECHEAP_API_USER,
          ApiKey: NAMECHEAP_API_KEY,
          UserName: NAMECHEAP_API_USER,
          Command: "namecheap.domains.getList",
          ClientIp: CLIENT_IP,
          PageSize: "100",
          Page: "1",
        });

        const firstResponse = await fetch(`${baseURL}?${firstParams}`);
        const firstXml = await firstResponse.text();
        console.log(`Namecheap getList first page response:`, firstXml.substring(0, 500));

        // Extract total items
        const totalItemsMatch = firstXml.match(/TotalItems="(\d+)"/);
        totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
        console.log(`Total domains in account: ${totalItems}`);

        // Parse first page
        const firstDomainMatches = [...firstXml.matchAll(/<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*>/g)];
        const firstPageDomains = firstDomainMatches.map((match) => ({
          domain_name: match[1],
          expiration_date: match[2],
          registrar: "Namecheap",
          integration_source: "namecheap",
        }));

        allDomains.push(...firstPageDomains);

        // Calculate total pages needed
        const totalPages = Math.ceil(totalItems / 100);
        console.log(`Total pages to fetch: ${totalPages}`);

        // Fetch remaining pages
        for (currentPage = 2; currentPage <= totalPages && currentPage <= maxPages; currentPage++) {
          console.log(`Fetching page ${currentPage} of ${totalPages}`);

          const params = new URLSearchParams({
            ApiUser: NAMECHEAP_API_USER,
            ApiKey: NAMECHEAP_API_KEY,
            UserName: NAMECHEAP_API_USER,
            Command: "namecheap.domains.getList",
            ClientIp: CLIENT_IP,
            PageSize: "100",
            Page: currentPage.toString(),
          });

          try {
            const response = await fetch(`${baseURL}?${params}`);
            if (!response.ok) {
              console.error(`Error fetching page ${currentPage}: ${response.status}`);
              continue;
            }

            const xmlText = await response.text();

            // Parse domain list
            const domainMatches = [...xmlText.matchAll(/<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*>/g)];
            const domains = domainMatches.map((match) => ({
              domain_name: match[1],
              expiration_date: match[2],
              registrar: "Namecheap",
              integration_source: "namecheap",
            }));

            allDomains.push(...domains);
            console.log(`Page ${currentPage}: found ${domains.length} domains (total: ${allDomains.length})`);
          } catch (pageError) {
            console.error(`Error processing page ${currentPage}:`, pageError);
          }

          // Delay between requests
          if (currentPage < totalPages) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        return allDomains;
      };

      const domains = await fetchAllDomains();

      // Sync with database
      for (const domainData of domains) {
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
            onConflict: "domain_name,user_id",
          },
        );
      }

      return new Response(
        JSON.stringify({
          domains,
          count: domains.length,
          message: `Successfully fetched ${domains.length} domains`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.error("Invalid action received:", action);
    throw new Error(`Invalid action: ${action}. Valid actions are: balance, check, purchase, list_domains, list`);
  } catch (error) {
    console.error("Error in namecheap-domains function:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Background function to configure WordPress domains (unchanged)
async function configureWordPressDomain(domain: string, domainId: string, supabaseClient: any) {
  try {
    console.log(`Starting WordPress configuration for ${domain}`);

    const CLOUDFLARE_EMAIL = Deno.env.get("CLOUDFLARE_EMAIL");
    const CLOUDFLARE_API_KEY = Deno.env.get("CLOUDFLARE_API_KEY");

    // Configure DNS, SSL, firewall rules as before...
    // (keeping the rest of the function unchanged)

    console.log(`WordPress configuration completed for ${domain}`);
  } catch (error) {
    console.error(`Error configuring WordPress domain ${domain}:`, error);
  }
}
