import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FolderOpen, User, Briefcase, Calculator, RefreshCw, CheckCircle2, Loader2, History, Mail, Sparkles, MoreVertical } from "lucide-react";
import HistoricoResumen from "@/components/HistoricoResumen";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fmtMoneda, fmtFecha, fmtPorcentaje, cargarHistoricos, solicitarRenovacion, getSessionToken, type RenovacionOpcion } from "@/lib/celesol";
import { useState, useEffect } from "react";
import { TrendingUp } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface ResultsStepProps {
  nombre: string;
  dni: string;
  email: string;
  cuentas: any[][];
  mapaDueños: Record<string, string[]>;
  socioId: string;
}

function CuentaMobileCard({ fila, onRenovar, renovado, readonly }: { fila: any[]; onRenovar?: (fila: any[]) => void; renovado?: boolean; readonly?: boolean }) {
  const capital = parseFloat(fila[5]) || 0;
  const interes = parseFloat(fila[6]) || 0;
  const total = capital + interes;
  const cardClass = readonly
    ? "rounded-lg border p-3 text-sm bg-gray-50 border-gray-200 dark:bg-gray-900/30 dark:border-gray-700"
    : `rounded-lg border p-3 text-sm ${renovado ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800" : "bg-card"}`;
  return (
    <div className={cardClass}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground text-base">#{fila[0]}</span>
          {renovado && !readonly && (
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-emerald-300 text-emerald-700 bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-900/40">
              <CheckCircle2 className="w-3 h-3" /> Renovación solicitada
            </Badge>
          )}
        </div>
        {!readonly && !renovado && onRenovar && (
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => onRenovar(fila)}>
            <MoreVertical className="w-3.5 h-3.5" /> Acciones
          </Button>
        )}
      </div>
      <div className="space-y-0.5 text-xs">
        {[
          ["Emisión", fmtFecha(fila[1])],
          ["Plazo", `${fila[2]} días`],
          ["Vencimiento", fmtFecha(fila[3])],
          ["TNA", fmtPorcentaje(fila[4])],
          ["Capital", fmtMoneda(capital)],
          ["Interés", fmtMoneda(interes)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between items-center py-0.5">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums text-right">{value}</span>
          </div>
        ))}
      </div>
      <div className="pt-1.5 mt-1.5 border-t flex justify-between items-center">
        <span className="text-xs text-muted-foreground font-medium">Total Venc.</span>
        <span className={`font-bold tabular-nums ${readonly ? "text-gray-500" : "text-secondary"}`}>{fmtMoneda(total)}</span>
      </div>
      {renovado && !readonly && (
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1.5 italic">
          Se renovará automáticamente al vencimiento
        </p>
      )}
    </div>
  );
}

