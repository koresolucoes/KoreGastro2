
-- ==============================================================================
-- FIX CRÍTICO MULTI-LOJA
-- Execute este script para corrigir o acesso às lojas secundárias
-- ==============================================================================

-- 1. Garantir que a tabela stores existe e tem os dados corretos
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migrar usuários existentes para a tabela stores (caso ainda não estejam)
-- Isso cria a "Loja Principal" para usuários antigos
INSERT INTO stores (id, name, owner_id)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'name', 'Minha Loja Principal') as name,
  id as owner_id
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 2. Alterar a lógica de segurança (RLS Function)
-- O problema principal estava aqui: ele comparava ID da Loja direto com ID do User.
-- Agora ele verifica se você é o DONO na tabela stores OU se tem permissão explícita.
CREATE OR REPLACE FUNCTION public.has_access_to_store(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. Verificar se o usuário é o DONO da loja na tabela 'stores'
  -- Isso funciona tanto para a loja principal (onde id = owner_id)
  -- quanto para lojas secundárias (onde id != owner_id, mas owner_id = auth.uid())
  IF EXISTS (
    SELECT 1 FROM stores 
    WHERE id = target_store_id 
    AND owner_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Verificar se o usuário tem permissão delegada (Gerente/Caixa convidado)
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

-- 3. Atualizar Chaves Estrangeiras (FKs) das tabelas de dados
-- Elas devem apontar para 'stores(id)', não 'auth.users(id)'
-- Se elas apontarem para auth.users, o insert falha para lojas secundárias
DO $$
DECLARE
    tbl text;
    -- Lista de tabelas que usam 'user_id' como identificador da loja
    table_list text[] := ARRAY[
        'company_profile', 'employees', 'customers', 'suppliers', 'ingredients', 
        'recipes', 'orders', 'tables', 'halls', 'stations', 'categories', 
        'ingredient_categories', 'roles', 'transactions', 'loyalty_settings',
        'reservation_settings', 'purchase_orders', 'production_plans', 
        'schedules', 'leave_requests', 'ifood_webhook_logs', 'ifood_menu_sync',
        'subscriptions', 'webhooks', 'delivery_drivers', 'portioning_events', 
        'station_stocks', 'requisitions', 'cashier_closings'
    ];
BEGIN
    FOREACH tbl IN ARRAY table_list LOOP
        BEGIN
            -- Tenta remover a FK antiga que aponta para auth.users
            -- O nome da constraint varia, tentamos os padrões comuns
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I_user_id_fkey', tbl, tbl);
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS user_id_fkey', tbl);
            
            -- Adiciona a nova FK apontando para stores(id)
            -- ON DELETE CASCADE garante que se apagar a loja, apaga os dados
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I_store_id_fkey FOREIGN KEY (user_id) REFERENCES stores(id) ON DELETE CASCADE', tbl, tbl);
            
            RAISE NOTICE 'Tabela % atualizada para referenciar stores(id).', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Nota: Tabela % pode já estar atualizada ou erro: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- 4. Atualizar a função de criação de loja para garantir consistência
CREATE OR REPLACE FUNCTION create_new_store(store_name TEXT)
RETURNS JSON AS $$
DECLARE
  new_store_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  new_store_id := gen_random_uuid(); 

  -- A. Criar a Loja na tabela 'stores'
  INSERT INTO stores (id, name, owner_id)
  VALUES (new_store_id, store_name, current_user_id);

  -- B. Criar Perfil da Empresa (Agora funciona pois a FK aponta para stores)
  INSERT INTO company_profile (user_id, company_name, cnpj)
  VALUES (new_store_id, store_name, '00.000.000/0000-00');

  -- C. Inserir permissão de Dono (Redundante para acesso, mas útil para listagens)
  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (current_user_id, new_store_id, 'owner');

  RETURN json_build_object(
    'success', true,
    'store_id', new_store_id,
    'name', store_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
