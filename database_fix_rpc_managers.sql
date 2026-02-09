
-- ==============================================================================
-- FIX: FUNÇÕES RPC PARA GESTÃO DE EQUIPE (MULTI-LOJA)
-- Execute este script para corrigir o erro 404 ao carregar gestores.
-- ==============================================================================

-- 1. Função para buscar lista de gestores da loja
DROP FUNCTION IF EXISTS get_store_managers;
CREATE OR REPLACE FUNCTION get_store_managers(store_id_input UUID DEFAULT NULL)
RETURNS TABLE (
  permission_id UUID,
  manager_id UUID,
  manager_email TEXT,
  manager_name TEXT,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  target_store_id UUID;
BEGIN
  -- Se não passado, tenta usar o ID do usuário (legado), mas idealmente deve receber o ID da loja
  target_store_id := COALESCE(store_id_input, auth.uid());
  
  -- Segurança: Apenas dono ou quem tem role 'owner' na loja pode ver a lista de gestores
  IF NOT EXISTS (
      SELECT 1 FROM stores WHERE id = target_store_id AND owner_id = auth.uid()
  ) AND NOT EXISTS (
      SELECT 1 FROM unit_permissions WHERE store_id = target_store_id AND manager_id = auth.uid() AND role = 'owner'
  ) THEN
      -- Se não tiver permissão, retorna vazio (segurança silenciosa)
      RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    up.id as permission_id,
    up.manager_id,
    u.email as manager_email,
    COALESCE(u.raw_user_meta_data->>'name', 'Usuário') as manager_name,
    up.role,
    up.created_at
  FROM unit_permissions up
  JOIN auth.users u ON up.manager_id = u.id
  WHERE up.store_id = target_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Função para convidar um novo gestor por e-mail
DROP FUNCTION IF EXISTS invite_manager_by_email;
CREATE OR REPLACE FUNCTION invite_manager_by_email(email_input TEXT, role_input TEXT, store_id_input UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  target_user_id UUID;
  target_store_id UUID;
BEGIN
  target_store_id := COALESCE(store_id_input, auth.uid());
  
  -- Segurança: Apenas Owner pode convidar
  IF NOT EXISTS (
      SELECT 1 FROM stores WHERE id = target_store_id AND owner_id = auth.uid()
  ) AND NOT EXISTS (
      SELECT 1 FROM unit_permissions WHERE store_id = target_store_id AND manager_id = auth.uid() AND role = 'owner'
  ) THEN
      RETURN json_build_object('success', false, 'message', 'Permissão negada. Apenas proprietários podem convidar.');
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = email_input;

  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não encontrado com este e-mail. Peça para ele criar uma conta no ChefOS primeiro.');
  END IF;

  IF EXISTS (SELECT 1 FROM unit_permissions WHERE manager_id = target_user_id AND store_id = target_store_id) THEN
    RETURN json_build_object('success', false, 'message', 'Este usuário já é um gestor desta loja.');
  END IF;

  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (target_user_id, target_store_id, role_input);

  RETURN json_build_object('success', true, 'message', 'Gestor adicionado com sucesso!');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Função para remover um gestor
DROP FUNCTION IF EXISTS remove_store_manager;
CREATE OR REPLACE FUNCTION remove_store_manager(permission_id_input UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Remove a permissão se o usuário logado for dono da loja associada à permissão
  DELETE FROM unit_permissions up
  WHERE id = permission_id_input 
  AND EXISTS (
      SELECT 1 FROM stores s WHERE s.id = up.store_id AND s.owner_id = auth.uid()
      UNION
      SELECT 1 FROM unit_permissions p WHERE p.store_id = up.store_id AND p.manager_id = auth.uid() AND p.role = 'owner'
  );
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
