-- Restore order creation against the actual orders/order_items schema. A prior
-- hardening migration referenced columns that never existed (recipe_name,
-- unit_price, total_price, preparation_id, is_primary_prep and created_at).

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_restaurant_id uuid,
  p_order_data jsonb,
  p_items jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_existing_order jsonb;
  v_table_number integer := COALESCE((p_order_data->>'tableNumber')::integer, 0);
  v_customer_id uuid;
  v_order_type public.order_type;
  v_table_id uuid;
  v_order_id uuid;
  v_fallback_station_id uuid;
  v_item jsonb;
  v_recipe record;
  v_preparation record;
  v_preparation_count integer;
  v_group_id uuid;
  v_item_price numeric;
  v_item_cost numeric;
  v_option_ids uuid[];
  v_option_text text;
  v_status_timestamps jsonb := jsonb_build_object('PENDENTE', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  v_result jsonb;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
    AND NOT public.has_access_to_store(p_restaurant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to restaurant %', p_restaurant_id;
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Between 1 and 100 items are required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT to_jsonb(o) INTO v_existing_order
    FROM public.orders o
    WHERE o.idempotency_key = p_idempotency_key AND o.user_id = p_restaurant_id;
    IF v_existing_order IS NOT NULL THEN RETURN v_existing_order; END IF;
  END IF;

  IF NULLIF(p_order_data->>'customerId', '') IS NOT NULL THEN
    v_customer_id := (p_order_data->>'customerId')::uuid;
  END IF;
  IF v_table_number > 0 THEN
    v_order_type := 'Dine-in';
    SELECT id INTO v_table_id FROM public.tables
    WHERE user_id = p_restaurant_id AND number = v_table_number;
    IF v_table_id IS NULL THEN RAISE EXCEPTION 'Table #% not found', v_table_number; END IF;
  ELSE
    v_order_type := CASE p_order_data->>'orderType'
      WHEN 'Takeout' THEN 'Takeout'::public.order_type
      WHEN 'QuickSale' THEN 'QuickSale'::public.order_type
      WHEN 'iFood-Delivery' THEN 'iFood-Delivery'::public.order_type
      WHEN 'iFood-Takeout' THEN 'iFood-Takeout'::public.order_type
      WHEN 'External-Delivery' THEN 'External-Delivery'::public.order_type
      WHEN 'Tab' THEN 'Tab'::public.order_type
      WHEN 'External-Pickup' THEN 'External-Pickup'::public.order_type
      ELSE 'QuickSale'::public.order_type
    END;
  END IF;

  INSERT INTO public.orders (
    user_id, table_number, order_type, status, customer_id, customer_name,
    notes, delivery_info, idempotency_key
  ) VALUES (
    p_restaurant_id, v_table_number, v_order_type, 'OPEN', v_customer_id,
    NULLIF(left(p_order_data->>'customerName', 160), ''), NULLIF(left(p_order_data->>'notes', 1000), ''),
    p_order_data->'deliveryInfo', p_idempotency_key
  ) RETURNING id INTO v_order_id;

  SELECT id INTO v_fallback_station_id FROM public.stations
  WHERE user_id = p_restaurant_id ORDER BY created_at LIMIT 1;
  IF v_fallback_station_id IS NULL THEN RAISE EXCEPTION 'No production station configured'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'quantity')::integer, 0) <= 0 THEN RAISE EXCEPTION 'Item quantity must be positive'; END IF;
    SELECT r.* INTO v_recipe
    FROM public.recipes r
    WHERE COALESCE(r.store_id, r.user_id) = p_restaurant_id
      AND r.deleted_at IS NULL
      AND (
        (NULLIF(v_item->>'recipeId', '') IS NOT NULL AND r.id = (v_item->>'recipeId')::uuid)
        OR (NULLIF(v_item->>'externalCode', '') IS NOT NULL AND r.external_code = v_item->>'externalCode')
      )
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Recipe not found'; END IF;

    v_item_price := COALESCE(v_recipe.price, 0);
    v_item_cost := COALESCE(v_recipe.operational_cost, 0);
    v_option_ids := ARRAY[]::uuid[];
    v_option_text := substring(COALESCE(v_item->>'notes', '') from '\[OPT_RECIPE_IDS:([^\]]+)\]');
    IF v_option_text IS NOT NULL THEN
      SELECT COALESCE(array_agg(trim(value)::uuid), ARRAY[]::uuid[]) INTO v_option_ids
      FROM unnest(string_to_array(v_option_text, ',')) value
      WHERE trim(value) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
      SELECT
        v_item_price + COALESCE(SUM(r.price), 0),
        v_item_cost + COALESCE(SUM(r.operational_cost), 0)
      INTO v_item_price, v_item_cost
      FROM public.recipes r
      WHERE r.id = ANY(v_option_ids)
        AND COALESCE(r.store_id, r.user_id) = p_restaurant_id
        AND r.deleted_at IS NULL;
    END IF;

    SELECT COUNT(*) INTO v_preparation_count
    FROM public.recipe_preparations rp
    WHERE rp.recipe_id = v_recipe.id AND rp.deleted_at IS NULL;
    IF v_preparation_count > 0 THEN
      v_group_id := gen_random_uuid();
      FOR v_preparation IN
        SELECT * FROM public.recipe_preparations
        WHERE recipe_id = v_recipe.id AND deleted_at IS NULL ORDER BY display_order
      LOOP
        INSERT INTO public.order_items (
          order_id, recipe_id, name, quantity, price, original_price, unit_cost,
          notes, status, station_id, status_timestamps, user_id, group_id
        ) VALUES (
          v_order_id, v_recipe.id, v_recipe.name || ' (' || v_preparation.name || ')',
          (v_item->>'quantity')::integer, v_item_price / v_preparation_count,
          v_item_price / v_preparation_count, v_item_cost / v_preparation_count,
          CASE WHEN v_preparation.id = (
            SELECT id FROM public.recipe_preparations WHERE recipe_id = v_recipe.id AND deleted_at IS NULL ORDER BY display_order LIMIT 1
          ) THEN NULLIF(left(v_item->>'notes', 1000), '') ELSE NULL END,
          'PENDENTE', COALESCE(v_preparation.station_id, v_fallback_station_id),
          v_status_timestamps, p_restaurant_id, v_group_id
        );
      END LOOP;
    ELSE
      INSERT INTO public.order_items (
        order_id, recipe_id, name, quantity, price, original_price, unit_cost,
        notes, status, station_id, status_timestamps, user_id
      ) VALUES (
        v_order_id, v_recipe.id, v_recipe.name, (v_item->>'quantity')::integer,
        v_item_price, v_item_price, v_item_cost, NULLIF(left(v_item->>'notes', 1000), ''),
        'PENDENTE', v_fallback_station_id, v_status_timestamps, p_restaurant_id
      );
    END IF;
  END LOOP;

  IF v_table_id IS NOT NULL THEN UPDATE public.tables SET status = 'OCUPADA' WHERE id = v_table_id; END IF;
  SELECT to_jsonb(o) || jsonb_build_object(
    'order_items', COALESCE((SELECT jsonb_agg(to_jsonb(oi)) FROM public.order_items oi WHERE oi.order_id = o.id), '[]'::jsonb)
  ) INTO v_result FROM public.orders o WHERE o.id = v_order_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_restaurant_id uuid,
  p_order_data jsonb,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  RETURN public.create_order_with_items(p_restaurant_id, p_order_data, p_items, NULL::text);
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_with_items(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_order_with_items(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, jsonb, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, jsonb, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calculate_daily_cmv(p_user_id uuid, p_date date)
RETURNS TABLE(cogs numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_cogs numeric := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
    AND NOT public.has_access_to_store(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_user_id;
  END IF;
  SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) INTO v_cogs
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.user_id = p_user_id AND o.status = 'COMPLETED'
    AND DATE(COALESCE(o.completed_at, o."timestamp")) = p_date
    AND o.deleted_at IS NULL AND oi.deleted_at IS NULL;
  v_cogs := v_cogs + COALESCE((
    SELECT SUM(total_cost) FROM public.inventory_adjustments
    WHERE user_id = p_user_id AND DATE(created_at) = p_date
      AND type IN ('DESPERDICIO', 'VENCIMENTO', 'CONSUMO_INTERNO')
  ), 0);
  RETURN QUERY SELECT v_cogs;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_daily_cmv(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_daily_cmv(uuid, date) TO authenticated, service_role;
