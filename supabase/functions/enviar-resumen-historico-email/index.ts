import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.4";

// Rate limit: 3 envíos por DNI cada 30 minutos
const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MIN = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PorAño {
  año: number;
  capital: number;
  interes: number;
  cantidad: number;
}

interface Payload {
  email: string;
  nombre: string;
  dni: string;
  cuentas?: any[][];
  metricas: {
    cantidad: number;
    capitalTotal: number;
    interesTotal: number;
    primerAhorroFecha: string | null;
    antiguedadTexto: string;
    porAño: PorAño[];
  };
  insight: string;
}

const fmtMoneda = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v || 0);

const parseLocalDate = (f: string): Date => {
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(f);
};

const fmtFecha = (f: string | null) => {
  if (!f) return "-";
  try {
    return parseLocalDate(f).toLocaleDateString("es-AR");
  } catch {
    return f;
  }
};

// Normaliza texto a Latin1 (jsPDF default fuente Helvetica) reemplazando caracteres problemáticos
const norm = (s: string) =>
  (s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u00A0/g, " ");

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Payload & { sessionToken?: string };
    const { email, nombre, dni, metricas, insight, cuentas = [], sessionToken } = body;

    if (!email || !metricas) {
      return new Response(
        JSON.stringify({ error: "Datos incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Session validation
    if (!sessionToken || typeof sessionToken !== "string" || sessionToken.length < 32) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: sess } = await supabaseAdmin
      .from("otp_sessions")
      .select("dni, email, expires_at")
      .eq("token", sessionToken)
      .maybeSingle();
    if (!sess || new Date(sess.expires_at) < new Date() || sess.dni !== String(dni ?? "")) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Force destination to the session's email — do not allow client to override.
    const destinationEmail = sess.email;
    const sinceISO = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("dni", String(dni ?? ""))
      .eq("tipo", "resumen-historico")
      .gte("created_at", sinceISO);

    if ((recentCount ?? 0) >= RATE_LIMIT_COUNT) {
      return new Response(
        JSON.stringify({ error: "Has alcanzado el límite de envíos. Intentá nuevamente en unos minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== Generar PDF =====
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    // Colores institucionales
    const primary: [number, number, number] = [26, 39, 68]; // #1a2744
    const teal: [number, number, number] = [77, 138, 122];   // #4d8a7a
    const muted: [number, number, number] = [141, 164, 194]; // #8da4c2
    const text: [number, number, number] = [90, 106, 126];   // #5a6a7e

    // Header band
    doc.setFillColor(...primary);
    doc.rect(0, 0, pageWidth, 80, "F");
    doc.setFillColor(...teal);
    doc.rect(0, 80, pageWidth, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(norm("Mutual Celesol"), margin, 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(220, 230, 245);
    doc.text(norm("Resumen analitico de ahorros historicos"), margin, 58);

    // Saludo
    let y = 110;
    doc.setTextColor(...primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(norm(`Hola, ${nombre}`), margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...text);
    doc.text(norm(`DNI: ${dni}  |  Generado: ${new Date().toLocaleDateString("es-AR")}`), margin, y);
    y += 26;

    // ===== KPIs en grid 2x2 =====
    const kpis = [
      { label: "Ahorros cerrados", value: String(metricas.cantidad) },
      { label: "Capital total invertido", value: fmtMoneda(metricas.capitalTotal) },
      { label: "Intereses generados", value: fmtMoneda(metricas.interesTotal) },
      { label: "Antiguedad como ahorrista", value: metricas.antiguedadTexto || "-" },
    ];
    const kpiW = (pageWidth - margin * 2 - 12) / 2;
    const kpiH = 56;
    kpis.forEach((kpi, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = margin + col * (kpiW + 12);
      const yKpi = y + row * (kpiH + 10);

      doc.setFillColor(245, 247, 250);
      doc.setDrawColor(229, 233, 239);
      doc.roundedRect(x, yKpi, kpiW, kpiH, 6, 6, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...muted);
      doc.text(norm(kpi.label.toUpperCase()), x + 12, yKpi + 18);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...primary);
      doc.text(norm(kpi.value), x + 12, yKpi + 40);
    });
    y += kpiH * 2 + 10 + 24;

    // ===== Tabla por año =====
    if (metricas.porAño && metricas.porAño.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...primary);
      doc.text(norm("Capital e intereses por ano"), margin, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Ano", "Cant.", "Capital", "Intereses", "Total"]],
        body: metricas.porAño.map((a) => [
          String(a.año),
          String(a.cantidad),
          fmtMoneda(a.capital),
          fmtMoneda(a.interes),
          fmtMoneda(a.capital + a.interes),
        ]),
        styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: teal, textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 50, halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right", fontStyle: "bold" },
        },
      });
      // @ts-ignore lastAutoTable es agregado por el plugin
      y = (doc as any).lastAutoTable.finalY + 26;
    }

    // ===== Detalle del perfil de ahorrista obtenido en la web =====
    if (cuentas && cuentas.length > 0) {
      if (y > doc.internal.pageSize.getHeight() - 150) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...primary);
      doc.text(norm("Detalle de ahorros cerrados"), margin, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Cuenta", "Emision", "Plazo", "Vencimiento", "TNA", "Capital", "Interes"]],
        body: cuentas.map((fila) => [
          norm(String(fila?.[0] ?? "-")),
          fmtFecha(fila?.[1] ? String(fila[1]) : null),
          fila?.[2] ? `${fila[2]} dias` : "-",
          fmtFecha(fila?.[3] ? String(fila[3]) : null),
          fila?.[4] ? `${(parseFloat(String(fila[4])) * 100).toFixed(2)}%` : "-",
          fmtMoneda(parseFloat(String(fila?.[5] ?? 0)) || 0),
          fmtMoneda(parseFloat(String(fila?.[6] ?? 0)) || 0),
        ]),
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 58 },
          1: { cellWidth: 62 },
          2: { cellWidth: 48, halign: "center" },
          3: { cellWidth: 70 },
          4: { cellWidth: 50, halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
        },
      });
      // @ts-ignore lastAutoTable es agregado por el plugin
      y = (doc as any).lastAutoTable.finalY + 26;
    }

    // ===== Insight IA =====
    if (insight && insight.trim().length > 0) {
      // Espacio mínimo para el bloque
      if (y > doc.internal.pageSize.getHeight() - 160) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...primary);
      doc.text(norm("Tu trayectoria"), margin, y);
      y += 12;

      const boxX = margin;
      const boxW = pageWidth - margin * 2;
      const insightText = norm(insight);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...text);
      const lines = doc.splitTextToSize(insightText, boxW - 24);
      const boxH = lines.length * 14 + 24;

      doc.setFillColor(240, 244, 255);
      doc.setDrawColor(...teal);
      doc.setLineWidth(1);
      doc.roundedRect(boxX, y, boxW, boxH, 6, 6, "FD");
      // Barra lateral teal
      doc.setFillColor(...teal);
      doc.rect(boxX, y, 4, boxH, "F");

      doc.text(lines, boxX + 18, y + 18);
      y += boxH + 16;
    }

    // ===== Footer en cada página =====
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const ph = doc.internal.pageSize.getHeight();
      doc.setDrawColor(229, 233, 239);
      doc.setLineWidth(0.5);
      doc.line(margin, ph - 36, pageWidth - margin, ph - 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...muted);
      doc.text(norm("Powered by Red Unisol"), margin, ph - 20);
      doc.text(`${i} / ${pageCount}`, pageWidth - margin, ph - 20, { align: "right" });
    }

    const pdfArrayBuffer = doc.output("arraybuffer");
    const pdfBuffer = new Uint8Array(pdfArrayBuffer);
    const fileName = `Perfil_Ahorrista_${dni}_${new Date().toISOString().slice(0, 10)}.pdf`;

    // ===== Email HTML (misma estética que OTP) =====
    const LOGO_URL = "https://isxurwtrxsujbmqhruht.supabase.co/storage/v1/object/public/email-assets/celesol_logo.png";

    const safeNombre = escapeHtml(nombre);
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#edf1f5;font-family:'DM Sans',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#edf1f5;padding:40px 0;"><tr><td align="center"><table width="440" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="background:#ffffff;padding:32px 32px 24px;text-align:center;border-bottom:2px solid #4d8a7a;"><img src="${LOGO_URL}" alt="Mutual Celesol" width="120" height="120" style="display:block;margin:0 auto 16px;border-radius:10px;"><h1 style="margin:0;font-family:'Sora','DM Sans',sans-serif;font-size:22px;font-weight:700;color:#1a2744;letter-spacing:0.5px;">Mutual Celesol</h1><p style="margin:6px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#4d8a7a;letter-spacing:0.3px;font-weight:500;">Sistema de Autogestión</p></td></tr><tr><td style="padding:32px 32px 8px;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#1a2744;margin:0 0 6px;font-weight:500;">Hola${safeNombre ? ` <strong>${safeNombre}</strong>` : ""},</p><p style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#5a6a7e;margin:0 0 24px;line-height:1.6;">Se le ha enviado al ahorrista el resumen de su perfil, con el detalle de sus ahorros históricos y el análisis correspondiente.</p></td></tr><tr><td align="center" style="padding:0 32px 28px;"><div style="display:inline-block;background:#f0f4ff;border:2px solid #4d8a7a;border-radius:12px;padding:18px 28px;font-family:'Sora','DM Sans',sans-serif;font-size:18px;line-height:1.35;font-weight:700;color:#1a2744;">Perfil de ahorrista adjunto</div></td></tr><tr><td style="padding:0 32px 28px;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#8da4c2;margin:0 0 4px;text-align:center;">El archivo PDF contiene el resumen obtenido en la web.</p><p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#8da4c2;margin:0;text-align:center;">Si no solicitaste este resumen, ignorá este mensaje.</p></td></tr><tr><td style="background:#f5f7fa;padding:16px 32px;border-top:1px solid #e5e9ef;"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#8da4c2;text-align:center;margin:0;">Powered by <strong style="color:#4d8a7a;">Red Unisol</strong></p></td></tr></table></td></tr></table></body></html>`;

    // ===== SMTP =====
    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.log(`[RESUMEN-HISTORICO] SMTP no configurado para ${email}`);
      return new Response(
        JSON.stringify({ error: "Servicio de email no configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Texto plano de fallback (evita que algunos clientes muestren el MIME crudo)
    const textoPlano = `Hola ${nombre},

Se le ha enviado al ahorrista el resumen de su perfil.

Capital total invertido: ${fmtMoneda(metricas.capitalTotal)}
Ahorros cerrados: ${metricas.cantidad}
Antigüedad: ${metricas.antiguedadTexto}

El archivo PDF adjunto contiene el resumen del perfil de ahorrista obtenido en la web.

Si no solicitaste este resumen, ignorá este mensaje.

Powered by Red Unisol`;

    await client.send({
      from: `Mutual Celesol <${SMTP_USER}>`,
      to: destinationEmail,
      subject: `Perfil de ahorrista - ${nombre} | Mutual Celesol`,
      content: textoPlano,
      html,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          encoding: "binary",
          contentType: "application/pdf",
        },
      ],
    });

    await client.close();

    await supabaseAdmin.from("email_send_log").insert({
      dni: String(dni ?? ""),
      email: email.toLowerCase().trim(),
      tipo: "resumen-historico",
    });

    console.log(`[RESUMEN-HISTORICO] Enviado a ${email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enviar-resumen-historico-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
