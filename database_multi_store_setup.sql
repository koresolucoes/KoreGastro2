
-- 1. Criar a tabela de Lojas (Stores) se não existir
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id), -- O usuário humano (dono/login)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Migração: Para cada usuário existente que já tem dados, criar uma "Loja Principal"
INSERT INTO stores (id, name, owner_id)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'name', 'Minha Loja Principal') as name,
  id as owner_id
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 3. CORREÇÃO CRÍTICA: Atualizar a tabela unit_permissions
-- O erro acontecia porque ela referenciava auth.users, mas agora deve referenciar stores
ALTER TABLE unit_permissions DROP CONSTRAINT IF EXISTS unit_permissions_store_id_fkey;
ALTER TABLE unit_permissions 
  ADD CONSTRAINT unit_permissions_store_id_fkey 
  FOREIGN KEY (store_id) REFERENCES stores(id);

-- 4. CORREÇÃO DE CHAVES ESTRANGEIRAS NAS TABELAS DE DADOS
DO $$
DECLARE
    tbl text;
    table_list text[] := ARRAY[
        'company_profile', 
        'employees', 
        'customers', 
        'suppliers', 
        'ingredients', 
        'recipes', 
        'orders', 
        'tables', 
        'halls', 
        'stations', 
        'categories', 
        'ingredient_categories', 
        'roles', 
        'transactions',
        'loyalty_settings',
        'reservation_settings'
    ];
BEGIN
    FOREACH tbl IN ARRAY table_list LOOP
        BEGIN
            -- Tenta remover a restrição antiga
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I_user_id_fkey', tbl, tbl);
            
            -- Adiciona a nova restrição apontando para stores
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I_store_id_fkey FOREIGN KEY (user_id) REFERENCES stores(id)', tbl, tbl);
            
            RAISE NOTICE 'Tabela % atualizada com sucesso.', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Aviso: Não foi possível atualizar a tabela %: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- 5. Função para Criar Nova Loja (Corrigida e Final)
CREATE OR REPLACE FUNCTION create_new_store(store_name TEXT)
RETURNS JSON AS $$
DECLARE
  new_store_id UUID;
  user_id UUID;
BEGIN
  user_id := auth.uid();
  new_store_id := gen_random_uuid(); 

  -- A. Criar a Loja
  INSERT INTO stores (id, name, owner_id)
  VALUES (new_store_id, store_name, user_id);

  -- B. Criar Perfil da Empresa
  INSERT INTO company_profile (user_id, company_name, cnpj)
  VALUES (new_store_id, store_name, '00.000.000/0000-00');

  -- C. Dar permissão de Dono (Agora vai funcionar pois a FK foi corrigida no passo 3)
  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (user_id, new_store_id, 'owner');

  RETURN json_build_object(
    'success', true,
    'store_id', new_store_id,
    'name', store_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
