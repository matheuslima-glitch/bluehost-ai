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
    const { keywords, quantity = 5, language = 'portuguese', structure, niche } = await req.json();
    
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const languageMap: Record<string, string> = {
      'portuguese': 'Português',
      'english': 'Inglês',
      'spanish': 'Espanhol'
    };

    const prompt = `Olá, preciso de ${quantity} domínios do nicho ${niche || keywords} e no idioma ${languageMap[language]}. Me dê eles em .online

- Lembre-se de SEMPRE usar .online
- Lembre-se de NUNCA usar acentos.
- Lembre-se de NUNCA usar traços.
- Retorne APENAS um objeto JSON válido no seguinte formato, sem nenhum texto adicional:
{
  "domains": [
    "primeirodominio.online",
    "segundodominio.online"
  ]
}`;

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini AI error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Gemini AI error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Gemini AI response:', JSON.stringify(data));
    
    if (!data.candidates || data.candidates.length === 0) {
      console.error('No candidates in response:', data);
      throw new Error('Failed to generate suggestions - no candidates returned');
    }

    if (!data.candidates[0].content || !data.candidates[0].content.parts || data.candidates[0].content.parts.length === 0) {
      console.error('Invalid response structure:', data);
      throw new Error('Failed to generate suggestions - invalid response structure');
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    console.log('Raw text response:', textResponse);
    
    // Try to extract JSON from the response
    let domains = [];
    try {
      // Remove markdown code blocks if present
      const jsonText = textResponse.replace(/```json\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      domains = parsed.domains || [];
    } catch (parseError) {
      console.error('Failed to parse JSON, falling back to line extraction:', parseError);
      // Fallback: extract .online domains from text
      domains = textResponse
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.includes('.online'))
        .map((line: string) => {
          // Extract just the domain.online part
          const match = line.match(/([a-z0-9]+\.online)/i);
          return match ? match[1].toLowerCase() : null;
        })
        .filter((domain: string | null): domain is string => domain !== null)
        .slice(0, quantity);
    }

    if (domains.length === 0) {
      throw new Error('No valid domains generated');
    }

    return new Response(
      JSON.stringify({ domains }),
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