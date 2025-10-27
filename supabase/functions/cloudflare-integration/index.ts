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
    
    const CLOUDFLARE_EMAIL = Deno.env.get('CLOUDFLARE_EMAIL');
    const CLOUDFLARE_API_KEY = Deno.env.get('CLOUDFLARE_API_KEY');
    
    if (!CLOUDFLARE_EMAIL || !CLOUDFLARE_API_KEY) {
      throw new Error('Cloudflare API credentials not configured');
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
      'X-Auth-Email': CLOUDFLARE_EMAIL,
      'X-Auth-Key': CLOUDFLARE_API_KEY,
      'Content-Type': 'application/json'
    };

    if (action === 'zones') {
      // List all zones (domains) in Cloudflare
      const response = await fetch('https://api.cloudflare.com/client/v4/zones', {
        headers
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Failed to fetch Cloudflare zones');
      }

      const zones = data.result.map((zone: any) => ({
        domain_name: zone.name,
        status: zone.status === 'active' ? 'active' : 'suspended',
        registrar: 'Cloudflare',
        integration_source: 'cloudflare',
        nameservers: zone.name_servers
      }));

      // Sync with database
      for (const zoneData of zones) {
        const { error } = await supabaseClient
          .from('domains')
          .upsert({
            user_id: user.id,
            domain_name: zoneData.domain_name,
            status: zoneData.status,
            registrar: zoneData.registrar,
            integration_source: zoneData.integration_source,
            nameservers: zoneData.nameservers
          }, {
            onConflict: 'domain_name,user_id'
          });

        if (error) {
          console.error('Error syncing zone:', error);
        }
      }

      return new Response(
        JSON.stringify({ zones, count: zones.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'analytics') {
      // Get analytics data from Cloudflare
      const { zoneId } = await req.json();
      
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/analytics/dashboard?since=${since}`,
        { headers }
      );

      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Failed to fetch analytics');
      }

      return new Response(
        JSON.stringify(data.result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('Error in cloudflare-integration function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
