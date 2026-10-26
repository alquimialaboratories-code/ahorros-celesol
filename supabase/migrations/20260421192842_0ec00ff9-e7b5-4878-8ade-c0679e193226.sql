CREATE TABLE public.renovacion_solicitudes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitante_nombre TEXT NOT NULL,
  solicitante_dni TEXT NOT NULL,
  solicitante_email TEXT NOT NULL,
  solicitante_socio_id TEXT NOT NULL,
  cuenta_id TEXT NOT NULL,
  titular_nombre TEXT,
  titular_dni TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_renovacion_solicitudes_cuenta ON public.renovacion_solicitudes(cuenta_id);
CREATE INDEX idx_renovacion_solicitudes_solicitante_dni ON public.renovacion_solicitudes(solicitante_dni);

ALTER TABLE public.renovacion_solicitudes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all access"
ON public.renovacion_solicitudes
FOR ALL
USING (false)
WITH CHECK (false);