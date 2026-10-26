import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CELESOL_API = Deno.env.get("CELESOL_API_URL") || "";
const CELESOL_TOKEN = Deno.env.get("CELESOL_API_TOKEN") || "";


// Rate limit: máximo 3 OTPs por DNI cada 10 minutos
const OTP_RATE_LIMIT_COUNT = 3;
const OTP_RATE_LIMIT_WINDOW_MIN = 10;

// Session TTL after OTP verification (minutes)
const SESSION_TTL_MIN = 30;

// ── BYPASS TEMPORAL DE PRUEBA (admin test) ──
const TEST_DNI = "12345678";
const TEST_EMAIL = "admin.test@celesol.local";
const TEST_OTP = "361479";
const TEST_SOCIO_ID = "99999999";
const TEST_NOMBRE = "Admin Test";

// ── BYPASS TEMPORAL DE PRUEBA (usuario NO admin) ──
const TEST2_DNI = "33392841";
const TEST2_EMAIL = "gabriela.acosta88@outlook.com";
const TEST2_OTP = "847205";
const TEST2_SOCIO_ID = "88888888";
const TEST2_NOMBRE = "Gabriela Acosta";

function validarDni(dni: string): boolean {
  return /^\d{7,8}$/.test(dni);
}

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarUserId(id: unknown): boolean {
  return typeof id === "string" && /^\d{1,15}$/.test(id);
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function celesolFetch(body: Record<string, unknown>) {
  console.log("celesolFetch request:", JSON.stringify(body));
  if (!CELESOL_API) {
    console.error("CELESOL_API_URL no configurada");
    throw new Error("UPSTREAM_UNAVAILABLE");
  }
  if (!CELESOL_TOKEN) {
    console.error("CELESOL_API_TOKEN no configurado");
    throw new Error("UPSTREAM_UNAVAILABLE");
  }
  const resp = await fetch(CELESOL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CELESOL_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errorBody = await resp.text();
    if (resp.status === 401 || resp.status === 403) {
      // Credencial inválida/vencida: registrar sin exponer el token ni el detalle upstream.
      console.error(`CELESOL AUTH ERROR ${resp.status} (token inválido, vencido o revocado)`);
      throw new Error("UPSTREAM_UNAVAILABLE");
    }
    console.error(`CELESOL ${resp.status} response:`, errorBody);
    // Do NOT forward upstream body or status to the client.
    throw new Error("UPSTREAM_UNAVAILABLE");
  }
  return resp.json();
}


function generateOtp(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < 6; i++) code += (bytes[i] % 10).toString();
  return code;
}

