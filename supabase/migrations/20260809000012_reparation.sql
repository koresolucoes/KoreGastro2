-- Reparation Migration

CREATE OR REPLACE FUNCTION "public"."authenticate_menu_customer"("p_store_id" "uuid", "p_cpf" "text", "p_password" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_customer RECORD;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;
    SELECT * INTO v_customer 
    FROM public.customers 
    WHERE user_id = p_store_id AND cpf = p_cpf
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Cliente não cadastrado.');
    END IF;

    IF v_customer.password_hash IS NULL OR v_customer.password_hash = crypt(p_password, v_customer.password_hash) THEN
        RETURN json_build_object('success', true, 'customer', json_build_object(
            'id', v_customer.id,
            'name', v_customer.name,
            'phone', v_customer.phone,
            'cpf', v_customer.cpf,
            'loyalty_points', v_customer.loyalty_points
        ));
    END IF;

    RETURN json_build_object('success', false, 'message', 'Senha incorreta.');
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_free_trial_subscription"("plan_id_to_subscribe" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id_to_subscribe UUID := auth.uid();
  trial_days INTEGER;
  period_end_date TIMESTAMP WITH TIME ZONE;
  new_subscription_id UUID;
BEGIN
  -- Passo 1: Verifica se o plano é um plano de teste gratuito válido
  SELECT p.trial_period_days INTO trial_days
  FROM public.plans p
  WHERE p.id = plan_id_to_subscribe AND p.price = 0;

  IF trial_days IS NULL THEN
    RAISE EXCEPTION 'This plan is not a free trial plan or does not exist.';
  END IF;

  -- Passo 2: Garante que o usuário não tenha uma assinatura ativa
  IF EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = user_id_to_subscribe AND s.status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already has an active subscription.';
  END IF;

  -- Passo 3: Calcula a data de término do período de teste
  period_end_date := now() + (trial_days || ' days')::interval;

  -- Passo 4. Cria ou atualiza o registro de assinatura do usuário
  -- Esta é a ÚNICA escrita no banco de dados necessária. As permissões
  -- serão derivadas dinamicamente a partir deste registro.
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
  VALUES (user_id_to_subscribe, plan_id_to_subscribe, 'active', period_end_date)
  ON CONFLICT (user_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now()
  RETURNING id INTO new_subscription_id;

  -- Passo 5: Retorna uma confirmação de sucesso
  RETURN json_build_object('status', 'success', 'message', 'Free trial activated successfully.', 'subscription_id', new_subscription_id);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."delete_store"("target_store_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;

CREATE OR REPLACE FUNCTION "public"."get_menu_customer_history"("p_store_id" "uuid", "p_customer_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_result JSON;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;
    SELECT json_agg(
        json_build_object(
            'id', id,
            'created_at', timestamp,
            'status', status,
            'total', COALESCE((SELECT SUM(price * quantity) FROM public.order_items WHERE order_id = orders.id), 0)
        ) ORDER BY timestamp DESC
    ) INTO v_result
    FROM public.orders
    WHERE user_id = p_store_id AND customer_id = p_customer_id;
    
    RETURN json_build_object('success', true, 'orders', COALESCE(v_result, '[]'::json));
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_menu_customer_profile"("p_store_id" "uuid", "p_customer_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_customer RECORD;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;
    SELECT * INTO v_customer 
    FROM public.customers 
    WHERE user_id = p_store_id AND id = p_customer_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Cliente não encontrado.');
    END IF;

    RETURN json_build_object('success', true, 'customer', json_build_object(
        'id', v_customer.id,
        'name', v_customer.name,
        'phone', v_customer.phone,
        'cpf', v_customer.cpf,
        'loyalty_points', v_customer.loyalty_points
    ));
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_menu_with_stock"("p_store_id" "uuid", "p_is_available" boolean DEFAULT NULL::boolean, "p_category_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;
    WITH RECURSIVE 
    recipe_base_ingredients AS (
        SELECT id AS recipe_id, source_ingredient_id AS ingredient_id
        FROM public.recipes
        WHERE store_id = p_store_id AND source_ingredient_id IS NOT NULL
    ),
    recipe_direct_ingredients AS (
        SELECT recipe_id, ingredient_id, quantity
        FROM public.recipe_ingredients
        WHERE user_id = p_store_id -- Mantendo user_id aqui por enquanto se as outras tabelas não mudarem
    ),
    recipe_tree AS (
        SELECT 
            r.id AS root_recipe_id,
            r.id AS current_recipe_id,
            1::NUMERIC AS required_qty
        FROM public.recipes r
        WHERE r.store_id = p_store_id AND r.is_sub_recipe = FALSE
        
        UNION ALL
        
        SELECT 
            rt.root_recipe_id,
            rsr.child_recipe_id AS current_recipe_id,
            rt.required_qty * rsr.quantity AS required_qty
        FROM recipe_tree rt
        JOIN public.recipe_sub_recipes rsr ON rsr.parent_recipe_id = rt.current_recipe_id
        WHERE rsr.user_id = p_store_id
    ),
    required_ingredients AS (
        SELECT 
            rt.root_recipe_id,
            rdi.ingredient_id,
            SUM(rt.required_qty * rdi.quantity) AS total_required_qty
        FROM recipe_tree rt
        JOIN recipe_direct_ingredients rdi ON rdi.recipe_id = rt.current_recipe_id
        GROUP BY rt.root_recipe_id, rdi.ingredient_id
        
        UNION ALL
        
        SELECT 
            rt.root_recipe_id,
            rbi.ingredient_id,
            SUM(rt.required_qty) AS total_required_qty
        FROM recipe_tree rt
        JOIN recipe_base_ingredients rbi ON rbi.recipe_id = rt.current_recipe_id
        GROUP BY rt.root_recipe_id, rbi.ingredient_id
    ),
    stock_check AS (
        SELECT 
            ri.root_recipe_id,
            BOOL_AND(COALESCE(i.stock, 0) >= ri.total_required_qty) AS has_stock
        FROM required_ingredients ri
        JOIN public.ingredients i ON i.id = ri.ingredient_id
        GROUP BY ri.root_recipe_id
    ),
    final_menu AS (
        SELECT 
            r.*,
            jsonb_build_object('name', c.name) AS categories,
            COALESCE(sc.has_stock, TRUE) AS has_stock
        FROM public.recipes r
        LEFT JOIN public.categories c ON c.id = r.category_id
        LEFT JOIN stock_check sc ON sc.root_recipe_id = r.id
        WHERE r.store_id = p_store_id 
          AND r.is_sub_recipe = FALSE
          AND (p_is_available IS NULL OR r.is_available = p_is_available)
          AND (p_category_id IS NULL OR r.category_id = p_category_id)
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(fm.*)), '[]'::jsonb) INTO v_result FROM final_menu fm;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_order_by_session"("p_session_token" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order JSON;
BEGIN
    SELECT row_to_json(o)
      INTO v_order
    FROM (
      SELECT o.*,
        COALESCE(
          (SELECT json_agg(
            row_to_json(oi)
          ) FROM (
             SELECT item.*, row_to_json(r) as recipe
             FROM order_items item
             LEFT JOIN recipes r ON r.id = item.recipe_id
             WHERE item.order_id = o.id
          ) oi), 
        '[]'::json) as order_items
      FROM orders o
      WHERE o.session_token = p_session_token
      LIMIT 1
    ) o;
    
    RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_store_managers"("store_id_input" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("permission_id" "uuid", "manager_id" "uuid", "manager_email" "text", "manager_name" "text", "role" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_store_id UUID;
BEGIN
  -- Se não passado, tenta usar o ID do usuário (legado), mas idealmente deve receber o ID da loja
  target_store_id := COALESCE(store_id_input, auth.uid());
  
  -- Segurança: Apenas dono ou quem tem role 'owner' na loja pode ver a lista de gestores
  -- USAMOS ALIASES (s, up_check) PARA EVITAR AMBIGUIDADE COM OS PARÂMETROS DE RETORNO
  IF NOT EXISTS (
      SELECT 1 FROM stores s WHERE s.id = target_store_id AND s.owner_id = auth.uid()
  ) AND NOT EXISTS (
      SELECT 1 FROM unit_permissions up_check 
      WHERE up_check.store_id = target_store_id 
      AND up_check.manager_id = auth.uid() 
      AND up_check.role = 'owner'
  ) THEN
      -- Se não tiver permissão, retorna vazio (segurança silenciosa)
      RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    up.id as permission_id,
    up.manager_id,
    u.email::TEXT as manager_email, -- Cast explícito para TEXT para evitar erro de tipo
    COALESCE(u.raw_user_meta_data->>'name', 'Usuário')::TEXT as manager_name,
    up.role::TEXT,
    up.created_at
  FROM unit_permissions up
  JOIN auth.users u ON up.manager_id = u.id
  WHERE up.store_id = target_store_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_user_active_permissions"("p_user_id" "uuid") RETURNS TABLE("permission_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select
    pp.permission_key
  from
    public.subscriptions s
  join
    public.plan_permissions pp on s.plan_id = pp.plan_id
  where
    s.user_id = p_user_id and s.status = 'active';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_comunnity_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_plan_name" "text", "p_permissions" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
    v_role_id UUID;
    v_subscription_id UUID;
    v_permission TEXT;
BEGIN
    -- 1. Upsert subscription with improved date logic
    INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
    VALUES (p_user_id, p_plan_id, 'active', NOW() + INTERVAL '1 month')
    ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        status = 'active',
        -- If current period is in the future, add 1 month to it.
        -- Otherwise, set it to 1 month from now.
        current_period_end = (
            CASE
                WHEN subscriptions.current_period_end > NOW()
                THEN subscriptions.current_period_end + INTERVAL '1 month'
                ELSE NOW() + INTERVAL '1 month'
            END
        ),
        updated_at = NOW();

    -- 2. Upsert a role for the user
    INSERT INTO roles (user_id, name)
    VALUES (p_user_id, 'Plano - ' || p_plan_name)
    ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name
    RETURNING id INTO v_role_id;

    -- 3. Clear old permissions for this user
    DELETE FROM role_permissions WHERE user_id = p_user_id;

    -- 4. Insert new permissions based on the plan
    FOREACH v_permission IN ARRAY p_permissions
    LOOP
        INSERT INTO role_permissions (user_id, role_id, permission_key)
        VALUES (p_user_id, v_role_id, v_permission);
    END LOOP;
END;$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;

CREATE OR REPLACE FUNCTION "public"."invite_manager_by_email"("email_input" "text", "role_input" "text", "store_id_input" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_user_id UUID;
  target_store_id UUID;
BEGIN
  target_store_id := COALESCE(store_id_input, auth.uid());
  
  -- Segurança: Apenas Owner pode convidar
  IF NOT EXISTS (
      SELECT 1 FROM stores s WHERE s.id = target_store_id AND s.owner_id = auth.uid()
  ) AND NOT EXISTS (
      SELECT 1 FROM unit_permissions up_check 
      WHERE up_check.store_id = target_store_id 
      AND up_check.manager_id = auth.uid() 
      AND up_check.role = 'owner'
  ) THEN
      RETURN json_build_object('success', false, 'message', 'Permissão negada. Apenas proprietários podem convidar.');
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = email_input;

  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não encontrado com este e-mail. Peça para ele criar uma conta no ChefOS primeiro.');
  END IF;

  IF EXISTS (SELECT 1 FROM unit_permissions up WHERE up.manager_id = target_user_id AND up.store_id = target_store_id) THEN
    RETURN json_build_object('success', false, 'message', 'Este usuário já é um gestor desta loja.');
  END IF;

  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (target_user_id, target_store_id, role_input);

  RETURN json_build_object('success', true, 'message', 'Gestor adicionado com sucesso!');
END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_account_manager"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Verifica se existe algum registro na tabela 'employees' que corresponda ao UID do usuário autenticado
  -- e que tenha o cargo ('role') de 'Gerente'.
  RETURN EXISTS (
    SELECT 1
    FROM public.employees
    WHERE user_id = auth.uid() AND role = 'Gerente'
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_system_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.system_admins 
    WHERE email = auth.jwt() ->> 'email'
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."log_edit_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Para a tabela forum_topics
  IF (TG_TABLE_NAME = 'forum_topics') THEN
    IF (OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title) THEN
      INSERT INTO forum_edits (user_id, topic_id, previous_title, previous_content)
      VALUES (OLD.user_id, OLD.id, OLD.title, OLD.content);
      NEW.last_edited_at := now();
    END IF;
  END IF;

  -- Para a tabela forum_comments
  IF (TG_TABLE_NAME = 'forum_comments') THEN
    IF (OLD.content IS DISTINCT FROM NEW.content) THEN
      INSERT INTO forum_edits (user_id, comment_id, previous_content)
      VALUES (OLD.user_id, OLD.id, OLD.content);
      NEW.last_edited_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."override_order_item_price"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_recipe_price numeric;
  v_recipe_cost numeric;
BEGIN
  IF NEW.recipe_id IS NOT NULL THEN
    -- Busca Preço e Custo da Tabela original
    SELECT price, operational_cost INTO v_recipe_price, v_recipe_cost
    FROM public.recipes 
    WHERE id = NEW.recipe_id;
    
    IF v_recipe_price IS NOT NULL THEN
       NEW.original_price := v_recipe_price;
       NEW.unit_cost := COALESCE(v_recipe_cost, 0);

       IF NEW.discount_type = 'percentage' THEN
          NEW.price := NEW.original_price - (NEW.original_price * COALESCE(NEW.discount_value, 0) / 100.0);
       ELSIF NEW.discount_type = 'amount' THEN
          NEW.price := NEW.original_price - COALESCE(NEW.discount_value, 0);
       ELSE
          NEW.price := NEW.original_price;
       END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."public_call_waiter"("p_session_token" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_table_number INT;
  v_user_id UUID;
BEGIN
  SELECT table_number, user_id INTO v_table_number, v_user_id
  FROM public.orders 
  WHERE session_token = p_session_token AND status = 'OPEN';

  IF v_table_number IS NOT NULL AND v_table_number > 0 THEN
    UPDATE public.tables
    SET status = 'CHAMANDO_GARCOM'
    WHERE number = v_table_number AND user_id = v_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."public_request_bill"("p_session_token" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_table_number INT;
  v_user_id UUID;
BEGIN
  SELECT table_number, user_id INTO v_table_number, v_user_id
  FROM public.orders 
  WHERE session_token = p_session_token AND status = 'OPEN';

  IF v_table_number IS NOT NULL AND v_table_number > 0 THEN
    UPDATE public.tables
    SET status = 'PAGANDO'
    WHERE number = v_table_number AND user_id = v_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."regenerate_external_api_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_api_key text; -- Declara uma variável para guardar a nova chave
BEGIN
  -- Executa o UPDATE e usa a cláusula "INTO" para armazenar
  -- o valor retornado na nossa variável "new_api_key".
  UPDATE public.company_profile
  SET external_api_key = gen_random_uuid()
  WHERE user_id = auth.uid()
  RETURNING external_api_key INTO new_api_key;

  -- Retorna o valor que foi armazenado na variável.
  RETURN new_api_key;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."register_menu_customer"("p_store_id" "uuid", "p_name" "text", "p_phone" "text", "p_cpf" "text", "p_password" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_customer_id UUID;
    v_existing_cpf UUID;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;
    SELECT id INTO v_existing_cpf FROM public.customers 
    WHERE user_id = p_store_id AND (cpf = p_cpf OR phone = p_phone) LIMIT 1;
    
    IF FOUND THEN
        RETURN json_build_object('success', false, 'message', 'CPF ou Telefone já cadastrado nesta loja.');
    END IF;

    INSERT INTO public.customers (user_id, name, phone, cpf, password_hash)
    VALUES (p_store_id, p_name, p_phone, p_cpf, crypt(p_password, gen_salt('bf')))
    RETURNING id INTO v_customer_id;

    RETURN json_build_object('success', true, 'customer', json_build_object(
        'id', v_customer_id,
        'name', p_name,
        'phone', p_phone,
        'cpf', p_cpf,
        'loyalty_points', 0
    ));
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."remove_store_manager"("permission_id_input" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;

CREATE OR REPLACE FUNCTION "public"."sync_user_store_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_manager_id UUID;
  allowed_stores JSONB;
BEGIN
  -- Determinar qual usuário foi afetado (cobre INSERT, UPDATE e DELETE)
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'unit_permissions' THEN
      target_manager_id := OLD.manager_id;
    ELSIF TG_TABLE_NAME = 'stores' THEN
      target_manager_id := OLD.owner_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'unit_permissions' THEN
      target_manager_id := NEW.manager_id;
    ELSIF TG_TABLE_NAME = 'stores' THEN
      target_manager_id := NEW.owner_id;
    END IF;
  END IF;

  -- Agregar todas as lojas que este gerente tem acesso em um array JSONB
  SELECT COALESCE(jsonb_agg(store_id), '[]'::jsonb)
  INTO allowed_stores
  FROM (
      SELECT store_id FROM public.unit_permissions WHERE manager_id = target_manager_id
      UNION
      SELECT id as store_id FROM public.stores WHERE owner_id = target_manager_id
  ) AS user_stores;

  -- Atualizar o raw_app_meta_data do usuário na tabela auth.users
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
      COALESCE(raw_app_meta_data, '{}'::jsonb),
      '{stores}',
      allowed_stores
  )
  WHERE id = target_manager_id;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."update_order_public"("p_order_id" "uuid", "p_customer_name" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.orders
    SET customer_name = COALESCE(p_customer_name, customer_name),
        notes = COALESCE(p_notes, notes)
    WHERE id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."adjust_stock" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."adjust_stock_by_lot" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."create_ingredient_with_lot" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."create_order_with_items" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."decrement_stock_for_order" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."finalize_order_transaction" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."get_daily_dre" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."get_financial_summary" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."mark_order_as_served" FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."update_item_status" FROM PUBLIC, anon;

-- FIX KG-002 WhatsApp RLS
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."whatsapp_chats";
DROP POLICY IF EXISTS "Enable insert for all users" ON "public"."whatsapp_chats";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."whatsapp_chats";
DROP POLICY IF EXISTS "Enable delete for all users" ON "public"."whatsapp_chats";

DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."whatsapp_configs";
DROP POLICY IF EXISTS "Enable insert for all users" ON "public"."whatsapp_configs";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."whatsapp_configs";
DROP POLICY IF EXISTS "Enable delete for all users" ON "public"."whatsapp_configs";

DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."whatsapp_messages";
DROP POLICY IF EXISTS "Enable insert for all users" ON "public"."whatsapp_messages";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."whatsapp_messages";
DROP POLICY IF EXISTS "Enable delete for all users" ON "public"."whatsapp_messages";

CREATE POLICY "Enable read for store owner or managers" ON "public"."whatsapp_chats" FOR SELECT USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));
CREATE POLICY "Enable all for store owner or managers" ON "public"."whatsapp_chats" FOR ALL USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));

CREATE POLICY "Enable read for store owner or managers" ON "public"."whatsapp_configs" FOR SELECT USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));
CREATE POLICY "Enable all for store owner or managers" ON "public"."whatsapp_configs" FOR ALL USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));

CREATE POLICY "Enable read for store owner or managers" ON "public"."whatsapp_messages" FOR SELECT USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));
CREATE POLICY "Enable all for store owner or managers" ON "public"."whatsapp_messages" FOR ALL USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));

