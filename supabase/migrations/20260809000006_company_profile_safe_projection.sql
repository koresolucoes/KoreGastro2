-- FASE 1: PROJEÇÃO PÚBLICA SEGURA
CREATE TABLE IF NOT EXISTS public.store_integration_credentials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    external_api_key uuid,
    focusnfe_token text,
    focusnfe_cert_valid_until text,
    mp_access_token text,
    mp_refresh_token text,
    mp_user_id text,
    mp_token_expires_at timestamp with time zone,
    ifood_merchant_id text,
    mercado_pago_customer_id text,
    mercado_pago_default_card_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE OR REPLACE VIEW public.company_profile_public AS
SELECT
  cp.user_id,
  cp.company_name,
  cp.cnpj,
  cp.address,
  cp.created_at,
  cp.logo_url,
  cp.phone,
  cp.menu_cover_url,
  cp.menu_header_url,
  cp.latitude,
  cp.longitude,
  cp.time_clock_radius,
  cp.mp_public_key,
  (sic.ifood_merchant_id IS NOT NULL) AS has_ifood_integration,
  (sic.mp_access_token IS NOT NULL) AS has_mercadopago_integration,
  (sic.focusnfe_token IS NOT NULL) AS has_focusnfe_integration
FROM public.company_profile cp
LEFT JOIN public.store_integration_credentials sic ON cp.user_id = sic.store_id;

-- Grant access to the view
GRANT SELECT ON public.company_profile_public TO anon;
GRANT SELECT ON public.company_profile_public TO authenticated;
GRANT SELECT ON public.company_profile_public TO service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

