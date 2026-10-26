import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DESTINATARIO = "dfrias.celesol@gmail.com";
const LOGO_URL =
  "https://isxurwtrxsujbmqhruht.supabase.co/storage/v1/object/public/email-assets/celesol_logo.png";

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

const escape = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

    const { solicitante, cuentaId, titularNombre, titularDni, ahorro, opcion, opcionDetalle } = await req.json();

    if (!solicitante?.nombre || !solicitante?.dni || !cuentaId) {
      return new Response(
        JSON.stringify({ error: "Datos insuficientes." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const capital = Number(ahorro?.capital) || 0;
    const interes = Number(ahorro?.interes) || 0;
    const total = capital + interes;
    const fechaSolicitud = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

    const filasAhorro: Array<[string, string]> = [
      ["Nro de cuenta", `#${escape(cuentaId)}`],
      ["Emisión", escape(fmtFecha(ahorro?.emision))],
      ["Plazo", ahorro?.plazo ? `${escape(ahorro.plazo)} días` : "-"],
      ["Vencimiento", escape(fmtFecha(ahorro?.vencimiento))],
      ["TNA", escape(fmtPorcentaje(ahorro?.tna))],
      ["Capital", escape(fmtMoneda(capital))],
      ["Interés", escape(fmtMoneda(interes))],
      ["Total al vencimiento", escape(fmtMoneda(total))],
    ];

    const ahorroRows = filasAhorro
      .map(
        ([k, v]) =>
          `<tr><td style="padding:8px 12px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5a6a7e;border-bottom:1px solid #eef2f6;">${k}</td><td style="padding:8px 12px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#1a2744;font-weight:600;text-align:right;border-bottom:1px solid #eef2f6;">${v}</td></tr>`
      )
      .join("");

    const titularBloque = titularNombre
      ? `<p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5a6a7e;margin:0 0 4px;"><strong style="color:#1a2744;">Titular del ahorro:</strong> ${escape(titularNombre)}${titularDni ? ` (DNI ${escape(titularDni)})` : ""}</p>`
      : `<p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5a6a7e;margin:0 0 4px;"><em>El solicitante es el titular del ahorro.</em></p>`;

    const opcionLabel = opcion || "Renovación Total";
    const opcionDetalleHtml = opcion === "Otros" && opcionDetalle
      ? `<p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5a6a7e;margin:8px 0 0;line-height:1.5;"><strong style="color:#1a2744;">Detalle:</strong> ${escape(opcionDetalle)}</p>`
      : "";
    const opcionBloque = `<div style="margin:0 0 4px;padding:14px 16px;border-radius:10px;background:#f0f7f4;border:1px solid #cfe5dc;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#4d8a7a;margin:0 0 4px;letter-spacing:0.4px;text-transform:uppercase;font-weight:600;">Acción solicitada</p><p style="font-family:'Sora','DM Sans',sans-serif;font-size:16px;color:#1a2744;margin:0;font-weight:700;">${escape(opcionLabel)}</p>${opcionDetalleHtml}</div>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#edf1f5;font-family:'DM Sans',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#edf1f5;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="background:#ffffff;padding:32px 32px 24px;text-align:center;border-bottom:2px solid #4d8a7a;"><img src="${LOGO_URL}" alt="Mutual Celesol" width="120" height="120" style="display:block;margin:0 auto 16px;border-radius:10px;"><h1 style="margin:0;font-family:'Sora','DM Sans',sans-serif;font-size:22px;font-weight:700;color:#1a2744;letter-spacing:0.5px;">Solicitud de Renovación</h1><p style="margin:6px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#4d8a7a;letter-spacing:0.3px;font-weight:500;">Mutual Celesol · Sistema de Autogestión</p></td></tr><tr><td style="padding:28px 32px 8px;">${opcionBloque}</td></tr><tr><td style="padding:18px 32px 8px;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#5a6a7e;margin:0 0 18px;line-height:1.6;">Se recibió una nueva solicitud a través del portal de autogestión.</p><h2 style="font-family:'Sora','DM Sans',sans-serif;font-size:15px;font-weight:600;color:#1a2744;margin:0 0 10px;">Solicitante</h2><p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5a6a7e;margin:0 0 4px;"><strong style="color:#1a2744;">Nombre:</strong> ${escape(solicitante.nombre)}</p><p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5a6a7e;margin:0 0 4px;"><strong style="color:#1a2744;">DNI:</strong> ${escape(solicitante.dni)}</p><p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5a6a7e;margin:0 0 18px;"><strong style="color:#1a2744;">Email:</strong> ${escape(solicitante.email || "-")}</p>${titularBloque}</td></tr><tr><td style="padding:18px 32px 8px;"><h2 style="font-family:'Sora','DM Sans',sans-serif;font-size:15px;font-weight:600;color:#1a2744;margin:0 0 10px;">Ahorro a renovar</h2><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef2f6;border-radius:10px;border-collapse:separate;overflow:hidden;">${ahorroRows}</table></td></tr><tr><td style="padding:20px 32px 24px;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#8da4c2;margin:0;text-align:center;">Solicitud registrada el <strong style="color:#4d8a7a;">${escape(fechaSolicitud)}</strong></p></td></tr><tr><td style="background:#f5f7fa;padding:16px 32px;border-top:1px solid #e5e9ef;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#8da4c2;text-align:center;margin:0;">Powered by <strong style="color:#4d8a7a;">Red Unisol</strong></p></td></tr></table></td></tr></table></body></html>`;

    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.log(`[Renovacion] SMTP no configurado. Solicitud cuenta #${cuentaId} de ${solicitante.nombre}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
    });

    await client.send({
      from: `Mutual Celesol <${SMTP_USER}>`,
      to: DESTINATARIO,
      replyTo: solicitante.email || undefined,
      subject: "Solicitud Renovación de Ahorro Celesol",
      content: "auto",
      html,
    });

    await client.close();

    console.log(`[Renovacion] Email enviado a ${DESTINATARIO} para cuenta #${cuentaId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enviar-renovacion-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
