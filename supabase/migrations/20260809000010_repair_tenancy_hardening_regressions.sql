-- Migration: 20260809000010_repair_tenancy_hardening_regressions.sql
-- Description: Repair tenancy hardening regressions introduced in 000009 while preserving concurrency, financial integrity, and security from 03D, 03E, etc.

-- 1. finalize_order_transaction
CREATE OR REPLACE FUNCTION "public"."finalize_order_transaction"(
    "p_order_id" "uuid",
    "p_user_id" "uuid",
    "p_table_id" "uuid",
    "p_payments" "jsonb",
    "p_closed_by_employee_id" "uuid",
    "p_tip_amount" numeric DEFAULT 0
) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_order_status TEXT;
    v_table_num INTEGER;
    v_command_num INTEGER;
    v_discount_type TEXT;
    v_discount_value NUMERIC;
    v_delivery_cost NUMERIC;

    v_order_ref TEXT;
    v_target_table_id UUID;
    v_open_orders_count INTEGER;

    v_subtotal_raw NUMERIC;
    v_subtotal NUMERIC;
    v_discount_amount NUMERIC;
    v_net_items NUMERIC;
    v_delivery_fee NUMERIC;
    v_order_total NUMERIC;
    v_tip NUMERIC;
    v_expected_total NUMERIC;

    payment_record JSONB;
    v_method_text TEXT;
    v_amount_text TEXT;
    v_curr_amount NUMERIC;
    v_payments_total NUMERIC := 0;
    v_non_cash_total NUMERIC := 0;
    v_cash_total NUMERIC := 0;
    v_change NUMERIC := 0;

    v_ingredient_record RECORD;
