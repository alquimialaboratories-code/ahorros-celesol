CREATE TABLE public.tasas_mercado_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrumento text NOT NULL UNIQUE,
  tna30 numeric,
  tna60 numeric,
  detalle text,
  fuente_url text,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tasas_mercado_cache TO anon, authenticated;
GRANT ALL ON public.tasas_mercado_cache TO service_role;

ALTER TABLE public.tasas_mercado_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de tasas cache"
  ON public.tasas_mercado_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.configuracion_tasas (clave, valor)
VALUES ('tna_pf_tradicional', 29.0), ('tna_fci_mm', 24.0)
ON CONFLICT (clave) DO NOTHING;