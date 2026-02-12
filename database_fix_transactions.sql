
-- ==============================================================================
-- FIX RISCO B: TRANSAÇÃO FINANCEIRA ATÔMICA
-- Função para fechar conta, liberar mesa e registrar pagamentos de uma só vez.
-- ==============================================================================

CREATE OR REPLACE FUNCTION finalize_order_transaction(
    p_order_id UUID,
    p_user_id UUID, -- ID da Loja/Restaurante
    p_table_id UUID, -- Pode ser NULL se for Venda Rápida/Comanda
    p_payments JSONB, -- Array de objetos: [{ "method": "Pix", "amount": 100, "employee_id": "..." }]
    p_closed_by_employee_id UUID,
    p_tip_amount NUMERIC DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
    payment_record JSONB;
    v_order_ref TEXT;
    v_table_num INTEGER;
    v_command_num INTEGER;
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
    END IF;

    -- 4. Registrar Transações Financeiras (Loop no JSONB)
    FOR payment_record IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        INSERT INTO transactions (
            user_id,
            employee_id,
            type,
            amount,
            description,
            created_at,
            date -- Mantendo compatibilidade com schema atual
        ) VALUES (
            p_user_id,
            p_closed_by_employee_id, -- Quem recebeu
            'Receita',
            (payment_record->>'amount')::NUMERIC,
            'Receita ' || v_order_ref || ' (' || (payment_record->>'method') || ')',
            NOW(),
            NOW()
        );
    END LOOP;

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

    RETURN json_build_object('success', true, 'message', 'Conta fechada com sucesso');

EXCEPTION WHEN OTHERS THEN
    -- Em caso de erro, o Postgres faz ROLLBACK automático de tudo acima
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
