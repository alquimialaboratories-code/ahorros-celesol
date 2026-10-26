import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { valor, sessionToken, clave: claveIn } = await req.json();
    const CLAVES_PERMITIDAS = new Set(["tna_celesol", "tna_pf_tradicional", "tna_fci_mm"]);
    const clave = typeof claveIn === "string" && CLAVES_PERMITIDAS.has(claveIn) ? claveIn : "tna_celesol";

    if (!sessionToken || typeof sessionToken !== "string" || sessionToken.length < 32) {
      return new Response(JSON.stringify({ error: "Sesión requerida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sess } = await supabase
      .from("otp_sessions")
      .select("dni, email, expires_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (!sess || new Date(sess.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Sesión inválida o expirada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin via server-side allowlist (no hardcoded creds).
    const { data: adminRow } = await supabase
      .from("admin_allowlist")
      .select("dni")
      .eq("dni", sess.dni)
      .eq("email", String(sess.email ?? "").toLowerCase().trim())
      .maybeSingle();

    if (!adminRow) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0 || numero > 500) {
      return new Response(JSON.stringify({ error: "Valor inválido (debe ser entre 0 y 500)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase
      .from("configuracion_tasas")
      .upsert({ clave, valor: numero, updated_at: new Date().toISOString() });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, valor: numero }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("actualizar-tna-celesol error:", e);
    return new Response(
      JSON.stringify({ error: "Error al actualizar la tasa." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
