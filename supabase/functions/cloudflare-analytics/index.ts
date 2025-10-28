import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { zoneId } = await req.json();
    
    const CLOUDFLARE_EMAIL = Deno.env.get('CLOUDFLARE_EMAIL');
    const CLOUDFLARE_API_KEY = Deno.env.get('CLOUDFLARE_API_KEY');
    
    if (!CLOUDFLARE_EMAIL || !CLOUDFLARE_API_KEY) {
      console.error('Cloudflare credentials not configured');
      throw new Error('Cloudflare credentials not configured');
    }
    
    if (!zoneId) {
      console.error('Zone ID is required');
      throw new Error('Zone ID is required');
    }

    // Calculate dates (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const dateGeq = thirtyDaysAgo.toISOString().split('T')[0];
    const dateLeq = now.toISOString().split('T')[0];

    const query = `
      query GetZoneAnalytics($zoneTag: string!, $date_geq: Date!, $date_leq: Date!) {
        viewer {
          zones(filter: {zoneTag: $zoneTag}) {
            httpRequestsAdaptiveGroups(limit: 1, filter: {date_geq: $date_geq, date_leq: $date_leq}) {
              sum {
                requests
                uniques
              }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'X-Auth-Email': CLOUDFLARE_EMAIL,
        'X-Auth-Key': CLOUDFLARE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          zoneTag: zoneId,
          date_geq: dateGeq,
          date_leq: dateLeq,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloudflare API error:', errorText);
      throw new Error(`Cloudflare API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Cloudflare analytics response:', JSON.stringify(data));

    const analytics = data.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]?.sum || {
      requests: 0,
      uniques: 0
    };

    return new Response(
      JSON.stringify({
        requests: analytics.requests || 0,
        uniqueVisitors: analytics.uniques || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in cloudflare-analytics function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
