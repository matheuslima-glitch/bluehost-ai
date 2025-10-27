import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();
    
    const CPANEL_API_TOKEN = Deno.env.get('CPANEL_API_TOKEN');
    const CPANEL_URL = Deno.env.get('CPANEL_URL');
    const CPANEL_USERNAME = Deno.env.get('CPANEL_USERNAME');
    
    if (!CPANEL_API_TOKEN || !CPANEL_URL || !CPANEL_USERNAME) {
      throw new Error('cPanel API credentials not configured');
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

    const headers = {
      'Authorization': `cpanel ${CPANEL_USERNAME}:${CPANEL_API_TOKEN}`,
      'Content-Type': 'application/json'
    };

    if (action === 'domains') {
      // List domains from cPanel
      const response = await fetch(
        `${CPANEL_URL}/execute/DomainInfo/list_domains`,
        { headers }
      );

      const data = await response.json();
      
      if (!data.status) {
        throw new Error('Failed to fetch cPanel domains');
      }

      const domains = data.data.main_domain ? [
        {
          domain_name: data.data.main_domain,
          registrar: 'cPanel',
          integration_source: 'cpanel',
          status: 'active'
        },
        ...data.data.addon_domains.map((domain: string) => ({
          domain_name: domain,
          registrar: 'cPanel',
          integration_source: 'cpanel',
          status: 'active'
        })),
        ...data.data.sub_domains.map((domain: string) => ({
          domain_name: domain,
          registrar: 'cPanel',
          integration_source: 'cpanel',
          status: 'active'
        }))
      ] : [];

      // Sync with database
      for (const domainData of domains) {
        const { error } = await supabaseClient
          .from('domains')
          .upsert({
            user_id: user.id,
            domain_name: domainData.domain_name,
            registrar: domainData.registrar,
            integration_source: domainData.integration_source,
            status: domainData.status
          }, {
            onConflict: 'domain_name,user_id'
          });

        if (error) {
          console.error('Error syncing domain:', error);
        }
      }

      return new Response(
        JSON.stringify({ domains, count: domains.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'bandwidth') {
      // Get bandwidth statistics
      const response = await fetch(
        `${CPANEL_URL}/execute/Bandwidth/get_retention_periods`,
        { headers }
      );

      const data = await response.json();
      
      return new Response(
        JSON.stringify(data.data || {}),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('Error in cpanel-integration function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
