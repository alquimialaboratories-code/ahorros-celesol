
-- otp_sessions: server-issued session token after OTP verification
CREATE TABLE public.otp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  dni text NOT NULL,
  email text NOT NULL,
  socio_id text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.otp_sessions TO service_role;
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access" ON public.otp_sessions FOR ALL USING (false) WITH CHECK (false);
CREATE INDEX otp_sessions_token_idx ON public.otp_sessions(token);

-- admin_allowlist: server-side admin identities (no hardcoded creds in client)
CREATE TABLE public.admin_allowlist (
  dni text PRIMARY KEY,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_allowlist TO service_role;
ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access" ON public.admin_allowlist FOR ALL USING (false) WITH CHECK (false);
INSERT INTO public.admin_allowlist (dni, email) VALUES ('38504004', 'diegofriastrebucq@gmail.com');

-- Storage: remove policy that allowed listing objects in email-assets bucket.
-- Individual object public URLs continue to work via the CDN bypass because the bucket is still public.
DROP POLICY IF EXISTS "Public read access" ON storage.objects;

-- Explicit intent for renovacion_solicitudes: inserts occur only via service role (bypasses RLS).
CREATE POLICY "Backend-only inserts via service role"
  ON public.renovacion_solicitudes FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);
