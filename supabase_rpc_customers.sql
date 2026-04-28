CREATE OR REPLACE FUNCTION public.register_menu_customer(p_store_id uuid, p_name text, p_phone text, p_cpf text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_id UUID;
    v_existing_cpf UUID;
BEGIN
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

CREATE OR REPLACE FUNCTION public.authenticate_menu_customer(p_store_id uuid, p_cpf text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.get_menu_customer_history(p_store_id uuid, p_customer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
    
    RETURN json_build_object('success', true, 'orders', COALESCE(v_result, '[]'::json));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_menu_customer_profile(p_store_id uuid, p_customer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
EOF
