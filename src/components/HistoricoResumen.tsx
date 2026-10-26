import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, Coins, Sparkles, TrendingUp, Wallet, Mail, Loader2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoneda, getSessionToken, parseLocalDate } from "@/lib/celesol";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistoricoResumenProps {
  nombre: string;
  dni: string;
  email: string;
  cuentas: any[][];
  onVolver: () => void;
}

interface MetricasAgg {
  cantidad: number;
  capitalTotal: number;
  interesTotal: number;
  primerAhorroFecha: string | null;
  añosActivos: number;
  añoMasFuerte: { año: number; capital: number } | null;
  plazoPreferido: number | null;
  porAño: { año: number; capital: number; interes: number; cantidad: number }[];
  antiguedadTexto: string;
}

function calcularAntiguedad(primerFecha: string | null): { texto: string; años: number } {
  if (!primerFecha) return { texto: "-", años: 0 };
  const inicio = parseLocalDate(primerFecha);
  if (isNaN(inicio.getTime())) return { texto: "-", años: 0 };
  const hoy = new Date();
  let años = hoy.getFullYear() - inicio.getFullYear();
  let meses = hoy.getMonth() - inicio.getMonth();
  if (meses < 0) {
    años -= 1;
    meses += 12;
  }
  const partes: string[] = [];
  if (años > 0) partes.push(`${años} año${años !== 1 ? "s" : ""}`);
  if (meses > 0) partes.push(`${meses} mes${meses !== 1 ? "es" : ""}`);
  if (partes.length === 0) partes.push("Menos de un mes");
  return { texto: partes.join(", "), años };
}