async function validateSession(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  sessionToken: unknown,
  expectedDni?: string,
): Promise<{ dni: string; email: string; socio_id: string } | null> {
  if (typeof sessionToken !== "string" || sessionToken.length < 32) return null;
  const { data, error } = await supabaseAdmin
    .from("otp_sessions")
    .select("dni, email, socio_id, expires_at")
    .eq("token", sessionToken)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  if (expectedDni && data.dni !== expectedDni) return null;
  return { dni: data.dni, email: data.email, socio_id: data.socio_id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      action,
      dni,
      email,
      userId,
      code,
      cuentaId,
      nombreSolicitante,
      titularNombre,
      titularDni,
      ahorro,
      opcion,
      opcionDetalle,
      sessionToken,
    } = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Acción requerida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── validar-socio ──
    if (action === "validar-socio") {
      if (!dni || !validarDni(dni)) {
        return new Response(
          JSON.stringify({ error: "DNI inválido. Debe tener 7 u 8 dígitos." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!email || !validarEmail(email)) {
        return new Response(
          JSON.stringify({ error: "Email inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Bypass usuario de prueba
      if (String(dni) === TEST_DNI && email.toLowerCase().trim() === TEST_EMAIL) {
        return new Response(
          JSON.stringify({ dni: TEST_DNI, id: TEST_SOCIO_ID, nombre: TEST_NOMBRE }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (String(dni) === TEST2_DNI && email.toLowerCase().trim() === TEST2_EMAIL) {
        return new Response(
          JSON.stringify({ dni: TEST2_DNI, id: TEST2_SOCIO_ID, nombre: TEST2_NOMBRE }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const datos = await celesolFetch({
        cmd: `[NroDoc] = ${dni}`,
        tipo: "F.Module.SocioMutual",
        campos: "Email;ID;NombreCompleto",
        max: 1,
      });

      if (!datos || datos.length === 0) {
        return new Response(
          JSON.stringify({ error: "El DNI ingresado no está registrado como socio." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailRegistrado = datos[0][0];
      if (!emailRegistrado || emailRegistrado.toLowerCase().trim() !== email.toLowerCase().trim()) {
        return new Response(
          JSON.stringify({ error: "El correo ingresado no coincide con nuestros registros." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ dni: String(dni), id: String(datos[0][1] ?? ""), nombre: String(datos[0][2] ?? "") }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── enviar-otp ──
    if (action === "enviar-otp") {
      if (!dni || !validarDni(dni)) {
        return new Response(
          JSON.stringify({ error: "DNI inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!email || !validarEmail(email)) {
        return new Response(
          JSON.stringify({ error: "Email inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Bypass usuario de prueba: no valida socio ni envía email
      if (String(dni) === TEST_DNI && email.toLowerCase().trim() === TEST_EMAIL) {
        return new Response(
          JSON.stringify({
            success: true,
            nombre: TEST_NOMBRE,
            id: TEST_SOCIO_ID,
            message: "Usuario de prueba: usá el código fijo.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (String(dni) === TEST2_DNI && email.toLowerCase().trim() === TEST2_EMAIL) {
        return new Response(
          JSON.stringify({
            success: true,
            nombre: TEST2_NOMBRE,
            id: TEST2_SOCIO_ID,
            message: "Usuario de prueba: usá el código fijo.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate socio first
      const datos = await celesolFetch({
        cmd: `[NroDoc] = ${dni}`,
        tipo: "F.Module.SocioMutual",
        campos: "Email;ID;NombreCompleto",
        max: 1,
      });

      if (!datos || datos.length === 0) {
        return new Response(
          JSON.stringify({ error: "El DNI ingresado no está registrado como socio." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailRegistrado = datos[0][0];
      if (!emailRegistrado || emailRegistrado.toLowerCase().trim() !== email.toLowerCase().trim()) {
        return new Response(
          JSON.stringify({ error: "El correo ingresado no coincide con nuestros registros." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const socioNombre = datos[0][2];
      const socioId = datos[0][1];

      // Rate limiting: contar OTPs recientes para este DNI
      const supabaseAdminRL = getSupabaseAdmin();
      const sinceISO = new Date(Date.now() - OTP_RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();
      const { count: recentCount } = await supabaseAdminRL
        .from("otp_codes")
        .select("id", { count: "exact", head: true })
        .eq("dni", dni)
        .gte("created_at", sinceISO);

      if ((recentCount ?? 0) >= OTP_RATE_LIMIT_COUNT) {
        return new Response(
          JSON.stringify({
            error: `Demasiados intentos. Esperá unos minutos antes de solicitar otro código.`,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate OTP, store only its hash
      const otpCode = generateOtp();
      const otpHash = await sha256Hex(otpCode);
      const supabaseAdmin = getSupabaseAdmin();

      // Invalidate previous unused codes for this DNI
      await supabaseAdmin
        .from("otp_codes")
        .update({ used: true })
        .eq("dni", dni)
        .eq("used", false);

      // Insert new code (hashed)
      const { error: insertError } = await supabaseAdmin.from("otp_codes").insert({
        dni,
        email: email.toLowerCase().trim(),
        code: otpHash,
      });

      if (insertError) {
        console.error("Error inserting OTP:", insertError);
        throw new Error("Error al generar código de verificación.");
      }

      // Send email via send-otp-email function (authenticated with shared internal secret)
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const internalSecret = Deno.env.get("INTERNAL_FN_SECRET")!;
        await fetch(`${supabaseUrl}/functions/v1/send-otp-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "x-internal-secret": internalSecret,
          },
          body: JSON.stringify({ email, code: otpCode, nombre: socioNombre }),
        });
      } catch (emailErr) {
        console.error("Error sending OTP email:", emailErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          nombre: String(socioNombre ?? ""),
          id: String(socioId ?? ""),
          message: "Código enviado al correo registrado.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── verificar-otp ──
    if (action === "verificar-otp") {
      if (!dni || !validarDni(dni)) {
        return new Response(
          JSON.stringify({ error: "DNI inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!code || !/^\d{6}$/.test(code)) {
        return new Response(
          JSON.stringify({ error: "Código inválido. Debe ser de 6 dígitos." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Bypass usuario de prueba: acepta código fijo y emite sesión admin
      if (String(dni) === TEST_DNI && String(code) === TEST_OTP) {
        const supabaseAdminT = getSupabaseAdmin();
        const tokenT = generateSessionToken();
        const expiresAtT = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000).toISOString();
        await supabaseAdminT.from("otp_sessions").insert({
          token: tokenT,
          dni: TEST_DNI,
          email: TEST_EMAIL,
          socio_id: TEST_SOCIO_ID,
          expires_at: expiresAtT,
        });
        const { data: adminRowT } = await supabaseAdminT
          .from("admin_allowlist")
          .select("dni")
          .eq("dni", TEST_DNI)
          .eq("email", TEST_EMAIL)
          .maybeSingle();
        return new Response(
          JSON.stringify({
            valid: true,
            sessionToken: tokenT,
            expiresAt: expiresAtT,
            nombre: TEST_NOMBRE,
            id: TEST_SOCIO_ID,
            isAdmin: !!adminRowT,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (String(dni) === TEST2_DNI && String(code) === TEST2_OTP) {
        const supabaseAdminT2 = getSupabaseAdmin();
        const tokenT2 = generateSessionToken();
        const expiresAtT2 = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000).toISOString();
        await supabaseAdminT2.from("otp_sessions").insert({
          token: tokenT2,
          dni: TEST2_DNI,
          email: TEST2_EMAIL,
          socio_id: TEST2_SOCIO_ID,
          expires_at: expiresAtT2,
        });
        return new Response(
          JSON.stringify({
            valid: true,
            sessionToken: tokenT2,
            expiresAt: expiresAtT2,
            nombre: TEST2_NOMBRE,
            id: TEST2_SOCIO_ID,
            isAdmin: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const codeHash = await sha256Hex(String(code));
      const supabaseAdmin = getSupabaseAdmin();
      const { data: otpData, error: otpError } = await supabaseAdmin
        .from("otp_codes")
        .select("id, expires_at, email")
        .eq("dni", dni)
        .eq("code", codeHash)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (otpError || !otpData) {
        return new Response(
          JSON.stringify({ error: "Código incorrecto o expirado." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (new Date(otpData.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "El código ha expirado. Solicitá uno nuevo." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabaseAdmin.from("otp_codes").update({ used: true }).eq("id", otpData.id);

      // Look up socio metadata (id + nombre) for the session record
      let socioIdVal = "";
      let socioNombre = "";
      try {
        const datos = await celesolFetch({
          cmd: `[NroDoc] = ${dni}`,
          tipo: "F.Module.SocioMutual",
          campos: "Email;ID;NombreCompleto",
          max: 1,
        });
        if (datos && datos.length > 0) {
          socioIdVal = String(datos[0][1] ?? "");
          socioNombre = String(datos[0][2] ?? "");
        }
      } catch (_) {
        // fall through — session will still be issued without id resolution
      }

      // Issue session token
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000).toISOString();
      await supabaseAdmin.from("otp_sessions").insert({
        token,
        dni,
        email: String(otpData.email ?? "").toLowerCase().trim(),
        socio_id: socioIdVal,
        expires_at: expiresAt,
      });

      // Check admin flag
      const { data: adminRow } = await supabaseAdmin
        .from("admin_allowlist")
        .select("dni")
        .eq("dni", dni)
        .eq("email", String(otpData.email ?? "").toLowerCase().trim())
        .maybeSingle();

      return new Response(
        JSON.stringify({
          valid: true,
          sessionToken: token,
          expiresAt,
          nombre: socioNombre,
          id: socioIdVal,
          isAdmin: !!adminRow,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Actions below require a valid session
    const supabaseAdmin = getSupabaseAdmin();

    // ── cargar-cuentas / cargar-historicos ──
    if (action === "cargar-cuentas" || action === "cargar-historicos") {
      if (!dni || !validarDni(dni)) {
        return new Response(
          JSON.stringify({ error: "DNI inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!validarUserId(String(userId))) {
        return new Response(
          JSON.stringify({ error: "userId inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const session = await validateSession(supabaseAdmin, sessionToken, String(dni));
      if (!session) {
        return new Response(
          JSON.stringify({ error: "Sesión inválida o expirada. Iniciá sesión nuevamente." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Ensure the userId belongs to the session
      if (session.socio_id && String(userId) !== session.socio_id) {
        return new Response(
          JSON.stringify({ error: "No autorizado." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const estadoFiltro = action === "cargar-historicos"
        ? `[Estado] <> 0`
        : `[Estado]=0`;

      const safeDni = String(dni);
      const safeUserId = String(userId);
      const filtro = `${estadoFiltro} AND ( [Integrantes][NroDocumento = ${safeDni}] OR [Integrantes][Socio.Productor.ID = ${safeUserId}] )`;

      const cuentas = await celesolFetch({
        cmd: filtro,
        tipo: "F.Module.Cuentas.amt.AMT",
        campos: "ID;FechaEmision;Plazo;Vencimiento;TNA;Capital;Interes",
        max: 200,
      });

      if (!cuentas || cuentas.length === 0) {
        return new Response(
          JSON.stringify({ cuentas: [], mapaDueños: {} }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cuentasSanitizadas = cuentas.map((c: any[]) => c.slice(0, 7));
      const ids = cuentasSanitizadas.map((c: any[]) => c[0]).filter(Boolean).join(",");

      const dueñosData = await celesolFetch({
        cmd: `[Cuenta.ID] In (${ids})`,
        tipo: "F.Module.Cuentas.CuentaPorSocio",
        campos: "Cuenta.ID;Socio.NombreCompleto",
        max: 500,
      });

      const mapaDueños: Record<string, string[]> = {};
      if (dueñosData) {
        dueñosData.forEach((fila: any[]) => {
          const cuentaId = String(fila[0] ?? "");
          const nombreDueño = String(fila[1] ?? "");
          if (cuentaId && nombreDueño) {
            if (!mapaDueños[cuentaId]) mapaDueños[cuentaId] = [];
            mapaDueños[cuentaId].push(nombreDueño);
          }
        });
      }

      return new Response(
        JSON.stringify({ cuentas: cuentasSanitizadas, mapaDueños }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── solicitar-renovacion ──
    if (action === "solicitar-renovacion") {
      if (!dni || !validarDni(dni)) {
        return new Response(
          JSON.stringify({ error: "DNI inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!email || !validarEmail(email)) {
        return new Response(
          JSON.stringify({ error: "Email inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!validarUserId(String(userId))) {
        return new Response(
          JSON.stringify({ error: "userId inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!cuentaId || !/^\d+$/.test(String(cuentaId))) {
        return new Response(
          JSON.stringify({ error: "Número de ahorro inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!nombreSolicitante || typeof nombreSolicitante !== "string") {
        return new Response(
          JSON.stringify({ error: "Nombre del solicitante requerido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const session = await validateSession(supabaseAdmin, sessionToken, String(dni));
      if (!session) {
        return new Response(
          JSON.stringify({ error: "Sesión inválida o expirada." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const opcionesValidas = ["Renovación Total", "Renovación Parcial con Retiro", "Retiro Total", "Otros"];
      const opcionFinal = opcionesValidas.includes(String(opcion)) ? String(opcion) : "Renovación Total";
      const opcionDetalleFinal = opcionFinal === "Otros" && typeof opcionDetalle === "string"
        ? opcionDetalle.slice(0, 1000)
        : null;

      const { error: insertError } = await supabaseAdmin
        .from("renovacion_solicitudes")
        .insert({
          solicitante_nombre: nombreSolicitante,
          solicitante_dni: String(dni),
          solicitante_email: String(email).toLowerCase().trim(),
          solicitante_socio_id: String(userId),
          cuenta_id: String(cuentaId),
          titular_nombre: titularNombre ? String(titularNombre) : null,
          titular_dni: titularDni ? String(titularDni) : null,
          opcion: opcionFinal,
          opcion_detalle: opcionDetalleFinal,
          ahorro: ahorro || null,
        });

      if (insertError) {
        console.error("Error inserting renovacion:", insertError);
        throw new Error("Error al registrar la solicitud de renovación.");
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const internalSecret = Deno.env.get("INTERNAL_FN_SECRET")!;
      const notifPayload = {
        solicitante: {
          nombre: nombreSolicitante,
          dni: String(dni),
          email: String(email).toLowerCase().trim(),
        },
        cuentaId: String(cuentaId),
        titularNombre: titularNombre || null,
        titularDni: titularDni || null,
        ahorro: ahorro || null,
        opcion: opcionFinal,
        opcionDetalle: opcionDetalleFinal,
      };

      try {
        await fetch(`${supabaseUrl}/functions/v1/enviar-renovacion-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "x-internal-secret": internalSecret,
          },
          body: JSON.stringify(notifPayload),
        });
      } catch (waErr) {
        console.error("Error sending renovacion whatsapp (Edna):", waErr);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción no reconocida." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("celesol-proxy error:", e);
    // Return a generic message; details stay in server logs.
    return new Response(
      JSON.stringify({ error: "Error al procesar la solicitud. Intente nuevamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
