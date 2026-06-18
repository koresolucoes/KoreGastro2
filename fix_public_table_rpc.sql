-- 1) Função para ler o pedido via session_token (bypass RLS)
CREATE OR REPLACE FUNCTION public.get_order_by_session(p_session_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 2) Função para check-in e pedir a conta da mesa (bypass RLS)
CREATE OR REPLACE FUNCTION public.update_table_order(p_order_id UUID, p_customer_name TEXT, p_notes TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order JSON;
BEGIN
    UPDATE public.orders
    SET customer_name = COALESCE(p_customer_name, customer_name),
        notes = COALESCE(p_notes, notes)
    WHERE id = p_order_id
    RETURNING row_to_json(orders.*) INTO v_order;

    RETURN v_order;
END;
$$;