function agregarMetricas(cuentas: any[][]): MetricasAgg {
  const cantidad = cuentas.length;
  let capitalTotal = 0;
  let interesTotal = 0;
  let primerEmision: Date | null = null;
  const porAñoMap = new Map<number, { capital: number; interes: number; cantidad: number }>();
  const plazos = new Map<number, number>();

  cuentas.forEach((fila) => {
    const capital = parseFloat(fila[5]) || 0;
    const interes = parseFloat(fila[6]) || 0;
    capitalTotal += capital;
    interesTotal += interes;

    const emision = fila[1] ? parseLocalDate(fila[1]) : null;
    if (emision && !isNaN(emision.getTime())) {
      if (!primerEmision || emision < primerEmision) primerEmision = emision;
    }

    // Año por vencimiento (cuando cerró)
    const venc = fila[3] ? parseLocalDate(fila[3]) : emision;
    if (venc && !isNaN(venc.getTime())) {
      const año = venc.getFullYear();
      const cur = porAñoMap.get(año) || { capital: 0, interes: 0, cantidad: 0 };
      cur.capital += capital;
      cur.interes += interes;
      cur.cantidad += 1;
      porAñoMap.set(año, cur);
    }

    const plazo = parseInt(String(fila[2]));
    if (!isNaN(plazo) && plazo > 0) {
      plazos.set(plazo, (plazos.get(plazo) || 0) + 1);
    }
  });

  const porAño = Array.from(porAñoMap.entries())
    .map(([año, v]) => ({ año, ...v }))
    .sort((a, b) => a.año - b.año);

  const añoMasFuerte = porAño.length
    ? porAño.reduce((max, cur) => (cur.capital > max.capital ? cur : max), porAño[0])
    : null;

  let plazoPreferido: number | null = null;
  let maxCount = 0;
  plazos.forEach((count, plazo) => {
    if (count > maxCount) {
      maxCount = count;
      plazoPreferido = plazo;
    }
  });

  const primerAhorroFecha = primerEmision ? (primerEmision as Date).toISOString() : null;
  const { texto: antiguedadTexto, años: añosActivos } = calcularAntiguedad(primerAhorroFecha);

  return {
    cantidad,
    capitalTotal,
    interesTotal,
    primerAhorroFecha,
    añosActivos,
    añoMasFuerte: añoMasFuerte ? { año: añoMasFuerte.año, capital: añoMasFuerte.capital } : null,
    plazoPreferido,
    porAño,
    antiguedadTexto,
  };
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
  accent = "secondary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  accent?: "primary" | "secondary";
}) {
  const ringClass = accent === "secondary" ? "bg-secondary/10 text-secondary" : "bg-primary/10 text-primary";
  return (
    <Card className="border bg-card hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground mt-1.5 break-words">{value}</p>
            {sublabel && <p className="text-[11px] text-muted-foreground mt-1">{sublabel}</p>}
          </div>
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${ringClass}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const HistoricoResumen = ({ nombre, dni, email, cuentas, onVolver }: HistoricoResumenProps) => {
  const { toast } = useToast();
  const metricas = useMemo(() => agregarMetricas(cuentas), [cuentas]);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  useEffect(() => {
    if (cuentas.length === 0) {
      setInsight(null);
      setInsightLoading(false);
      return;
    }
    let cancelled = false;
    setInsightLoading(true);
    setInsightError(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("generar-insight-historico", {
          body: {
            cantidad: metricas.cantidad,
            capitalTotal: metricas.capitalTotal,
            interesTotal: metricas.interesTotal,
            primerAhorroFecha: metricas.primerAhorroFecha,
            añosActivos: metricas.añosActivos,
            añoMasFuerte: metricas.añoMasFuerte,
            plazoPreferido: metricas.plazoPreferido,
            porAño: metricas.porAño,
          },
        });
        if (cancelled) return;
        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "No se pudo generar el análisis");
        }
        setInsight(data?.insight || "");
      } catch (err: any) {
        if (cancelled) return;
        setInsightError(err.message || "No se pudo generar el análisis");
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentas]);

  const handleEnviarPdf = async () => {
    if (cuentas.length === 0) return;
    setEnviandoEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("enviar-resumen-historico-email", {
        body: {
          email,
          nombre,
          dni,
          metricas: {
            cantidad: metricas.cantidad,
            capitalTotal: metricas.capitalTotal,
            interesTotal: metricas.interesTotal,
            primerAhorroFecha: metricas.primerAhorroFecha,
            antiguedadTexto: metricas.antiguedadTexto,
            porAño: metricas.porAño,
          },
          cuentas,
          insight: insight ?? "",
          sessionToken: getSessionToken(),
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Error al enviar el PDF");
      }
      toast({
        title: "✅ Resumen enviado",
        description: `Te enviamos el PDF a ${email}`,
      });
    } catch (err: any) {
      toast({
        title: "Error al enviar",
        description: err.message || "No se pudo enviar el PDF. Intentá nuevamente.",
        variant: "destructive",
      });
    } finally {
      setEnviandoEmail(false);
    }
  };

  if (cuentas.length === 0) {
    return (
      <Card className="w-full max-w-4xl shadow-lg border bg-card">
        <CardContent className="p-6 space-y-4">
          <Button variant="ghost" size="sm" onClick={onVolver} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Volver a la tabla
          </Button>
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No hay datos históricos suficientes para generar un resumen.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const primerAhorroLabel = metricas.primerAhorroFecha
    ? `Desde ${parseLocalDate(metricas.primerAhorroFecha).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}`
    : undefined;

  return (
    <Card className="w-full max-w-4xl shadow-lg border bg-card">
      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Header con volver */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onVolver} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Volver a la tabla
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-secondary" />
            <h2 className="text-base sm:text-lg font-bold text-foreground font-[Sora,DM_Sans,sans-serif]">
              Tu trayectoria en Celesol
            </h2>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Ahorros cerrados"
            value={String(metricas.cantidad)}
            accent="secondary"
          />
          <KpiCard
            icon={<Wallet className="w-5 h-5" />}
            label="Capital invertido"
            value={fmtMoneda(metricas.capitalTotal)}
            accent="primary"
          />
          <KpiCard
            icon={<Coins className="w-5 h-5" />}
            label="Intereses generados"
            value={fmtMoneda(metricas.interesTotal)}
            accent="secondary"
          />
          <KpiCard
            icon={<Calendar className="w-5 h-5" />}
            label="Antigüedad"
            value={metricas.antiguedadTexto}
            sublabel={primerAhorroLabel}
            accent="primary"
          />
        </div>

        {/* Gráfico anual */}
        {metricas.porAño.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Capital e intereses por año</h3>
            <div className="w-full h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metricas.porAño} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="año" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(v)
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => fmtMoneda(value)}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="capital" name="Capital" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="interes" name="Intereses" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Insight IA */}
        <div className="rounded-lg border-2 border-secondary/30 bg-secondary/5 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-secondary" />
            </div>
            <h3 className="text-sm font-semibold text-secondary">Análisis personalizado</h3>
          </div>
          {insightLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[95%]" />
              <Skeleton className="h-4 w-[80%]" />
            </div>
          )}
          {!insightLoading && insightError && (
            <p className="text-sm text-muted-foreground italic">
              No pudimos generar el análisis en este momento. Tu resumen igual está disponible.
            </p>
          )}
          {!insightLoading && !insightError && insight && (
            <p className="text-sm sm:text-[15px] text-foreground leading-relaxed">{insight}</p>
          )}
        </div>

        {/* Acción email */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Download className="w-3.5 h-3.5" />
            <span>Recibí este resumen como PDF en tu correo</span>
          </div>
          <Button
            onClick={handleEnviarPdf}
            disabled={enviandoEmail || insightLoading}
            className="gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
          >
            {enviandoEmail ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" /> Enviar PDF a mi email
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default HistoricoResumen;