REVOKE ALL ON "public"."whatsapp_chats" FROM anon;
REVOKE ALL ON "public"."whatsapp_configs" FROM anon;
REVOKE ALL ON "public"."whatsapp_messages" FROM anon;

-- Fix regenerate_external_api_key (KG-009)
CREATE OR REPLACE FUNCTION "public"."regenerate_external_api_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
  new_api_key text;
BEGIN
  -- Insert or update store_integration_credentials
  INSERT INTO public.store_integration_credentials (store_id, external_api_key)
  VALUES (auth.uid(), gen_random_uuid())
  ON CONFLICT (store_id) DO UPDATE
  SET external_api_key = gen_random_uuid()
  RETURNING external_api_key INTO new_api_key;
  
  RETURN new_api_key;
END;
$$;

-- Create RPC for updating credentials (KG-009)
CREATE OR REPLACE FUNCTION "public"."update_store_credentials"("p_store_id" "uuid", "p_credentials" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
  END IF;

  INSERT INTO public.store_integration_credentials (
    store_id, 
    ifood_merchant_id, 
    mp_access_token, 
    mp_refresh_token, 
    mp_user_id, 
    mp_token_expires_at,
    mercado_pago_customer_id,
    mercado_pago_default_card_id,
    focusnfe_token,
    focusnfe_cert_valid_until
  )
  VALUES (
    p_store_id,
    p_credentials->>'ifood_merchant_id',
    p_credentials->>'mp_access_token',
    p_credentials->>'mp_refresh_token',
    p_credentials->>'mp_user_id',
    (p_credentials->>'mp_token_expires_at')::timestamp,
    p_credentials->>'mercado_pago_customer_id',
    p_credentials->>'mercado_pago_default_card_id',
    p_credentials->>'focusnfe_token',
    p_credentials->>'focusnfe_cert_valid_until'
  )
  ON CONFLICT (store_id) DO UPDATE
  SET
    ifood_merchant_id = COALESCE(p_credentials->>'ifood_merchant_id', store_integration_credentials.ifood_merchant_id),
    mp_access_token = COALESCE(p_credentials->>'mp_access_token', store_integration_credentials.mp_access_token),
    mp_refresh_token = COALESCE(p_credentials->>'mp_refresh_token', store_integration_credentials.mp_refresh_token),
    mp_user_id = COALESCE(p_credentials->>'mp_user_id', store_integration_credentials.mp_user_id),
    mp_token_expires_at = COALESCE((p_credentials->>'mp_token_expires_at')::timestamp, store_integration_credentials.mp_token_expires_at),
    mercado_pago_customer_id = COALESCE(p_credentials->>'mercado_pago_customer_id', store_integration_credentials.mercado_pago_customer_id),
    mercado_pago_default_card_id = COALESCE(p_credentials->>'mercado_pago_default_card_id', store_integration_credentials.mercado_pago_default_card_id),
    focusnfe_token = COALESCE(p_credentials->>'focusnfe_token', store_integration_credentials.focusnfe_token),
    focusnfe_cert_valid_until = COALESCE(p_credentials->>'focusnfe_cert_valid_until', store_integration_credentials.focusnfe_cert_valid_until);
END;
$$;

