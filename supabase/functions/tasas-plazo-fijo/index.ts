import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// Fuentes
const URL_PF = "https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo";
const URL_FCI = "https://api.argentinadatos.com/v1/finanzas/fci/comparatasas";
const URL_LETRAS = "https://api.argentinadatos.com/v1/finanzas/letras";
const URL_DATA912 = "https://data912.com/live/arg_notes";

const PAGE_PF = "https://comparatasas.ar/plazos-fijos";
const PAGE_LECAPS = "https://comparatasas.ar/lecaps";
const PAGE_FCI = "https://comparatasas.ar/cuentas-billeteras";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function fetchJson(url: string, timeoutMs = 20000): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CelesolBot/1.0)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return await res.json();
}

// ---------- PF Tradicional ----------
async function computePF(): Promise<{ tna30: number; detalle: string; fuente_url: string }> {
  const data: any[] = await fetchJson(URL_PF);
  const vals = data
    .map((e) => Number(e?.tnaClientes))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length === 0) throw new Error("PF: sin datos");
  const max = Math.max(...vals);
  return {
    tna30: max * 100, // API entrega decimal (0.19 = 19%)
    detalle: `Mejor tasa de ${vals.length} bancos (clientes, 30 días)`,
    fuente_url: PAGE_PF,
  };
}

// ---------- FCI Money Market ----------
async function computeFCI(): Promise<{ tna30: number; detalle: string; fuente_url: string }> {
  const data: any = await fetchJson(URL_FCI);
  const fondos: any[] = Array.isArray(data?.fondos) ? data.fondos : [];
  const mm = fondos.filter(
    (f) =>
      f?.tipoRenta === "Mercado de Dinero" &&
      typeof f?.moneda === "string" &&
      /peso/i.test(f.moneda) &&
      f?.rendimientos?.unMes != null &&
      Number.isFinite(Number(f.rendimientos.unMes)),
  );
  if (mm.length === 0) throw new Error("FCI: sin datos MM en pesos");
  const vals = mm.map((f) => Number(f.rendimientos.unMes));
  const max = Math.max(...vals); // rendimiento % a 30 días
  return {
    tna30: (max * 365) / 30, // anualizado a TNA (ACT/365)
    detalle: `Mejor rendimiento de ${mm.length} FCI Money Market (CAFCI, 30d anualizado)`,
    fuente_url: PAGE_FCI,
  };
}

// ---------- LECAP ----------
async function computeLECAP(): Promise<{ tna30: number; detalle: string; fuente_url: string }> {
  const [letras, prices] = await Promise.all([fetchJson(URL_LETRAS), fetchJson(URL_DATA912)]);
  const priceBy: Record<string, number> = {};
  for (const r of prices as any[]) {
    if (r?.symbol && Number.isFinite(Number(r?.c))) priceBy[r.symbol] = Number(r.c);
  }
  const today = Date.now();
  const rows: { ticker: string; dias: number; tna: number }[] = [];
  for (const l of letras as any[]) {
    const ticker = l?.ticker;
    if (typeof ticker !== "string" || !ticker.startsWith("S")) continue; // solo LECAP
    const fv = l?.fechaVencimiento;
    const vpv = Number(l?.vpv);
    if (!fv || !Number.isFinite(vpv) || vpv <= 0) continue;
    const dias = Math.round((new Date(fv + "T00:00:00").getTime() - today) / 86400000);
    if (dias <= 0) continue;
    const price = priceBy[ticker];
    let tna: number | null = null;
    if (Number.isFinite(price) && price > 0) {
      // TNA lineal ACT/365
      tna = ((vpv / price - 1) * 365) / dias * 100;
    } else if (l?.tem != null && Number.isFinite(Number(l.tem))) {
      tna = Number(l.tem) * 12; // TEM % -> TNA %
    }
    if (tna != null && Number.isFinite(tna) && tna > 0 && tna < 300) {
      rows.push({ ticker, dias, tna });
    }
  }
  if (rows.length === 0) throw new Error("LECAP: sin datos");
  const best = rows.reduce((a, b) =>
    Math.abs(b.dias - 30) < Math.abs(a.dias - 30) ? b : a,
  );
  return {
    tna30: best.tna,
    detalle: `LECAP ${best.ticker} (${best.dias} días al vencimiento)`,
    fuente_url: PAGE_LECAPS,
  };
}


// ---------- Cache + refresh ----------
type Instrumento = "pf_tradicional" | "fci_mm" | "lecap";

async function readCache(instrumento: Instrumento) {
  const { data } = await supabase
    .from("tasas_mercado_cache")
    .select("*")
    .eq("instrumento", instrumento)
    .maybeSingle();
  return data;
}

async function writeCache(
  instrumento: Instrumento,
  payload: { tna30: number; detalle: string; fuente_url: string },
) {
  const { error } = await supabase.from("tasas_mercado_cache").upsert(
    {
      instrumento,
      tna30: payload.tna30,
      tna60: null,
      detalle: payload.detalle,
      fuente_url: payload.fuente_url,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "instrumento" },
  );
  if (error) throw new Error(`cache upsert ${instrumento}: ${error.message}`);
}

async function getOrRefresh(
  instrumento: Instrumento,
  compute: () => Promise<{ tna30: number; detalle: string; fuente_url: string }>,
) {
  const cached = await readCache(instrumento);
  const stale =
    !cached || Date.now() - new Date(cached.fetched_at).getTime() > CACHE_TTL_MS;
  if (!stale) return cached;
  try {
    const fresh = await compute();
    await writeCache(instrumento, fresh);
    return await readCache(instrumento);
  } catch (e) {
    console.error(`refresh ${instrumento} failed:`, e);
    return cached; // fallback a caché previo (puede ser null)
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const [pf, fci, lecap] = await Promise.all([
      getOrRefresh("pf_tradicional", computePF),
      getOrRefresh("fci_mm", computeFCI),
      getOrRefresh("lecap", computeLECAP),
    ]);

    const tasas: Array<{
      instrumento: string;
      tna30: number;
      tna60?: number | null;
      detalle?: string;
    }> = [];

    if (pf && pf.tna30 != null) {
      tasas.push({
        instrumento: "Plazo Fijo Tradicional",
        tna30: Number(pf.tna30),
        detalle: pf.detalle ?? undefined,
      });
    }
    if (fci && fci.tna30 != null) {
      tasas.push({
        instrumento: "Fondo Común de Inversión",
        tna30: Number(fci.tna30),
        detalle: fci.detalle ?? undefined,
      });
    }
    if (lecap && lecap.tna30 != null) {
      tasas.push({
        instrumento: "Letra del Tesoro",
        tna30: Number(lecap.tna30),
        detalle: lecap.detalle ?? undefined,
      });
    }

    const fechaReferencia =
      [pf, fci, lecap]
        .filter((c) => c?.fetched_at)
        .map((c) => new Date(c!.fetched_at).getTime())
        .sort((a, b) => b - a)[0] != null
        ? new Date(
            Math.max(
              ...[pf, fci, lecap]
                .filter((c) => c?.fetched_at)
                .map((c) => new Date(c!.fetched_at).getTime()),
            ),
          ).toISOString()
        : new Date().toISOString();

    return new Response(
      JSON.stringify({
        tasas,
        fechaReferencia,
        nota:
          "Se muestra la mejor tasa disponible por instrumento, tomada de fuentes públicas (ArgentinaDatos / comparatasas.ar); pueden diferir de la oferta puntual de cada entidad.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("tasas-plazo-fijo error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
