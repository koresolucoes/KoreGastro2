-- Migration: 20260809000009_harden_rpc_tenancy_checks.sql
-- Description: Harden tenant-sensitive SECURITY DEFINER RPCs against cross-tenant execution.

-- 1. Ensure has_access_to_store supports service_role, owner_id, app_metadata, and unit_permissions
CREATE OR REPLACE FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Service role bypass for server-side background tasks
  IF auth.role() = 'service_role' THEN
      RETURN TRUE;
  END IF;

  -- A. Direct account/store match (legacy single-store)
  IF auth.uid() IS NOT NULL AND auth.uid() = target_store_id THEN
      RETURN TRUE;
  END IF;

  -- B. Store owner check in stores table
  IF auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE id = target_store_id AND owner_id = auth.uid()
  ) THEN
      RETURN TRUE;
  END IF;

  -- C. Delegated store permission in JWT app_metadata
  IF COALESCE((current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' -> 'stores'), '[]'::jsonb) ? target_store_id::text THEN
      RETURN TRUE;
  END IF;

  -- D. Delegated manager permission in unit_permissions table
  IF auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.unit_permissions 
      WHERE manager_id = auth.uid() 
        AND store_id = target_store_id
  ) THEN
      RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 2. Harden create_order_with_items
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
    FROM orders o
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
    SELECT * INTO v_recipe FROM public.recipes 
    WHERE user_id = p_restaurant_id AND external_code = v_item->>'externalCode';

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

-- 3. Harden adjust_stock (overload 1 and overload 2)
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

-- 4. Harden adjust_stock_by_lot
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
    v_entry_lot_id UUID;
    v_remaining_quantity NUMERIC;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_user_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_user_id;
    END IF;

    IF p_quantity_change > 0 THEN
        SELECT id INTO v_entry_lot_id
        FROM inventory_lots
        WHERE ingredient_id = p_ingredient_id
          AND lot_number = p_lot_number_for_entry
          AND COALESCE(expiration_date, '1970-01-01') = COALESCE(p_expiration_date_for_entry, '1970-01-01')
          AND user_id = p_user_id;

        IF v_entry_lot_id IS NULL THEN
            INSERT INTO inventory_lots (ingredient_id, lot_number, expiration_date, quantity, user_id)
            VALUES (p_ingredient_id, p_lot_number_for_entry, p_expiration_date_for_entry, p_quantity_change, p_user_id)
            RETURNING id INTO v_entry_lot_id;
        ELSE
            UPDATE inventory_lots
            SET quantity = quantity + p_quantity_change
            WHERE id = v_entry_lot_id;
        END IF;

        INSERT INTO inventory_movements (ingredient_id, quantity_change, reason, user_id, lot_id)
        VALUES (p_ingredient_id, p_quantity_change, p_reason, p_user_id, v_entry_lot_id);
    ELSE
        v_remaining_quantity := abs(p_quantity_change);

        IF p_lot_id_for_exit IS NOT NULL THEN
            UPDATE inventory_lots
            SET quantity = quantity - v_remaining_quantity
            WHERE id = p_lot_id_for_exit
            AND quantity >= v_remaining_quantity;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Estoque insuficiente no lote selecionado.';
            END IF;
            
            INSERT INTO inventory_movements (ingredient_id, quantity_change, reason, user_id, lot_id)
            VALUES (p_ingredient_id, p_quantity_change, p_reason, p_user_id, p_lot_id_for_exit);
        END IF;
    END IF;

    UPDATE ingredients
    SET stock = stock + p_quantity_change,
        last_movement_at = NOW()
    WHERE id = p_ingredient_id;
END;
$$;

-- 5. Harden create_ingredient_with_lot
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

    INSERT INTO ingredients (
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
            INSERT INTO inventory_lots (
                ingredient_id, lot_number, expiration_date, quantity, user_id
            )
            VALUES (
                v_ingredient_id, p_lot_number, p_expiration_date, p_initial_quantity, p_user_id
            )
            RETURNING id INTO v_lot_id;
            
            INSERT INTO inventory_movements (
                ingredient_id, quantity_change, reason, user_id, lot_id
            )
            VALUES (
                v_ingredient_id, p_initial_quantity, 'Entrada Inicial', p_user_id, v_lot_id
            );
        END;
    END IF;
END;
$$;

-- 6. Harden finalize_order_transaction
CREATE OR REPLACE FUNCTION "public"."finalize_order_transaction"(
    "p_order_id" "uuid",
    "p_user_id" "uuid",
    "p_table_id" "uuid",
    "p_payments" "jsonb",
    "p_closed_by_employee_id" "uuid",
    "p_tip_amount" numeric DEFAULT 0
) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    payment_record JSONB;
    v_order_ref TEXT;
    v_table_num INTEGER;
    v_command_num INTEGER;
    v_open_orders_count INTEGER;
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_user_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_user_id;
    END IF;

    SELECT table_number, command_number INTO v_table_num, v_command_num
    FROM orders WHERE id = p_order_id;

    IF v_command_num IS NOT NULL THEN
        v_order_ref := 'Comanda #' || v_command_num;
    ELSIF v_table_num > 0 THEN
        v_order_ref := 'Mesa ' || v_table_num;
    ELSE
        v_order_ref := 'Pedido #' || substring(p_order_id::text, 1, 8);
    END IF;

    UPDATE orders 
    SET 
        status = 'COMPLETED',
        completed_at = NOW(),
        closed_by_employee_id = p_closed_by_employee_id
    WHERE id = p_order_id;

    IF v_table_num > 0 THEN
        SELECT COUNT(*) INTO v_open_orders_count
        FROM orders 
        WHERE table_number = v_table_num 
          AND user_id = p_user_id 
          AND status IN ('OPEN', 'PAYING')
          AND id != p_order_id;

        IF v_open_orders_count = 0 THEN
            IF p_table_id IS NOT NULL THEN
                UPDATE tables 
                SET status = 'LIVRE', employee_id = NULL, customer_count = 0
                WHERE id = p_table_id;
            ELSE
                UPDATE tables 
                SET status = 'LIVRE', employee_id = NULL, customer_count = 0
                WHERE number = v_table_num AND user_id = p_user_id;
            END IF;
        END IF;
    END IF;

    RETURN json_build_object('success', true, 'order_id', p_order_id);
END;
$$;

-- 7. Harden Analytics RPCs (get_daily_dre, get_financial_summary, calculate_daily_cmv)
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
    FROM orders
    WHERE user_id = p_user_id AND status = 'COMPLETED' AND DATE(created_at) = p_date;

    SELECT COALESCE(SUM(amount), 0) INTO v_indirect_costs
    FROM transactions t
    JOIN financial_categories fc ON t.financial_category_id = fc.id
    WHERE t.user_id = p_user_id AND t.type = 'Despesa' AND fc.type = 'CUSTO_INDIRETO' AND t.competence_date = p_date;

    SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) INTO v_cogs_real
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.user_id = p_user_id AND o.status = 'COMPLETED' AND DATE(o.created_at) = p_date;

    v_cogs_real := v_cogs_real + COALESCE((
        SELECT SUM(total_cost)
        FROM inventory_adjustments
        WHERE user_id = p_user_id AND DATE(created_at) = p_date AND type IN ('DESPERDICIO', 'VENCIMENTO', 'CONSUMO_INTERNO')
    ), 0);

    SELECT COALESCE(SUM(amount), 0) INTO v_operating_expenses
    FROM transactions t
    JOIN financial_categories fc ON t.financial_category_id = fc.id
    WHERE t.user_id = p_user_id AND t.type = 'Despesa' AND fc.type = 'DESPESA_OPERACIONAL' AND t.competence_date = p_date;

    SELECT COALESCE(SUM(monthly_depreciation / 30), 0) INTO v_daily_depreciation
    FROM assets_depreciation
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
    FROM transactions
    WHERE user_id = p_user_id 
      AND type = 'Receita' 
      AND date >= p_start_date 
      AND date <= p_end_date
  ),
  expense_stats AS (
    SELECT 
      COALESCE(SUM(amount), 0) as expenses
    FROM transactions
    WHERE user_id = p_user_id 
      AND type = 'Despesa'
      AND date >= p_start_date 
      AND date <= p_end_date
  ),
  order_stats AS (
    SELECT COUNT(*) as count
    FROM orders
    WHERE user_id = p_user_id
      AND status = 'COMPLETED'
      AND timestamp >= p_start_date
      AND timestamp <= p_end_date
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
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.user_id = p_user_id AND o.status = 'COMPLETED' AND DATE(o.created_at) = p_date;

    v_cogs_real := v_cogs_real + COALESCE((
        SELECT SUM(total_cost)
        FROM inventory_adjustments
        WHERE user_id = p_user_id AND DATE(created_at) = p_date AND type IN ('DESPERDICIO', 'VENCIMENTO', 'CONSUMO_INTERNO')
    ), 0);

    RETURN QUERY SELECT v_cogs_real;
END;
$$;
