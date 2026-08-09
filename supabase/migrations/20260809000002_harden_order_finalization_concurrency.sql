-- Migration: 20260809000002_harden_order_finalization_concurrency.sql
-- ETAPA 03D: Finalization & Concurrency Hardening for finalize_order_transaction

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
    v_order_ref TEXT;
    v_target_table_id UUID;
    v_open_orders_count INTEGER;
    payment_record JSONB;
    v_ingredient_record RECORD;
BEGIN
    -- 1. LOCK O REGISTRO DO PEDIDO ANTES DE QUALQUER EFEITO
    -- Adquire lock FOR UPDATE na linha do pedido correspondente
    SELECT status, table_number, command_number
    INTO v_order_status, v_table_num, v_command_num
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

    -- 2. STATUS GUARD & IDEMPOTÊNCIA
    -- Se o pedido já estiver COMPLETED:
    -- Retorna resposta idempotente sem re-executar nenhum efeito colateral
    IF v_order_status = 'COMPLETED' THEN
        RETURN json_build_object(
            'success', true,
            'already_finalized', true,
            'order_id', p_order_id,
            'message', 'Pedido já finalizado anteriormente'
        );
    END IF;

    -- Se o pedido estiver CANCELLED ou outro estado não finalizável:
    IF v_order_status = 'CANCELLED' THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Não é possível finalizar um pedido cancelado'
        );
    END IF;

    -- Construir string de referência para o extrato / transação / baixa de estoque
    IF v_command_num IS NOT NULL THEN
        v_order_ref := 'Comanda #' || v_command_num;
    ELSIF v_table_num IS NOT NULL AND v_table_num > 0 THEN
        v_order_ref := 'Mesa ' || v_table_num;
    ELSE
        v_order_ref := 'Pedido #' || substring(p_order_id::text, 1, 8);
    END IF;

    -- 3. ATUALIZAR STATUS DO PEDIDO PARA COMPLETED
    UPDATE public.orders
    SET 
        status = 'COMPLETED',
        completed_at = NOW(),
        closed_by_employee_id = p_closed_by_employee_id
    WHERE id = p_order_id;

    -- 4. LOCK E LIBERAÇÃO DA MESA (se aplicável)
    -- Ordem determinística de locks: 1. Order, 2. Table
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

        -- Verificar se ainda existem outros pedidos abertos/em pagamento para a mesma mesa
        SELECT COUNT(*) INTO v_open_orders_count
        FROM public.orders
        WHERE table_number = v_table_num
          AND user_id = p_user_id
          AND status IN ('OPEN', 'PAYING')
          AND id != p_order_id;

        -- Se não restar nenhum outro pedido aberto, libera a mesa
        IF v_open_orders_count = 0 AND v_target_table_id IS NOT NULL THEN
            UPDATE public.tables
            SET status = 'LIVRE', employee_id = NULL, customer_count = 0
            WHERE id = v_target_table_id;
        END IF;
    END IF;

    -- 5. REGISTRAR TRANSAÇÕES FINANCEIRAS (Loop no JSONB)
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

    -- 6. REGISTRAR GORJETA (se houver)
    IF p_tip_amount IS NOT NULL AND p_tip_amount > 0 THEN
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
            p_tip_amount,
            'Gorjeta ' || v_order_ref,
            NOW(),
            NOW()
        );
    END IF;

    -- 7. BAIXA DE ESTOQUE
    FOR v_ingredient_record IN (
        WITH RECURSIVE 
            order_recipes AS (
                SELECT recipe_id, SUM(quantity) as qty
                FROM public.order_items
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
        'message', 'Conta fechada e estoque deduzido com sucesso'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'message', SQLERRM
    );
END;
$$;

-- Owner e Grants
ALTER FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "service_role";