BEGIN
    -- 0. TENANCY GUARD FOR AUTHENTICATED ROLE
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_user_id) THEN
        RETURN json_build_object(
            'success', false,
            'message', 'FORBIDDEN: Access denied to store ' || p_user_id
        );
    END IF;

    -- 1. LOCK O REGISTRO DO PEDIDO ANTES DE QUALQUER EFEITO (FOR UPDATE)
    SELECT status, table_number, command_number, discount_type, discount_value, delivery_cost
    INTO v_order_status, v_table_num, v_command_num, v_discount_type, v_discount_value, v_delivery_cost
    FROM public.orders
    WHERE id = p_order_id AND user_id = p_user_id
    FOR UPDATE;

    -- Se o pedido não for encontrado ou pertencente a outro usuário
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Pedido não encontrado ou não pertence a este estabelecimento'
        );
    END IF;

    -- 2. STATUS GUARD & IDEMPOTÊNCIA (03D intacto)
    IF v_order_status = 'COMPLETED' THEN
        RETURN json_build_object(
            'success', true,
            'already_finalized', true,
            'order_id', p_order_id,
            'message', 'Pedido já finalizado anteriormente'
        );
    END IF;

    IF v_order_status = 'CANCELLED' THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Não é possível finalizar um pedido cancelado'
        );
    END IF;

    IF v_order_status NOT IN ('OPEN', 'PAYING') THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Pedido em status inválido para finalização'
        );
    END IF;

    -- 3. DETERMINAR O TOTAL OFICIAL SERVER-SIDE (DO BANCO DE DADOS)
    SELECT COALESCE(SUM(price * quantity), 0)
    INTO v_subtotal_raw
    FROM public.order_items
    WHERE order_id = p_order_id AND status != 'CANCELADO';

    v_subtotal := ROUND(COALESCE(v_subtotal_raw, 0), 2);

    IF v_discount_type = 'percentage' AND v_discount_value IS NOT NULL AND v_discount_value > 0 THEN
        v_discount_amount := ROUND(v_subtotal * (v_discount_value / 100.0), 2);
    ELSIF v_discount_type = 'fixed_value' AND v_discount_value IS NOT NULL AND v_discount_value > 0 THEN
        v_discount_amount := ROUND(v_discount_value, 2);
    ELSE
        v_discount_amount := 0;
    END IF;

    v_net_items := GREATEST(0, v_subtotal - v_discount_amount);
    v_delivery_fee := ROUND(COALESCE(v_delivery_cost, 0), 2);
    v_order_total := ROUND(v_net_items + v_delivery_fee, 2);

    -- 4. VALIDAR GORJETA (p_tip_amount)
    IF p_tip_amount IS NOT NULL AND p_tip_amount < 0 THEN
        RETURN json_build_object(
            'success', false,
            'code', 'INVALID_TIP_AMOUNT',
            'message', 'Valor da gorjeta não pode ser negativo'
        );
    END IF;

    v_tip := ROUND(GREATEST(0, COALESCE(p_tip_amount, 0)), 2);
    v_expected_total := ROUND(v_order_total + v_tip, 2);

    -- 5. VALIDAÇÃO ESTRUTURAL E FINANCEIRA DE P_PAYMENTS
    IF p_payments IS NULL OR jsonb_typeof(p_payments) != 'array' OR jsonb_array_length(p_payments) = 0 THEN
        RETURN json_build_object(
            'success', false,
            'code', 'INVALID_PAYMENTS_PAYLOAD',
            'message', 'Lista de pagamentos ausente ou vazia'
        );
    END IF;

    v_payments_total := 0;
    v_non_cash_total := 0;
    v_cash_total := 0;

    FOR payment_record IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_method_text := trim(COALESCE(payment_record->>'method', ''));
        IF v_method_text = '' THEN
            RETURN json_build_object(
                'success', false,
                'code', 'INVALID_PAYMENT_METHOD',
                'message', 'Forma de pagamento não informada'
            );
        END IF;

        IF payment_record->'amount' IS NULL OR payment_record->>'amount' IS NULL OR trim(payment_record->>'amount') = '' THEN
            RETURN json_build_object(
                'success', false,
                'code', 'INVALID_PAYMENT_AMOUNT',
                'message', 'Valor do pagamento ausente ou inválido'
            );
        END IF;

        v_amount_text := trim(payment_record->>'amount');
        IF NOT (v_amount_text ~ '^-?[0-9]+(\.[0-9]+)?$') THEN
            RETURN json_build_object(
                'success', false,
                'code', 'INVALID_PAYMENT_AMOUNT',
                'message', 'Valor do pagamento não é numérico válido'
            );
        END IF;

        v_curr_amount := ROUND((v_amount_text)::NUMERIC, 2);

        IF v_curr_amount <= 0 THEN
            RETURN json_build_object(
                'success', false,
                'code', 'INVALID_PAYMENT_AMOUNT',
                'message', 'Valor do pagamento deve ser maior que zero'
            );
        END IF;

        v_payments_total := v_payments_total + v_curr_amount;

        IF lower(v_method_text) LIKE '%dinheiro%' OR lower(v_method_text) LIKE '%cash%' THEN
            v_cash_total := v_cash_total + v_curr_amount;
        ELSE
            v_non_cash_total := v_non_cash_total + v_curr_amount;
        END IF;
    END LOOP;

    -- Validação de pagamento insuficiente (Underpayment)
    IF v_payments_total < v_expected_total THEN
        RETURN json_build_object(
            'success', false,
            'code', 'INSUFFICIENT_PAYMENT',
            'order_total', v_expected_total,
            'payments_total', v_payments_total,
            'message', 'Valor pago (R$ ' || v_payments_total || ') é inferior ao total do pedido (R$ ' || v_expected_total || ')'
        );
    END IF;

    -- Validação de pagamento excedente em método não-dinheiro (Overpayment Não-Cash)
    IF v_non_cash_total > v_expected_total THEN
        RETURN json_build_object(
            'success', false,
            'code', 'INVALID_OVERPAYMENT',
            'order_total', v_expected_total,
            'payments_total', v_payments_total,
            'message', 'Pagamento em método não-dinheiro excede o total do pedido'
        );
    END IF;

    v_change := ROUND(v_payments_total - v_expected_total, 2);

    -- 6. EXECUTAR EFEITOS COLATERAIS (SOMENTE APÓS TODAS AS VALIDAÇÕES)

    IF v_command_num IS NOT NULL THEN
        v_order_ref := 'Comanda #' || v_command_num;
    ELSIF v_table_num IS NOT NULL AND v_table_num > 0 THEN
        v_order_ref := 'Mesa ' || v_table_num;
    ELSE
        v_order_ref := 'Pedido #' || substring(p_order_id::text, 1, 8);
    END IF;

    -- 6a. Atualizar status do pedido para COMPLETED
    UPDATE public.orders
    SET 
        status = 'COMPLETED',
        completed_at = NOW(),
        closed_by_employee_id = p_closed_by_employee_id
    WHERE id = p_order_id;

    -- 6b. Lock e Liberação da mesa (se aplicável)
    IF v_table_num IS NOT NULL AND v_table_num > 0 THEN
        IF p_table_id IS NOT NULL THEN
            SELECT id INTO v_target_table_id
            FROM public.tables
            WHERE id = p_table_id AND user_id = p_user_id
            FOR UPDATE;
        END IF;

        IF v_target_table_id IS NULL THEN
            SELECT id INTO v_target_table_id
            FROM public.tables
            WHERE number = v_table_num AND user_id = p_user_id
            FOR UPDATE;
        END IF;

        SELECT COUNT(*) INTO v_open_orders_count
        FROM public.orders
        WHERE table_number = v_table_num
          AND user_id = p_user_id
          AND status IN ('OPEN', 'PAYING')
          AND id != p_order_id;

        IF v_open_orders_count = 0 AND v_target_table_id IS NOT NULL THEN
            UPDATE public.tables
            SET status = 'LIVRE', employee_id = NULL, customer_count = 0
            WHERE id = v_target_table_id;
        END IF;
    END IF;

    -- 6c. Registrar Transações Financeiras (Loop no JSONB)
    IF jsonb_typeof(p_payments) = 'array' THEN
        FOR payment_record IN SELECT * FROM jsonb_array_elements(p_payments)
        LOOP
            INSERT INTO public.transactions (
                user_id,
                employee_id,
                type,
                amount,
                description,
                created_at,
                date
            ) VALUES (
                p_user_id,
                p_closed_by_employee_id,
                'Receita',
                (payment_record->>'amount')::NUMERIC,
                'Receita ' || v_order_ref || ' (' || (payment_record->>'method') || ')',
                NOW(),
                NOW()
            );
        END LOOP;
    END IF;

    -- 6d. Registrar Gorjeta (se houver)
    IF v_tip > 0 THEN
        INSERT INTO public.transactions (
            user_id,
            employee_id,
            type,
            amount,
            description,
            created_at,
            date
        ) VALUES (
            p_user_id,
            p_closed_by_employee_id,
            'Gorjeta',
            v_tip,
            'Gorjeta ' || v_order_ref,
            NOW(),
            NOW()
        );
    END IF;

    -- 6e. Baixa de Estoque
    FOR v_ingredient_record IN (
        WITH RECURSIVE 
            order_recipes AS (
                SELECT recipe_id, SUM(quantity) as qty
                FROM public.order_items
                WHERE order_id = p_order_id AND recipe_id IS NOT NULL AND status != 'CANCELADO'
                GROUP BY recipe_id
            ),
            recipe_base_ingredients AS (
                SELECT id AS recipe_id, source_ingredient_id AS ingredient_id
                FROM public.recipes
                WHERE store_id = p_user_id AND source_ingredient_id IS NOT NULL
            ),
            recipe_direct_ingredients AS (
                SELECT recipe_id, ingredient_id, quantity
                FROM public.recipe_ingredients
                WHERE user_id = p_user_id
            ),
            recipe_tree AS (
                SELECT r.recipe_id AS root_recipe_id, r.recipe_id AS current_recipe_id, r.qty::NUMERIC AS required_qty
                FROM order_recipes r
                UNION ALL
                SELECT rt.root_recipe_id, rsr.child_recipe_id AS current_recipe_id, rt.required_qty * rsr.quantity AS required_qty
                FROM recipe_tree rt
                JOIN public.recipe_sub_recipes rsr ON rsr.parent_recipe_id = rt.current_recipe_id
                WHERE rsr.user_id = p_user_id
            ),
            required_ingredients AS (
                SELECT rdi.ingredient_id, SUM(rt.required_qty * rdi.quantity) AS total_required_qty
                FROM recipe_tree rt
                JOIN recipe_direct_ingredients rdi ON rdi.recipe_id = rt.current_recipe_id
                GROUP BY rdi.ingredient_id
                UNION ALL
                SELECT rbi.ingredient_id, SUM(rt.required_qty) AS total_required_qty
                FROM recipe_tree rt
                JOIN recipe_base_ingredients rbi ON rbi.recipe_id = rt.current_recipe_id
                GROUP BY rbi.ingredient_id
            )
        SELECT ingredient_id, SUM(total_required_qty) as final_qty
        FROM required_ingredients
        GROUP BY ingredient_id
    )
    LOOP
        PERFORM public.adjust_stock_by_lot(
            p_ingredient_id := v_ingredient_record.ingredient_id,
            p_quantity_change := -v_ingredient_record.final_qty,
            p_reason := 'Venda ' || v_order_ref,
            p_user_id := p_user_id,
            p_lot_id_for_exit := NULL::UUID,
            p_lot_number_for_entry := NULL::TEXT,
            p_expiration_date_for_entry := NULL::DATE
        );
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'order_id', p_order_id,
        'change', v_change,
        'message', 'Conta fechada e estoque deduzido com sucesso'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'message', SQLERRM
    );
