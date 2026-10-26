ALTER TABLE public.renovacion_solicitudes
  ADD COLUMN IF NOT EXISTS opcion text,
  ADD COLUMN IF NOT EXISTS opcion_detalle text,
  ADD COLUMN IF NOT EXISTS ahorro jsonb;