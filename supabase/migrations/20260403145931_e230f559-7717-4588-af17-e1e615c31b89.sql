
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all access" ON public.otp_codes
FOR ALL
USING (false)
WITH CHECK (false);
