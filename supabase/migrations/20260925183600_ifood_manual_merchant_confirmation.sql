-- Store the merchant claimed by the restaurant before the admin manually activates the binding.
alter table public.ifood_integration_requests
  add column if not exists claimed_merchant_id text;

comment on column public.ifood_integration_requests.claimed_merchant_id is
  'Merchant ID submitted by the restaurant for manual admin confirmation before centralized iFood activation.';
