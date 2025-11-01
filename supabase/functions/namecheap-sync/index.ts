import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NAMECHEAP_API_KEY = Deno.env.get('NAMECHEAP_API_KEY');
const NAMECHEAP_API_USER = Deno.env.get('NAMECHEAP_API_USER');
const CLIENT_IP = '185.158.133.1'; // IP do servidor Namecheap

console.log('[Namecheap Sync] Function started');

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[Namecheap Sync] Processing sync request');

  try {
    if (!NAMECHEAP_API_KEY || !NAMECHEAP_API_USER) {
      throw new Error('Namecheap API credentials not configured');
    }

    // Criar cliente Supabase com service role key para operações de sistema
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const baseURL = 'https://api.namecheap.com/xml.response';
    const syncResults = {
      balanceUpdated: false,
      domainsUpdated: 0,
      errors: [] as string[],
      timestamp: new Date().toISOString(),
    };

    // ============================================================
    // 1. SINCRONIZAR SALDO DA CONTA
    // ============================================================
    console.log('[Namecheap Sync] Fetching account balance...');
    try {
      const balanceParams = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER!,
        ApiKey: NAMECHEAP_API_KEY!,
        UserName: NAMECHEAP_API_USER!,
        Command: 'namecheap.users.getBalances',
        ClientIp: CLIENT_IP
      });

      const balanceResponse = await fetch(`${baseURL}?${balanceParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      if (!balanceResponse.ok) {
        throw new Error(`Balance API error: ${balanceResponse.status}`);
      }

      const balanceXml = await balanceResponse.text();
      console.log('[Namecheap Sync] Balance XML:', balanceXml.substring(0, 500));

      // Parse balance - tentar múltiplos campos
      const availableBalanceMatch = balanceXml.match(/AvailableBalance="([^"]+)"/);
      const accountBalanceMatch = balanceXml.match(/AccountBalance="([^"]+)"/);
      
      let balanceUSD = 0;
      if (availableBalanceMatch) {
        balanceUSD = parseFloat(availableBalanceMatch[1]);
      } else if (accountBalanceMatch) {
        balanceUSD = parseFloat(accountBalanceMatch[1]);
      }

      const balanceBRL = balanceUSD * 5.70; // Conversão aproximada

      console.log('[Namecheap Sync] Parsed balance:', { balanceUSD, balanceBRL });

      // Obter todos os usuários do sistema para atualizar o saldo
      const { data: users, error: usersError } = await supabaseClient
        .from('profiles')
        .select('id');

      if (usersError) {
        throw usersError;
      }

      // Atualizar saldo para todos os usuários
      for (const user of users || []) {
        const { error: balanceError } = await supabaseClient
          .from('namecheap_balance')
          .upsert({
            user_id: user.id,
            balance_usd: balanceUSD,
            balance_brl: balanceBRL,
            last_synced_at: new Date().toISOString()
          }, { 
            onConflict: 'user_id',
            ignoreDuplicates: false 
          });

        if (balanceError) {
          console.error(`[Namecheap Sync] Error updating balance for user ${user.id}:`, balanceError);
          syncResults.errors.push(`Balance update failed for user ${user.id}: ${balanceError.message}`);
        }
      }

      syncResults.balanceUpdated = true;
      console.log('[Namecheap Sync] Balance updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Namecheap Sync] Balance sync error:', error);
      syncResults.errors.push(`Balance sync failed: ${errorMessage}`);
    }

    // ============================================================
    // 2. SINCRONIZAR DOMÍNIOS
    // ============================================================
    console.log('[Namecheap Sync] Fetching domains from Namecheap...');
    try {
      const allNamecheapDomains: Array<{
        name: string;
        expirationDate: string;
        isExpired: boolean;
        autoRenew: boolean;
        isLocked: boolean;
      }> = [];

      let currentPage = 1;
      let hasMore = true;

      // Buscar todas as páginas de domínios
      while (hasMore) {
        const domainsParams = new URLSearchParams({
          ApiUser: NAMECHEAP_API_USER!,
          ApiKey: NAMECHEAP_API_KEY!,
          UserName: NAMECHEAP_API_USER!,
          Command: 'namecheap.domains.getList',
          ClientIp: CLIENT_IP,
          PageSize: '100',
          Page: currentPage.toString()
        });

        const domainsResponse = await fetch(`${baseURL}?${domainsParams}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/xml',
          },
        });

        if (!domainsResponse.ok) {
          throw new Error(`Domains API error: ${domainsResponse.status}`);
        }

        const domainsXml = await domainsResponse.text();
        console.log(`[Namecheap Sync] Domains XML page ${currentPage}:`, domainsXml.substring(0, 300));

        // Parse domínios do XML
        const domainMatches = [...domainsXml.matchAll(/<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*IsLocked="([^"]*)"[^>]*AutoRenew="([^"]*)"[^>]*IsExpired="([^"]*)"[^>]*>/g)];
        
        const pageDomains = domainMatches.map(match => ({
          name: match[1],
          expirationDate: match[2],
          isLocked: match[3] === 'true',
          autoRenew: match[4] === 'true',
          isExpired: match[5] === 'true'
        }));

        allNamecheapDomains.push(...pageDomains);

        // Verificar se há mais páginas
        const totalItemsMatch = domainsXml.match(/TotalItems="(\d+)"/);
        const totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1]) : 0;
        const loadedItems = currentPage * 100;

        hasMore = loadedItems < totalItems;
        currentPage++;

        // Delay para evitar rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`[Namecheap Sync] Found ${allNamecheapDomains.length} domains in Namecheap`);

      // Buscar domínios existentes no banco
      const { data: existingDomains, error: existingError } = await supabaseClient
        .from('domains')
        .select('domain_name, id, status, expiration_date, auto_renew, user_id')
        .eq('integration_source', 'namecheap');

      if (existingError) {
        throw existingError;
      }

      const existingDomainMap = new Map(
        (existingDomains || []).map(d => [d.domain_name, d])
      );

      console.log(`[Namecheap Sync] Found ${existingDomainMap.size} domains in database`);

      // Processar cada domínio da Namecheap
      for (const ncDomain of allNamecheapDomains) {
        try {
          const existingDomain = existingDomainMap.get(ncDomain.name);

          // Determinar status do domínio
          let status = 'active';
          if (ncDomain.isExpired) {
            status = 'expired';
          } else {
            const expDate = new Date(ncDomain.expirationDate);
            const now = new Date();
            const daysUntilExpiry = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysUntilExpiry <= 0) {
              status = 'expired';
            } else if (daysUntilExpiry <= 7) {
              status = 'expiring';
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
                .from('domains')
                .update({
                  status,
                  expiration_date: ncDomain.expirationDate,
                  auto_renew: ncDomain.autoRenew,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingDomain.id);

              if (updateError) {
                console.error(`[Namecheap Sync] Error updating domain ${ncDomain.name}:`, updateError);
                syncResults.errors.push(`Failed to update ${ncDomain.name}: ${updateError.message}`);
              } else {
                syncResults.domainsUpdated++;
                console.log(`[Namecheap Sync] Updated domain: ${ncDomain.name}`);

                // Registrar log de atividade da mudança de status
                if (existingDomain.status !== status) {
                  await supabaseClient
                    .from('domain_activity_logs')
                    .insert({
                      domain_id: existingDomain.id,
                      user_id: existingDomain.user_id || '00000000-0000-0000-0000-000000000000',
                      action_type: 'status_changed',
                      old_value: existingDomain.status,
                      new_value: status
                    })
                    .select()
                    .single();
                }
              }
            }
          } else {
            // Novo domínio detectado - não inserir automaticamente
            // Apenas logar para análise manual
            console.log(`[Namecheap Sync] New domain detected in Namecheap: ${ncDomain.name}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Namecheap Sync] Error processing domain ${ncDomain.name}:`, error);
          syncResults.errors.push(`Failed to process ${ncDomain.name}: ${errorMessage}`);
        }
      }

      console.log('[Namecheap Sync] Domain sync completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Namecheap Sync] Domain sync error:', error);
      syncResults.errors.push(`Domain sync failed: ${errorMessage}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Namecheap Sync] Sync completed in ${duration}ms`);
    console.log('[Namecheap Sync] Results:', syncResults);

    return new Response(
      JSON.stringify({
        success: true,
        results: syncResults,
        duration: `${duration}ms`
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Namecheap Sync] Fatal error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
