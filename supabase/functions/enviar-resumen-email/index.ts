import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.4";

// Normaliza texto a Latin1 (jsPDF Helvetica)
const norm = (s: string) =>
  (s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ");

// Rate limit: máximo 5 resúmenes por DNI cada 30 minutos
const RESUMEN_RATE_LIMIT_COUNT = 5;
const RESUMEN_RATE_LIMIT_WINDOW_MIN = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Cuenta {
  nro: string | number;
  emision: string;
  plazo: string | number;
  vencimiento: string;
  tna: number | string;
  capital: number;
  interes: number;
  titulares: string;
  categoria: "Mis Ahorros" | "Cartera de Clientes";
}

const parseLocalDate = (f: string): Date => {
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(f);
};

const fmtFecha = (f: string) => {
  if (!f) return "-";
  try {
    return parseLocalDate(f).toLocaleDateString("es-AR");
  } catch {
    return f;
  }
};

const fmtMoneda = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(v || 0);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, nombre, dni, cuentas, sessionToken } = await req.json() as {
      email: string;
      nombre: string;
      dni: string;
      cuentas: Cuenta[];
      sessionToken?: string;
    };

    if (!email || !cuentas || !Array.isArray(cuentas)) {
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
    const destinationEmail = sess.email;

    // Rate limiting por DNI
    const sinceISO = new Date(Date.now() - RESUMEN_RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("dni", String(dni ?? ""))
      .eq("tipo", "resumen")
      .gte("created_at", sinceISO);

    if ((recentCount ?? 0) >= RESUMEN_RATE_LIMIT_COUNT) {
      return new Response(
        JSON.stringify({ error: "Has alcanzado el límite de envíos. Intentá nuevamente en unos minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build worksheet
    const headers = [
      "Categoría", "Nro Cuenta", "Titulares", "Emisión", "Plazo (días)",
      "Vencimiento", "TNA", "Capital", "Interés", "Total al Vencimiento"
    ];
    const rows = cuentas.map((c) => [
      c.categoria,
      c.nro,
      c.titulares,
      fmtFecha(c.emision),
      c.plazo,
      fmtFecha(c.vencimiento),
      typeof c.tna === "number" ? c.tna : parseFloat(String(c.tna)) || 0,
      Number(c.capital) || 0,
      Number(c.interes) || 0,
      (Number(c.capital) || 0) + (Number(c.interes) || 0),
    ]);

    const totalCapital = cuentas.reduce((s, c) => s + (Number(c.capital) || 0), 0);
    const totalInteres = cuentas.reduce((s, c) => s + (Number(c.interes) || 0), 0);
    const totalGeneral = totalCapital + totalInteres;

    const aoa = [
      [`Resumen de Ahorros - Mutual Celesol`],
      [`Socio: ${nombre}`, `DNI: ${dni}`, `Fecha: ${new Date().toLocaleDateString("es-AR")}`],
      [],
      headers,
      ...rows,
      [],
      ["", "", "", "", "", "", "TOTALES:", totalCapital, totalInteres, totalGeneral],
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 22 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
    ];
    // Format currency columns
    const dataStart = 5; // after title rows + header
    for (let i = 0; i < rows.length; i++) {
      const r = dataStart + i - 1;
      ["H", "I", "J"].forEach((col) => {
        const cell = ws[`${col}${r}`];
        if (cell) cell.z = '"$"#,##0.00';
      });
      const tnaCell = ws[`G${r}`];
      if (tnaCell && typeof tnaCell.v === "number") tnaCell.z = '0.00"%"';
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ahorros");
    const xlsxBuffer: Uint8Array = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const fileName = `Ahorros_${dni}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // ===== Detectar Productor y generar PDF de "Mis Ahorros" =====
    const misAhorros = cuentas.filter((c) => c.categoria === "Mis Ahorros");
    const cartera = cuentas.filter((c) => c.categoria === "Cartera de Clientes");
    const esProductor = cartera.length > 0;
    const adjuntarPdfProductor = esProductor && misAhorros.length > 0;

    let pdfBuffer: Uint8Array | null = null;
    let pdfFileName = "";

    if (adjuntarPdfProductor) {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;
      const primary: [number, number, number] = [26, 39, 68];
      const teal: [number, number, number] = [77, 138, 122];
      const muted: [number, number, number] = [141, 164, 194];
      const text: [number, number, number] = [90, 106, 126];

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
      doc.text(norm("Detalle de mis ahorros vigentes"), margin, 58);

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

      // KPIs
      const capPropio = misAhorros.reduce((s, c) => s + (Number(c.capital) || 0), 0);
      const intPropio = misAhorros.reduce((s, c) => s + (Number(c.interes) || 0), 0);
      const totPropio = capPropio + intPropio;
      const kpis = [
        { label: "Ahorros vigentes", value: String(misAhorros.length) },
        { label: "Capital invertido", value: fmtMoneda(capPropio) },
        { label: "Intereses estimados", value: fmtMoneda(intPropio) },
        { label: "Total al vencimiento", value: fmtMoneda(totPropio) },
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

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...primary);
      doc.text(norm("Detalle de mis ahorros"), margin, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Cuenta", "Emision", "Plazo", "Vencimiento", "TNA", "Capital", "Interes"]],
        body: misAhorros.map((c) => [
          String(c.nro ?? "-"),
          fmtFecha(c.emision),
          c.plazo ? `${c.plazo} dias` : "-",
          fmtFecha(c.vencimiento),
          c.tna ? `${(parseFloat(String(c.tna)) * 100).toFixed(2)}%` : "-",
          fmtMoneda(Number(c.capital) || 0),
          fmtMoneda(Number(c.interes) || 0),
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

      pdfBuffer = new Uint8Array(doc.output("arraybuffer"));
      pdfFileName = `Mis_Ahorros_${dni}_${new Date().toISOString().slice(0, 10)}.pdf`;
    }

    const LOGO_URL = "https://isxurwtrxsujbmqhruht.supabase.co/storage/v1/object/public/email-assets/celesol_logo.png";

    const introHtml = adjuntarPdfProductor
      ? `Adjuntamos dos archivos: un <strong>Excel</strong> con el detalle de los ahorros de tu cartera de clientes y un <strong>PDF</strong> con el detalle de tus propios ahorros vigentes.`
      : `Adjuntamos tu resumen de ahorros vigentes en formato Excel, con el detalle de tus cuentas y las de tu cartera (si corresponde).`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#edf1f5;font-family:'DM Sans',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#edf1f5;padding:40px 0;"><tr><td align="center"><table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="background:#ffffff;padding:32px 32px 24px;text-align:center;border-bottom:2px solid #4d8a7a;"><img src="${LOGO_URL}" alt="Mutual Celesol" width="100" height="100" style="display:block;margin:0 auto 16px;border-radius:10px;"><h1 style="margin:0;font-family:'Sora','DM Sans',sans-serif;font-size:22px;font-weight:700;color:#1a2744;">Resumen de Ahorros</h1><p style="margin:6px 0 0;font-size:13px;color:#4d8a7a;font-weight:500;">Mutual Celesol</p></td></tr><tr><td style="padding:32px;"><p style="font-size:15px;color:#1a2744;margin:0 0 16px;">Hola <strong>${nombre}</strong>,</p><p style="font-size:14px;color:#5a6a7e;line-height:1.6;margin:0 0 20px;">${introHtml}</p><div style="background:#f5f7fa;border-left:4px solid #4d8a7a;padding:16px 20px;border-radius:6px;margin:16px 0;"><p style="margin:0 0 6px;font-size:13px;color:#5a6a7e;">Total al vencimiento:</p><p style="margin:0;font-size:22px;font-weight:700;color:#1a2744;font-family:'Sora',sans-serif;">${fmtMoneda(totalGeneral)}</p><p style="margin:6px 0 0;font-size:12px;color:#8da4c2;">${cuentas.length} cuenta(s) · DNI ${dni}</p></div><p style="font-size:12px;color:#8da4c2;margin:20px 0 0;">Si no solicitaste este resumen, ignorá este mensaje.</p></td></tr><tr><td style="background:#f5f7fa;padding:16px 32px;border-top:1px solid #e5e9ef;text-align:center;"><p style="font-size:11px;color:#8da4c2;margin:0;">Powered by <strong style="color:#4d8a7a;">Red Unisol</strong></p></td></tr></table></td></tr></table></body></html>`;

    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.log(`[RESUMEN] SMTP no configurado. Para ${email}`);
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

    const attachments: any[] = [
      {
        filename: fileName,
        content: xlsxBuffer,
        encoding: "binary",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ];
    if (pdfBuffer) {
      attachments.push({
        filename: pdfFileName,
        content: pdfBuffer,
        encoding: "binary",
        contentType: "application/pdf",
      });
    }

    await client.send({
      from: `Mutual Celesol <${SMTP_USER}>`,
      to: destinationEmail,
      subject: `Resumen de Ahorros - ${nombre} | Mutual Celesol`,
      content: "auto",
      html,
      attachments,
    });

    await client.close();

    // Registrar envío exitoso para rate limiting
    await supabaseAdmin.from("email_send_log").insert({
      dni: String(dni ?? ""),
      email: email.toLowerCase().trim(),
      tipo: "resumen",
    });

    console.log(`[RESUMEN] Enviado a ${email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enviar-resumen-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
