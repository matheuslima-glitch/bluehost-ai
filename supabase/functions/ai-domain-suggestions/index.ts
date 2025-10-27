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
    const { keywords } = await req.json();
    
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const prompt = `Generate 10 creative, short, and memorable domain name suggestions based on these keywords: "${keywords}". 
    
    Rules:
    - Each domain should be between 5-15 characters
    - Include only .com extensions
    - Be creative but professional
    - Easy to remember and type
    - No hyphens or numbers unless absolutely necessary
    - Consider combining words, using prefixes/suffixes
    
    Return ONLY a JSON array of domain names, nothing else. Format: ["domain1.com", "domain2.com", ...]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      }
    );

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0]) {
      throw new Error('Failed to generate suggestions');
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    
    // Try to parse JSON from response
    let suggestions = [];
    try {
      // Extract JSON array from response (might be wrapped in markdown code blocks)
      const jsonMatch = textResponse.match(/\[.*\]/s);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: extract domain-like strings
        const domainMatches = textResponse.match(/[\w-]+\.com/g);
        suggestions = domainMatches || [];
      }
    } catch (e) {
      console.error('Failed to parse suggestions:', e);
      suggestions = [];
    }

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ai-domain-suggestions function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
