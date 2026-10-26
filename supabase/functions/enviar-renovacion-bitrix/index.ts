import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Webhook de prueba Bitrix24 (mismo del ejemplo bitrixWebhook.js)
const BITRIX_WEBHOOK_URL =
  "https://redunisol.bitrix24.es/rest/82889/it8qz7q807lwywc3/im.notify.personal.add.json";
const BITRIX_USER_ID = 7;

const fmtMoneda = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(v || 0);

const parseLocalDate = (f: string): Date => {
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(f);
};

const fmtFecha = (f?: string) => {
  if (!f) return "-";
  try {
    return parseLocalDate(f).toLocaleDateString("es-AR");
  } catch {
    return String(f);
  }
};

const fmtPorcentaje = (p?: string | number) => {
  if (p === undefined || p === null || p === "") return "-";
  const n = parseFloat(String(p));
  if (isNaN(n)) return "-";
  return (n * 100).toFixed(2) + "%";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const { solicitante, cuentaId, titularNombre, titularDni, ahorro, opcion, opcionDetalle } =
      await req.json();

    if (!solicitante?.nombre || !solicitante?.dni || !cuentaId) {
      return new Response(JSON.stringify({ error: "Datos insuficientes." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const capital = Number(ahorro?.capital) || 0;
    const interes = Number(ahorro?.interes) || 0;
    const total = capital + interes;
    const fechaSolicitud = new Date().toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    });

    const opcionLabel = opcion || "Renovación Total";
    const opcionDetalleLinea =
      opcion === "Otros" && opcionDetalle ? `\nDetalle: ${opcionDetalle}` : "";
    const titularLinea = titularNombre
      ? `Titular: ${titularNombre}${titularDni ? ` (DNI ${titularDni})` : ""}`
      : "El solicitante es el titular del ahorro.";

    // Bitrix usa BBCode para formato en notificaciones
    const message =
      `[B]🔔 Solicitud de Renovación de Ahorro Celesol[/B]\n` +
      `[B]Acción solicitada:[/B] ${opcionLabel}${opcionDetalleLinea}\n\n` +
      `[B]Solicitante[/B]\n` +
      `Nombre: ${solicitante.nombre}\n` +
      `DNI: ${solicitante.dni}\n` +
      `Email: ${solicitante.email || "-"}\n` +
      `${titularLinea}\n\n` +
      `[B]Ahorro a renovar[/B]\n` +
      `Nro de cuenta: #${cuentaId}\n` +
      `Emisión: ${fmtFecha(ahorro?.emision)}\n` +
      `Plazo: ${ahorro?.plazo ? `${ahorro.plazo} días` : "-"}\n` +
      `Vencimiento: ${fmtFecha(ahorro?.vencimiento)}\n` +
      `TNA: ${fmtPorcentaje(ahorro?.tna)}\n` +
      `Capital: ${fmtMoneda(capital)}\n` +
      `Interés: ${fmtMoneda(interes)}\n` +
      `Total al vencimiento: ${fmtMoneda(total)}\n\n` +
      `Solicitud registrada el ${fechaSolicitud}`;

    const payload = { USER_ID: BITRIX_USER_ID, MESSAGE: message };

    const resp = await fetch(BITRIX_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Bitrix webhook error:", resp.status, data);
      return new Response(
        JSON.stringify({ error: `Bitrix ${resp.status}`, details: data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Renovacion-Bitrix] Notificación enviada a USER_ID ${BITRIX_USER_ID} (cuenta #${cuentaId})`);

    return new Response(JSON.stringify({ success: true, bitrix: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enviar-renovacion-bitrix error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
