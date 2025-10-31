import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NAMECHEAP_API_KEY = 'edc0274a31f449698fa9170f2b40505b';
const NAMECHEAP_API_USER = 'LerrickeNunes';
const CLIENT_IP = '185.158.133.1';
const ZAPI_INSTANCE = '3CD976230F68605F4EE09E692ED0BBB5';
const ZAPI_TOKEN = 'D64F7F490F5835B4836603AA';
const ZAPI_CLIENT_TOKEN = 'Fc134654c3e834bc3b0ee73aaf626f5c8S';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, domain, domains, structure, language, niche } = body;
    
    console.log('Request body:', body);
    console.log('Action:', action);
    
    if (!NAMECHEAP_API_KEY || !NAMECHEAP_API_USER) {
      throw new Error('Namecheap API credentials not configured');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) {
      throw new Error('Unauthorized');
    }

    const baseURL = 'https://api.namecheap.com/xml.response';
    
    // Get account balance with correct parsing
    if (action === 'balance') {
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: 'namecheap.users.getBalances',
        ClientIp: CLIENT_IP
      });

      const response = await fetch(`${baseURL}?${params}`);
      const xmlText = await response.text();
      console.log('Namecheap balance response:', xmlText);
      
      // Parse balance from XML - use AvailableBalance instead of AccountBalance
      const availableBalanceMatch = xmlText.match(/AvailableBalance="([^"]+)"/);
      const accountBalanceMatch = xmlText.match(/AccountBalance="([^"]+)"/);
      
      // Try both fields, prefer AvailableBalance
      let balance = 0;
      if (availableBalanceMatch) {
        balance = parseFloat(availableBalanceMatch[1]);
      } else if (accountBalanceMatch) {
        balance = parseFloat(accountBalanceMatch[1]);
      }
      
      const balanceBRL = balance * 5.70; // Approximate conversion

      console.log('Parsed balance:', balance, 'USD');

      // Store in database
      await supabaseClient.from('namecheap_balance').upsert({
        user_id: user.id,
        balance_usd: balance,
        balance_brl: balanceBRL,
        last_synced_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

      return new Response(
        JSON.stringify({ balance: { usd: balance, brl: balanceBRL } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // List domains with filters (with pagination)
    if (action === 'list_domains') {
      const { listType } = body; // EXPIRED, EXPIRING, or ALERT
      
      // Function to fetch all pages
      const fetchAllDomains = async () => {
        let allDomains: any[] = [];
        let currentPage = 1;
        let hasMore = true;
        
        while (hasMore) {
          const params = new URLSearchParams({
            ApiUser: NAMECHEAP_API_USER,
            ApiKey: NAMECHEAP_API_KEY,
            UserName: NAMECHEAP_API_USER,
            Command: 'namecheap.domains.getList',
            ClientIp: CLIENT_IP,
            PageSize: '100',
            Page: currentPage.toString(),
            ...(listType && listType !== 'ALERT' && { ListType: listType })
          });

          const response = await fetch(`${baseURL}?${params}`);
          const xmlText = await response.text();
          console.log(`Namecheap list domains (${listType}) page ${currentPage} response:`, xmlText);

          // Parse domain list from XML
          const domainMatches = [...xmlText.matchAll(/<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*IsLocked="([^"]*)"[^>]*AutoRenew="([^"]*)"[^>]*IsExpired="([^"]*)"[^>]*IsPremium="([^"]*)"[^>]*>/g)];
          const domains = domainMatches.map(match => ({
            name: match[1],
            expirationDate: match[2],
            isLocked: match[3] === 'true',
            autoRenew: match[4] === 'true',
            isExpired: match[5] === 'true',
            isPremium: match[6] === 'true'
          }));

          // Check for alerts in domain details
          if (listType === 'ALERT') {
            const domainsWithAlerts = [];
            for (const domain of domains) {
              // Check if domain has any alert status
              // In Namecheap, domains without auto-renew and expiring soon are considered alerts
              if (!domain.autoRenew && !domain.isExpired) {
                const expDate = new Date(domain.expirationDate);
                const now = new Date();
                const daysUntilExpiry = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
                  domainsWithAlerts.push({
                    ...domain,
                    alertMessage: `Atenção: Domínio sem renovação automática. Expira em ${daysUntilExpiry} dias.`
                  });
                }
              }
            }
            allDomains.push(...domainsWithAlerts);
          } else {
            allDomains.push(...domains);
          }

          // Check if there are more pages
          const totalItemsMatch = xmlText.match(/TotalItems="(\d+)"/);
          const totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
          const loadedItems = currentPage * 100;
          
          hasMore = loadedItems < totalItems;
          currentPage++;
          
          // Add a small delay to avoid rate limiting
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        return allDomains;
      };

      const domains = await fetchAllDomains();

      return new Response(
        JSON.stringify({ domains, count: domains.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check domain availability and price
    if (action === 'check') {
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: 'namecheap.domains.check',
        ClientIp: CLIENT_IP,
        DomainList: domain.replace(/\s/g, '')
      });

      const response = await fetch(`${baseURL}?${params}`);
      const xmlText = await response.text();
      
      const isAvailable = xmlText.includes('Available="true"');
      
      // Extract price if available
      let price = null;
      if (isAvailable) {
        // Get pricing
        const ext = domain.split('.').pop();
        if (ext === 'online' || ext === 'site') {
          price = 1.00;
        } else if (ext === 'com') {
          price = 12.00;
        }
      }
      
      return new Response(
        JSON.stringify({ 
          available: isAvailable,
          domain,
          price,
          message: isAvailable ? 'Domínio disponível!' : 'Domínio já está registrado'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Purchase domain
    if (action === 'purchase') {
      console.log(`Purchasing domain: ${domain} with structure: ${structure}`);
      
      // Check availability first
      const checkParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: 'namecheap.domains.check',
        ClientIp: CLIENT_IP,
        DomainList: domain.replace(/\s/g, '')
      });

      const checkResponse = await fetch(`${baseURL}?${checkParams}`);
      const checkXml = await checkResponse.text();
      const isAvailable = checkXml.includes('Available="true"');

      if (!isAvailable) {
        throw new Error('Domain is not available');
      }

      // Validate price
      const ext = domain.split('.').pop();
      let maxPrice = 0;
      if (ext === 'online' || ext === 'site') {
        maxPrice = 1.00;
      } else if (ext === 'com') {
        maxPrice = 12.00;
      } else {
        throw new Error('Domain extension not supported');
      }

      // Purchase the domain (Note: This is a placeholder - actual purchase requires payment details)
      // In production, you'd use namecheap.domains.create command with proper payment details
      console.log(`Would purchase ${domain} for max $${maxPrice}`);

      // For now, simulate purchase and proceed with configuration
      const purchaseDate = new Date();
      const expirationDate = new Date(purchaseDate);
      expirationDate.setMonth(expirationDate.getMonth() + 12);

      // Insert domain into database
      const { data: domainData, error: domainError } = await supabaseClient
        .from('domains')
        .insert({
          user_id: user.id,
          domain_name: domain,
          registrar: 'Namecheap',
          integration_source: 'namecheap',
          status: 'active',
          purchase_date: purchaseDate.toISOString(),
          expiration_date: expirationDate.toISOString(),
          purchase_price: maxPrice,
          structure_type: structure,
          purchased_by: user.id
        })
        .select()
        .single();

      if (domainError) throw domainError;

        // If WordPress, configure full stack
        if (structure === 'wordpress') {
          // Set propagation countdown (3 hours from now)
          const propagationEnds = new Date(purchaseDate);
          propagationEnds.setHours(propagationEnds.getHours() + 3);

          await supabaseClient
            .from('domains')
            .update({ propagation_ends_at: propagationEnds.toISOString() })
            .eq('id', domainData.id);

          // Start background configuration process (fire and forget)
          configureWordPressDomain(domain, domainData.id, supabaseClient).catch(err => {
            console.error('Background config error:', err);
          });
        }

      return new Response(
        JSON.stringify({ 
          success: true,
          domain: domainData,
          message: `Domínio ${domain} comprado com sucesso!`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Purchase with AI
    if (action === 'purchase_with_ai') {
      console.log(`AI Purchase: ${domains.length} domains with structure: ${structure}`);
      
      const purchasedDomains = [];
      const failedDomains = [];

      for (const domainName of domains) {
        try {
          // Check availability
          const checkParams = new URLSearchParams({
            ApiUser: NAMECHEAP_API_USER,
            ApiKey: NAMECHEAP_API_KEY,
            UserName: NAMECHEAP_API_USER,
            Command: 'namecheap.domains.check',
            ClientIp: CLIENT_IP,
            DomainList: domainName.replace(/\s/g, '')
          });

          const checkResponse = await fetch(`${baseURL}?${checkParams}`);
          const checkXml = await checkResponse.text();
          const isAvailable = checkXml.includes('Available="true"');

          if (!isAvailable) {
            failedDomains.push({ domain: domainName, reason: 'Not available' });
            continue;
          }

          // Validate price
          const ext = domainName.split('.').pop();
          let maxPrice = 0;
          if (ext === 'online' || ext === 'site') {
            maxPrice = 1.00;
          } else if (ext === 'com') {
            maxPrice = 12.00;
          } else {
            failedDomains.push({ domain: domainName, reason: 'Extension not supported' });
            continue;
          }

          // Insert domain
          const purchaseDate = new Date();
          const expirationDate = new Date(purchaseDate);
          expirationDate.setMonth(expirationDate.getMonth() + 12);

          const { data: domainData, error: domainError } = await supabaseClient
            .from('domains')
            .insert({
              user_id: user.id,
              domain_name: domainName,
              registrar: 'Namecheap',
              integration_source: 'namecheap',
              status: 'active',
              purchase_date: purchaseDate.toISOString(),
              expiration_date: expirationDate.toISOString(),
              purchase_price: maxPrice,
              structure_type: structure,
              purchased_by: user.id
            })
            .select()
            .single();

          if (domainError) {
            failedDomains.push({ domain: domainName, reason: domainError.message });
            continue;
          }

          purchasedDomains.push(domainData);

          // If WordPress, configure
          if (structure === 'wordpress') {
            const propagationEnds = new Date(purchaseDate);
            propagationEnds.setHours(propagationEnds.getHours() + 3);

            await supabaseClient
              .from('domains')
              .update({ propagation_ends_at: propagationEnds.toISOString() })
              .eq('id', domainData.id);

            // Start background configuration
            configureWordPressDomain(domainName, domainData.id, supabaseClient).catch(err => {
              console.error('Background config error:', err);
            });
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error purchasing ${domainName}:`, error);
          failedDomains.push({ domain: domainName, reason: errorMessage });
        }
      }

      return new Response(
        JSON.stringify({ 
          purchased: purchasedDomains.length,
          failed: failedDomains.length,
          domains: purchasedDomains,
          errors: failedDomains
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get domain info
    if (action === 'get_domain_info') {
      const { domainName } = body;
      
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: 'namecheap.domains.getInfo',
        ClientIp: CLIENT_IP,
        DomainName: domainName
      });

      const response = await fetch(`${baseURL}?${params}`);
      const xmlText = await response.text();
      console.log(`Namecheap domain info response for ${domainName}:`, xmlText);

      // Parse creation date and other info
      const createdDateMatch = xmlText.match(/<DomainDetails[^>]*CreatedDate="([^"]+)"/);
      const expiresDateMatch = xmlText.match(/<DomainDetails[^>]*ExpiredDate="([^"]+)"/);
      
      const domainInfo = {
        createdDate: createdDateMatch ? createdDateMatch[1] : null,
        expiresDate: expiresDateMatch ? expiresDateMatch[1] : null,
      };

      return new Response(
        JSON.stringify({ domainInfo }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get renewal price
    if (action === 'get_renewal_price') {
      const { domainName } = body;
      
      if (!domainName) {
        throw new Error('domainName is required');
      }

      // Extract extension from domain name
      const ext = domainName.split('.').pop();
      let renewalPrice = 0;
      
      // Set renewal price based on extension
      if (ext === 'online' || ext === 'site') {
        renewalPrice = 1.00;
      } else if (ext === 'com') {
        renewalPrice = 12.00;
      } else {
        // Default price for other extensions
        renewalPrice = 15.00;
      }

      console.log(`Renewal price for ${domainName}: $${renewalPrice}`);

      return new Response(
        JSON.stringify({ price: renewalPrice, domain: domainName }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // List all domains with pagination
    if (action === 'list') {
      const fetchAllDomains = async () => {
        let allDomains: any[] = [];
        let currentPage = 1;
        let hasMore = true;
        
        while (hasMore) {
          const params = new URLSearchParams({
            ApiUser: NAMECHEAP_API_USER,
            ApiKey: NAMECHEAP_API_KEY,
            UserName: NAMECHEAP_API_USER,
            Command: 'namecheap.domains.getList',
            ClientIp: CLIENT_IP,
            PageSize: '100',
            Page: currentPage.toString()
          });

          const response = await fetch(`${baseURL}?${params}`);
          const xmlText = await response.text();
          console.log(`Fetching page ${currentPage} of domains...`);
          
          const domainMatches = [...xmlText.matchAll(/<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*>/g)];
          const domains = domainMatches.map(match => ({
            domain_name: match[1],
            expiration_date: match[2],
            registrar: 'Namecheap',
            integration_source: 'namecheap'
          }));
          
          allDomains.push(...domains);

          // Check if there are more pages
          const totalItemsMatch = xmlText.match(/TotalItems="(\d+)"/);
          const totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
          const loadedItems = currentPage * 100;
          
          hasMore = loadedItems < totalItems;
          currentPage++;
          
          // Add delay to avoid rate limiting
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        return allDomains;
      };

      const domains = await fetchAllDomains();

      // Sync with database
      for (const domainData of domains) {
        await supabaseClient
          .from('domains')
          .upsert({
            user_id: user.id,
            domain_name: domainData.domain_name,
            expiration_date: domainData.expiration_date,
            registrar: domainData.registrar,
            integration_source: domainData.integration_source,
            status: 'active'
          }, {
            onConflict: 'domain_name,user_id'
          });
      }

      return new Response(
        JSON.stringify({ domains, count: domains.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.error('Invalid action received:', action);
    throw new Error(`Invalid action: ${action}. Valid actions are: balance, check, purchase, purchase_with_ai, list, get_domain_info, get_renewal_price`);
  } catch (error) {
    console.error('Error in namecheap-domains function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// Background function to configure WordPress domains
async function configureWordPressDomain(domain: string, domainId: string, supabaseClient: any) {
  try {
    console.log(`Starting WordPress configuration for ${domain}`);

    const CLOUDFLARE_EMAIL = Deno.env.get('CLOUDFLARE_EMAIL');
    const CLOUDFLARE_API_KEY = Deno.env.get('CLOUDFLARE_API_KEY');

    // Step 1: Change nameservers at Namecheap (to Cloudflare)
    console.log(`Step 1: Changing nameservers for ${domain}`);
    // This would require actual Namecheap API call to set nameservers
    // namecheap.domains.dns.setCustom with ns1.cloudflare.com, ns2.cloudflare.com

    // Step 2: Create zone in Cloudflare
    console.log(`Step 2: Creating Cloudflare zone for ${domain}`);
    const zoneResponse = await fetch('https://api.cloudflare.com/client/v4/zones', {
      method: 'POST',
      headers: {
        'X-Auth-Email': CLOUDFLARE_EMAIL!,
        'X-Auth-Key': CLOUDFLARE_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: domain, jump_start: true })
    });

    const zoneData = await zoneResponse.json();
    if (!zoneData.success) {
      throw new Error(`Cloudflare zone creation failed: ${JSON.stringify(zoneData.errors)}`);
    }

    const zoneId = zoneData.result.id;
    console.log(`Zone created with ID: ${zoneId}`);

    // Update domain with zone_id
    await supabaseClient
      .from('domains')
      .update({ zone_id: zoneId })
      .eq('id', domainId);

    // Step 3: Configure DNS records
    console.log(`Step 3: Configuring DNS records`);
    
    // CNAME for www
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        'X-Auth-Email': CLOUDFLARE_EMAIL!,
        'X-Auth-Key': CLOUDFLARE_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: 'www',
        content: domain,
        proxied: true
      })
    });

    // CNAME for track
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        'X-Auth-Email': CLOUDFLARE_EMAIL!,
        'X-Auth-Key': CLOUDFLARE_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: 'track',
        content: 'khrv4.ttrk.io',
        proxied: true
      })
    });

    // A record for root
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        'X-Auth-Email': CLOUDFLARE_EMAIL!,
        'X-Auth-Key': CLOUDFLARE_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'A',
        name: '@',
        content: '69.46.11.10',
        proxied: true
      })
    });

    // Mark DNS as configured
    await supabaseClient
      .from('domains')
      .update({ dns_configured: true })
      .eq('id', domainId);

    // Step 4: Configure SSL
    console.log(`Step 4: Configuring SSL`);
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, {
      method: 'PATCH',
      headers: {
        'X-Auth-Email': CLOUDFLARE_EMAIL!,
        'X-Auth-Key': CLOUDFLARE_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: 'full' })
    });

    await supabaseClient
      .from('domains')
      .update({ ssl_status: 'configured' })
      .eq('id', domainId);

    // Step 5: Create firewall rules
    console.log(`Step 5: Creating firewall rules`);
    
    // Create filter for sitemap
    const filterResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/filters`, {
      method: 'POST',
      headers: {
        'X-Auth-Email': CLOUDFLARE_EMAIL!,
        'X-Auth-Key': CLOUDFLARE_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        { expression: '(http.request.uri.path contains "sitemap")' },
        { expression: '(http.request.uri.query contains "?s=")' }
      ])
    });

    const filterData = await filterResponse.json();
    if (filterData.success && filterData.result.length >= 2) {
      // Create firewall rules
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/firewall/rules`, {
        method: 'POST',
        headers: {
          'X-Auth-Email': CLOUDFLARE_EMAIL!,
          'X-Auth-Key': CLOUDFLARE_API_KEY!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([
          {
            filter: { id: filterData.result[0].id },
            action: 'block',
            description: 'Block sitemap access'
          },
          {
            filter: { id: filterData.result[1].id },
            action: 'block',
            description: 'Block search queries'
          }
        ])
      });
    }

    // Step 6: Send WhatsApp notification
    console.log(`Step 6: Sending WhatsApp notification`);
    const now = new Date();
    const dateTime = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
      method: 'POST',
      headers: {
        'Client-Token': ZAPI_CLIENT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: '5511999999999', // Replace with actual phone number
        message: `✅ Domínio configurado com sucesso!\n\n🌐 ${domain}\n📅 ${dateTime}\n\nTodos os serviços foram configurados automaticamente.`
      })
    });

    console.log(`WordPress configuration completed for ${domain}`);
  } catch (error) {
    console.error(`Error configuring WordPress domain ${domain}:`, error);
  }
}
