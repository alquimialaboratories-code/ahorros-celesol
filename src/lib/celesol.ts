import { supabase } from "@/integrations/supabase/client";

export interface SocioInfo {
  dni: string;
  id: string;
  nombre: string;
}

export interface EnviarOtpResult {
  success: boolean;
  nombre: string;
  id: string;
  message: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  sessionToken: string;
  expiresAt: string;
  nombre: string;
  id: string;
  isAdmin: boolean;
}

// In-memory session (cleared on tab reload / logout)
let currentSessionToken: string | null = null;
let currentIsAdmin = false;

export function getSessionToken(): string | null {
  return currentSessionToken;
}

export function isCurrentAdmin(): boolean {
  return currentIsAdmin;
}

export function clearSession() {
  currentSessionToken = null;
  currentIsAdmin = false;
}

export async function validarSocio(dni: string, email: string): Promise<SocioInfo> {
  const { data, error } = await supabase.functions.invoke("celesol-proxy", {
    body: { action: "validar-socio", dni, email },
  });

  if (error) {
    throw new Error(data?.error || "Error de conexión con el servidor.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as SocioInfo;
}

export async function enviarOtp(dni: string, email: string): Promise<EnviarOtpResult> {
  const { data, error } = await supabase.functions.invoke("celesol-proxy", {
    body: { action: "enviar-otp", dni, email },
  });

  if (error) {
    throw new Error(data?.error || "Error al enviar código de verificación.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as EnviarOtpResult;
}

export async function verificarOtp(dni: string, code: string): Promise<VerifyOtpResult> {
  const { data, error } = await supabase.functions.invoke("celesol-proxy", {
    body: { action: "verificar-otp", dni, code },
  });

  if (error) {
    throw new Error(data?.error || "Error al verificar código.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const result = data as VerifyOtpResult;
  currentSessionToken = result.sessionToken;
  currentIsAdmin = !!result.isAdmin;
  return result;
}

export async function cargarCuentas(dni: string, userId: string): Promise<{ cuentas: any[][]; mapaDueños: Record<string, string[]> }> {
  const { data, error } = await supabase.functions.invoke("celesol-proxy", {
    body: { action: "cargar-cuentas", dni, userId, sessionToken: currentSessionToken },
  });

  if (error) {
    throw new Error(data?.error || "Error al cargar cuentas.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as { cuentas: any[][]; mapaDueños: Record<string, string[]> };
}

export async function cargarHistoricos(dni: string, userId: string): Promise<{ cuentas: any[][]; mapaDueños: Record<string, string[]> }> {
  const { data, error } = await supabase.functions.invoke("celesol-proxy", {
    body: { action: "cargar-historicos", dni, userId, sessionToken: currentSessionToken },
  });

  if (error) {
    throw new Error(data?.error || "Error al cargar históricos.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as { cuentas: any[][]; mapaDueños: Record<string, string[]> };
}

export type RenovacionOpcion =
  | "Renovación Total"
  | "Renovación Parcial con Retiro"
  | "Retiro Total"
  | "Otros";

export async function solicitarRenovacion(params: {
  dni: string;
  email: string;
  userId: string;
  nombreSolicitante: string;
  cuentaId: string;
  titularNombre?: string;
  titularDni?: string;
  opcion: RenovacionOpcion;
  opcionDetalle?: string;
  ahorro?: {
    emision?: string;
    plazo?: string | number;
    vencimiento?: string;
    tna?: string | number;
    capital?: number;
    interes?: number;
  };
}): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke("celesol-proxy", {
    body: { action: "solicitar-renovacion", ...params, sessionToken: currentSessionToken },
  });

  if (error) {
    throw new Error(data?.error || "Error al registrar la renovación.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as { success: boolean };
}

// Formatting helpers
export const fmtMoneda = (v: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v);

// Parsea "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss" como fecha LOCAL (no UTC),
// para evitar el desfase de 1 día en zonas horarias negativas como AR (UTC-3).
export const parseLocalDate = (f: string): Date => {
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(f);
};

export const fmtFecha = (f: string) =>
  f ? parseLocalDate(f).toLocaleDateString('es-AR') : "-";

export const fmtPorcentaje = (p: number | string) =>
  p ? (parseFloat(String(p)) * 100).toFixed(2) + "%" : "-";
