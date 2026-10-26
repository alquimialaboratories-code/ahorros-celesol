import { useState } from "react";
import LoginStep from "@/components/LoginStep";
import OtpStep from "@/components/OtpStep";
import ResultsStep from "@/components/ResultsStep";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { enviarOtp, verificarOtp, cargarCuentas, clearSession } from "@/lib/celesol";
import TasasComparativa from "@/components/TasasComparativa";
import celesolLogo from "@/assets/celesol_logo.png";

type Step = "login" | "otp" | "loading" | "accounts-error" | "results";

const Consultas = () => {
  const [step, setStep] = useState<Step>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState("Procesando...");
  const { toast } = useToast();

  const [socioNombre, setSocioNombre] = useState("");
  const [socioDni, setSocioDni] = useState("");
  const [socioId, setSocioId] = useState("");
  const [socioEmail, setSocioEmail] = useState("");
  const [cuentas, setCuentas] = useState<any[][]>([]);
  const [mapaDueños, setMapaDueños] = useState<Record<string, string[]>>({});
  const [isAdmin, setIsAdmin] = useState(false);

  const handleLogin = async (dniVal: string, emailVal: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await enviarOtp(dniVal, emailVal);
      setSocioNombre(result.nombre);
      setSocioDni(dniVal);
      setSocioId(result.id);
      setSocioEmail(emailVal);
      setStep("otp");
    } catch (err: any) {
      let msg = err.message;
      if (msg.includes("Failed to fetch")) {
        msg = "Fallo de red. Por favor, acepta el certificado de seguridad de la API.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadAccounts = async () => {
    setLoading(true);
    setError(null);
    setStep("loading");
    setLoadingText("Obteniendo cartera y cotitulares...");
    try {
      const resultado = await cargarCuentas(socioDni, socioId);
      setCuentas(resultado.cuentas);
      setMapaDueños(resultado.mapaDueños);
      setStep("results");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No pudimos cargar tus ahorros. Intentá nuevamente.");
      setStep("accounts-error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const verifyRes = await verificarOtp(socioDni, code);
      setIsAdmin(verifyRes.isAdmin);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No pudimos verificar el código. Intentá nuevamente.");
      setLoading(false);
      return;
    }
    await handleLoadAccounts();
  };

  const handleResendOtp = async () => {
    setError(null);
    try {
      await enviarOtp(socioDni, socioEmail);
      toast({ title: "Código reenviado", description: "Revisá tu correo electrónico." });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    clearSession();
    setStep("login");
    setSocioNombre("");
    setSocioDni("");
    setSocioId("");
    setSocioEmail("");
    setCuentas([]);
    setMapaDueños({});
    setIsAdmin(false);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 sm:px-6 h-24">
          <img src={celesolLogo} alt="Mutual Celesol" className="h-16 sm:h-20" />
          {(step === "results" || step === "otp" || step === "accounts-error") && (
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground gap-1.5">
              <LogOut className="w-4 h-4" />
              {step === "results" ? "Página Principal" : "Volver"}
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-3 sm:px-4 py-6 sm:py-10 gap-6">
        {step === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-secondary" />
            </div>
            <p className="text-muted-foreground text-sm">{loadingText}</p>
          </div>
        )}

        {step === "login" && <LoginStep onSubmit={handleLogin} loading={loading} error={error} />}

        {step === "accounts-error" && (
          <div className="w-full max-w-md space-y-5">
            <h1 className="text-2xl font-bold text-center text-foreground">No pudimos cargar tus ahorros</h1>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button onClick={handleLoadAccounts} disabled={loading} className="w-full h-11 gap-2">
              <RotateCcw className="w-4 h-4" />
              Reintentar consulta
            </Button>
          </div>
        )}

        {step === "otp" && (
          <OtpStep
            email={socioEmail}
            onVerify={handleVerifyOtp}
            onResend={handleResendOtp}
            loading={loading}
            error={error}
          />
        )}

        {step === "results" && (
          <>
            <ResultsStep
              nombre={socioNombre}
              dni={socioDni}
              email={socioEmail}
              cuentas={cuentas}
              mapaDueños={mapaDueños}
              socioId={socioId}
            />
            <TasasComparativa isAdmin={isAdmin} />
          </>
        )}
      </main>

      <footer className="w-full border-t py-4 space-y-2">
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Mutual Celesol · Sistema de Autogestión
        </p>
        <p className="text-center text-[11px] text-muted-foreground/70 mt-1">
          Powered by <span className="font-semibold">Red Unisol</span>
        </p>
      </footer>
    </div>
  );
};

export default Consultas;
