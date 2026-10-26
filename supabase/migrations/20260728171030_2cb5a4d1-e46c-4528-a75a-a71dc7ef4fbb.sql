
DROP POLICY IF EXISTS "email_assets_public_read" ON storage.objects;
CREATE POLICY "email_assets_public_read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'email-assets');

DROP POLICY IF EXISTS "deny_writes_anon_authenticated_insert" ON storage.objects;
CREATE POLICY "deny_writes_anon_authenticated_insert"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "deny_writes_anon_authenticated_update" ON storage.objects;
CREATE POLICY "deny_writes_anon_authenticated_update"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "deny_writes_anon_authenticated_delete" ON storage.objects;
CREATE POLICY "deny_writes_anon_authenticated_delete"
ON storage.objects
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);
