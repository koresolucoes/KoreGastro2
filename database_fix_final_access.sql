
-- ==============================================================================
-- FIX FINAL: ACESSO OPERACIONAL E RLS
-- ==============================================================================

BEGIN;

-- 1. REFORÇAR A FUNÇÃO DE SEGURANÇA (RLS)
-- Garante que o sistema saiba que donos têm acesso total
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


-- 2. CRIAÇÃO DE FUNCIONÁRIOS FALTANTES (O "PULO DO GATO")
-- Para cada loja que um usuário é dono, verifica se existe um funcionário "Gerente"
-- Se não existir, cria um funcionário padrão para o dono poder operar.

DO $$
DECLARE
    store_record RECORD;
    gerente_role_id UUID;
    owner_name TEXT;
BEGIN
    FOR store_record IN SELECT * FROM public.stores LOOP
        
        -- 2.1. Buscar ou Criar Cargo de Gerente nesta loja
        SELECT id INTO gerente_role_id FROM public.roles WHERE user_id = store_record.id AND name = 'Gerente' LIMIT 1;
        
        IF gerente_role_id IS NULL THEN
            INSERT INTO public.roles (name, user_id) VALUES ('Gerente', store_record.id) RETURNING id INTO gerente_role_id;
            
            -- Inserir permissões para este novo cargo
            INSERT INTO public.role_permissions (role_id, user_id, permission_key)
            SELECT gerente_role_id, store_record.id, p.perm
            FROM (VALUES 
                ('/dashboard'), ('/pos'), ('/kds'), ('/ifood-kds'), ('/cashier'), ('/inventory'), 
                ('/requisitions'), ('/purchasing'), ('/suppliers'), ('/customers'), ('/menu'), 
                ('/ifood-menu'), ('/ifood-store-manager'), ('/technical-sheets'), ('/mise-en-place'), 
                ('/performance'), ('/reports'), ('/employees'), ('/schedules'), ('/my-leave'), 
                ('/my-profile'), ('/payroll'), ('/settings'), ('/reservations'), ('/time-clock'), 
                ('/leave-management'), ('/tutorials'), ('/delivery')
            ) AS p(perm);
        END IF;

        -- 2.2. Verificar se existe algum funcionário com este cargo
        -- (Assume-se que se não tem funcionário Gerente, o dono não consegue acessar)
        IF NOT EXISTS (SELECT 1 FROM public.employees WHERE role_id = gerente_role_id AND user_id = store_record.id) THEN
            
            -- Tenta pegar o nome do dono via metadados, ou usa padrão
            SELECT COALESCE(raw_user_meta_data->>'name', 'Gerente (Dono)') INTO owner_name 
            FROM auth.users WHERE id = store_record.owner_id;
            
            IF owner_name IS NULL THEN owner_name := 'Gerente Principal'; END IF;

            -- CRIA O FUNCIONÁRIO OPERACIONAL PARA O DONO
            INSERT INTO public.employees (
                user_id, 
                name, 
                pin, 
                role_id
            ) VALUES (
                store_record.id,
                owner_name,
                '1234', -- PIN PADRÃO PARA RECUPERAR ACESSO
                gerente_role_id
            );
            
            RAISE NOTICE 'Funcionário Gerente criado para a loja % (PIN: 1234)', store_record.name;
        END IF;

    END LOOP;
END $$;


-- 3. ATUALIZAR A FUNÇÃO DE CRIAÇÃO DE LOJA (PREVENÇÃO)
-- Agora ela cria automaticamente o funcionário além das permissões.

CREATE OR REPLACE FUNCTION public.create_new_store(store_name TEXT)
RETURNS JSON AS $$
DECLARE
  new_store_id UUID;
  current_user_id UUID;
  plan_limit INTEGER;
  current_count INTEGER;
  user_plan_id UUID;
  new_role_id UUID;
  user_name TEXT;
BEGIN
  current_user_id := auth.uid();

  -- A. Verificar Plano e Limites
  SELECT plan_id INTO user_plan_id
  FROM public.subscriptions
  WHERE user_id = current_user_id AND status IN ('active', 'trialing')
  LIMIT 1;

  IF user_plan_id IS NULL THEN
    plan_limit := 1;
  ELSE
    SELECT max_stores INTO plan_limit FROM public.plans WHERE id = user_plan_id;
    IF plan_limit IS NULL THEN plan_limit := 1; END IF;
  END IF;

  SELECT count(*) INTO current_count FROM public.stores WHERE owner_id = current_user_id;

  IF current_count >= plan_limit THEN
    RETURN json_build_object('success', false, 'message', 'Limite de lojas atingido.');
  END IF;

  -- B. Criação da Loja
  new_store_id := gen_random_uuid(); 
  INSERT INTO public.stores (id, name, owner_id) VALUES (new_store_id, store_name, current_user_id);

  -- C. Dados Básicos
  INSERT INTO public.company_profile (user_id, company_name, cnpj) VALUES (new_store_id, store_name, '00.000.000/0000-00');
  INSERT INTO public.unit_permissions (manager_id, store_id, role) VALUES (current_user_id, new_store_id, 'owner');
  INSERT INTO public.reservation_settings (user_id, is_enabled, booking_duration_minutes, max_party_size, min_party_size, booking_notice_days) VALUES (new_store_id, false, 90, 8, 2, 30);
  INSERT INTO public.loyalty_settings (user_id, is_enabled, points_per_real) VALUES (new_store_id, false, 1);

  -- D. CRIAÇÃO DE CARGOS E PERMISSÕES
  INSERT INTO public.roles (name, user_id) VALUES ('Gerente', new_store_id) RETURNING id INTO new_role_id;

  INSERT INTO public.role_permissions (role_id, user_id, permission_key)
  SELECT new_role_id, new_store_id, p.perm
  FROM ( VALUES 
    ('/dashboard'), ('/pos'), ('/kds'), ('/ifood-kds'), ('/cashier'), ('/inventory'), 
    ('/requisitions'), ('/purchasing'), ('/suppliers'), ('/customers'), ('/menu'), 
    ('/ifood-menu'), ('/ifood-store-manager'), ('/technical-sheets'), ('/mise-en-place'), 
    ('/performance'), ('/reports'), ('/employees'), ('/schedules'), ('/my-leave'), 
    ('/my-profile'), ('/payroll'), ('/settings'), ('/reservations'), ('/time-clock'), 
    ('/leave-management'), ('/tutorials'), ('/delivery')
  ) AS p(perm);

  INSERT INTO public.roles (name, user_id) VALUES ('Caixa', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Cozinha', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Garçom', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Entregador', new_store_id);

  -- E. CRIAÇÃO DO FUNCIONÁRIO OPERACIONAL (NOVO)
  SELECT COALESCE(raw_user_meta_data->>'name', 'Gerente') INTO user_name FROM auth.users WHERE id = current_user_id;
  
  INSERT INTO public.employees (user_id, name, pin, role_id)
  VALUES (new_store_id, user_name, '1234', new_role_id);

  RETURN json_build_object(
    'success', true,
    'store_id', new_store_id,
    'name', store_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
