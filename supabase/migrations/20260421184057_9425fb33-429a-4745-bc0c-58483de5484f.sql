CREATE TABLE public.email_send_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dni text NOT NULL,
  email text NOT NULL,
  tipo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_send_log_dni_created ON public.email_send_log (dni, tipo, created_at DESC);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all access" ON public.email_send_log AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);