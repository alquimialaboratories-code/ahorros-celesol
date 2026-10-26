CREATE TABLE public.configuracion_tasas (
  clave text PRIMARY KEY,
  valor numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.configuracion_tasas TO anon, authenticated;
GRANT ALL ON public.configuracion_tasas TO service_role;

ALTER TABLE public.configuracion_tasas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de tasas"
ON public.configuracion_tasas
FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.configuracion_tasas (clave, valor) VALUES ('tna_celesol', 35.5)
ON CONFLICT (clave) DO NOTHING;