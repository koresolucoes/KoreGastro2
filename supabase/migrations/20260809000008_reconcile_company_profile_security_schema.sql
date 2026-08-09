-- Migration: 20260809000008_reconcile_company_profile_security_schema.sql
-- Description: Reconcile company profile security schema, store_integration_credentials table, constraints, RLS, idempotent backfill, and safe public view projection.

-- 1. Create store_integration_credentials table if it does not exist
CREATE TABLE IF NOT EXISTS public.store_integration_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL,
    external_api_key uuid NULL,
    focusnfe_token text NULL,
    focusnfe_cert_valid_until text NULL,
    mp_access_token text NULL,
    mp_refresh_token text NULL,
    mp_user_id text NULL,
    mp_token_expires_at timestamptz NULL,
    ifood_merchant_id text NULL,
    mercado_pago_customer_id text NULL,
    mercado_pago_default_card_id text NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Idempotent UNIQUE constraint on store_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'store_integration_credentials_store_id_key' 
          AND conrelid = 'public.store_integration_credentials'::regclass
    ) THEN
        ALTER TABLE public.store_integration_credentials 
        ADD CONSTRAINT store_integration_credentials_store_id_key UNIQUE (store_id);
    END IF;
END $$;

-- 3. Idempotent Foreign Key constraint on store_id referencing public.stores(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'store_integration_credentials_store_id_fkey' 
          AND conrelid = 'public.store_integration_credentials'::regclass
    ) THEN
        ALTER TABLE public.store_integration_credentials 
        ADD CONSTRAINT store_integration_credentials_store_id_fkey 
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Enable RLS and configure Least Privilege Grants for store_integration_credentials
ALTER TABLE public.store_integration_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_integration_credentials FROM anon;
REVOKE ALL ON TABLE public.store_integration_credentials FROM authenticated;
GRANT ALL ON TABLE public.store_integration_credentials TO service_role;

-- 5. Revoke direct SELECT on company_profile from anon to prevent public access to legacy sensitive columns
REVOKE SELECT ON TABLE public.company_profile FROM anon;

-- 6. Re-create / Replace public.company_profile_public view with strict allowlist projection and boolean integration flags
CREATE OR REPLACE VIEW public.company_profile_public AS
SELECT
  cp.user_id,
  cp.company_name,
  cp.cnpj,
  cp.address,
  cp.phone,
  cp.logo_url,
  cp.menu_cover_url,
  cp.menu_header_url,
  cp.latitude,
  cp.longitude,
  cp.time_clock_radius,
  cp.created_at,
  cp.mp_public_key,
  (
    COALESCE(sic.ifood_merchant_id, cp.ifood_merchant_id) IS NOT NULL
  ) AS has_ifood_integration,
  (
    COALESCE(sic.mp_access_token, cp.mp_access_token) IS NOT NULL 
    OR cp.mp_public_key IS NOT NULL
  ) AS has_mercadopago_integration,
  (
    COALESCE(sic.focusnfe_token, cp.focusnfe_token) IS NOT NULL
  ) AS has_focusnfe_integration
FROM public.company_profile cp
LEFT JOIN public.store_integration_credentials sic ON sic.store_id = cp.user_id;

-- 7. View Grants
GRANT SELECT ON public.company_profile_public TO anon;
GRANT SELECT ON public.company_profile_public TO authenticated;
GRANT SELECT ON public.company_profile_public TO service_role;

-- 8. Idempotent Backfill from company_profile to store_integration_credentials
-- Preserves existing private credentials in store_integration_credentials using COALESCE
INSERT INTO public.store_integration_credentials (
    store_id,
    external_api_key,
    focusnfe_token,
    focusnfe_cert_valid_until,
    mp_access_token,
    mp_refresh_token,
    mp_user_id,
    mp_token_expires_at,
    ifood_merchant_id,
    mercado_pago_customer_id,
    mercado_pago_default_card_id
)
SELECT 
    cp.user_id AS store_id,
    cp.external_api_key,
    cp.focusnfe_token,
    cp.focusnfe_cert_valid_until,
    cp.mp_access_token,
    cp.mp_refresh_token,
    cp.mp_user_id,
    cp.mp_token_expires_at,
    cp.ifood_merchant_id,
    cp.mercado_pago_customer_id,
    cp.mercado_pago_default_card_id
FROM public.company_profile cp
WHERE cp.external_api_key IS NOT NULL
   OR cp.focusnfe_token IS NOT NULL
   OR cp.focusnfe_cert_valid_until IS NOT NULL
   OR cp.mp_access_token IS NOT NULL
   OR cp.mp_refresh_token IS NOT NULL
   OR cp.mp_user_id IS NOT NULL
   OR cp.mp_token_expires_at IS NOT NULL
   OR cp.ifood_merchant_id IS NOT NULL
   OR cp.mercado_pago_customer_id IS NOT NULL
   OR cp.mercado_pago_default_card_id IS NOT NULL
ON CONFLICT (store_id) DO UPDATE SET
    external_api_key = COALESCE(store_integration_credentials.external_api_key, EXCLUDED.external_api_key),
    focusnfe_token = COALESCE(store_integration_credentials.focusnfe_token, EXCLUDED.focusnfe_token),
    focusnfe_cert_valid_until = COALESCE(store_integration_credentials.focusnfe_cert_valid_until, EXCLUDED.focusnfe_cert_valid_until),
    mp_access_token = COALESCE(store_integration_credentials.mp_access_token, EXCLUDED.mp_access_token),
    mp_refresh_token = COALESCE(store_integration_credentials.mp_refresh_token, EXCLUDED.mp_refresh_token),
    mp_user_id = COALESCE(store_integration_credentials.mp_user_id, EXCLUDED.mp_user_id),
    mp_token_expires_at = COALESCE(store_integration_credentials.mp_token_expires_at, EXCLUDED.mp_token_expires_at),
    ifood_merchant_id = COALESCE(store_integration_credentials.ifood_merchant_id, EXCLUDED.ifood_merchant_id),
    mercado_pago_customer_id = COALESCE(store_integration_credentials.mercado_pago_customer_id, EXCLUDED.mercado_pago_customer_id),
    mercado_pago_default_card_id = COALESCE(store_integration_credentials.mercado_pago_default_card_id, EXCLUDED.mercado_pago_default_card_id),
    updated_at = now();

-- 9. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
