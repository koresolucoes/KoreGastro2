CREATE OR REPLACE FUNCTION public.update_table_order(p_order_id UUID, p_customer_name TEXT, p_notes TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order JSON;
    v_table_number INT;
    v_user_id UUID;
BEGIN
    UPDATE public.orders
    SET customer_name = COALESCE(p_customer_name, customer_name),
        notes = COALESCE(p_notes, notes)
    WHERE id = p_order_id
    RETURNING table_number, user_id INTO v_table_number, v_user_id;

    -- Marcar a mesa como OCUPADA se houver table_number
    IF v_table_number IS NOT NULL THEN
        UPDATE public.tables
        SET status = 'OCUPADA'
        WHERE number = v_table_number AND user_id = v_user_id;
    END IF;

    -- Return the updated order as JSON
    SELECT row_to_json(o) INTO v_order
    FROM public.orders o
    WHERE o.id = p_order_id;

    RETURN v_order;
END;
$$;
