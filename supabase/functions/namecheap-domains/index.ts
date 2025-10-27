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
    const { action, domain } = await req.json();
    
    const NAMECHEAP_API_KEY = Deno.env.get('NAMECHEAP_API_KEY');
    const NAMECHEAP_API_USER = Deno.env.get('NAMECHEAP_API_USER');
    
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
    
    if (action === 'check') {
      // Check domain availability
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: 'namecheap.domains.check',
        ClientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
        DomainList: domain
      });

      const response = await fetch(`${baseURL}?${params}`);
      const xmlText = await response.text();
      
      // Parse XML response
      const isAvailable = xmlText.includes('Available="true"');
      
      return new Response(
        JSON.stringify({ 
          available: isAvailable,
          domain,
          message: isAvailable ? 'Domain is available!' : 'Domain is already registered'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list') {
      // List user domains from Namecheap
      const params = new URLSearchParams({
        ApiUser: NAMECHEAP_API_USER,
        ApiKey: NAMECHEAP_API_KEY,
        UserName: NAMECHEAP_API_USER,
        Command: 'namecheap.domains.getList',
        ClientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
        PageSize: '100'
      });

      const response = await fetch(`${baseURL}?${params}`);
      const xmlText = await response.text();
      
      // Parse XML and extract domains
      const domainMatches = xmlText.matchAll(/<Domain[^>]*Name="([^"]+)"[^>]*Expires="([^"]+)"[^>]*>/g);
      const domains = [];
      
      for (const match of domainMatches) {
        domains.push({
          domain_name: match[1],
          expiration_date: match[2],
          registrar: 'Namecheap',
          integration_source: 'namecheap'
        });
      }

      // Sync with database
      for (const domainData of domains) {
        const { error } = await supabaseClient
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

        if (error) {
          console.error('Error syncing domain:', error);
        }
      }

      return new Response(
        JSON.stringify({ domains, count: domains.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
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
