import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { email, code, nombre } = await req.json();

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: "Email y código requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOGO_URL = "https://isxurwtrxsujbmqhruht.supabase.co/storage/v1/object/public/email-assets/celesol_logo.png";

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#edf1f5;font-family:'DM Sans',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#edf1f5;padding:40px 0;"><tr><td align="center"><table width="440" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="background:#ffffff;padding:32px 32px 24px;text-align:center;border-bottom:2px solid #4d8a7a;"><img src="${LOGO_URL}" alt="Mutual Celesol" width="120" height="120" style="display:block;margin:0 auto 16px;border-radius:10px;"><h1 style="margin:0;font-family:'Sora','DM Sans',sans-serif;font-size:22px;font-weight:700;color:#1a2744;letter-spacing:0.5px;">Mutual Celesol</h1><p style="margin:6px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#4d8a7a;letter-spacing:0.3px;font-weight:500;">Sistema de Autogestión</p></td></tr><tr><td style="padding:32px 32px 8px;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#1a2744;margin:0 0 6px;font-weight:500;">Hola${nombre ? ` <strong>${nombre}</strong>` : ""},</p><p style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#5a6a7e;margin:0 0 24px;line-height:1.6;">Tu código de verificación para acceder a tus ahorros es:</p></td></tr><tr><td align="center" style="padding:0 32px 28px;"><div style="display:inline-block;background:#f0f4ff;border:2px solid #4d8a7a;border-radius:12px;padding:18px 36px;letter-spacing:14px;font-family:'Sora','DM Sans',sans-serif;font-size:34px;font-weight:700;color:#1a2744;">${code}</div></td></tr><tr><td style="padding:0 32px 28px;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#8da4c2;margin:0 0 4px;text-align:center;">Este código expira en <strong style="color:#4d8a7a;">5 minutos</strong>.</p><p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#8da4c2;margin:0;text-align:center;">Si no solicitaste este código, ignorá este mensaje.</p></td></tr><tr><td style="background:#f5f7fa;padding:16px 32px;border-top:1px solid #e5e9ef;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#8da4c2;text-align:center;margin:0;">Powered by <strong style="color:#4d8a7a;">Red Unisol</strong></p></td></tr></table></td></tr></table></body></html>`;

    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.log(`[OTP] SMTP not configured. Code for ${email}: ${code}`);
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
        auth: {
          username: SMTP_USER,
          password: SMTP_PASS,
        },
      },
    });

    await client.send({
      from: `Mutual Celesol <${SMTP_USER}>`,
      to: email,
      subject: `${code} - Código de verificación | Mutual Celesol`,
      content: "auto",
      html,
    });

    await client.close();

    console.log(`[OTP] Email sent to ${email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-otp-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
