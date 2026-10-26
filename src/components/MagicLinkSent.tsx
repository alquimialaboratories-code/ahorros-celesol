import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail } from "lucide-react";

interface MagicLinkSentProps {
  email: string;
}

const MagicLinkSent = ({ email }: MagicLinkSentProps) => {
  return (
    <Card className="w-full max-w-md shadow-xl border-0">
      <CardHeader className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
            <Mail className="w-6 h-6 text-accent" />
          </div>
        </div>
        <CardTitle className="text-xl">📧 ¡Enlace enviado!</CardTitle>
        <CardDescription className="text-sm">
          Hemos enviado un enlace a <strong>{email}</strong>.
          <br />
          Por favor revisa tu bandeja de entrada o la carpeta de Spam.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
};

export default MagicLinkSent;
