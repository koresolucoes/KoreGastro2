
-- Função para buscar lista de gestores da loja atual (onde store_id é o usuário logado)
CREATE OR REPLACE FUNCTION get_store_managers()
RETURNS TABLE (
  permission_id UUID,
  manager_id UUID,
  manager_email TEXT,
  manager_name TEXT,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
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
  WHERE up.store_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para convidar/adicionar um gestor pelo E-mail
CREATE OR REPLACE FUNCTION invite_manager_by_email(email_input TEXT, role_input TEXT)
RETURNS JSON AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- 1. Buscar o ID do usuário pelo e-mail
  SELECT id INTO target_user_id FROM auth.users WHERE email = email_input;

  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não encontrado com este e-mail. Peça para ele criar uma conta no ChefOS primeiro.');
  END IF;

  -- 2. Verificar se já existe permissão
  IF EXISTS (SELECT 1 FROM unit_permissions WHERE manager_id = target_user_id AND store_id = auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Este usuário já é um gestor desta loja.');
  END IF;

  -- 3. Inserir permissão
  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (target_user_id, auth.uid(), role_input);

  RETURN json_build_object('success', true, 'message', 'Gestor adicionado com sucesso!');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para remover um gestor
CREATE OR REPLACE FUNCTION remove_store_manager(permission_id_input UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Só permite deletar se a loja for a dona (auth.uid() = store_id)
  DELETE FROM unit_permissions
  WHERE id = permission_id_input AND store_id = auth.uid();
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
