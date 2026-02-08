
-- ==============================================================================
-- FIX: RESERVAS - CORREÇÃO DE UPSERT E PERMISSÕES
-- ==============================================================================

-- 1. Garantir constraint UNIQUE em user_id para permitir UPSERT na tabela de configurações
ALTER TABLE reservation_settings 
DROP CONSTRAINT IF EXISTS reservation_settings_user_id_key;

ALTER TABLE reservation_settings 
ADD CONSTRAINT reservation_settings_user_id_key UNIQUE (user_id);

-- 2. Garantir permissões de RLS para Configurações (Settings)
ALTER TABLE reservation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Multi-unit Access Select" ON reservation_settings;
DROP POLICY IF EXISTS "Multi-unit Access Insert" ON reservation_settings;
DROP POLICY IF EXISTS "Multi-unit Access Update" ON reservation_settings;
DROP POLICY IF EXISTS "Multi-unit Access Delete" ON reservation_settings;

CREATE POLICY "Multi-unit Access Select" ON reservation_settings
FOR SELECT USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Insert" ON reservation_settings
FOR INSERT WITH CHECK ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Update" ON reservation_settings
FOR UPDATE USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Delete" ON reservation_settings
FOR DELETE USING ( public.has_access_to_store(user_id) );

-- 3. Garantir permissões de RLS para as Reservas em si (Reservations)
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Multi-unit Access Select" ON reservations;
DROP POLICY IF EXISTS "Multi-unit Access Insert" ON reservations;
DROP POLICY IF EXISTS "Multi-unit Access Update" ON reservations;
DROP POLICY IF EXISTS "Multi-unit Access Delete" ON reservations;

CREATE POLICY "Multi-unit Access Select" ON reservations
FOR SELECT USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Insert" ON reservations
FOR INSERT WITH CHECK ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Update" ON reservations
FOR UPDATE USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Delete" ON reservations
FOR DELETE USING ( public.has_access_to_store(user_id) );
