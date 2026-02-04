
-- ==============================================================================
-- FIX: CORREÇÃO DE TIPO NA FUNÇÃO CREATE_NEW_STORE
-- Erro anterior: operator does not exist: uuid = text
-- Solução: Alterar o tipo da variável user_plan_id de TEXT para UUID
-- ==============================================================================

CREATE OR REPLACE FUNCTION create_new_store(store_name TEXT)
RETURNS JSON AS $$
DECLARE
  new_store_id UUID;
  current_user_id UUID;
  plan_limit INTEGER;
  current_count INTEGER;
  user_plan_id UUID; -- ALTERADO DE TEXT PARA UUID
BEGIN
  current_user_id := auth.uid();

  -- A. Verificar Plano e Limites
  -- Busca o plano ativo do usuário
  -- Nota: Se subscriptions.plan_id for NULL ou não existir, user_plan_id será NULL
  SELECT plan_id INTO user_plan_id
  FROM subscriptions
  WHERE user_id = current_user_id AND status IN ('active', 'trialing')
  LIMIT 1;

  -- Se não tiver plano ativo, limite é 1 (apenas a loja principal criada no cadastro)
  IF user_plan_id IS NULL THEN
    plan_limit := 1;
  ELSE
    -- Busca o limite de lojas do plano
    -- Agora a comparação id (UUID) = user_plan_id (UUID) funcionará corretamente
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
      'message', 'Você atingiu o limite de lojas do seu plano (' || plan_limit || '). Atualize sua assinatura para criar mais.'
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

  -- 2. Permissão Explícita
  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (current_user_id, new_store_id, 'owner');
  
  -- 3. Configurações Padrão
  INSERT INTO reservation_settings (user_id, is_enabled, booking_duration_minutes, max_party_size, min_party_size, booking_notice_days)
  VALUES (new_store_id, false, 90, 8, 2, 30);

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
