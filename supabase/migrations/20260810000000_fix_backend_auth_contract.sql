-- Repair the authentication contract used by the web app and external API.
-- This migration is intentionally idempotent and can be applied after 00012.

BEGIN;

-- The old zero-argument function always used auth.uid() as the store id. That
-- breaks multi-unit accounts and could leave company_profile and the protected
-- credential table with different keys.
DROP FUNCTION IF EXISTS public.regenerate_external_api_key();
DROP FUNCTION IF EXISTS public.regenerate_external_api_key(uuid);

CREATE FUNCTION public.regenerate_external_api_key(p_store_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_store_id uuid;
  new_api_key uuid := gen_random_uuid();
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required';
  END IF;

  target_store_id := COALESCE(p_store_id, auth.uid());
  IF target_store_id IS NULL THEN
    RAISE EXCEPTION 'BAD_REQUEST: Store id is required';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.has_access_to_store(target_store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', target_store_id;
  END IF;

  INSERT INTO public.store_integration_credentials (
    store_id,
    external_api_key,
    updated_at
  )
  VALUES (
    target_store_id,
    new_api_key,
    now()
  )
  ON CONFLICT (store_id) DO UPDATE
  SET external_api_key = EXCLUDED.external_api_key,
      updated_at = now();

  -- Keep the legacy private column synchronized while older server handlers
  -- are migrated to store_integration_credentials. The public view excludes it.
  UPDATE public.company_profile
  SET external_api_key = new_api_key
  WHERE user_id = target_store_id;

  RETURN new_api_key::text;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_external_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_external_api_key(uuid) TO authenticated, service_role;

-- All writes to the protected credentials table go through this tenant-aware
-- RPC. The frontend has no direct table grants.
CREATE OR REPLACE FUNCTION public.update_store_credentials(
  p_store_id uuid,
  p_credentials jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.has_access_to_store(p_store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_store_id;
  END IF;

  INSERT INTO public.store_integration_credentials (
    store_id,
    ifood_merchant_id,
    mp_access_token,
    mp_refresh_token,
    mp_user_id,
    mp_token_expires_at,
    mercado_pago_customer_id,
    mercado_pago_default_card_id,
    focusnfe_token,
    focusnfe_cert_valid_until,
    updated_at
  )
  VALUES (
    p_store_id,
    p_credentials->>'ifood_merchant_id',
    p_credentials->>'mp_access_token',
    p_credentials->>'mp_refresh_token',
    p_credentials->>'mp_user_id',
    NULLIF(p_credentials->>'mp_token_expires_at', '')::timestamptz,
    p_credentials->>'mercado_pago_customer_id',
    p_credentials->>'mercado_pago_default_card_id',
    p_credentials->>'focusnfe_token',
    p_credentials->>'focusnfe_cert_valid_until',
    now()
  )
  ON CONFLICT (store_id) DO UPDATE
  SET ifood_merchant_id = CASE WHEN p_credentials ? 'ifood_merchant_id' THEN EXCLUDED.ifood_merchant_id ELSE store_integration_credentials.ifood_merchant_id END,
      mp_access_token = CASE WHEN p_credentials ? 'mp_access_token' THEN EXCLUDED.mp_access_token ELSE store_integration_credentials.mp_access_token END,
      mp_refresh_token = CASE WHEN p_credentials ? 'mp_refresh_token' THEN EXCLUDED.mp_refresh_token ELSE store_integration_credentials.mp_refresh_token END,
      mp_user_id = CASE WHEN p_credentials ? 'mp_user_id' THEN EXCLUDED.mp_user_id ELSE store_integration_credentials.mp_user_id END,
      mp_token_expires_at = CASE WHEN p_credentials ? 'mp_token_expires_at' THEN EXCLUDED.mp_token_expires_at ELSE store_integration_credentials.mp_token_expires_at END,
      mercado_pago_customer_id = CASE WHEN p_credentials ? 'mercado_pago_customer_id' THEN EXCLUDED.mercado_pago_customer_id ELSE store_integration_credentials.mercado_pago_customer_id END,
      mercado_pago_default_card_id = CASE WHEN p_credentials ? 'mercado_pago_default_card_id' THEN EXCLUDED.mercado_pago_default_card_id ELSE store_integration_credentials.mercado_pago_default_card_id END,
      focusnfe_token = CASE WHEN p_credentials ? 'focusnfe_token' THEN EXCLUDED.focusnfe_token ELSE store_integration_credentials.focusnfe_token END,
      focusnfe_cert_valid_until = CASE WHEN p_credentials ? 'focusnfe_cert_valid_until' THEN EXCLUDED.focusnfe_cert_valid_until ELSE store_integration_credentials.focusnfe_cert_valid_until END,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.update_store_credentials(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_store_credentials(uuid, jsonb) TO authenticated, service_role;

-- Keep all future employee PIN writes hashed at rest. Existing clients can keep
-- sending the PIN during create/update; PostgreSQL replaces it before storage.
CREATE OR REPLACE FUNCTION public.hash_employee_pin_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.pin IS NULL OR NEW.pin ~ '^\$2[aby]\$' THEN
    RETURN NEW;
  END IF;

  IF NEW.pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'INVALID_PIN: PIN must contain 4 to 8 digits';
  END IF;

  NEW.pin := extensions.crypt(NEW.pin, extensions.gen_salt('bf', 10));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hash_employee_pin_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_hash_pin_before_write ON public.employees;
CREATE TRIGGER employees_hash_pin_before_write
BEFORE INSERT OR UPDATE OF pin ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.hash_employee_pin_before_write();

-- Existing installations may contain four-digit plaintext PINs. The backend
-- retains compatibility during rollout, while this migration upgrades stored
-- values to bcrypt hashes without changing the PIN known by the employee.
UPDATE public.employees
SET pin = extensions.crypt(pin, extensions.gen_salt('bf', 10))
WHERE pin IS NOT NULL
  AND pin !~ '^\$2[aby]\$';

NOTIFY pgrst, 'reload schema';

COMMIT;
