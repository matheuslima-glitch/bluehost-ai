import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { zoneId } = await req.json();

    const CLOUDFLARE_EMAIL = Deno.env.get("CLOUDFLARE_EMAIL");
    const CLOUDFLARE_API_KEY = Deno.env.get("CLOUDFLARE_API_KEY");

    if (!CLOUDFLARE_EMAIL || !CLOUDFLARE_API_KEY) {
      console.error("Cloudflare credentials not configured");
      throw new Error("Cloudflare credentials not configured");
    }

    if (!zoneId) {
      console.error("Zone ID is required");
      throw new Error("Zone ID is required");
    }

    console.log(`[Cloudflare Analytics] Fetching analytics for zone: ${zoneId}`);

    // Calculate dates (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Format dates as YYYY-MM-DD
    const dateStart = thirtyDaysAgo.toISOString().split("T")[0];
    const dateEnd = now.toISOString().split("T")[0];

    // Usar a API REST v4 ao invés de GraphQL para maior confiabilidade
    const analyticsUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/analytics/dashboard`;

    // Parâmetros da query
    const params = new URLSearchParams({
      since: dateStart,
      until: dateEnd,
      continuous: "false",
    });

    console.log(`[Cloudflare Analytics] Fetching from: ${analyticsUrl}?${params}`);

    const response = await fetch(`${analyticsUrl}?${params}`, {
      method: "GET",
      headers: {
        "X-Auth-Email": CLOUDFLARE_EMAIL,
        "X-Auth-Key": CLOUDFLARE_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cloudflare API error:", errorText);

      // Se falhar, tentar método alternativo com GraphQL
      console.log("[Cloudflare Analytics] Fallback to GraphQL...");

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

      const graphqlResponse = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: {
          "X-Auth-Email": CLOUDFLARE_EMAIL,
          "X-Auth-Key": CLOUDFLARE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            zoneTag: zoneId,
            date_geq: dateStart,
            date_leq: dateEnd,
          },
        }),
      });

      if (graphqlResponse.ok) {
        const graphqlData = await graphqlResponse.json();
        console.log("[Cloudflare Analytics] GraphQL response:", JSON.stringify(graphqlData));

        const analytics = graphqlData.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]?.sum || {
          requests: 0,
          uniques: 0,
        };

        return new Response(
          JSON.stringify({
            requests: analytics.requests || 0,
            uniqueVisitors: analytics.uniques || 0,
            period: `${dateStart} to ${dateEnd}`,
            source: "graphql",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Cloudflare API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("[Cloudflare Analytics] REST API response:", JSON.stringify(data));

    // Parse response from REST API
    let totalRequests = 0;
    let totalUniques = 0;

    if (data.success && data.result) {
      // Somar todos os dados do período
      if (data.result.totals) {
        totalRequests = data.result.totals.requests?.all || 0;
        totalUniques = data.result.totals.uniques?.all || 0;
      }

      // Se não tiver totals, somar dos timeseries
      if (totalRequests === 0 && data.result.timeseries) {
        data.result.timeseries.forEach((entry: any) => {
          totalRequests += entry.requests?.all || 0;
          totalUniques += entry.uniques?.all || 0;
        });
      }
    }

    console.log(`[Cloudflare Analytics] Total requests: ${totalRequests}, Total uniques: ${totalUniques}`);

    // Se ainda não tiver dados, tentar endpoint alternativo
    if (totalRequests === 0) {
      console.log("[Cloudflare Analytics] Trying alternative endpoint...");

      // Tentar endpoint de traffic analytics
      const trafficUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/analytics/events`;
      const trafficParams = new URLSearchParams({
        since: dateStart + "T00:00:00Z",
        until: dateEnd + "T23:59:59Z",
        limit: "1000",
      });

      const trafficResponse = await fetch(`${trafficUrl}?${trafficParams}`, {
        method: "GET",
        headers: {
          "X-Auth-Email": CLOUDFLARE_EMAIL,
          "X-Auth-Key": CLOUDFLARE_API_KEY,
          "Content-Type": "application/json",
        },
      });

      if (trafficResponse.ok) {
        const trafficData = await trafficResponse.json();
        if (trafficData.success && trafficData.result) {
          // Contar eventos como requests
          totalRequests = trafficData.result.length || 0;
          // Estimar únicos baseado em IPs únicos se disponível
          const uniqueIps = new Set(trafficData.result.map((e: any) => e.clientIP).filter(Boolean));
          totalUniques = uniqueIps.size || Math.floor(totalRequests * 0.7); // Estimativa se não tiver IPs
        }
      }
    }

    return new Response(
      JSON.stringify({
        requests: totalRequests,
        uniqueVisitors: totalUniques,
        period: `${dateStart} to ${dateEnd}`,
        source: "rest-api",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[Cloudflare Analytics] Error:", error);

    // Retornar valores de exemplo se tudo falhar (para não quebrar a UI)
    return new Response(
      JSON.stringify({
        requests: 0,
        uniqueVisitors: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        note: "Analytics data temporarily unavailable",
      }),
      {
        status: 200, // Retornar 200 para não quebrar a UI
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
