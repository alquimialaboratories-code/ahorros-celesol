import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EDNA_URL = "https://app.edna.io/api/v1/out-messages/whatsapp/template";
// Destino fijo: +54 3541 518245 → formato internacional E.164 sin '+'.
// Para móviles argentinos WhatsApp requiere el '9' entre el código de país (54) y el área.
const DESTINO_WA = "5493512271059";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get("INTERNAL_FN_SECRET");
    const providedSecret = req.headers.get("x-internal-secret");
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "No autorizado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("EDNA_API_KEY");
    const sender = Deno.env.get("EDNA_SENDER"); // ej: "5493513105768_WA"
    const subjectRaw = Deno.env.get("EDNA_SUBJECT_ID"); // ej: "2580"
    const templateIdRaw = Deno.env.get("EDNA_TEMPLATE_ID");

    if (!apiKey || !sender || !templateIdRaw) {
      console.error("Faltan secretos de Edna (EDNA_API_KEY/EDNA_SENDER/EDNA_TEMPLATE_ID)");
      return new Response(
        JSON.stringify({ error: "Configuración de Edna incompleta." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const templateId = Number(templateIdRaw);
    if (!Number.isFinite(templateId)) {
      return new Response(
        JSON.stringify({ error: "EDNA_TEMPLATE_ID inválido." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const subjectId = subjectRaw ? Number(subjectRaw) : undefined;

    const body = await req.json();
    const {
      solicitante,       // { nombre, dni, email }
      cuentaId,
      titularNombre,
      titularDni,
      opcion,
      opcionDetalle,
    } = body || {};

    // Si la renovación es de un cliente a cargo (productor), el "cliente" es el titular.
    const clienteNombre = String(titularNombre || solicitante?.nombre || "").trim();
    const clienteDni = String(titularDni || solicitante?.dni || "").trim();
    const clienteEmail = String(solicitante?.email || "").trim();
    const accion = opcion === "Otros" && opcionDetalle
      ? `Otros: ${opcionDetalle}`
      : String(opcion || "Renovación Total");
    const nroCuenta = String(cuentaId || "");

    // Plantilla: {{1}} nombre, {{2}} acción, {{3}} DNI, {{4}} cuenta, {{5}} email
    const textVariables = [clienteNombre, accion, clienteDni, nroCuenta, clienteEmail];

    const payload: Record<string, unknown> = {
      messageId: crypto.randomUUID(),
      sender,
      phone: DESTINO_WA,
      templateId,
      textVariables,
    };
    if (subjectId !== undefined && Number.isFinite(subjectId)) {
      payload.subject = subjectId;
    }

    console.log("Edna payload:", JSON.stringify(payload));

    const resp = await fetch(EDNA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const respText = await resp.text();
    if (!resp.ok) {
      console.error(`Edna ${resp.status}: ${respText}`);
      return new Response(
        JSON.stringify({ error: `Edna respondió ${resp.status}`, detail: respText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Edna OK:", respText);
    return new Response(
      JSON.stringify({ success: true, edna: respText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enviar-renovacion-whatsapp error:", e);
    const message = e instanceof Error ? e.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
