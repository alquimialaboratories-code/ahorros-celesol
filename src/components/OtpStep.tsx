import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowRight, RotateCcw, Shield, Mail } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface OtpStepProps {
  email: string;
  onVerify: (code: string) => void;
  onResend: () => void;
  loading: boolean;
  error?: string | null;
}

const OtpStep = ({ email, onVerify, onResend, loading, error }: OtpStepProps) => {
  const [code, setCode] = useState("");
  const [resendTimer, setResendTimer] = useState(60);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) onVerify(code);
  };

  const handleResend = () => {
    setResendTimer(60);
    setCode("");
    onResend();
  };

  // Mask email
  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 6)) + c);

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-3">
          <Mail className="w-7 h-7 text-secondary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Verificá tu identidad
        </h1>
        <p className="text-muted-foreground text-sm">
          Enviamos un código de 6 dígitos a<br />
          <span className="font-medium text-foreground">{maskedEmail}</span>
        </p>
      </div>

      <Card className="shadow-lg border bg-card">
        <CardHeader className="pb-0" />
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive" className="text-sm">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={setCode}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90"
              disabled={loading || code.length < 6}
            >
              {loading ? "Verificando..." : (
                <>
                  Verificar código
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>

            <div className="text-center">
              {resendTimer > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Reenviar código en <span className="font-semibold">{resendTimer}s</span>
                </p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResend}
                  className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reenviar código
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="w-3.5 h-3.5" />
        <span>El código expira en 5 minutos</span>
      </div>
    </div>
  );
};

export default OtpStep;
