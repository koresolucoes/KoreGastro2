-- FASE 1: PROJEÇÃO PÚBLICA SEGURA DA EMPRESA
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
  (cp.mp_access_token IS NOT NULL OR cp.mp_public_key IS NOT NULL) AS has_mercadopago_integration
FROM public.company_profile cp;

-- Permissões de Leitura
GRANT SELECT ON public.company_profile_public TO anon;
GRANT SELECT ON public.company_profile_public TO authenticated;
GRANT SELECT ON public.company_profile_public TO service_role;

-- Recarrega o cache do PostgREST no Supabase
NOTIFY pgrst, 'reload schema';