function CuentaTable({ filas, onRenovar, renovados, readonly }: { filas: any[][]; onRenovar?: (fila: any[]) => void; renovados?: Set<string>; readonly?: boolean }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="space-y-2">
        {filas.map((fila, i) => (
          <CuentaMobileCard key={i} fila={fila} onRenovar={onRenovar} renovado={renovados?.has(String(fila[0]))} readonly={readonly} />
        ))}
      </div>
    );
  }

  const headerClass = readonly ? "bg-gray-400 hover:bg-gray-400" : "bg-primary hover:bg-primary";
  const headerTextClass = readonly ? "text-white font-semibold text-xs px-2 py-2" : "text-primary-foreground font-semibold text-xs px-2 py-2";

  return (
    <div className="overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className={headerClass}>
            <TableHead className={headerTextClass}>Nro</TableHead>
            <TableHead className={headerTextClass}>Emisión</TableHead>
            <TableHead className={headerTextClass}>Plazo</TableHead>
            <TableHead className={headerTextClass}>Venc.</TableHead>
            <TableHead className={headerTextClass}>TNA</TableHead>
            <TableHead className={`${headerTextClass} text-right`}>Capital</TableHead>
            <TableHead className={`${headerTextClass} text-right`}>Interés</TableHead>
            <TableHead className={`${headerTextClass} text-right`}>Total Venc.</TableHead>
            {!readonly && <TableHead className={`${headerTextClass} text-center whitespace-nowrap`}>Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((fila, i) => {
            const capital = parseFloat(fila[5]) || 0;
            const interes = parseFloat(fila[6]) || 0;
            const total = capital + interes;
            const esRenovado = renovados?.has(String(fila[0]));
            return (
              <TableRow key={i} className={`text-xs ${readonly ? "even:bg-gray-50 dark:even:bg-gray-900/20" : esRenovado ? "bg-emerald-50 dark:bg-emerald-950/20" : "even:bg-muted/40"}`}>
                <TableCell className="font-medium px-2 py-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    #{fila[0]}
                    {esRenovado && !readonly && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                  </div>
                </TableCell>
                <TableCell className="px-2 py-1.5 whitespace-nowrap">{fmtFecha(fila[1])}</TableCell>
                <TableCell className="px-2 py-1.5">{fila[2]}d</TableCell>
                <TableCell className="px-2 py-1.5 whitespace-nowrap">{fmtFecha(fila[3])}</TableCell>
                <TableCell className="px-2 py-1.5">{fmtPorcentaje(fila[4])}</TableCell>
                <TableCell className="text-right tabular-nums px-2 py-1.5 whitespace-nowrap">{fmtMoneda(capital)}</TableCell>
                <TableCell className="text-right tabular-nums px-2 py-1.5 whitespace-nowrap">{fmtMoneda(interes)}</TableCell>
                <TableCell className={`text-right font-semibold tabular-nums px-2 py-1.5 whitespace-nowrap ${readonly ? "text-gray-500" : "text-secondary"}`}>{fmtMoneda(total)}</TableCell>
                {!readonly && (
                  <TableCell className="text-center px-2 py-1.5">
                    {esRenovado ? (
                      <Badge variant="outline" className="text-[10px] h-5 gap-0.5 border-emerald-300 text-emerald-700 bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-900/40 whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3" /> Renovación
                      </Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => onRenovar?.(fila)} aria-label="Acciones del ahorro">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CarteraCliente({ nombre, cuentas, onRenovar, renovados, readonly }: { nombre: string; cuentas: any[][]; onRenovar?: (fila: any[]) => void; renovados?: Set<string>; readonly?: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerClass = readonly ? "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700" : "bg-muted/50 hover:bg-muted/80";
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border overflow-hidden mb-3">
      <CollapsibleTrigger className={`w-full flex items-center justify-between px-4 py-3 ${triggerClass} transition-colors cursor-pointer`}>
        <span className="font-semibold text-sm text-foreground">{nombre}</span>
        <span className="flex items-center gap-2 text-xs">
          <span className="bg-card px-2 py-0.5 rounded-full border text-muted-foreground">{cuentas.length} cuenta(s)</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CuentaTable filas={cuentas} onRenovar={onRenovar} renovados={renovados} readonly={readonly} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function calcTotales(filas: any[][]) {
  const capital = filas.reduce((s, f) => s + (parseFloat(f[5]) || 0), 0);
  const interes = filas.reduce((s, f) => s + (parseFloat(f[6]) || 0), 0);
  return { capital, interes, total: capital + interes };
}

function truncarNombre(nombre: string, max = 20): string {
  if (nombre.length <= max) return nombre;
  // If it contains " & ", show first name + "y N más"
  const partes = nombre.split(" & ");
  if (partes.length > 1) {
    const primer = partes[0].split(" ").slice(0, 2).join(" ");
    return `${primer} +${partes.length - 1}`;
  }
  return nombre.slice(0, max) + "…";
}

function ResumenLinea({ icon, label, totales, destacado = false }: {
  icon: React.ReactNode; label: string; totales: { capital: number; interes: number; total: number }; destacado?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const displayLabel = isMobile ? truncarNombre(label) : label;
  const cls = destacado
    ? "rounded-lg bg-secondary/10 border-2 border-secondary/30 p-3"
    : "rounded-lg bg-card border p-3";

  if (destacado) {
    return (
      <div className={cls}>
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs font-semibold truncate text-secondary">{displayLabel}</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">Capital</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{fmtMoneda(totales.capital)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">Interés</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{fmtMoneda(totales.interes)}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-dashed">
            <span className="text-[11px] text-muted-foreground">Total Venc.</span>
            <span className="text-sm font-bold tabular-nums text-secondary">{fmtMoneda(totales.total)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cls}>
      <CollapsibleTrigger className="w-full flex items-center justify-between cursor-pointer gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon}
          <span className="text-xs font-semibold truncate text-foreground" title={label}>{displayLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold tabular-nums text-foreground whitespace-nowrap">{fmtMoneda(totales.total)}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {isMobile && label !== displayLabel && (
          <p className="text-[10px] text-muted-foreground mt-1.5 mb-1">{label}</p>
        )}
        <div className="space-y-1 mt-2 pt-2 border-t border-dashed">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">Capital</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{fmtMoneda(totales.capital)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">Interés</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{fmtMoneda(totales.interes)}</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CuentasView({ nombre, cuentas, mapaDueños, readonly, onRenovar, renovados }: {
  nombre: string; cuentas: any[][]; mapaDueños: Record<string, string[]>; readonly?: boolean;
  onRenovar?: (fila: any[]) => void; renovados?: Set<string>;
}) {
  const misAhorros: any[][] = [];
  const carteraDesignados: Record<string, any[][]> = {};

  cuentas.forEach((fila) => {
    const idCuenta = fila[0];
    const titulares = mapaDueños[idCuenta] || ["Socio Desconocido"];
    const nombresUnidos = titulares.join(" & ");
    if (titulares.includes(nombre)) {
      misAhorros.push(fila);
    } else {
      if (!carteraDesignados[nombresUnidos]) carteraDesignados[nombresUnidos] = [];
      carteraDesignados[nombresUnidos].push(fila);
    }
  });

  const clientesGrupos = Object.keys(carteraDesignados);
  const hayCartera = clientesGrupos.length > 0;
  const totalGeneral = calcTotales(cuentas);
  const totalesMios = calcTotales(misAhorros);

  if (cuentas.length === 0) {
    return (
      <div className="flex items-center gap-3 p-6 rounded-lg bg-muted text-muted-foreground">
        <FolderOpen className="w-6 h-6 shrink-0" />
        <p className="text-sm">{readonly ? "No se encontraron ahorros históricos." : "El socio no tiene Ahorros vigentes en este momento."}</p>
      </div>
    );
  }

  return (
    <>
      {misAhorros.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <User className={`w-4 h-4 ${readonly ? "text-gray-400" : "text-secondary"}`} />
            <h3 className={`text-sm font-semibold ${readonly ? "text-gray-500" : "text-secondary"}`}>Mis Ahorros</h3>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <CuentaTable filas={misAhorros} onRenovar={onRenovar} renovados={renovados} readonly={readonly} />
          </div>
        </div>
      )}

      {hayCartera && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className={`w-4 h-4 ${readonly ? "text-gray-400" : "text-primary"}`} />
            <h3 className={`text-sm font-semibold ${readonly ? "text-gray-500" : "text-primary"}`}>Mi Cartera de Clientes</h3>
          </div>
          {clientesGrupos.map((grupo) => (
            <CarteraCliente key={grupo} nombre={grupo} cuentas={carteraDesignados[grupo]} onRenovar={onRenovar} renovados={renovados} readonly={readonly} />
          ))}
        </div>
      )}

      {/* Resumen */}
      <div className={`rounded-lg border p-4 ${readonly ? "bg-gray-50/50 dark:bg-gray-900/20" : "bg-muted/30"}`}>
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="w-4 h-4 text-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Resumen General</h3>
        </div>

        {hayCartera ? (
          <div className="space-y-2">
            {misAhorros.length > 0 && (
              <ResumenLinea
                icon={<User className="w-3.5 h-3.5 text-secondary" />}
                label="Mis Ahorros"
                totales={totalesMios}
              />
            )}
            {clientesGrupos.map((grupo) => (
              <ResumenLinea
                key={grupo}
                icon={<Briefcase className="w-3.5 h-3.5 text-primary" />}
                label={grupo}
                totales={calcTotales(carteraDesignados[grupo])}
              />
            ))}
            <Separator className="my-2" />
            <ResumenLinea
              icon={<Calculator className="w-3.5 h-3.5 text-secondary" />}
              label="TOTAL GENERAL"
              totales={totalGeneral}
              destacado
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-card border p-3 text-center">
              <p className="text-xs text-muted-foreground">Capital Total</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{fmtMoneda(totalGeneral.capital)}</p>
            </div>
            <div className="rounded-lg bg-card border p-3 text-center">
              <p className="text-xs text-muted-foreground">Interés Total</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{fmtMoneda(totalGeneral.interes)}</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${readonly ? "bg-gray-100 border-2 border-gray-300 dark:bg-gray-800 dark:border-gray-600" : "bg-secondary/10 border-2 border-secondary/30"}`}>
              <p className="text-xs text-muted-foreground">Total al Vencimiento</p>
              <p className={`text-lg font-bold tabular-nums ${readonly ? "text-gray-500" : "text-secondary"}`}>{fmtMoneda(totalGeneral.total)}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const ResultsStep = ({ nombre, dni, email, cuentas, mapaDueños, socioId }: ResultsStepProps) => {
  const [renovados, setRenovados] = useState<Set<string>>(new Set());
  const [renovandoId, setRenovandoId] = useState<string | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [dialogFila, setDialogFila] = useState<any[] | null>(null);
  const [otrosTexto, setOtrosTexto] = useState("");
  const [tnaCelesol, setTnaCelesol] = useState<number>(35.5);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("configuracion_tasas")
        .select("valor")
        .eq("clave", "tna_celesol")
        .maybeSingle();
      if (data?.valor != null) setTnaCelesol(Number(data.valor));
    })();
  }, []);

  // Históricos state
  const [historicoCuentas, setHistoricoCuentas] = useState<any[][] | null>(null);
  const [historicoMapaDueños, setHistoricoMapaDueños] = useState<Record<string, string[]>>({});
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoError, setHistoricoError] = useState<string | null>(null);
  const [historicoVista, setHistoricoVista] = useState<"tabla" | "resumen">("tabla");

  const handleTabChange = async (value: string) => {
    if (value === "historicos" && historicoCuentas === null && !historicoLoading) {
      setHistoricoLoading(true);
      setHistoricoError(null);
      try {
        const result = await cargarHistoricos(dni, socioId);
        setHistoricoCuentas(result.cuentas);
        setHistoricoMapaDueños(result.mapaDueños);
      } catch (err: any) {
        setHistoricoError(err.message);
        setHistoricoCuentas([]);
      } finally {
        setHistoricoLoading(false);
      }
    }
  };

  const abrirDialogo = (fila: any[]) => {
    const cuentaId = String(fila[0]);
    if (renovados.has(cuentaId) || renovandoId === cuentaId) return;
    setOtrosTexto("");
    setDialogFila(fila);
  };

  const confirmarOpcion = async (opcion: RenovacionOpcion) => {
    if (!dialogFila) return;
    const fila = dialogFila;
    const cuentaId = String(fila[0]);
    const detalle = opcion === "Otros" ? otrosTexto.trim() : undefined;
    if (opcion === "Otros" && !detalle) {
      toast({ title: "Detalle requerido", description: "Por favor describí brevemente lo que necesitás.", variant: "destructive" });
      return;
    }
    setRenovandoId(cuentaId);
    try {
      const titulares = mapaDueños[cuentaId] || [];
      const esMio = titulares.includes(nombre);
      const titularNombre = !esMio && titulares.length > 0 ? titulares.join(" & ") : undefined;

      await solicitarRenovacion({
        dni,
        email,
        userId: socioId,
        nombreSolicitante: nombre,
        cuentaId,
        titularNombre,
        opcion,
        opcionDetalle: detalle,
        ahorro: {
          emision: fila[1],
          plazo: fila[2],
          vencimiento: fila[3],
          tna: fila[4],
          capital: parseFloat(fila[5]) || 0,
          interes: parseFloat(fila[6]) || 0,
        },
      });

      setRenovados(prev => new Set(prev).add(cuentaId));
      setDialogFila(null);
      toast({
        title: "✅ Solicitud registrada",
        description: `Tu solicitud (${opcion}) sobre el ahorro #${cuentaId} fue enviada correctamente.`,
      });
    } catch (err: any) {
      toast({
        title: "Error al enviar la solicitud",
        description: err.message || "Intentá nuevamente más tarde.",
        variant: "destructive",
      });
    } finally {
      setRenovandoId(null);
    }
  };

  const handleEnviarResumen = async () => {
    if (cuentas.length === 0) {
      toast({ title: "Sin ahorros", description: "No hay cuentas vigentes para enviar.", variant: "destructive" });
      return;
    }
    setEnviandoEmail(true);
    try {
      const cuentasPayload = cuentas.map((fila) => {
        const idCuenta = String(fila[0]);
        const titulares = mapaDueños[idCuenta] || ["Socio Desconocido"];
        const esMio = titulares.includes(nombre);
        return {
          nro: fila[0],
          emision: fila[1],
          plazo: fila[2],
          vencimiento: fila[3],
          tna: fila[4],
          capital: parseFloat(fila[5]) || 0,
          interes: parseFloat(fila[6]) || 0,
          titulares: titulares.join(" & "),
          categoria: esMio ? "Mis Ahorros" : "Cartera de Clientes",
        };
      });

      const { data, error } = await supabase.functions.invoke("enviar-resumen-email", {
        body: { email, nombre, dni, cuentas: cuentasPayload, sessionToken: getSessionToken() },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Error al enviar el email");
      }

      toast({
        title: "✅ Resumen enviado",
        description: `Te enviamos el detalle de tus ahorros a ${email}`,
      });
    } catch (err: any) {
      toast({
        title: "Error al enviar",
        description: err.message || "No se pudo enviar el resumen. Intentá nuevamente.",
        variant: "destructive",
      });
    } finally {
      setEnviandoEmail(false);
    }
  };

  // Si está en vista resumen analítico, mostrar solo eso
  if (historicoVista === "resumen" && historicoCuentas !== null) {
    return (
      <HistoricoResumen
        nombre={nombre}
        dni={dni}
        email={email}
        cuentas={historicoCuentas}
        onVolver={() => setHistoricoVista("tabla")}
      />
    );
  }

  return (
    <>
      <Card className="w-full max-w-4xl shadow-lg border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary/15 flex items-center justify-center">
                <User className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <CardTitle className="text-lg">
                  Bienvenido/a, <span className="text-secondary">{nombre}</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">DNI: {dni}</p>
              </div>
            </div>
            {cuentas.length > 0 && (
              <Button
                onClick={handleEnviarResumen}
                disabled={enviandoEmail}
                size="sm"
                className="gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              >
                {enviandoEmail ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Mail className="w-4 h-4" /> Enviar resumen por email</>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="vigentes" onValueChange={handleTabChange}>
            <TabsList className="mb-4 w-full sm:w-auto">
              <TabsTrigger value="vigentes" className="gap-1.5">
                <Calculator className="w-3.5 h-3.5" /> Vigentes
              </TabsTrigger>
              <TabsTrigger value="historicos" className="gap-1.5">
                <History className="w-3.5 h-3.5" /> Históricos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vigentes" className="space-y-6">
              <CuentasView
                nombre={nombre}
                cuentas={cuentas}
                mapaDueños={mapaDueños}
                onRenovar={abrirDialogo}
                renovados={renovados}
              />
            </TabsContent>

            <TabsContent value="historicos" className="space-y-6">
              {historicoLoading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  <p className="text-sm text-muted-foreground">Cargando históricos...</p>
                </div>
              )}
              {historicoError && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
                  <p className="text-sm">{historicoError}</p>
                </div>
              )}
              {!historicoLoading && historicoCuentas !== null && (
                <>
                  {historicoCuentas.length > 0 && (
                    <div className="flex justify-end">
                      <Button
                        onClick={() => setHistoricoVista("resumen")}
                        size="sm"
                        className="gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                      >
                        <Sparkles className="w-4 h-4" />
                        Ver resumen analítico
                      </Button>
                    </div>
                  )}
                  <CuentasView
                    nombre={nombre}
                    cuentas={historicoCuentas}
                    mapaDueños={historicoMapaDueños}
                    readonly
                  />
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={dialogFila !== null} onOpenChange={(open) => { if (!open) setDialogFila(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-semibold">
              Acciones sobre el ahorro {dialogFila ? `#${dialogFila[0]}` : ""}
            </DialogTitle>
            <DialogDescription>
              Elegí la acción que querés solicitar para este ahorro.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-secondary">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">TNA Mutual Celesol</span>
            </div>
            <span className="text-base font-bold text-secondary tabular-nums">{tnaCelesol.toFixed(2)}%</span>
          </div>


          <div className="grid grid-cols-1 gap-2 mt-2">
            {(["Renovación Total", "Renovación Parcial con Retiro", "Retiro Total"] as RenovacionOpcion[]).map((op) => (
              <Button
                key={op}
                variant="outline"
                className="justify-start gap-2 h-11 text-sm font-medium border-secondary/30 hover:bg-secondary/10 hover:text-secondary hover:border-secondary"
                disabled={renovandoId !== null}
                onClick={() => confirmarOpcion(op)}
              >
                <RefreshCw className="w-4 h-4" /> {op}
              </Button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Otros</label>
            <Textarea
              placeholder="Describí brevemente lo que necesitás..."
              value={otrosTexto}
              onChange={(e) => setOtrosTexto(e.target.value)}
              rows={3}
              maxLength={1000}
              disabled={renovandoId !== null}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2"
                disabled={renovandoId !== null || !otrosTexto.trim()}
                onClick={() => confirmarOpcion("Otros")}
              >
                {renovandoId !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Enviar "Otros"
              </Button>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="ghost" size="sm" onClick={() => setDialogFila(null)} disabled={renovandoId !== null}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ResultsStep;