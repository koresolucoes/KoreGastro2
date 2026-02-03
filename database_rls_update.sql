
-- ==============================================================================
-- SCRIPT DE MIGRAÇÃO DE RLS PARA MULTI-UNIDADE (CHEFOS) - CORRIGIDO
-- ==============================================================================

-- 1. Tabela de Permissões (Garante que ela existe antes de aplicar as politicas)
CREATE TABLE IF NOT EXISTS unit_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID REFERENCES auth.users(id) NOT NULL,
  store_id UUID REFERENCES auth.users(id) NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(manager_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_unit_permissions_manager ON unit_permissions(manager_id);
CREATE INDEX IF NOT EXISTS idx_unit_permissions_store ON unit_permissions(store_id);

ALTER TABLE unit_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own permissions" ON unit_permissions;
CREATE POLICY "Users can view their own permissions" 
ON unit_permissions FOR SELECT 
USING (auth.uid() = manager_id);

DROP POLICY IF EXISTS "Stores can see their managers" ON unit_permissions;
CREATE POLICY "Stores can see their managers" 
ON unit_permissions FOR SELECT 
USING (auth.uid() = store_id);

-- 2. Função Auxiliar
CREATE OR REPLACE FUNCTION public.has_access_to_store(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Acesso direto
  IF auth.uid() = target_store_id THEN
    RETURN TRUE;
  END IF;
  -- Acesso delegado
  IF EXISTS (
    SELECT 1 FROM unit_permissions 
    WHERE manager_id = auth.uid() 
    AND store_id = target_store_id
  ) THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Loop para tabelas que POSSUEM a coluna user_id
DO $$
DECLARE
    tbl text;
    -- Removido 'portioning_event_outputs' desta lista pois ela não tem user_id
    table_list text[] := ARRAY[
        'halls', 
        'tables', 
        'stations', 
        'categories', 
        'orders', 
        'order_items', 
        'employees', 
        'ingredients', 
        'ingredient_categories', 
        'suppliers', 
        'recipe_ingredients', 
        'recipe_preparations', 
        'promotions', 
        'promotion_recipes', 
        'recipe_sub_recipes', 
        'purchase_orders', 
        'purchase_order_items', 
        'production_plans', 
        'production_tasks', 
        'reservations', 
        'reservation_settings', 
        'schedules', 
        'shifts', 
        'leave_requests', 
        'company_profile', 
        'roles', 
        'role_permissions', 
        'customers', 
        'loyalty_settings', 
        'loyalty_rewards', 
        'loyalty_movements',
        'inventory_lots', 
        'ifood_webhook_logs', 
        'ifood_menu_sync', 
        'subscriptions', 
        'recipes', 
        'webhooks', 
        'delivery_drivers', 
        'portioning_events', 
        'station_stocks', 
        'requisitions', 
        'requisition_items', 
        'transactions', 
        'cashier_closings'
    ];
BEGIN
    FOREACH tbl IN ARRAY table_list LOOP
        -- Habilitar RLS
        EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY;', tbl);

        -- Limpar políticas antigas
        EXECUTE format('DROP POLICY IF EXISTS "Users can view their own data" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Users can insert their own data" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Users can update their own data" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Users can delete their own data" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Enable all for users based on user_id" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Users can view items of their own restaurant" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Multi-unit Access Select" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Multi-unit Access Insert" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Multi-unit Access Update" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Multi-unit Access Delete" ON %I;', tbl);
        
        -- Criar Novas Políticas
        EXECUTE format('
            CREATE POLICY "Multi-unit Access Select" ON %I
            FOR SELECT
            USING ( public.has_access_to_store(user_id) );
        ', tbl);

        EXECUTE format('
            CREATE POLICY "Multi-unit Access Insert" ON %I
            FOR INSERT
            WITH CHECK ( public.has_access_to_store(user_id) );
        ', tbl);

        EXECUTE format('
            CREATE POLICY "Multi-unit Access Update" ON %I
            FOR UPDATE
            USING ( public.has_access_to_store(user_id) )
            WITH CHECK ( public.has_access_to_store(user_id) );
        ', tbl);

        EXECUTE format('
            CREATE POLICY "Multi-unit Access Delete" ON %I
            FOR DELETE
            USING ( public.has_access_to_store(user_id) );
        ', tbl);

        RAISE NOTICE 'Políticas atualizadas para: %', tbl;
    END LOOP;
END $$;

-- 4. Tratamento Especial: portioning_event_outputs (não tem user_id, usa event_id)
ALTER TABLE portioning_event_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Multi-unit Access Select" ON portioning_event_outputs;
DROP POLICY IF EXISTS "Multi-unit Access Insert" ON portioning_event_outputs;
DROP POLICY IF EXISTS "Multi-unit Access Update" ON portioning_event_outputs;
DROP POLICY IF EXISTS "Multi-unit Access Delete" ON portioning_event_outputs;

CREATE POLICY "Multi-unit Access Select" ON portioning_event_outputs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM portioning_events pe 
    WHERE pe.id = portioning_event_outputs.event_id 
    AND public.has_access_to_store(pe.user_id)
  )
);

CREATE POLICY "Multi-unit Access Insert" ON portioning_event_outputs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM portioning_events pe 
    WHERE pe.id = portioning_event_outputs.event_id 
    AND public.has_access_to_store(pe.user_id)
  )
);

CREATE POLICY "Multi-unit Access Update" ON portioning_event_outputs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM portioning_events pe 
    WHERE pe.id = portioning_event_outputs.event_id 
    AND public.has_access_to_store(pe.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM portioning_events pe 
    WHERE pe.id = portioning_event_outputs.event_id 
    AND public.has_access_to_store(pe.user_id)
  )
);

CREATE POLICY "Multi-unit Access Delete" ON portioning_event_outputs FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM portioning_events pe 
    WHERE pe.id = portioning_event_outputs.event_id 
    AND public.has_access_to_store(pe.user_id)
  )
);
