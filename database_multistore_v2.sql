
-- ==============================================================================
-- CHEFOS MULTI-STORE V2 - LOGIC & SECURITY
-- ==============================================================================

-- 1. Garantir tabela de lojas e índices
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stores_owner ON stores(owner_id);

-- 2. Atualizar função de verificação de acesso (RLS Helper)
CREATE OR REPLACE FUNCTION public.has_access_to_store(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Acesso Direto: O usuário é o DONO da loja na tabela stores
  IF EXISTS (SELECT 1 FROM stores WHERE id = target_store_id AND owner_id = auth.uid()) THEN
    RETURN TRUE;
  END IF;

  -- Acesso Delegado: O usuário tem permissão na tabela unit_permissions
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

-- 3. Função ROBUSTA para criar loja com verificação de plano
CREATE OR REPLACE FUNCTION create_new_store(store_name TEXT)
RETURNS JSON AS $$
DECLARE
  new_store_id UUID;
  current_user_id UUID;
  plan_limit INTEGER;
  current_count INTEGER;
  user_plan_id TEXT;
BEGIN
  current_user_id := auth.uid();

  -- A. Verificar Plano e Limites
  -- Busca o plano ativo do usuário
  SELECT plan_id INTO user_plan_id
  FROM subscriptions
  WHERE user_id = current_user_id AND status IN ('active', 'trialing')
  LIMIT 1;

  -- Se não tiver plano ativo, limite é 1 (apenas a loja principal criada no cadastro)
  IF user_plan_id IS NULL THEN
    plan_limit := 1;
  ELSE
    -- Busca o limite de lojas do plano
    SELECT max_stores INTO plan_limit
    FROM plans
    WHERE id = user_plan_id;
    
    -- Fallback se o plano não tiver limite definido
    IF plan_limit IS NULL THEN plan_limit := 1; END IF;
  END IF;

  -- Conta lojas atuais onde o usuário é DONO
  SELECT count(*) INTO current_count
  FROM stores
  WHERE owner_id = current_user_id;

  -- Validação
  IF current_count >= plan_limit THEN
    RETURN json_build_object(
      'success', false, 
      'message', 'Você atingiu o limite de lojas do seu plano. Atualize sua assinatura para criar mais.'
    );
  END IF;

  -- B. Criação da Loja
  new_store_id := gen_random_uuid(); 

  INSERT INTO stores (id, name, owner_id)
  VALUES (new_store_id, store_name, current_user_id);

  -- C. Inicialização de Dados da Loja
  -- 1. Perfil da Empresa
  INSERT INTO company_profile (user_id, company_name, cnpj)
  VALUES (new_store_id, store_name, '00.000.000/0000-00');

  -- 2. Permissão Explícita (Redundante mas segura para listagens)
  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (current_user_id, new_store_id, 'owner');
  
  -- 3. Configurações Padrão de Reserva (Desativado)
  INSERT INTO reservation_settings (user_id, is_enabled, booking_duration_minutes, max_party_size, min_party_size, booking_notice_days)
  VALUES (new_store_id, false, 90, 8, 2, 30);

  -- 4. Configurações Padrão de Fidelidade (Desativado)
  INSERT INTO loyalty_settings (user_id, is_enabled, points_per_real)
  VALUES (new_store_id, false, 1);

  RETURN json_build_object(
    'success', true,
    'store_id', new_store_id,
    'name', store_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função para Excluir Loja (Apenas Dono)
CREATE OR REPLACE FUNCTION delete_store(target_store_id UUID)
RETURNS JSON AS $$
DECLARE
BEGIN
  -- Verifica se é o dono
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = target_store_id AND owner_id = auth.uid()) THEN
     RETURN json_build_object('success', false, 'message', 'Apenas o dono pode excluir a loja.');
  END IF;

  -- Verifica se é a última loja (não permitir ficar sem nenhuma loja para evitar bugs de UI)
  IF (SELECT count(*) FROM stores WHERE owner_id = auth.uid()) <= 1 THEN
     RETURN json_build_object('success', false, 'message', 'Você não pode excluir sua única loja.');
  END IF;

  -- Exclui a loja (CASCADE deve limpar o resto se as FKs estiverem certas, 
  -- mas por segurança deletamos permissões primeiro)
  DELETE FROM unit_permissions WHERE store_id = target_store_id;
  DELETE FROM stores WHERE id = target_store_id;

  RETURN json_build_object('success', true, 'message', 'Loja excluída com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
