import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowRight, Shield } from "lucide-react";

interface LoginStepProps {
  onSubmit: (dni: string, email: string) => void;
  loading: boolean;
  error?: string | null;
}

const LoginStep = ({ onSubmit, loading, error }: LoginStepProps) => {
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(dni, email);
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Consultá tus Ahorros
        </h1>
        <p className="text-muted-foreground">
          Ingresá tus datos para acceder a tu cartera.
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
            <div className="space-y-1.5">
              <Label htmlFor="dni" className="text-sm font-medium">
                Número de Documento (DNI)
              </Label>
              <Input
                id="dni"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ej: 12345678"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                Correo Electrónico Registrado
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="nombre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90"
              disabled={loading}
            >
              {loading ? (
                "Validando..."
              ) : (
                <>
                  Consultar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="w-3.5 h-3.5" />
        <span>Conexión segura · Sus datos no se almacenan</span>
      </div>
    </div>
  );
};

export default LoginStep;
