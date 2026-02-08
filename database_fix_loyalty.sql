
-- ==============================================================================
-- FIX: FIDELIDADE - CORREÇÃO DE UPSERT E PERMISSÕES
-- ==============================================================================

-- 1. Garantir constraint UNIQUE em user_id para permitir UPSERT
-- Se já existir, o comando não falha, mas garante que só haja 1 config por loja.
ALTER TABLE loyalty_settings 
DROP CONSTRAINT IF EXISTS loyalty_settings_user_id_key;

ALTER TABLE loyalty_settings 
ADD CONSTRAINT loyalty_settings_user_id_key UNIQUE (user_id);

-- 2. Garantir permissões de RLS para Prêmios (Rewards)
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Multi-unit Access Select" ON loyalty_rewards;
DROP POLICY IF EXISTS "Multi-unit Access Insert" ON loyalty_rewards;
DROP POLICY IF EXISTS "Multi-unit Access Update" ON loyalty_rewards;
DROP POLICY IF EXISTS "Multi-unit Access Delete" ON loyalty_rewards;

CREATE POLICY "Multi-unit Access Select" ON loyalty_rewards
FOR SELECT USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Insert" ON loyalty_rewards
FOR INSERT WITH CHECK ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Update" ON loyalty_rewards
FOR UPDATE USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Delete" ON loyalty_rewards
FOR DELETE USING ( public.has_access_to_store(user_id) );

-- 3. Garantir permissões de RLS para Configurações (Settings)
ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Multi-unit Access Select" ON loyalty_settings;
DROP POLICY IF EXISTS "Multi-unit Access Insert" ON loyalty_settings;
DROP POLICY IF EXISTS "Multi-unit Access Update" ON loyalty_settings;
DROP POLICY IF EXISTS "Multi-unit Access Delete" ON loyalty_settings;

CREATE POLICY "Multi-unit Access Select" ON loyalty_settings
FOR SELECT USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Insert" ON loyalty_settings
FOR INSERT WITH CHECK ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Update" ON loyalty_settings
FOR UPDATE USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Delete" ON loyalty_settings
FOR DELETE USING ( public.has_access_to_store(user_id) );