END;
$$;

-- 2. create_order_with_items (Overloads audit & fix)
CREATE OR REPLACE FUNCTION "public"."create_order_with_items"(
    "p_restaurant_id" "uuid",
    "p_order_data" "jsonb",
    "p_items" "jsonb"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN public.create_order_with_items(p_restaurant_id, p_order_data, p_items, NULL::text);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_order_with_items"(
    "p_restaurant_id" "uuid",
    "p_order_data" "jsonb",
    "p_items" "jsonb",
    "p_idempotency_key" "text" DEFAULT NULL::"text"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order_id UUID;
  v_existing_order JSONB;
  v_table_number INT;
  v_customer_id UUID;
  v_order_type TEXT;
  v_table_id UUID;
  v_new_order_id UUID;
  v_fallback_station_id UUID;
  v_item JSONB;
  v_recipe RECORD;
  v_prep RECORD;
  v_group_id UUID;
  v_prep_count INT;
  v_is_first_prep BOOLEAN;
  v_final_order JSONB;
  v_status_timestamps JSONB;
BEGIN
  -- Explicit tenancy check for authenticated caller
  IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_restaurant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to restaurant %', p_restaurant_id;
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT row_to_json(o) INTO v_existing_order
    FROM public.orders o
    WHERE idempotency_key = p_idempotency_key AND user_id = p_restaurant_id;

    IF v_existing_order IS NOT NULL THEN
      RETURN v_existing_order;
    END IF;
  END IF;

  v_table_number := (p_order_data->>'tableNumber')::INT;
  IF p_order_data->>'customerId' IS NOT NULL AND p_order_data->>'customerId' != '' THEN
    v_customer_id := (p_order_data->>'customerId')::UUID;
  END IF;

  IF v_table_number > 0 THEN
    v_order_type := 'Dine-in';
    SELECT id INTO v_table_id FROM public.tables 
    WHERE user_id = p_restaurant_id AND number = v_table_number;
    
    IF v_table_id IS NULL THEN
      RAISE EXCEPTION 'Table #% not found.', v_table_number;
    END IF;
  ELSE
    v_order_type := 'QuickSale';
  END IF;

  INSERT INTO public.orders (user_id, table_number, order_type, status, customer_id, idempotency_key)
  VALUES (p_restaurant_id, v_table_number, v_order_type, 'OPEN', v_customer_id, p_idempotency_key)
  RETURNING id INTO v_new_order_id;

  SELECT id INTO v_fallback_station_id FROM public.stations 
  WHERE user_id = p_restaurant_id LIMIT 1;

  IF v_fallback_station_id IS NULL THEN
    RAISE EXCEPTION 'No production stations found for this restaurant.';
  END IF;

  v_status_timestamps := jsonb_build_object('PENDENTE', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Query for recipe using canonical store ownership (recipes.store_id)
    SELECT * INTO v_recipe FROM public.recipes 
    WHERE store_id = p_restaurant_id
      AND external_code = v_item->>'externalCode'
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Recipe not found for external code: %', v_item->>'externalCode';
    END IF;

    SELECT count(*) INTO v_prep_count FROM public.recipe_preparations WHERE recipe_id = v_recipe.id;

    IF v_prep_count > 0 THEN
      v_group_id := gen_random_uuid();
      v_is_first_prep := TRUE;
      FOR v_prep IN SELECT * FROM public.recipe_preparations WHERE recipe_id = v_recipe.id LOOP
        INSERT INTO public.order_items (
          order_id, recipe_id, recipe_name, quantity, unit_price, total_price, notes, status, station_id, status_timestamps, user_id, group_id, preparation_id, is_primary_prep
        ) VALUES (
          v_new_order_id, v_recipe.id, v_recipe.name, (v_item->>'quantity')::NUMERIC, v_recipe.price, v_recipe.price, v_item->>'notes', 'PENDENTE', COALESCE(v_prep.station_id, v_fallback_station_id), v_status_timestamps, p_restaurant_id, v_group_id, v_prep.id, v_is_first_prep
        );
        v_is_first_prep := FALSE;
      END LOOP;
    ELSE
      INSERT INTO public.order_items (
        order_id, recipe_id, recipe_name, quantity, unit_price, total_price, notes, status, station_id, status_timestamps, user_id
      ) VALUES (
        v_new_order_id, v_recipe.id, v_recipe.name, (v_item->>'quantity')::NUMERIC, v_recipe.price, v_recipe.price, v_item->>'notes', 'PENDENTE', v_fallback_station_id, v_status_timestamps, p_restaurant_id
      );
    END IF;
  END LOOP;

  IF v_table_id IS NOT NULL THEN
    UPDATE public.tables SET status = 'OCUPADA' WHERE id = v_table_id;
  END IF;

  SELECT jsonb_build_object(
    'id', o.id,
    'user_id', o.user_id,
    'table_number', o.table_number,
    'order_type', o.order_type,
    'status', o.status,
    'customer_id', o.customer_id,
    'created_at', o.created_at,
    'order_items', COALESCE((SELECT jsonb_agg(to_jsonb(oi.*)) FROM public.order_items oi WHERE oi.order_id = o.id), '[]'::jsonb)
  ) INTO v_final_order
  FROM public.orders o
  WHERE o.id = v_new_order_id;

  RETURN v_final_order;
END;
$$;

-- 3. adjust_stock_by_lot (Full FIFO/FEFO + Tenancy)
CREATE OR REPLACE FUNCTION "public"."adjust_stock_by_lot"(
    "p_ingredient_id" "uuid",
    "p_quantity_change" numeric,
    "p_reason" "text",
    "p_user_id" "uuid",
    "p_lot_id_for_exit" "uuid",
    "p_lot_number_for_entry" "text",
    "p_expiration_date_for_entry" "date"
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_ingredient_store_id UUID;
    v_entry_lot_id UUID;
    v_remaining_quantity NUMERIC;
    v_fifo_lot_record RECORD;
BEGIN
    -- Validar existencia e pertencimento do ingrediente à store
    SELECT user_id INTO v_ingredient_store_id
    FROM public.ingredients
    WHERE id = p_ingredient_id;

    IF v_ingredient_store_id IS NULL THEN
        RAISE EXCEPTION 'Ingrediente % não encontrado.', p_ingredient_id;
    END IF;

    IF v_ingredient_store_id != p_user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Ingrediente não pertence ao estabelecimento %', p_user_id;
    END IF;

    -- Validar permissao da role authenticated
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_user_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Acesso negado ao estabelecimento %', p_user_id;
    END IF;

    -- Entradas de estoque (quantidade positiva)
    IF p_quantity_change > 0 THEN
        SELECT id INTO v_entry_lot_id
        FROM public.inventory_lots
        WHERE ingredient_id = p_ingredient_id
          AND lot_number = p_lot_number_for_entry
          AND COALESCE(expiration_date, '1970-01-01') = COALESCE(p_expiration_date_for_entry, '1970-01-01')
          AND user_id = p_user_id;

        IF v_entry_lot_id IS NULL THEN
            INSERT INTO public.inventory_lots (ingredient_id, lot_number, expiration_date, quantity, user_id)
            VALUES (p_ingredient_id, p_lot_number_for_entry, p_expiration_date_for_entry, p_quantity_change, p_user_id)
            RETURNING id INTO v_entry_lot_id;
        ELSE
            UPDATE public.inventory_lots
            SET quantity = quantity + p_quantity_change
            WHERE id = v_entry_lot_id AND user_id = p_user_id;
        END IF;

        INSERT INTO public.inventory_movements (ingredient_id, quantity_change, reason, user_id, lot_id)
        VALUES (p_ingredient_id, p_quantity_change, p_reason, p_user_id, v_entry_lot_id);

    -- Saídas de estoque (quantidade negativa)
    ELSE
        v_remaining_quantity := abs(p_quantity_change);

        -- Se um lote especifico foi fornecido para a saida
        IF p_lot_id_for_exit IS NOT NULL THEN
            UPDATE public.inventory_lots
            SET quantity = quantity - v_remaining_quantity
            WHERE id = p_lot_id_for_exit
              AND ingredient_id = p_ingredient_id
              AND user_id = p_user_id
              AND quantity >= v_remaining_quantity;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Estoque insuficiente no lote selecionado.';
            END IF;
            
            INSERT INTO public.inventory_movements (ingredient_id, quantity_change, reason, user_id, lot_id)
            VALUES (p_ingredient_id, p_quantity_change, p_reason, p_user_id, p_lot_id_for_exit);

        -- Se NENHUM lote especifico foi fornecido, usar FEFO/FIFO
        ELSE
            FOR v_fifo_lot_record IN
                SELECT id, quantity
                FROM public.inventory_lots
                WHERE ingredient_id = p_ingredient_id
                  AND user_id = p_user_id
                  AND quantity > 0
                ORDER BY COALESCE(expiration_date, '9999-12-31') ASC, created_at ASC
            LOOP
                DECLARE
                    v_deduct_quantity NUMERIC;
                BEGIN
                    v_deduct_quantity := LEAST(v_remaining_quantity, v_fifo_lot_record.quantity);

                    UPDATE public.inventory_lots
                    SET quantity = quantity - v_deduct_quantity
                    WHERE id = v_fifo_lot_record.id AND user_id = p_user_id;
                    
                    INSERT INTO public.inventory_movements (ingredient_id, quantity_change, reason, user_id, lot_id)
                    VALUES (p_ingredient_id, -v_deduct_quantity, p_reason, p_user_id, v_fifo_lot_record.id);

                    v_remaining_quantity := v_remaining_quantity - v_deduct_quantity;

                    IF v_remaining_quantity <= 0 THEN
                        EXIT;
                    END IF;
                END;
            END LOOP;

            IF v_remaining_quantity > 0 THEN
                RAISE EXCEPTION 'Estoque insuficiente entre todos os lotes para esta saída.';
            END IF;
        END IF;
    END IF;

    -- Recomputar o estoque total na tabela de ingredientes
    UPDATE public.ingredients
    SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM public.inventory_lots WHERE ingredient_id = p_ingredient_id AND user_id = p_user_id),
        last_movement_at = NOW()
    WHERE id = p_ingredient_id AND user_id = p_user_id;
END;
$$;

-- 4. adjust_stock (Overloads)
CREATE OR REPLACE FUNCTION "public"."adjust_stock"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_store_id UUID;
BEGIN
  SELECT user_id INTO v_store_id
  FROM public.ingredients
  WHERE id = p_ingredient_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Ingredient % not found.', p_ingredient_id;
  END IF;

  IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(v_store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', v_store_id;
  END IF;

  UPDATE public.ingredients
  SET
    stock = stock + p_quantity_change,
    last_movement_at = now()
  WHERE id = p_ingredient_id;

  INSERT INTO public.inventory_movements(ingredient_id, quantity_change, reason, user_id)
  VALUES (p_ingredient_id, p_quantity_change, p_reason, v_store_id);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."adjust_stock"("p_ingredient_id" "uuid", "p_amount" numeric, "p_type" "text", "p_reason" "text", "p_station_id" "uuid" DEFAULT NULL::"uuid", "p_unit_cost" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_store_id UUID;
  v_qty_change NUMERIC;
BEGIN
  SELECT user_id INTO v_store_id 
  FROM public.ingredients 
  WHERE id = p_ingredient_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Ingredient % not found.', p_ingredient_id;
  END IF;

  IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(v_store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', v_store_id;
  END IF;

  v_qty_change := CASE WHEN p_type = 'ENTRY' THEN abs(p_amount) ELSE -abs(p_amount) END;

  UPDATE public.ingredients
  SET
    stock = stock + v_qty_change,
    last_movement_at = now()
  WHERE id = p_ingredient_id;

  INSERT INTO public.inventory_movements(ingredient_id, quantity_change, reason, user_id)
  VALUES (p_ingredient_id, v_qty_change, p_reason, v_store_id);
END;
$$;

-- 5. create_ingredient_with_lot
CREATE OR REPLACE FUNCTION "public"."create_ingredient_with_lot"(
    "p_user_id" "uuid",
    "p_name" "text",
    "p_unit" "text",
    "p_cost" numeric,
    "p_min_stock" numeric,
    "p_category_id" "uuid",
    "p_supplier_id" "uuid",
    "p_is_sellable" boolean,
    "p_price" numeric,
    "p_pos_category_id" "uuid",
    "p_station_id" "uuid",
    "p_proxy_recipe_id" "uuid",
    "p_initial_quantity" numeric,
    "p_lot_number" "text",
    "p_expiration_date" "date"
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_ingredient_id UUID;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_user_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_user_id;
    END IF;

    INSERT INTO public.ingredients (
        user_id, name, unit, cost, min_stock, category_id, supplier_id,
        is_sellable, price, pos_category_id, station_id, proxy_recipe_id,
        stock, last_movement_at
    )
    VALUES (
        p_user_id, p_name, p_unit, p_cost, p_min_stock, p_category_id, p_supplier_id,
        p_is_sellable, p_price, p_pos_category_id, p_station_id, p_proxy_recipe_id,
        p_initial_quantity, NOW()
    )
    RETURNING id INTO v_ingredient_id;

    IF p_initial_quantity > 0 THEN
        DECLARE
            v_lot_id UUID;
        BEGIN
            INSERT INTO public.inventory_lots (
                ingredient_id, lot_number, expiration_date, quantity, user_id
            )
            VALUES (
                v_ingredient_id, p_lot_number, p_expiration_date, p_initial_quantity, p_user_id
            )
            RETURNING id INTO v_lot_id;
            
            INSERT INTO public.inventory_movements (
                ingredient_id, quantity_change, reason, user_id, lot_id
            )
            VALUES (
                v_ingredient_id, p_initial_quantity, 'Entrada Inicial', p_user_id, v_lot_id
            );
        END;
    END IF;
END;
$$;

-- 6. Analytics RPCs
CREATE OR REPLACE FUNCTION "public"."get_daily_dre"("p_user_id" "uuid", "p_date" "date") RETURNS TABLE("gross_revenue" numeric, "indirect_costs" numeric, "net_revenue" numeric, "cogs_real" numeric, "gross_margin" numeric, "operating_expenses" numeric, "daily_depreciation" numeric, "net_profit" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_gross_revenue NUMERIC := 0;
    v_indirect_costs NUMERIC := 0;
    v_cogs_real NUMERIC := 0;
    v_operating_expenses NUMERIC := 0;
    v_daily_depreciation NUMERIC := 0;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_user_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_user_id;
    END IF;

    SELECT COALESCE(SUM(total_amount), 0) INTO v_gross_revenue
    FROM public.orders
    WHERE user_id = p_user_id AND status = 'COMPLETED' AND DATE(created_at) = p_date;

    SELECT COALESCE(SUM(amount), 0) INTO v_indirect_costs
    FROM public.transactions t
    JOIN public.financial_categories fc ON t.financial_category_id = fc.id
    WHERE t.user_id = p_user_id AND t.type = 'Despesa' AND fc.type = 'CUSTO_INDIRETO' AND t.competence_date = p_date;

    SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) INTO v_cogs_real
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    WHERE o.user_id = p_user_id AND o.status = 'COMPLETED' AND DATE(o.created_at) = p_date;

    v_cogs_real := v_cogs_real + COALESCE((
        SELECT SUM(total_cost)
        FROM public.inventory_adjustments
        WHERE user_id = p_user_id AND DATE(created_at) = p_date AND type IN ('DESPERDICIO', 'VENCIMENTO', 'CONSUMO_INTERNO')
    ), 0);

    SELECT COALESCE(SUM(amount), 0) INTO v_operating_expenses
    FROM public.transactions t
    JOIN public.financial_categories fc ON t.financial_category_id = fc.id
    WHERE t.user_id = p_user_id AND t.type = 'Despesa' AND fc.type = 'DESPESA_OPERACIONAL' AND t.competence_date = p_date;

    SELECT COALESCE(SUM(monthly_depreciation / 30), 0) INTO v_daily_depreciation
    FROM public.assets_depreciation
    WHERE user_id = p_user_id AND purchase_date <= p_date 
      AND p_date <= (purchase_date + (lifespan_months || ' months')::interval);

    RETURN QUERY SELECT 
        v_gross_revenue, 
        v_indirect_costs, 
        (v_gross_revenue - v_indirect_costs) as net_revenue,
        v_cogs_real,
        (v_gross_revenue - v_indirect_costs - v_cogs_real) as gross_margin,
        v_operating_expenses,
        v_daily_depreciation,
        (v_gross_revenue - v_indirect_costs - v_cogs_real - v_operating_expenses - v_daily_depreciation) as net_profit;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_financial_summary"("p_user_id" "uuid", "p_start_date" timestamp without time zone, "p_end_date" timestamp without time zone) RETURNS TABLE("total_revenue" numeric, "total_expenses" numeric, "net_profit" numeric, "total_orders" integer, "average_ticket" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_user_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_user_id;
  END IF;

  RETURN QUERY
  WITH sales_stats AS (
    SELECT 
      COALESCE(SUM(amount), 0) as revenue
    FROM public.transactions
    WHERE user_id = p_user_id 
      AND type = 'Receita' 
      AND date >= p_start_date 
      AND date <= p_end_date
  ),
  expense_stats AS (
    SELECT 
      COALESCE(SUM(amount), 0) as expenses
    FROM public.transactions
    WHERE user_id = p_user_id 
      AND type = 'Despesa'
      AND date >= p_start_date 
      AND date <= p_end_date
  ),
  order_stats AS (
    SELECT COUNT(*) as count
    FROM public.orders
    WHERE user_id = p_user_id
      AND status = 'COMPLETED'
      AND created_at >= p_start_date
      AND created_at <= p_end_date
  )
  SELECT
    s.revenue as total_revenue,
    e.expenses as total_expenses,
    (s.revenue - e.expenses) as net_profit,
    o.count::INTEGER as total_orders,
    CASE 
      WHEN o.count > 0 THEN ROUND((s.revenue / o.count), 2)
      ELSE 0 
    END as average_ticket
  FROM sales_stats s, expense_stats e, order_stats o;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."calculate_daily_cmv"("p_user_id" "uuid", "p_date" "date") RETURNS TABLE("cogs" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_cogs_real NUMERIC := 0;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_user_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_user_id;
    END IF;

    SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) INTO v_cogs_real
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    WHERE o.user_id = p_user_id AND o.status = 'COMPLETED' AND DATE(o.created_at) = p_date;

    v_cogs_real := v_cogs_real + COALESCE((
        SELECT SUM(total_cost)
        FROM public.inventory_adjustments
        WHERE user_id = p_user_id AND DATE(created_at) = p_date AND type IN ('DESPERDICIO', 'VENCIMENTO', 'CONSUMO_INTERNO')
    ), 0);

    RETURN QUERY SELECT v_cogs_real;
END;
$$;
