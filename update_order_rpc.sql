CREATE OR REPLACE FUNCTION update_order_public(p_order_id UUID, p_customer_name TEXT, p_notes TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.orders
    SET customer_name = COALESCE(p_customer_name, customer_name),
        notes = COALESCE(p_notes, notes)
    WHERE id = p_order_id;
END;
$$;
