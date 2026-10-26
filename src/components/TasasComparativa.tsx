import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, Minus, Loader2, BarChart3, AlertCircle, Pencil, Check, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface TasaInstrumento {
  instrumento: string;
  tna30: number;
  tna60?: number;
  detalle?: string;
}

interface TasasData {
  tasas: TasaInstrumento[];
  fechaReferencia: string;
  nota?: string;
}

interface Props {
  isAdmin?: boolean;
}

const DEFAULT_TNA = 35.5;

const TasasComparativa = ({ isAdmin = false }: Props) => {
  const [state, setState] = useState<"idle" | "loading" | "results" | "error">("idle");
  const [data, setData] = useState<TasasData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tnaCelesol, setTnaCelesol] = useState<number>(DEFAULT_TNA);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingTna, setSavingTna] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data: row } = await supabase
        .from("configuracion_tasas")
        .select("valor")
        .eq("clave", "tna_celesol")
        .maybeSingle();
      if (row?.valor != null) setTnaCelesol(Number(row.valor));
    })();
  }, []);

  const formatRelative = (iso?: string) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diff) || diff < 0) return new Date(iso).toLocaleString("es-AR");
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "hace instantes";
    if (mins < 60) return `hace ${mins} min`;
    const hs = Math.floor(mins / 60);
    if (hs < 24) return `hace ${hs} h`;
    const d = Math.floor(hs / 24);
    return `hace ${d} d`;
  };

  const MAX_RETRIES = 3;
  const INITIAL_BACKOFF_MS = 1500;

  const fetchTasas = async (attempt: number): Promise<void> => {
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("tasas-plazo-fijo", {
        body: { tnaActual: tnaCelesol / 100 },
      });

      if (fnError) throw new Error(fnError.message || "Error al consultar");
      if (fnData?.error) {
        const isRetryable = /no disponible|temporarily|timeout|429|503|502/i.test(fnData.error);
        if (isRetryable && attempt < MAX_RETRIES) {
          throw Object.assign(new Error(fnData.error), { retryable: true });
        }
        throw new Error(fnData.error);
      }

      setData(fnData);
      setState("results");
    } catch (err: any) {
      if (err.retryable && attempt < MAX_RETRIES) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        return fetchTasas(attempt + 1);
      }
      setError(err.message || "Error al obtener tasas del mercado");
      setState("error");
    }
  };

  const handleConsultar = async () => {
    setState("loading");
    setError(null);
    await fetchTasas(0);
  };

  const ADMIN_KEYS: { key: string; label: string; instrumento?: string }[] = [
    { key: "tna_celesol", label: "Mutual Celesol" },
  ];

  const getCurrentValue = (key: string): number | undefined => {
    if (key === "tna_celesol") return tnaCelesol;
    const meta = ADMIN_KEYS.find((k) => k.key === key);
    const row = data?.tasas.find((t) => t.instrumento === meta?.instrumento);
    return row?.tna30;
  };

  const startEdit = (key: string) => {
    const v = getCurrentValue(key);
    setEditValue(v != null ? v.toString() : "");
    setEditingKey(key);
  };

  const saveEdit = async (key: string) => {
    const num = Number(editValue.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0 || num > 500) {
      toast({ title: "Valor inválido", description: "Ingresá un número entre 0 y 500.", variant: "destructive" });
      return;
    }
    setSavingTna(true);
    try {
      const { getSessionToken } = await import("@/lib/celesol");
      const { data: res, error: err } = await supabase.functions.invoke("actualizar-tna-celesol", {
        body: { valor: num, clave: key, sessionToken: getSessionToken() },
      });
      if (err || res?.error) throw new Error(res?.error || err?.message || "Error");
      if (key === "tna_celesol") setTnaCelesol(num);
      setEditingKey(null);
      toast({ title: "TNA actualizada", description: `${ADMIN_KEYS.find((k) => k.key === key)?.label}: ${num.toFixed(2)}%` });
      // Refrescar valores si ya hay resultados visibles
      if (state === "results" && key !== "tna_celesol") await fetchTasas(0);
    } catch (e: any) {
      toast({ title: "No se pudo actualizar", description: e.message, variant: "destructive" });
    } finally {
      setSavingTna(false);
    }
  };

  const renderIndicator = (tna30: number) => {
    if (tnaCelesol > tna30 + 0.5) return <TrendingUp className="w-4 h-4 text-secondary" />;
    if (tnaCelesol < tna30 - 0.5) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const adminEditor = isAdmin && (
    <div className="rounded-lg border border-secondary/40 bg-secondary/5 p-3 space-y-2">
      <div className="text-xs">
        <p className="font-semibold text-secondary">Panel admin</p>
        <p className="text-muted-foreground">Ajustá las TNA que se muestran en la comparativa.</p>
      </div>
      <div className="space-y-1.5">
        {ADMIN_KEYS.map(({ key, label }) => {
          const current = getCurrentValue(key);
          const isEditing = editingKey === key;
          return (
            <div key={key} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium">{label}</span>
              {isEditing ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="h-8 w-20 text-sm"
                    disabled={savingTna}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button size="icon" variant="default" className="h-8 w-8" onClick={() => saveEdit(key)} disabled={savingTna}>
                    {savingTna ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingKey(null)} disabled={savingTna}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {current != null ? `${current.toFixed(2)}%` : "—"}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => startEdit(key)} className="gap-1.5 h-8">
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (state === "idle") {
    return (
      <Card className="w-full max-w-4xl border-dashed">
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-semibold text-sm text-foreground">Comparativa de Mercado</p>
              <p className="text-xs text-muted-foreground">
                Compará la TNA de Mutual Celesol con Plazo Fijo, FCI y Letras del Tesoro.
              </p>
            </div>
            <Button onClick={handleConsultar} size="sm" className="shrink-0 gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Consultar tasas
            </Button>
          </div>
          {adminEditor}
        </CardContent>
      </Card>
    );
  }

  if (state === "loading") {
    return (
      <Card className="w-full max-w-4xl">
        <CardContent className="flex flex-col items-center gap-3 p-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Consultando tasas del mercado...</p>
        </CardContent>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card className="w-full max-w-4xl border-destructive/30">
        <CardContent className="flex flex-col items-center gap-3 p-6">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={handleConsultar}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const renderMobile = () => (
    <div className="space-y-2">
      <div className="rounded-lg border-2 border-secondary/30 bg-secondary/10 p-3">
        <div className="font-bold text-secondary text-sm">⭐ Mutual Celesol</div>
        <div className="text-[11px] text-muted-foreground">Plazo Fijo Mutual</div>
        <div className="flex justify-between items-center mt-1 text-xs">
          <span className="text-muted-foreground">TNA</span>
          <span className="font-semibold text-secondary tabular-nums">{tnaCelesol.toFixed(2)}%</span>
        </div>
      </div>
      {data!.tasas.map((t, i) => (
        <div key={i} className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{t.instrumento}</span>
            {renderIndicator(t.tna30)}
          </div>
          {t.detalle && <div className="text-[11px] text-muted-foreground mt-0.5">{t.detalle}</div>}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1.5 text-xs">
            <span className="text-muted-foreground">TNA</span>
            <span className="tabular-nums text-right">{t.tna30.toFixed(2)}%</span>
          </div>

        </div>
      ))}
    </div>
  );

  return (
    <Card className="w-full max-w-4xl shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg">Comparativa de Mercado</CardTitle>
            <p className="text-xs text-muted-foreground">
              Actualizado {formatRelative(data!.fechaReferencia)} · Tu TNA en Celesol:{" "}
              <span className="font-semibold text-secondary">{tnaCelesol.toFixed(2)}%</span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {adminEditor}
        {isMobile ? renderMobile() : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground font-semibold text-xs">Instrumento</TableHead>
                  <TableHead className="text-primary-foreground font-semibold text-xs text-right">TNA</TableHead>
                  <TableHead className="text-primary-foreground font-semibold text-xs text-center">vs Celesol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-secondary/10 font-semibold text-sm border-b-2 border-secondary/30">
                  <TableCell className="font-bold text-secondary">
                    ⭐ Mutual Celesol
                    <div className="text-[11px] font-normal text-muted-foreground">Plazo Fijo Mutual</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-secondary">{tnaCelesol.toFixed(2)}%</TableCell>
                  <TableCell className="text-center">-</TableCell>
                </TableRow>
                {data!.tasas.map((t, i) => (
                  <TableRow key={i} className="even:bg-muted/40 text-sm">
                    <TableCell className="font-medium">
                      {t.instrumento}
                      {t.detalle && <div className="text-[11px] font-normal text-muted-foreground">{t.detalle}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.tna30.toFixed(2)}%</TableCell>
                    <TableCell className="text-center">{renderIndicator(t.tna30)}</TableCell>
                  </TableRow>
                ))}

              </TableBody>
            </Table>
          </div>
        )}

        {data!.nota && <p className="text-xs text-muted-foreground italic">{data!.nota}</p>}

        <p className="text-[10px] text-muted-foreground/70">
          Se muestra la mejor tasa disponible por instrumento, tomada de fuentes públicas (ArgentinaDatos / comparatasas.ar). Pueden diferir de la oferta puntual de cada entidad. La TNA de Mutual Celesol es administrada internamente.
        </p>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleConsultar} className="text-xs">
            Actualizar tasas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TasasComparativa;
