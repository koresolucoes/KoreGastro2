-- S0E.3 RPC Tenancy Hardening


CREATE OR REPLACE FUNCTION "public"."acknowledge_attention"("item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT o.user_id INTO v_store_id FROM public.order_items oi JOIN public.orders o ON oi.order_id = o.id WHERE oi.id = item_id;
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(v_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;

    UPDATE public.order_items
    SET status_timestamps = status_timestamps || jsonb_build_object('ATTENTION_ACKNOWLEDGED', now())
    WHERE id = item_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."decrement_stock_for_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    item record;
    v_store_id uuid;
BEGIN
    SELECT user_id INTO v_store_id FROM public.orders WHERE id = p_order_id;
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(v_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;

    FOR item IN
        SELECT ri.ingredient_id, ri.quantity * oi.quantity as total_quantity_needed
        FROM public.order_items oi
        JOIN public.recipe_ingredients ri ON oi.recipe_id = ri.recipe_id
        WHERE oi.order_id = p_order_id AND oi.status != 'CANCELADO'
    LOOP
        UPDATE public.ingredients
        SET stock = stock - item.total_quantity_needed
        WHERE id = item.ingredient_id AND user_id = v_store_id;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_admin_dashboard_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    total_clients INT;
    active_subscriptions INT;
    mrr_calc NUMERIC;
    recent_tickets INT;
BEGIN
    IF NOT public.is_system_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Only system admins can access this dashboard';
    END IF;

    SELECT COUNT(*) INTO total_clients FROM auth.users;
    SELECT COUNT(*) INTO active_subscriptions FROM public.subscriptions WHERE status = 'active';
    SELECT COALESCE(SUM(p.price_monthly), 0) INTO mrr_calc 
    FROM public.subscriptions s
    JOIN public.plans p ON s.plan_id = p.id
    WHERE s.status = 'active';
    SELECT COUNT(*) INTO recent_tickets FROM public.support_tickets WHERE status = 'open';

    RETURN json_build_object(
        'totalClients', total_clients,
        'activeSubscriptions', active_subscriptions,
        'mrr', mrr_calc,
        'recentSupportTickets', recent_tickets
    );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."mark_order_as_served"("order_id_param" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT user_id INTO v_store_id FROM public.orders WHERE id = order_id_param;
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(v_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;

    UPDATE public.order_items
    SET status = 'SERVIDO', 
        status_timestamps = status_timestamps || jsonb_build_object('SERVIDO', now())
    WHERE order_id = order_id_param;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."update_item_status"("item_id" "uuid", "new_status" "public"."order_item_status") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT o.user_id INTO v_store_id FROM public.order_items oi JOIN public.orders o ON oi.order_id = o.id WHERE oi.id = item_id;
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(v_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;

    UPDATE public.order_items
    SET status = new_status,
        status_timestamps = status_timestamps || jsonb_build_object(new_status, now())
    WHERE id = item_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."update_table_order"("p_order_id" "uuid", "p_customer_name" "text", "p_notes" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_order JSON;
    v_store_id UUID;
BEGIN
    SELECT user_id INTO v_store_id FROM public.orders WHERE id = p_order_id;
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(v_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';
    END IF;

    UPDATE public.orders
    SET customer_name = COALESCE(p_customer_name, customer_name),
        notes = COALESCE(p_notes, notes)
    WHERE id = p_order_id
    RETURNING row_to_json(orders.*) INTO v_order;
    
    RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."redeem_reward"("p_customer_id" "uuid", "p_reward_id" "uuid", "p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_store_id UUID;
    customer_points NUMERIC;
    reward RECORD;
    current_subtotal NUMERIC;
    discount_amount NUMERIC;
BEGIN
    -- Get store_id from order
    SELECT user_id INTO v_store_id FROM public.orders WHERE id = p_order_id;
    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(v_store_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Acesso negado.');
    END IF;

    -- Get customer points
    SELECT loyalty_points INTO customer_points FROM public.customers WHERE id = p_customer_id AND user_id = v_store_id;
    
    -- Get reward details
    SELECT * INTO reward FROM public.loyalty_rewards WHERE id = p_reward_id AND user_id = v_store_id;
    
    IF NOT FOUND OR NOT reward.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Prêmio não encontrado ou inativo.');
    END IF;

    IF COALESCE(customer_points, 0) < reward.points_cost THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pontos insuficientes.');
    END IF;

    -- Deduct points
    UPDATE public.customers SET loyalty_points = loyalty_points - reward.points_cost WHERE id = p_customer_id AND user_id = v_store_id;

    -- Update order with reward discount
    IF reward.reward_type = 'percentage_discount' THEN
        SELECT COALESCE(SUM(price * quantity), 0) INTO current_subtotal FROM public.order_items WHERE order_id = p_order_id AND status != 'CANCELADO';
        discount_amount := current_subtotal * (reward.discount_value / 100.0);
        UPDATE public.orders SET discount_type = 'percentage', discount_value = reward.discount_value WHERE id = p_order_id;
    ELSIF reward.reward_type = 'fixed_discount' THEN
        UPDATE public.orders SET discount_type = 'fixed', discount_value = reward.discount_value WHERE id = p_order_id;
    ELSIF reward.reward_type = 'free_item' THEN
        INSERT INTO public.order_items (order_id, recipe_id, quantity, price, original_price, status, user_id, notes)
        VALUES (p_order_id, reward.free_item_recipe_id, 1, 0, 0, 'PENDENTE', v_store_id, 'Item Resgatado (Prêmio)');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Prêmio resgatado com sucesso!');
END;
$$;
CREATE OR REPLACE FUNCTION "public"."authenticate_menu_customer"("p_store_id" "uuid", "p_cpf" "text", "p_password" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_customer RECORD;
BEGIN
    SELECT * INTO v_customer 
    FROM public.customers 
    WHERE user_id = p_store_id AND cpf = p_cpf
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Cliente não cadastrado.');

CREATE OR REPLACE FUNCTION "public"."create_free_trial_subscription"("plan_id_to_subscribe" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION "public"."delete_store"("target_store_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
BEGIN
  -- Verifica se é o dono
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = target_store_id AND owner_id = auth.uid()) THEN
     RETURN json_build_object('success', false, 'message', 'Apenas o dono pode excluir a loja.');

CREATE OR REPLACE FUNCTION "public"."get_menu_customer_history"("p_store_id" "uuid", "p_customer_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_result JSON;
BEGIN
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

CREATE OR REPLACE FUNCTION "public"."get_menu_customer_profile"("p_store_id" "uuid", "p_customer_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_customer RECORD;
BEGIN
    SELECT * INTO v_customer 
    FROM public.customers 
    WHERE user_id = p_store_id AND id = p_customer_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Cliente não encontrado.');

CREATE OR REPLACE FUNCTION "public"."get_menu_with_stock"("p_store_id" "uuid", "p_is_available" boolean DEFAULT NULL::boolean, "p_category_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_result JSONB;
BEGIN
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

CREATE OR REPLACE FUNCTION "public"."get_order_by_session"("p_session_token" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION "public"."get_store_managers"("store_id_input" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("permission_id" "uuid", "manager_id" "uuid", "manager_email" "text", "manager_name" "text", "role" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION "public"."get_user_active_permissions"("p_user_id" "uuid") RETURNS TABLE("permission_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION "public"."handle_new_comunnity_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');

CREATE OR REPLACE FUNCTION "public"."handle_new_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_plan_name" "text", "p_permissions" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    new_role_id UUID;
BEGIN
  -- A. Criar Loja
  INSERT INTO public.stores (id, name, owner_id)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'name', 'Minha Loja') || ' (Principal)', new.id)
  ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION "public"."invite_manager_by_email"("email_input" "text", "role_input" "text", "store_id_input" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION "public"."is_account_manager"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
BEGIN
  -- Verifica se existe algum registro na tabela 'employees' que corresponda ao UID do usuário autenticado
  -- e que tenha o cargo ('role') de 'Gerente'.
  RETURN EXISTS (
    SELECT 1
    FROM public.employees
    WHERE user_id = auth.uid() AND role = 'Gerente'
  );

CREATE OR REPLACE FUNCTION "public"."is_system_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.system_admins 
    WHERE email = auth.jwt() ->> 'email'
  );

CREATE OR REPLACE FUNCTION "public"."log_edit_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
BEGIN
  -- Para a tabela forum_topics
  IF (TG_TABLE_NAME = 'forum_topics') THEN
    IF (OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title) THEN
      INSERT INTO forum_edits (user_id, topic_id, previous_title, previous_content)
      VALUES (OLD.user_id, OLD.id, OLD.title, OLD.content);

CREATE OR REPLACE FUNCTION "public"."override_order_item_price"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION "public"."public_call_waiter"("p_session_token" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
  v_table_number INT;
  v_user_id UUID;
BEGIN
  SELECT table_number, user_id INTO v_table_number, v_user_id
  FROM public.orders 
  WHERE session_token = p_session_token AND status = 'OPEN';

CREATE OR REPLACE FUNCTION "public"."public_request_bill"("p_session_token" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
  v_table_number INT;
  v_user_id UUID;
BEGIN
  SELECT table_number, user_id INTO v_table_number, v_user_id
  FROM public.orders 
  WHERE session_token = p_session_token AND status = 'OPEN';

CREATE OR REPLACE FUNCTION "public"."regenerate_external_api_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_customer_id UUID;
    v_existing_cpf UUID;
BEGIN
    SELECT id INTO v_existing_cpf FROM public.customers 
    WHERE user_id = p_store_id AND (cpf = p_cpf OR phone = p_phone) LIMIT 1;
    
    IF FOUND THEN
        RETURN json_build_object('success', false, 'message', 'CPF ou Telefone já cadastrado nesta loja.');

CREATE OR REPLACE FUNCTION "public"."remove_store_manager"("permission_id_input" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION "public"."sync_user_store_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
  target_manager_id UUID;
  allowed_stores JSONB;
BEGIN
  -- Determinar qual usuário foi afetado (cobre INSERT, UPDATE e DELETE)
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'unit_permissions' THEN
      target_manager_id := OLD.manager_id;

CREATE OR REPLACE FUNCTION "public"."update_order_public"("p_order_id" "uuid", "p_customer_name" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
BEGIN
    UPDATE public.orders
    SET customer_name = COALESCE(p_customer_name, customer_name),
        notes = COALESCE(p_notes, notes)
    WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."validate_order_item_price"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $_$
DECLARE
    real_price DECIMAL;
    recipe_user_id UUID;
BEGIN
    -- 1. Busca o preço real e o dono da receita
    SELECT price, user_id INTO real_price, recipe_user_id 
    FROM public.recipes 
    WHERE id = NEW.recipe_id;
    
    -- 2. Verifica se a receita existe
    IF real_price IS NULL THEN
        RAISE EXCEPTION 'Receita inválida ou inexistente (ID: %)', NEW.recipe_id;

