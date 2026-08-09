-- Migration: 20260809000003_harden_order_finalization_financial_integrity.sql
-- ETAPA 03E: Financial Integrity / Order Finalization Validation

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

-- Owner e Grants
ALTER FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "service_role";
