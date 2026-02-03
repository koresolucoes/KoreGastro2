
-- 1. Criar a tabela de Lojas (Stores)
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id), -- Quem criou a loja
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Migração: Para cada usuário existente que já tem dados, criar uma "Loja Principal"
-- Isso garante que o sistema continue funcionando para contas existentes
INSERT INTO stores (id, name, owner_id)
SELECT 
  id, -- Mantemos o mesmo ID para não quebrar referências existentes nas outras tabelas
  COALESCE(raw_user_meta_data->>'name', 'Minha Loja Principal') as name,
  id as owner_id
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 3. Função para Criar Nova Loja (Atomicamente)
CREATE OR REPLACE FUNCTION create_new_store(store_name TEXT)
RETURNS JSON AS $$
DECLARE
  new_store_id UUID;
  user_id UUID;
BEGIN
  user_id := auth.uid();
  new_store_id := gen_random_uuid(); -- Gera um novo ID para a loja

  -- A. Criar a Loja
  INSERT INTO stores (id, name, owner_id)
  VALUES (new_store_id, store_name, user_id);

  -- B. Criar Perfil da Empresa (Vazio) vinculado a esta nova loja
  -- Usamos o ID da loja na coluna user_id da tabela company_profile
  INSERT INTO company_profile (user_id, company_name)
  VALUES (new_store_id, store_name);

  -- C. Dar permissão de Admin para quem criou
  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (user_id, new_store_id, 'owner');

  -- Retornar dados da nova loja
  RETURN json_build_object(
    'success', true,
    'store_id', new_store_id,
    'name', store_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
