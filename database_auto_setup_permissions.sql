
-- ==============================================================================
-- FIX E AUTOMAÇÃO: PERMISSÕES DE GERENTE EM MULTI-LOJA
-- ==============================================================================

-- 1. CORREÇÃO IMEDIATA (BACKFILL)
-- Insere todas as permissões para qualquer cargo 'Gerente' que esteja sem elas.
-- Isso vai consertar o seu usuário atual imediatamente.

INSERT INTO public.role_permissions (role_id, user_id, permission_key)
SELECT 
    r.id, 
    r.user_id, 
    p.perm
FROM public.roles r
CROSS JOIN (
    VALUES 
        ('/dashboard'), ('/pos'), ('/kds'), ('/ifood-kds'), 
        ('/cashier'), ('/inventory'), ('/requisitions'), ('/purchasing'), 
        ('/suppliers'), ('/customers'), ('/menu'), ('/ifood-menu'), 
        ('/ifood-store-manager'), ('/technical-sheets'), ('/mise-en-place'), 
        ('/performance'), ('/reports'), ('/employees'), ('/schedules'), 
        ('/my-leave'), ('/my-profile'), ('/payroll'), ('/settings'), 
        ('/reservations'), ('/time-clock'), ('/leave-management'), 
        ('/tutorials'), ('/delivery')
) AS p(perm)
WHERE r.name = 'Gerente'
AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp 
    WHERE rp.role_id = r.id AND rp.permission_key = p.perm
);


-- 2. ATUALIZAÇÃO DA FUNÇÃO CREATE_NEW_STORE
-- Agora, ao criar uma loja, o sistema já cria o cargo 'Gerente' e popula as permissões.
-- Isso evita que o erro se repita no futuro.

CREATE OR REPLACE FUNCTION public.create_new_store(store_name TEXT)
RETURNS JSON AS $$
DECLARE
  new_store_id UUID;
  current_user_id UUID;
  plan_limit INTEGER;
  current_count INTEGER;
  user_plan_id UUID;
  new_role_id UUID;
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

  -- D. CRIAÇÃO AUTOMÁTICA DE CARGOS E PERMISSÕES (NOVO)
  
  -- 1. Criar Cargo Gerente
  INSERT INTO public.roles (name, user_id) 
  VALUES ('Gerente', new_store_id) 
  RETURNING id INTO new_role_id;

  -- 2. Atribuir TODAS as permissões ao Gerente
  INSERT INTO public.role_permissions (role_id, user_id, permission_key)
  SELECT new_role_id, new_store_id, p.perm
  FROM (
    VALUES 
        ('/dashboard'), ('/pos'), ('/kds'), ('/ifood-kds'), 
        ('/cashier'), ('/inventory'), ('/requisitions'), ('/purchasing'), 
        ('/suppliers'), ('/customers'), ('/menu'), ('/ifood-menu'), 
        ('/ifood-store-manager'), ('/technical-sheets'), ('/mise-en-place'), 
        ('/performance'), ('/reports'), ('/employees'), ('/schedules'), 
        ('/my-leave'), ('/my-profile'), ('/payroll'), ('/settings'), 
        ('/reservations'), ('/time-clock'), ('/leave-management'), 
        ('/tutorials'), ('/delivery')
  ) AS p(perm);

  -- 3. Criar outros cargos padrão (opcional, facilita o uso)
  INSERT INTO public.roles (name, user_id) VALUES ('Caixa', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Cozinha', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Garçom', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Entregador', new_store_id);

  RETURN json_build_object(
    'success', true,
    'store_id', new_store_id,
    'name', store_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. ATUALIZAR TRIGGER DE NOVO USUÁRIO (ONBOARDING)
-- Garante que a primeira loja criada no cadastro também tenha as permissões corretas.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_role_id UUID;
BEGIN
  -- A. Criar Loja
  INSERT INTO public.stores (id, name, owner_id)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'name', 'Minha Loja') || ' (Principal)', new.id)
  ON CONFLICT (id) DO NOTHING;

  -- B. Perfil
  INSERT INTO public.company_profile (user_id, company_name, cnpj)
  VALUES (new.id, 'Minha Empresa', '00.000.000/0000-00')
  ON CONFLICT (user_id) DO NOTHING;

  -- C. Permissão de Dono
  INSERT INTO public.unit_permissions (manager_id, store_id, role)
  VALUES (new.id, new.id, 'owner')
  ON CONFLICT (manager_id, store_id) DO NOTHING;

  -- D. Cargos e Permissões Iniciais
  -- Verifica se já existe cargo Gerente (para evitar duplicidade em casos raros de retry)
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE user_id = new.id AND name = 'Gerente') THEN
      
      INSERT INTO public.roles (name, user_id) 
      VALUES ('Gerente', new.id) 
      RETURNING id INTO new_role_id;

      INSERT INTO public.role_permissions (role_id, user_id, permission_key)
      SELECT new_role_id, new.id, p.perm
      FROM (
        VALUES 
            ('/dashboard'), ('/pos'), ('/kds'), ('/ifood-kds'), 
            ('/cashier'), ('/inventory'), ('/requisitions'), ('/purchasing'), 
            ('/suppliers'), ('/customers'), ('/menu'), ('/ifood-menu'), 
            ('/ifood-store-manager'), ('/technical-sheets'), ('/mise-en-place'), 
            ('/performance'), ('/reports'), ('/employees'), ('/schedules'), 
            ('/my-leave'), ('/my-profile'), ('/payroll'), ('/settings'), 
            ('/reservations'), ('/time-clock'), ('/leave-management'), 
            ('/tutorials'), ('/delivery')
      ) AS p(perm);
      
      INSERT INTO public.roles (name, user_id) VALUES ('Caixa', new.id);
      INSERT INTO public.roles (name, user_id) VALUES ('Cozinha', new.id);
      INSERT INTO public.roles (name, user_id) VALUES ('Garçom', new.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
