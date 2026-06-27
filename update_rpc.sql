CREATE OR REPLACE FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric DEFAULT 0) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    payment_record JSONB;
    v_order_ref TEXT;
    v_table_num INTEGER;
    v_command_num INTEGER;
    v_ingredient_record RECORD;
BEGIN
    -- 1. Obter dados do pedido para referência
    SELECT table_number, command_number INTO v_table_num, v_command_num
    FROM orders WHERE id = p_order_id;

    -- Construir string de referência para o extrato
    IF v_command_num IS NOT NULL THEN
        v_order_ref := 'Comanda #' || v_command_num;
    ELSIF v_table_num > 0 THEN
        v_order_ref := 'Mesa ' || v_table_num;
    ELSE
        v_order_ref := 'Pedido #' || substring(p_order_id::text, 1, 8);
    END IF;

    -- 2. Atualizar Status do Pedido
    UPDATE orders 
    SET 
        status = 'COMPLETED',
        completed_at = NOW(),
        closed_by_employee_id = p_closed_by_employee_id
    WHERE id = p_order_id;

    -- 3. Liberar Mesa (se houver)
    IF p_table_id IS NOT NULL THEN
        UPDATE tables 
        SET 
            status = 'LIVRE',
            employee_id = NULL,
            customer_count = 0
        WHERE id = p_table_id;
    ELSIF v_table_num > 0 THEN
        -- Fallback to number if table_id is missing (e.g. from public API)
        UPDATE tables 
        SET 
            status = 'LIVRE',
            employee_id = NULL,
            customer_count = 0
        WHERE number = v_table_num AND user_id = p_user_id;
    END IF;

    -- 4. Registrar Transações Financeiras (Loop no JSONB)
    IF jsonb_typeof(p_payments) = 'array' THEN
        FOR payment_record IN SELECT * FROM jsonb_array_elements(p_payments)
        LOOP
            INSERT INTO transactions (
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

    -- 5. Registrar Gorjeta (se houver)
    IF p_tip_amount > 0 THEN
        INSERT INTO transactions (
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
            p_tip_amount,
            'Gorjeta ' || v_order_ref,
            NOW(),
            NOW()
        );
    END IF;

    -- 6. BAIXA DE ESTOQUE (Simples e Composto via CTE Recursiva)
    FOR v_ingredient_record IN (
        WITH RECURSIVE 
        -- Pega os itens do pedido
        order_recipes AS (
            SELECT recipe_id, SUM(quantity) as qty
            FROM order_items
            WHERE order_id = p_order_id AND recipe_id IS NOT NULL
            GROUP BY recipe_id
        ),
        recipe_base_ingredients AS (
            SELECT id AS recipe_id, source_ingredient_id AS ingredient_id
            FROM public.recipes
            WHERE user_id = p_user_id AND source_ingredient_id IS NOT NULL
        ),
        recipe_direct_ingredients AS (
            SELECT recipe_id, ingredient_id, quantity
            FROM public.recipe_ingredients
            WHERE user_id = p_user_id
        ),
        recipe_tree AS (
            SELECT 
                r.recipe_id AS root_recipe_id,
                r.recipe_id AS current_recipe_id,
                r.qty::NUMERIC AS required_qty
            FROM order_recipes r
            
            UNION ALL
            
            SELECT 
                rt.root_recipe_id,
                rsr.child_recipe_id AS current_recipe_id,
                rt.required_qty * rsr.quantity AS required_qty
            FROM recipe_tree rt
            JOIN public.recipe_sub_recipes rsr ON rsr.parent_recipe_id = rt.current_recipe_id
            WHERE rsr.user_id = p_user_id
        ),
        required_ingredients AS (
            SELECT 
                rdi.ingredient_id,
                SUM(rt.required_qty * rdi.quantity) AS total_required_qty
            FROM recipe_tree rt
            JOIN recipe_direct_ingredients rdi ON rdi.recipe_id = rt.current_recipe_id
            GROUP BY rdi.ingredient_id
            
            UNION ALL
            
            SELECT 
                rbi.ingredient_id,
                SUM(rt.required_qty) AS total_required_qty
            FROM recipe_tree rt
            JOIN recipe_base_ingredients rbi ON rbi.recipe_id = rt.current_recipe_id
            GROUP BY rbi.ingredient_id
        )
        SELECT ingredient_id, SUM(total_required_qty) as final_qty
        FROM required_ingredients
        GROUP BY ingredient_id
    )
    LOOP
        -- Chama a RPC existente para ajustar o estoque por lote usando parâmetros nomeados
        PERFORM adjust_stock_by_lot(
            p_ingredient_id := v_ingredient_record.ingredient_id,
            p_quantity_change := -v_ingredient_record.final_qty,
            p_reason := 'Venda ' || v_order_ref,
            p_user_id := p_user_id,
            p_lot_id_for_exit := NULL::UUID,
            p_lot_number_for_entry := NULL::TEXT,
            p_expiration_date_for_entry := NULL::DATE
        );
    END LOOP;

    RETURN json_build_object('success', true, 'message', 'Conta fechada e estoque deduzido com sucesso');

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;
