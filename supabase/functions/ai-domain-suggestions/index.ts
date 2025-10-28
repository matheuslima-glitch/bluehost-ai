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
    const { keywords, quantity = 5, language = 'portuguese', structure } = await req.json();
    
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const languageMap: Record<string, string> = {
      'portuguese': 'português',
      'english': 'English',
      'spanish': 'español'
    };

    const prompt = `Gere ${quantity} sugestões de domínio para o nicho "${keywords}" em ${languageMap[language]}. Use extensões .com, .site ou .online. Retorne apenas os domínios, um por linha.`;

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
    
    const suggestions = textResponse
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => 
        line && (line.includes('.com') || line.includes('.site') || line.includes('.online'))
      )
      .slice(0, quantity);

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
