import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MetricasInput {
  cantidad: number;
  capitalTotal: number;
  interesTotal: number;
  primerAhorroFecha: string | null;
  añosActivos: number;
  añoMasFuerte: { año: number; capital: number } | null;
  plazoPreferido: number | null;
  porAño: { año: number; capital: number; interes: number; cantidad: number }[];
}

const fmtMoneda = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v || 0);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const metricas = (await req.json()) as MetricasInput;

    if (!metricas || typeof metricas.cantidad !== "number") {
      return new Response(
        JSON.stringify({ error: "Métricas inválidas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Servicio de IA no configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resumenAños = metricas.porAño
      .map((a) => `${a.año}: ${a.cantidad} ahorros, capital ${fmtMoneda(a.capital)}, intereses ${fmtMoneda(a.interes)}`)
      .join("\n");

    const systemPrompt = `Eres un asistente financiero cálido de Mutual Celesol (Argentina). Generás un breve análisis personalizado del historial de ahorros de un socio. Tono mixto: arrancás cálido y celebratorio, cerrás con un dato concreto y analítico. Siempre en español rioplatense, usando "vos". Máximo 4 oraciones, sin emojis, sin saltos de línea, sin viñetas. No inventes datos, usá solo los provistos. No menciones tasas específicas ni recomiendes productos.`;

    const userPrompt = `Datos del socio:
- Total de ahorros cerrados: ${metricas.cantidad}
- Capital total invertido históricamente: ${fmtMoneda(metricas.capitalTotal)}
- Intereses totales generados: ${fmtMoneda(metricas.interesTotal)}
- Primer ahorro: ${metricas.primerAhorroFecha ?? "no disponible"}
- Años de actividad: ${metricas.añosActivos}
- Año más fuerte: ${metricas.añoMasFuerte ? `${metricas.añoMasFuerte.año} (${fmtMoneda(metricas.añoMasFuerte.capital)} de capital)` : "no disponible"}
- Plazo preferido (días): ${metricas.plazoPreferido ?? "no disponible"}

Detalle por año:
${resumenAños || "(sin datos por año)"}

Generá el insight ahora.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiadas solicitudes. Esperá un momento e intentá nuevamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "El servicio de IA no tiene créditos disponibles." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return new Response(
        JSON.stringify({ error: "No se pudo generar el análisis." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await aiRes.json();
    const insight = data?.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(
      JSON.stringify({ insight }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generar-insight-historico error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
