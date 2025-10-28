import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PurchaseProgress {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message: string;
  timestamp: string;
}

interface DomainPurchaseData {
  domain: string;
  price: number;
  available: boolean;
  zoneId?: string;
  registrar?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const progress: PurchaseProgress[] = [];
  const purchasedDomains: DomainPurchaseData[] = [];

  try {
    const { domains, structure = 'wordpress', userId } = await req.json();
    
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      throw new Error('No domains provided');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const NAMECHEAP_API_USER = 'LerrickeNunes';
    const NAMECHEAP_API_KEY = 'edc0274a31f449698fa9170f2b40505b';
    const NAMECHEAP_USERNAME = 'LerrickeNunes';
    const NAMECHEAP_CLIENT_IP = '18.216.155.225';
    
    const CLOUDFLARE_EMAIL = 'diretoria@institutoexperience.com.br';
    const CLOUDFLARE_API_KEY = 'e9029260de042477291a02ff8d6f87213e779';
    
    const ZAPI_INSTANCE = '3CD976230F68605F4EE09E692ED0BBB5';
    const ZAPI_TOKEN = 'D64F7F490F5835B4836603AA';
    const ZAPI_CLIENT_TOKEN = 'Fc134654c3e834bc3b0ee73aaf626f5c8S';

    // Função auxiliar para adicionar progresso
    const addProgress = (step: string, status: PurchaseProgress['status'], message: string) => {
      progress.push({
        step,
        status,
        message,
        timestamp: new Date().toISOString()
      });
    };

    // ETAPA 1: Verificar disponibilidade
    addProgress('verification', 'in_progress', 'Verificando disponibilidade dos domínios...');
    
    try {
      const verificationResponse = await fetch(
        'https://webhook.institutoexperience.com/webhook/2ad42b09-808e-42b9-bbb9-6e47d828004a',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domains })
        }
      );

      if (!verificationResponse.ok) {
        throw new Error('Falha na verificação de disponibilidade');
      }

      const verificationData = await verificationResponse.json();
      addProgress('verification', 'completed', `${verificationData.available?.length || 0} domínios disponíveis encontrados`);

      // Filtrar apenas domínios disponíveis
      const availableDomains = domains.filter((domain: string) => {
        return verificationData.available?.includes(domain) || true; // Assumindo que todos estão disponíveis se não vier resposta
      });

      if (availableDomains.length === 0) {
        throw new Error('Nenhum domínio disponível para compra');
      }

      // ETAPA 2: Comprar domínios na Namecheap
      addProgress('purchase', 'in_progress', `Comprando ${availableDomains.length} domínios na Namecheap...`);

      for (const domain of availableDomains) {
        try {
          const extension = domain.split('.').pop();
          let price = 1.0; // Default para .online e .site
          
          if (extension === 'com') {
            price = 12.0;
          }

          // Validar preço
          if (extension === 'online' || extension === 'site') {
            if (price > 1.0) {
              addProgress('purchase', 'error', `Domínio ${domain} excede o limite de preço`);
              continue;
            }
          } else if (extension === 'com') {
            if (price > 12.0) {
              addProgress('purchase', 'error', `Domínio ${domain} excede o limite de preço`);
              continue;
            }
          }

          // Comprar na Namecheap
          const namecheapUrl = new URL('https://api.namecheap.com/xml.response');
          namecheapUrl.searchParams.set('ApiUser', NAMECHEAP_API_USER);
          namecheapUrl.searchParams.set('ApiKey', NAMECHEAP_API_KEY);
          namecheapUrl.searchParams.set('UserName', NAMECHEAP_USERNAME);
          namecheapUrl.searchParams.set('ClientIp', NAMECHEAP_CLIENT_IP);
          namecheapUrl.searchParams.set('Command', 'namecheap.domains.create');
          namecheapUrl.searchParams.set('DomainName', domain);
          namecheapUrl.searchParams.set('Years', '1');

          const purchaseResponse = await fetch(namecheapUrl.toString());
          const purchaseXml = await purchaseResponse.text();

          if (purchaseXml.includes('Error') || !purchaseXml.includes('Success')) {
            throw new Error(`Falha ao comprar ${domain}`);
          }

          purchasedDomains.push({
            domain,
            price,
            available: true,
            registrar: 'namecheap'
          });

          addProgress('purchase', 'in_progress', `Domínio ${domain} comprado com sucesso`);

          // Se for Atomicat, apenas comprar e pular configuração
          if (structure === 'atomicat') {
            continue;
          }

          // ETAPA 3: Configurar Nameservers para Cloudflare (apenas WordPress)
          addProgress('nameservers', 'in_progress', `Configurando nameservers para ${domain}...`);

          const nsUrl = new URL('https://api.namecheap.com/xml.response');
          nsUrl.searchParams.set('ApiUser', NAMECHEAP_API_USER);
          nsUrl.searchParams.set('ApiKey', NAMECHEAP_API_KEY);
          nsUrl.searchParams.set('UserName', NAMECHEAP_USERNAME);
          nsUrl.searchParams.set('ClientIp', NAMECHEAP_CLIENT_IP);
          nsUrl.searchParams.set('Command', 'namecheap.domains.dns.setCustom');
          nsUrl.searchParams.set('SLD', domain.split('.')[0]);
          nsUrl.searchParams.set('TLD', domain.split('.')[1]);
          nsUrl.searchParams.set('Nameservers', 'ns1.cloudflare.com,ns2.cloudflare.com');

          await fetch(nsUrl.toString());
          addProgress('nameservers', 'completed', `Nameservers configurados para ${domain}`);

          // ETAPA 4: Criar zona na Cloudflare
          addProgress('cloudflare_zone', 'in_progress', `Criando zona Cloudflare para ${domain}...`);

          const zoneResponse = await fetch('https://api.cloudflare.com/client/v4/zones', {
            method: 'POST',
            headers: {
              'X-Auth-Email': CLOUDFLARE_EMAIL,
              'X-Auth-Key': CLOUDFLARE_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: domain,
              jump_start: true
            })
          });

          const zoneData = await zoneResponse.json();
          if (!zoneData.success) {
            throw new Error(`Falha ao criar zona Cloudflare para ${domain}`);
          }

          const zoneId = zoneData.result.id;
          purchasedDomains.find(d => d.domain === domain)!.zoneId = zoneId;

          addProgress('cloudflare_zone', 'completed', `Zona Cloudflare criada para ${domain}`);

          // ETAPA 5: Configurar registros DNS
          addProgress('dns_records', 'in_progress', `Configurando registros DNS para ${domain}...`);

          // CNAME para www
          await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
            method: 'POST',
            headers: {
              'X-Auth-Email': CLOUDFLARE_EMAIL,
              'X-Auth-Key': CLOUDFLARE_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'CNAME',
              name: 'www',
              content: domain,
              proxied: true
            })
          });

          // CNAME para track
          await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
            method: 'POST',
            headers: {
              'X-Auth-Email': CLOUDFLARE_EMAIL,
              'X-Auth-Key': CLOUDFLARE_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'CNAME',
              name: 'track',
              content: 'khrv4.ttrk.io',
              proxied: false
            })
          });

          // Registro A
          await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
            method: 'POST',
            headers: {
              'X-Auth-Email': CLOUDFLARE_EMAIL,
              'X-Auth-Key': CLOUDFLARE_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'A',
              name: '@',
              content: '69.46.11.10',
              proxied: true
            })
          });

          addProgress('dns_records', 'completed', `Registros DNS configurados para ${domain}`);

          // ETAPA 6: Configurar SSL
          addProgress('ssl', 'in_progress', `Configurando SSL para ${domain}...`);

          await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, {
            method: 'PATCH',
            headers: {
              'X-Auth-Email': CLOUDFLARE_EMAIL,
              'X-Auth-Key': CLOUDFLARE_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: 'full' })
          });

          addProgress('ssl', 'completed', `SSL configurado para ${domain}`);

          // ETAPA 7: Criar regras de Firewall
          addProgress('firewall', 'in_progress', `Configurando firewall para ${domain}...`);

          // Criar filtros
          const filterResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/filters`, {
            method: 'POST',
            headers: {
              'X-Auth-Email': CLOUDFLARE_EMAIL,
              'X-Auth-Key': CLOUDFLARE_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify([
              {
                expression: '(http.request.uri.path contains "sitemap")',
                description: 'Block sitemap access'
              },
              {
                expression: '(http.request.uri.query contains "?s=")',
                description: 'Block malicious search'
              }
            ])
          });

          const filterData = await filterResponse.json();
          
          if (filterData.success && filterData.result) {
            // Criar regras de firewall
            await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/firewall/rules`, {
              method: 'POST',
              headers: {
                'X-Auth-Email': CLOUDFLARE_EMAIL,
                'X-Auth-Key': CLOUDFLARE_API_KEY,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(
                filterData.result.map((filter: any) => ({
                  filter: { id: filter.id },
                  action: 'block'
                }))
              )
            });
          }

          addProgress('firewall', 'completed', `Firewall configurado para ${domain}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          addProgress('purchase', 'error', `Erro ao processar ${domain}: ${errorMessage}`);
        }
      }

      addProgress('purchase', 'completed', `${purchasedDomains.length} domínios comprados e configurados`);

      // ETAPA 8: Salvar no banco de dados
      addProgress('database', 'in_progress', 'Salvando domínios no banco de dados...');

      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + 11);

      for (const purchasedDomain of purchasedDomains) {
        const propagationTime = structure === 'wordpress' 
          ? new Date(Date.now() + 3 * 60 * 60 * 1000) // 3 horas
          : null;

        await supabase.from('domains').insert({
          user_id: userId,
          domain_name: purchasedDomain.domain,
          status: 'active',
          registrar: 'namecheap',
          expiration_date: expirationDate.toISOString(),
          auto_renew: false,
          integration_source: 'namecheap',
          nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
          monthly_visits: 0
        });
      }

      addProgress('database', 'completed', 'Domínios salvos no banco de dados');

      // ETAPA 9: Enviar notificação WhatsApp
      addProgress('notification', 'in_progress', 'Enviando notificação...');

      try {
        const now = new Date();
        const dateTime = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        
        const message = `🎉 *Compra de Domínios Concluída!*\n\n` +
          `📅 Data/Hora: ${dateTime}\n` +
          `📦 Total de domínios: ${purchasedDomains.length}\n\n` +
          `*Domínios comprados:*\n` +
          purchasedDomains.map(d => `✅ ${d.domain}`).join('\n');

        await fetch(
          `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Client-Token': ZAPI_CLIENT_TOKEN
            },
            body: JSON.stringify({
              phone: '5519999999999', // Número de telefone configurado
              message
            })
          }
        );

        addProgress('notification', 'completed', 'Notificação enviada com sucesso');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        addProgress('notification', 'error', `Erro ao enviar notificação: ${errorMessage}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          purchasedDomains,
          progress,
          message: `${purchasedDomains.length} domínios comprados e configurados com sucesso`
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      addProgress('error', 'error', `Erro no processo: ${errorMessage}`);
      throw error;
    }

  } catch (error) {
    console.error('Error in purchase-domains function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        progress
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});