

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."IngredientUnit" AS ENUM (
    'kg',
    'g',
    'lb',
    'oz',
    'ml',
    'l',
    'unit'
);


ALTER TYPE "public"."IngredientUnit" OWNER TO "postgres";


CREATE TYPE "public"."PlanStatus" AS ENUM (
    'Pendente',
    'Em Andamento',
    'Concluído',
    'Rascunho'
);


ALTER TYPE "public"."PlanStatus" OWNER TO "postgres";


CREATE TYPE "public"."ProductionStatus" AS ENUM (
    'A Fazer',
    'Em Preparo',
    'Concluído',
    'Rascunho'
);


ALTER TYPE "public"."ProductionStatus" OWNER TO "postgres";


CREATE TYPE "public"."discount_type" AS ENUM (
    'percentage',
    'fixed_value'
);


ALTER TYPE "public"."discount_type" OWNER TO "postgres";


CREATE TYPE "public"."ingredient_unit" AS ENUM (
    'g',
    'kg',
    'ml',
    'l',
    'un'
);


ALTER TYPE "public"."ingredient_unit" OWNER TO "postgres";


CREATE TYPE "public"."order_item_status" AS ENUM (
    'AGUARDANDO',
    'PENDENTE',
    'EM_PREPARO',
    'PRONTO',
    'SERVIDO',
    'CANCELADO'
);


ALTER TYPE "public"."order_item_status" OWNER TO "postgres";


CREATE TYPE "public"."order_type" AS ENUM (
    'Dine-in',
    'Takeout',
    'QuickSale',
    'iFood-Delivery',
    'iFood-Takeout',
    'External-Delivery',
    'Tab',
    'External-Pickup'
);


ALTER TYPE "public"."order_type" OWNER TO "postgres";


CREATE TYPE "public"."portioning_output_type" AS ENUM (
    'YIELD',
    'BYPRODUCT',
    'WASTE'
);


ALTER TYPE "public"."portioning_output_type" OWNER TO "postgres";


CREATE TYPE "public"."reservation_status" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'CANCELLED',
    'COMPLETED'
);


ALTER TYPE "public"."reservation_status" OWNER TO "postgres";


CREATE TYPE "public"."subscription_status" AS ENUM (
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid'
);


ALTER TYPE "public"."subscription_status" OWNER TO "postgres";


CREATE TYPE "public"."table_status" AS ENUM (
    'LIVRE',
    'OCUPADA',
    'PAGANDO'
);


ALTER TYPE "public"."table_status" OWNER TO "postgres";


CREATE TYPE "public"."transaction_type" AS ENUM (
    'Receita',
    'Despesa',
    'Gorjeta',
    'Abertura de Caixa'
);


ALTER TYPE "public"."transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."webhook_event" AS ENUM (
    'pedido.finalizado',
    'estoque.baixo',
    'reserva.confirmada',
    'cliente.novo'
);


ALTER TYPE "public"."webhook_event" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."acknowledge_attention"("item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.order_items
  set
    status_timestamps = status_timestamps || jsonb_build_object('ATTENTION_ACKNOWLEDGED', now())
  where id = item_id;
end;
$$;


ALTER FUNCTION "public"."acknowledge_attention"("item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Update the ingredient's stock
  update public.ingredients
  set
    stock = stock + p_quantity_change,
    last_movement_at = now()
  where id = p_ingredient_id and user_id = auth.uid();

  -- Insert a record of the movement
  insert into public.inventory_movements(ingredient_id, quantity_change, reason, user_id)
  values (p_ingredient_id, p_quantity_change, p_reason, auth.uid());
end;
$$;


ALTER FUNCTION "public"."adjust_stock"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock_by_lot"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text", "p_user_id" "uuid", "p_lot_id_for_exit" "uuid", "p_lot_number_for_entry" "text", "p_expiration_date_for_entry" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_entry_lot_id UUID;
    v_remaining_quantity NUMERIC;
    v_fifo_lot_record RECORD;
BEGIN
    -- Para entradas de estoque (quantidade positiva)
    IF p_quantity_change > 0 THEN
        -- Lógica de encontrar ou criar um lote para entrada (permanece a mesma)
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

    -- Para saídas de estoque (quantidade negativa)
    ELSE
        v_remaining_quantity := abs(p_quantity_change);

        -- **NOVA LÓGICA**: Se um lote específico foi fornecido para a saída, use-o.
        IF p_lot_id_for_exit IS NOT NULL THEN
            UPDATE inventory_lots
            SET quantity = quantity - v_remaining_quantity
            WHERE id = p_lot_id_for_exit
            AND quantity >= v_remaining_quantity;

            -- Verifica se a atualização foi bem-sucedida (ou seja, se havia estoque suficiente no lote)
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Estoque insuficiente no lote selecionado.';
            END IF;
            
            INSERT INTO inventory_movements (ingredient_id, quantity_change, reason, user_id, lot_id)
            VALUES (p_ingredient_id, p_quantity_change, p_reason, p_user_id, p_lot_id_for_exit);

        -- LÓGICA ANTIGA (FALLBACK): Se NENHUM lote específico for fornecido, use FIFO/FEFO.
        ELSE
            FOR v_fifo_lot_record IN
                SELECT id, quantity
                FROM inventory_lots
                WHERE ingredient_id = p_ingredient_id
                  AND quantity > 0
                ORDER BY COALESCE(expiration_date, '9999-12-31') ASC, created_at ASC -- Prioriza por validade (FEFO), depois por entrada (FIFO)
            LOOP
                DECLARE
                    v_deduct_quantity NUMERIC;
                BEGIN
                    v_deduct_quantity := LEAST(v_remaining_quantity, v_fifo_lot_record.quantity);

                    UPDATE inventory_lots
                    SET quantity = quantity - v_deduct_quantity
                    WHERE id = v_fifo_lot_record.id;
                    
                    INSERT INTO inventory_movements (ingredient_id, quantity_change, reason, user_id, lot_id)
                    VALUES (p_ingredient_id, -v_deduct_quantity, p_reason, p_user_id, v_fifo_lot_record.id);

                    v_remaining_quantity := v_remaining_quantity - v_deduct_quantity;

                    IF v_remaining_quantity <= 0 THEN
                        EXIT;
                    END IF;
                END;
            END LOOP;

            IF v_remaining_quantity > 0 THEN
                RAISE EXCEPTION 'Estoque insuficiente entre todos os lotes para esta saída.';
            END IF;
        END IF;
    END IF;

    -- Atualiza o estoque total na tabela principal de ingredientes.
    UPDATE ingredients
    SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM inventory_lots WHERE ingredient_id = p_ingredient_id),
        last_movement_at = NOW()
    WHERE id = p_ingredient_id;
END;
$$;


ALTER FUNCTION "public"."adjust_stock_by_lot"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text", "p_user_id" "uuid", "p_lot_id_for_exit" "uuid", "p_lot_number_for_entry" "text", "p_expiration_date_for_entry" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_and_delete_old_orders"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Move os itens de pedidos antigos para a tabela de arquivo
    -- Usamos um CTE (Common Table Expression) para deletar e retornar os dados em uma única operação
    WITH moved_items AS (
        DELETE FROM public.order_items
        WHERE order_id IN (
            SELECT id FROM public.orders
            WHERE completed_at < now() - interval '90 days'
              AND status IN ('COMPLETED', 'CANCELLED')
        )
        RETURNING *
    )
    INSERT INTO public.order_items_archive
    SELECT * FROM moved_items;

    -- Agora, move os pedidos principais para a tabela de arquivo
    WITH moved_orders AS (
        DELETE FROM public.orders
        WHERE completed_at < now() - interval '90 days'
          AND status IN ('COMPLETED', 'CANCELLED')
        RETURNING *
    )
    INSERT INTO public.orders_archive
    SELECT * FROM moved_orders;

END;
$$;


ALTER FUNCTION "public"."archive_and_delete_old_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clean_system_cache"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM system_cache WHERE expires_at < NOW();
END;
$$;


ALTER FUNCTION "public"."clean_system_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_free_trial_subscription"("plan_id_to_subscribe" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id_to_subscribe UUID := auth.uid();
  trial_days INTEGER;
  period_end_date TIMESTAMP WITH TIME ZONE;
  new_subscription_id UUID;
BEGIN
  -- Passo 1: Verifica se o plano é um plano de teste gratuito válido
  SELECT p.trial_period_days INTO trial_days
  FROM public.plans p
  WHERE p.id = plan_id_to_subscribe AND p.price = 0;

  IF trial_days IS NULL THEN
    RAISE EXCEPTION 'This plan is not a free trial plan or does not exist.';
  END IF;

  -- Passo 2: Garante que o usuário não tenha uma assinatura ativa
  IF EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = user_id_to_subscribe AND s.status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already has an active subscription.';
  END IF;

  -- Passo 3: Calcula a data de término do período de teste
  period_end_date := now() + (trial_days || ' days')::interval;

  -- Passo 4. Cria ou atualiza o registro de assinatura do usuário
  -- Esta é a ÚNICA escrita no banco de dados necessária. As permissões
  -- serão derivadas dinamicamente a partir deste registro.
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
  VALUES (user_id_to_subscribe, plan_id_to_subscribe, 'active', period_end_date)
  ON CONFLICT (user_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now()
  RETURNING id INTO new_subscription_id;

  -- Passo 5: Retorna uma confirmação de sucesso
  RETURN json_build_object('status', 'success', 'message', 'Free trial activated successfully.', 'subscription_id', new_subscription_id);
END;
$$;


ALTER FUNCTION "public"."create_free_trial_subscription"("plan_id_to_subscribe" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_ingredient_with_lot"("p_user_id" "uuid", "p_name" "text", "p_unit" "text", "p_cost" numeric, "p_min_stock" numeric, "p_category_id" "uuid", "p_supplier_id" "uuid", "p_is_sellable" boolean, "p_price" numeric, "p_pos_category_id" "uuid", "p_station_id" "uuid", "p_proxy_recipe_id" "uuid", "p_initial_quantity" numeric, "p_lot_number" "text", "p_expiration_date" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_ingredient_id UUID;
BEGIN
    -- 1. Insere o novo ingrediente e obtém seu ID.
    -- O estoque inicial já é definido aqui.
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

    -- 2. Se houver estoque inicial, cria o primeiro lote e a primeira movimentação.
    IF p_initial_quantity > 0 THEN
        DECLARE
            v_lot_id UUID;
        BEGIN
            -- Cria o registro do lote.
            INSERT INTO inventory_lots (
                ingredient_id, lot_number, expiration_date, quantity, user_id
            )
            VALUES (
                v_ingredient_id, p_lot_number, p_expiration_date, p_initial_quantity, p_user_id
            )
            RETURNING id INTO v_lot_id;
            
            -- Cria o registro da movimentação de 'Entrada Inicial'.
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


ALTER FUNCTION "public"."create_ingredient_with_lot"("p_user_id" "uuid", "p_name" "text", "p_unit" "text", "p_cost" numeric, "p_min_stock" numeric, "p_category_id" "uuid", "p_supplier_id" "uuid", "p_is_sellable" boolean, "p_price" numeric, "p_pos_category_id" "uuid", "p_station_id" "uuid", "p_proxy_recipe_id" "uuid", "p_initial_quantity" numeric, "p_lot_number" "text", "p_expiration_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_new_store"("store_name" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_store_id UUID;
  current_user_id UUID;
  plan_limit INTEGER;
  current_count INTEGER;
  user_plan_id UUID;
  new_role_id UUID;
  user_name TEXT;
BEGIN
  current_user_id := auth.uid();

  -- A. Verificar Plano e Limites
  SELECT plan_id INTO user_plan_id
  FROM public.subscriptions
  WHERE user_id = current_user_id AND status IN ('active', 'trialing')
  LIMIT 1;

  IF user_plan_id IS NULL THEN
    plan_limit := 1;
  ELSE
    SELECT max_stores INTO plan_limit FROM public.plans WHERE id = user_plan_id;
    IF plan_limit IS NULL THEN plan_limit := 1; END IF;
  END IF;

  SELECT count(*) INTO current_count FROM public.stores WHERE owner_id = current_user_id;

  IF current_count >= plan_limit THEN
    RETURN json_build_object('success', false, 'message', 'Limite de lojas atingido.');
  END IF;

  -- B. Criação da Loja
  new_store_id := gen_random_uuid(); 
  INSERT INTO public.stores (id, name, owner_id) VALUES (new_store_id, store_name, current_user_id);

  -- C. Dados Básicos
  INSERT INTO public.company_profile (user_id, company_name, cnpj) VALUES (new_store_id, store_name, '00.000.000/0000-00');
  INSERT INTO public.unit_permissions (manager_id, store_id, role) VALUES (current_user_id, new_store_id, 'owner');
  INSERT INTO public.reservation_settings (user_id, is_enabled, booking_duration_minutes, max_party_size, min_party_size, booking_notice_days) VALUES (new_store_id, false, 90, 8, 2, 30);
  INSERT INTO public.loyalty_settings (user_id, is_enabled, points_per_real) VALUES (new_store_id, false, 1);

  -- D. CRIAÇÃO DE CARGOS E PERMISSÕES
  INSERT INTO public.roles (name, user_id) VALUES ('Gerente', new_store_id) RETURNING id INTO new_role_id;

  INSERT INTO public.role_permissions (role_id, user_id, permission_key)
  SELECT new_role_id, new_store_id, p.perm
  FROM ( VALUES 
    ('/dashboard'), ('/pos'), ('/kds'), ('/ifood-kds'), ('/cashier'), ('/inventory'), 
    ('/requisitions'), ('/purchasing'), ('/suppliers'), ('/customers'), ('/menu'), 
    ('/ifood-menu'), ('/ifood-store-manager'), ('/technical-sheets'), ('/mise-en-place'), 
    ('/performance'), ('/reports'), ('/employees'), ('/schedules'), ('/my-leave'), 
    ('/my-profile'), ('/payroll'), ('/settings'), ('/reservations'), ('/time-clock'), 
    ('/leave-management'), ('/tutorials'), ('/delivery')
  ) AS p(perm);

  INSERT INTO public.roles (name, user_id) VALUES ('Caixa', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Cozinha', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Garçom', new_store_id);
  INSERT INTO public.roles (name, user_id) VALUES ('Entregador', new_store_id);

  -- E. CRIAÇÃO DO FUNCIONÁRIO OPERACIONAL (NOVO)
  SELECT COALESCE(raw_user_meta_data->>'name', 'Gerente') INTO user_name FROM auth.users WHERE id = current_user_id;
  
  INSERT INTO public.employees (user_id, name, pin, role_id)
  VALUES (new_store_id, user_name, '1234', new_role_id);

  RETURN json_build_object(
    'success', true,
    'store_id', new_store_id,
    'name', store_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."create_new_store"("store_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_with_items"("p_restaurant_id" "uuid", "p_order_data" "jsonb", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
            DECLARE
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
                                                                        -- 1. Extrair dados do pedido
                                                                            v_table_number := (p_order_data->>'tableNumber')::INT;
                                                                                
                                                                                    IF p_order_data->>'customerId' IS NOT NULL AND p_order_data->>'customerId' != '' THEN
                                                                                            v_customer_id := (p_order_data->>'customerId')::UUID;
                                                                                                END IF;

                                                                                                    -- 2. Validar Mesa (se aplicável)
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

                                                                                                                                                                                        -- 3. Inserir o Pedido (Order)
                                                                                                                                                                                            INSERT INTO public.orders (user_id, table_number, order_type, status, customer_id)
                                                                                                                                                                                                VALUES (p_restaurant_id, v_table_number, v_order_type, 'OPEN', v_customer_id)
                                                                                                                                                                                                    RETURNING id INTO v_new_order_id;

                                                                                                                                                                                                        -- 4. Obter Estação de Produção de Fallback
                                                                                                                                                                                                            SELECT id INTO v_fallback_station_id FROM public.stations 
                                                                                                                                                                                                                WHERE user_id = p_restaurant_id LIMIT 1;

                                                                                                                                                                                                                    IF v_fallback_station_id IS NULL THEN
                                                                                                                                                                                                                            RAISE EXCEPTION 'No production stations found for this restaurant.';
                                                                                                                                                                                                                                END IF;

                                                                                                                                                                                                                                    -- Timestamp no formato ISO para compatibilidade com o frontend
                                                                                                                                                                                                                                        v_status_timestamps := jsonb_build_object('PENDENTE', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

                                                                                                                                                                                                                                            -- 5. Processar e Inserir os Itens
                                                                                                                                                                                                                                                FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
                                                                                                                                                                                                                                                    LOOP
                                                                                                                                                                                                                                                            -- Buscar a Receita pelo externalCode
                                                                                                                                                                                                                                                                    SELECT * INTO v_recipe FROM public.recipes 
                                                                                                                                                                                                                                                                            WHERE user_id = p_restaurant_id AND external_code = v_item->>'externalCode';

                                                                                                                                                                                                                                                                                    IF NOT FOUND THEN
                                                                                                                                                                                                                                                                                                RAISE EXCEPTION 'Recipe not found for external code: %', v_item->>'externalCode';
                                                                                                                                                                                                                                                                                                        END IF;

                                                                                                                                                                                                                                                                                                                -- Verificar se a receita tem sub-preparos (Recipe Preparations)
                                                                                                                                                                                                                                                                                                                        SELECT count(*) INTO v_prep_count FROM public.recipe_preparations WHERE recipe_id = v_recipe.id;

                                                                                                                                                                                                                                                                                                                                IF v_prep_count > 0 THEN
                                                                                                                                                                                                                                                                                                                                            v_group_id := gen_random_uuid();
                                                                                                                                                                                                                                                                                                                                                        v_is_first_prep := TRUE;
                                                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                                                                                FOR v_prep IN SELECT * FROM public.recipe_preparations WHERE recipe_id = v_recipe.id ORDER BY created_at ASC
                                                                                                                                                                                                                                                                                                                                                                                            LOOP
                                                                                                                                                                                                                                                                                                                                                                                                            INSERT INTO public.order_items (
                                                                                                                                                                                                                                                                                                                                                                                                                                order_id, recipe_id, name, quantity, price, original_price, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                    notes, status, station_id, group_id, status_timestamps, user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ) VALUES (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        v_new_order_id, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_recipe.id, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                v_recipe.name || ' (' || v_prep.name || ')', 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    (v_item->>'quantity')::NUMERIC, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        v_recipe.price / v_prep_count, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_recipe.price / v_prep_count, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                CASE WHEN v_is_first_prep THEN v_item->>'notes' ELSE NULL END, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    'PENDENTE', 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        v_prep.station_id, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_group_id, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                v_status_timestamps, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    p_restaurant_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    v_is_first_prep := FALSE;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                END LOOP;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ELSE
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    -- Inserção normal sem preparos
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                INSERT INTO public.order_items (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                order_id, recipe_id, name, quantity, price, original_price, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                notes, status, station_id, status_timestamps, user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ) VALUES (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_new_order_id, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_recipe.id, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_recipe.name, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            (v_item->>'quantity')::NUMERIC, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_recipe.price, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_recipe.price, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_item->>'notes', 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            'PENDENTE', 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_fallback_station_id, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_status_timestamps, 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            p_restaurant_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                END IF;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    END LOOP;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        -- 6. Atualizar Status da Mesa
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            IF v_table_id IS NOT NULL THEN
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    UPDATE public.tables SET status = 'OCUPADA' WHERE id = v_table_id;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        END IF;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            -- 7. Montar o JSON de resposta (Pedido + Itens) para a API devolver
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


ALTER FUNCTION "public"."create_order_with_items"("p_restaurant_id" "uuid", "p_order_data" "jsonb", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_stock_for_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  item record;
  current_user_id uuid := auth.uid();
begin
  -- Loop through each ingredient required for the order
  for item in
    select
      ri.ingredient_id,
      ri.quantity * oi.quantity as total_quantity_needed
    from public.order_items oi
    join public.recipe_ingredients ri on oi.recipe_id = ri.recipe_id
    where oi.order_id = p_order_id and oi.user_id = current_user_id
  loop
    -- Decrement the stock for each ingredient
    update public.ingredients
    set stock = stock - item.total_quantity_needed
    where id = item.ingredient_id and user_id = current_user_id;
  end loop;
end;
$$;


ALTER FUNCTION "public"."decrement_stock_for_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_store"("target_store_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
BEGIN
  -- Verifica se é o dono
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = target_store_id AND owner_id = auth.uid()) THEN
     RETURN json_build_object('success', false, 'message', 'Apenas o dono pode excluir a loja.');
  END IF;

  -- Verifica se é a última loja (não permitir ficar sem nenhuma loja para evitar bugs de UI)
  IF (SELECT count(*) FROM stores WHERE owner_id = auth.uid()) <= 1 THEN
     RETURN json_build_object('success', false, 'message', 'Você não pode excluir sua única loja.');
  END IF;

  -- Exclui a loja (CASCADE deve limpar o resto se as FKs estiverem certas, 
  -- mas por segurança deletamos permissões primeiro)
  DELETE FROM unit_permissions WHERE store_id = target_store_id;
  DELETE FROM stores WHERE id = target_store_id;

  RETURN json_build_object('success', true, 'message', 'Loja excluída com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."delete_store"("target_store_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_dashboard_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  total_restaurants INT;
  total_mrr NUMERIC;
  recent_errors INT;
BEGIN
  -- Verifica se quem está chamando é realmente um admin
  IF NOT EXISTS (
    SELECT 1 FROM public.system_admins WHERE email = auth.jwt() ->> 'email'
  ) THEN
    RAISE EXCEPTION 'Acesso Negado';
  END IF;

  -- Conta o total de restaurantes (perfis de empresa) cadastrados
  SELECT COUNT(*) INTO total_restaurants FROM public.company_profile;

  -- Calcula o MRR (Receita Recorrente Mensal) baseado nas assinaturas ativas
  -- (Se a tabela subscriptions não tiver o campo amount, isso retornará 0 por enquanto)
  SELECT COALESCE(SUM(149.90), 0) INTO total_mrr FROM public.subscriptions WHERE status = 'active';

  -- Placeholder para erros recentes (pode ser conectado a uma tabela de logs no futuro)
  recent_errors := 0;

  RETURN json_build_object(
    'total_restaurants', total_restaurants,
    'total_mrr', total_mrr,
    'recent_errors', recent_errors
  );
END;
$$;


ALTER FUNCTION "public"."get_admin_dashboard_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_dre"("p_user_id" "uuid", "p_date" "date") RETURNS TABLE("gross_revenue" numeric, "indirect_costs" numeric, "net_revenue" numeric, "cogs_real" numeric, "gross_margin" numeric, "operating_expenses" numeric, "daily_depreciation" numeric, "net_profit" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_gross_revenue NUMERIC := 0;
    v_indirect_costs NUMERIC := 0;
    v_cogs_real NUMERIC := 0;
    v_operating_expenses NUMERIC := 0;
    v_daily_depreciation NUMERIC := 0;
BEGIN
    -- 1. Receita Bruta (Pedidos Concluídos no dia)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_gross_revenue
    FROM orders
    WHERE user_id = p_user_id AND status = 'COMPLETED' AND DATE(created_at) = p_date;

    -- 2. Custos Indiretos (Taxas lançadas no dia)
    SELECT COALESCE(SUM(amount), 0) INTO v_indirect_costs
    FROM transactions t
    JOIN financial_categories fc ON t.financial_category_id = fc.id
    WHERE t.user_id = p_user_id AND t.type = 'Despesa' AND fc.type = 'CUSTO_INDIRETO' AND t.competence_date = p_date;

    -- 3. CMV Real (Custo dos ingredientes baixados por venda + Desperdícios do dia)
    -- (Aqui somamos os ajustes de estoque do dia que representam perda/consumo)
    SELECT COALESCE(SUM(total_cost), 0) INTO v_cogs_real
    FROM inventory_adjustments
    WHERE user_id = p_user_id AND DATE(created_at) = p_date;
    -- Nota: O CMV das vendas em si já é deduzido via trigger/RPC no momento da venda, 
    -- precisaremos cruzar isso na aplicação ou expandir esta query.

    -- 4. Despesas Operacionais (OPEX do dia + Rateio de despesas mensais)
    SELECT COALESCE(SUM(amount), 0) INTO v_operating_expenses
    FROM transactions t
    JOIN financial_categories fc ON t.financial_category_id = fc.id
    WHERE t.user_id = p_user_id AND t.type = 'Despesa' AND fc.type = 'DESPESA_OPERACIONAL' AND t.competence_date = p_date;

    -- 5. Depreciação Diária (Rateio dos equipamentos)
    SELECT COALESCE(SUM(monthly_depreciation / 30), 0) INTO v_daily_depreciation
    FROM assets_depreciation
    WHERE user_id = p_user_id AND purchase_date <= p_date 
    AND p_date <= (purchase_date + (lifespan_months || ' months')::interval);

    -- Retornar os cálculos
    RETURN QUERY SELECT 
        v_gross_revenue,
        v_indirect_costs,
        (v_gross_revenue - v_indirect_costs) AS net_revenue,
        v_cogs_real,
        (v_gross_revenue - v_indirect_costs - v_cogs_real) AS gross_margin,
        v_operating_expenses,
        v_daily_depreciation,
        (v_gross_revenue - v_indirect_costs - v_cogs_real - v_operating_expenses - v_daily_depreciation) AS net_profit;
END;
$$;


ALTER FUNCTION "public"."get_daily_dre"("p_user_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_financial_summary"("p_user_id" "uuid", "p_start_date" timestamp without time zone, "p_end_date" timestamp without time zone) RETURNS TABLE("total_revenue" numeric, "total_expenses" numeric, "net_profit" numeric, "total_orders" integer, "average_ticket" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
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
      AND timestamp >= p_start_date -- Usando timestamp corretamente
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


ALTER FUNCTION "public"."get_financial_summary"("p_user_id" "uuid", "p_start_date" timestamp without time zone, "p_end_date" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_menu_with_stock"("p_restaurant_id" "uuid", "p_is_available" boolean DEFAULT NULL::boolean, "p_category_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH RECURSIVE 
    -- 1. Mapeia a relação Receita -> Ingrediente Base (para receitas simples)
    recipe_base_ingredients AS (
        SELECT id AS recipe_id, source_ingredient_id AS ingredient_id
        FROM public.recipes
        WHERE user_id = p_restaurant_id AND source_ingredient_id IS NOT NULL
    ),
    -- 2. Mapeia a relação Receita -> Ingredientes Compostos (recipe_ingredients)
    recipe_direct_ingredients AS (
        SELECT recipe_id, ingredient_id, quantity
        FROM public.recipe_ingredients
        WHERE user_id = p_restaurant_id
    ),
    -- 3. CTE Recursiva para descer a árvore de sub-receitas
    recipe_tree AS (
        -- Base: Receitas que não são sub-receitas de ninguém (Itens de Cardápio)
        SELECT 
            r.id AS root_recipe_id,
            r.id AS current_recipe_id,
            1::NUMERIC AS required_qty
        FROM public.recipes r
        WHERE r.user_id = p_restaurant_id AND r.is_sub_recipe = FALSE
        
        UNION ALL
        
        -- Passo Recursivo: Pega os filhos (sub-receitas)
        SELECT 
            rt.root_recipe_id,
            rsr.child_recipe_id AS current_recipe_id,
            rt.required_qty * rsr.quantity AS required_qty
        FROM recipe_tree rt
        JOIN public.recipe_sub_recipes rsr ON rsr.parent_recipe_id = rt.current_recipe_id
        WHERE rsr.user_id = p_restaurant_id
    ),
    -- 4. Junta a árvore com os ingredientes necessários
    required_ingredients AS (
        -- Ingredientes diretos da receita ou de suas sub-receitas
        SELECT 
            rt.root_recipe_id,
            rdi.ingredient_id,
            SUM(rt.required_qty * rdi.quantity) AS total_required_qty
        FROM recipe_tree rt
        JOIN recipe_direct_ingredients rdi ON rdi.recipe_id = rt.current_recipe_id
        GROUP BY rt.root_recipe_id, rdi.ingredient_id
        
        UNION ALL
        
        -- Ingredientes base (source_ingredient_id) da receita ou de suas sub-receitas
        SELECT 
            rt.root_recipe_id,
            rbi.ingredient_id,
            SUM(rt.required_qty) AS total_required_qty
        FROM recipe_tree rt
        JOIN recipe_base_ingredients rbi ON rbi.recipe_id = rt.current_recipe_id
        GROUP BY rt.root_recipe_id, rbi.ingredient_id
    ),
    -- 5. Verifica se há estoque suficiente para cada ingrediente de cada receita raiz
    stock_check AS (
        SELECT 
            ri.root_recipe_id,
            BOOL_AND(COALESCE(i.stock, 0) >= ri.total_required_qty) AS has_stock
        FROM required_ingredients ri
        JOIN public.ingredients i ON i.id = ri.ingredient_id
        GROUP BY ri.root_recipe_id
    ),
    -- 6. Monta o JSON final filtrando conforme os parâmetros
    final_menu AS (
        SELECT 
            r.*,
            jsonb_build_object('name', c.name) AS categories,
            COALESCE(sc.has_stock, TRUE) AS has_stock -- Se não tem ingredientes mapeados, assume que tem estoque
        FROM public.recipes r
        LEFT JOIN public.categories c ON c.id = r.category_id
        LEFT JOIN stock_check sc ON sc.root_recipe_id = r.id
        WHERE r.user_id = p_restaurant_id 
          AND r.is_sub_recipe = FALSE
          AND (p_is_available IS NULL OR r.is_available = p_is_available)
          AND (p_category_id IS NULL OR r.category_id = p_category_id)
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(fm.*)), '[]'::jsonb) INTO v_result FROM final_menu fm;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_menu_with_stock"("p_restaurant_id" "uuid", "p_is_available" boolean, "p_category_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_store_managers"("store_id_input" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("permission_id" "uuid", "manager_id" "uuid", "manager_email" "text", "manager_name" "text", "role" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_store_id UUID;
BEGIN
  -- Se não passado, tenta usar o ID do usuário (legado), mas idealmente deve receber o ID da loja
  target_store_id := COALESCE(store_id_input, auth.uid());
  
  -- Segurança: Apenas dono ou quem tem role 'owner' na loja pode ver a lista de gestores
  -- USAMOS ALIASES (s, up_check) PARA EVITAR AMBIGUIDADE COM OS PARÂMETROS DE RETORNO
  IF NOT EXISTS (
      SELECT 1 FROM stores s WHERE s.id = target_store_id AND s.owner_id = auth.uid()
  ) AND NOT EXISTS (
      SELECT 1 FROM unit_permissions up_check 
      WHERE up_check.store_id = target_store_id 
      AND up_check.manager_id = auth.uid() 
      AND up_check.role = 'owner'
  ) THEN
      -- Se não tiver permissão, retorna vazio (segurança silenciosa)
      RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    up.id as permission_id,
    up.manager_id,
    u.email::TEXT as manager_email, -- Cast explícito para TEXT para evitar erro de tipo
    COALESCE(u.raw_user_meta_data->>'name', 'Usuário')::TEXT as manager_name,
    up.role::TEXT,
    up.created_at
  FROM unit_permissions up
  JOIN auth.users u ON up.manager_id = u.id
  WHERE up.store_id = target_store_id;
END;
$$;


ALTER FUNCTION "public"."get_store_managers"("store_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_active_permissions"("p_user_id" "uuid") RETURNS TABLE("permission_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select
    pp.permission_key
  from
    public.subscriptions s
  join
    public.plan_permissions pp on s.plan_id = pp.plan_id
  where
    s.user_id = p_user_id and s.status = 'active';
end;
$$;


ALTER FUNCTION "public"."get_user_active_permissions"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_active_permissions"("p_user_id" "uuid") IS 'Retorna as permissões de módulo ativas para um usuário com base em sua assinatura.';



CREATE OR REPLACE FUNCTION "public"."handle_leave_request_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_leave_request_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_loyalty_points_on_order_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$DECLARE
  loyalty_config RECORD;
  order_total NUMERIC;
  points_earned NUMERIC;
BEGIN
  -- CORREÇÃO: Verifica a transição do status para 'COMPLETED'
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' AND NEW.customer_id IS NOT NULL THEN
    
    SELECT * INTO loyalty_config FROM public.loyalty_settings WHERE user_id = NEW.user_id;
    
    IF FOUND AND loyalty_config.is_enabled THEN
      -- Calcula o total apenas dos itens do pedido
      SELECT SUM(price * quantity) INTO order_total FROM public.order_items WHERE order_id = NEW.id;
      
      -- Garante que o total não seja nulo
      IF order_total > 0 THEN
        points_earned := floor(order_total * loyalty_config.points_per_real);
        
        IF points_earned > 0 THEN
          UPDATE public.customers SET loyalty_points = loyalty_points + points_earned WHERE id = NEW.customer_id;
          
          -- MELHORIA: Adiciona o ID do pedido no registro de movimento de pontos
          INSERT INTO public.loyalty_movements (user_id, customer_id, points_change, description, order_id)
          VALUES (NEW.user_id, NEW.customer_id, points_earned, 'Pontos ganhos no pedido #' || substr(NEW.id::text, 1, 8), NEW.id);
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."handle_loyalty_points_on_order_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_comunnity_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_comunnity_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_plan_name" "text", "p_permissions" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
    v_role_id UUID;
    v_subscription_id UUID;
    v_permission TEXT;
BEGIN
    -- 1. Upsert subscription with improved date logic
    INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
    VALUES (p_user_id, p_plan_id, 'active', NOW() + INTERVAL '1 month')
    ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        status = 'active',
        -- If current period is in the future, add 1 month to it.
        -- Otherwise, set it to 1 month from now.
        current_period_end = (
            CASE
                WHEN subscriptions.current_period_end > NOW()
                THEN subscriptions.current_period_end + INTERVAL '1 month'
                ELSE NOW() + INTERVAL '1 month'
            END
        ),
        updated_at = NOW();

    -- 2. Upsert a role for the user
    INSERT INTO roles (user_id, name)
    VALUES (p_user_id, 'Plano - ' || p_plan_name)
    ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name
    RETURNING id INTO v_role_id;

    -- 3. Clear old permissions for this user
    DELETE FROM role_permissions WHERE user_id = p_user_id;

    -- 4. Insert new permissions based on the plan
    FOREACH v_permission IN ARRAY p_permissions
    LOOP
        INSERT INTO role_permissions (user_id, role_id, permission_key)
        VALUES (p_user_id, v_role_id, v_permission);
    END LOOP;
END;$$;


ALTER FUNCTION "public"."handle_new_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_plan_name" "text", "p_permissions" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    new_role_id UUID;
BEGIN
  -- A. Criar Loja
  INSERT INTO public.stores (id, name, owner_id)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'name', 'Minha Loja') || ' (Principal)', new.id)
  ON CONFLICT (id) DO NOTHING;

  -- B. Perfil
  INSERT INTO public.company_profile (user_id, company_name, cnpj)
  VALUES (new.id, 'Minha Empresa', '00.000.000/0000-00')
  ON CONFLICT (user_id) DO NOTHING;

  -- C. Permissão de Dono
  INSERT INTO public.unit_permissions (manager_id, store_id, role)
  VALUES (new.id, new.id, 'owner')
  ON CONFLICT (manager_id, store_id) DO NOTHING;

  -- D. Cargos e Permissões Iniciais
  -- Verifica se já existe cargo Gerente (para evitar duplicidade em casos raros de retry)
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE user_id = new.id AND name = 'Gerente') THEN
      
      INSERT INTO public.roles (name, user_id) 
      VALUES ('Gerente', new.id) 
      RETURNING id INTO new_role_id;

      INSERT INTO public.role_permissions (role_id, user_id, permission_key)
      SELECT new_role_id, new.id, p.perm
      FROM (
        VALUES 
            ('/dashboard'), ('/pos'), ('/kds'), ('/ifood-kds'), 
            ('/cashier'), ('/inventory'), ('/requisitions'), ('/purchasing'), 
            ('/suppliers'), ('/customers'), ('/menu'), ('/ifood-menu'), 
            ('/ifood-store-manager'), ('/technical-sheets'), ('/mise-en-place'), 
            ('/performance'), ('/reports'), ('/employees'), ('/schedules'), 
            ('/my-leave'), ('/my-profile'), ('/payroll'), ('/settings'), 
            ('/reservations'), ('/time-clock'), ('/leave-management'), 
            ('/tutorials'), ('/delivery')
      ) AS p(perm);
      
      INSERT INTO public.roles (name, user_id) VALUES ('Caixa', new.id);
      INSERT INTO public.roles (name, user_id) VALUES ('Cozinha', new.id);
      INSERT INTO public.roles (name, user_id) VALUES ('Garçom', new.id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 1. O usuário é o dono da loja (acesso direto)
  IF auth.uid() = target_store_id THEN
    RETURN TRUE;
  END IF;

  -- 2. O usuário tem permissão delegada (tabela unit_permissions)
  IF EXISTS (
    SELECT 1 FROM unit_permissions 
    WHERE manager_id = auth.uid() 
    AND store_id = target_store_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_view_count"("topic_id_arg" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE forum_topics
  SET view_count = view_count + 1
  WHERE id = topic_id_arg;
$$;


ALTER FUNCTION "public"."increment_view_count"("topic_id_arg" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_manager_by_email"("email_input" "text", "role_input" "text", "store_id_input" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_user_id UUID;
  target_store_id UUID;
BEGIN
  target_store_id := COALESCE(store_id_input, auth.uid());
  
  -- Segurança: Apenas Owner pode convidar
  IF NOT EXISTS (
      SELECT 1 FROM stores s WHERE s.id = target_store_id AND s.owner_id = auth.uid()
  ) AND NOT EXISTS (
      SELECT 1 FROM unit_permissions up_check 
      WHERE up_check.store_id = target_store_id 
      AND up_check.manager_id = auth.uid() 
      AND up_check.role = 'owner'
  ) THEN
      RETURN json_build_object('success', false, 'message', 'Permissão negada. Apenas proprietários podem convidar.');
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = email_input;

  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não encontrado com este e-mail. Peça para ele criar uma conta no ChefOS primeiro.');
  END IF;

  IF EXISTS (SELECT 1 FROM unit_permissions up WHERE up.manager_id = target_user_id AND up.store_id = target_store_id) THEN
    RETURN json_build_object('success', false, 'message', 'Este usuário já é um gestor desta loja.');
  END IF;

  INSERT INTO unit_permissions (manager_id, store_id, role)
  VALUES (target_user_id, target_store_id, role_input);

  RETURN json_build_object('success', true, 'message', 'Gestor adicionado com sucesso!');
END;
$$;


ALTER FUNCTION "public"."invite_manager_by_email"("email_input" "text", "role_input" "text", "store_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_account_manager"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Verifica se existe algum registro na tabela 'employees' que corresponda ao UID do usuário autenticado
  -- e que tenha o cargo ('role') de 'Gerente'.
  RETURN EXISTS (
    SELECT 1
    FROM public.employees
    WHERE user_id = auth.uid() AND role = 'Gerente'
  );
END;
$$;


ALTER FUNCTION "public"."is_account_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_system_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_admins WHERE email = auth.jwt() ->> 'koresoluciones@outlook.com'
  );
END;
$$;


ALTER FUNCTION "public"."is_system_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_edit_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Para a tabela forum_topics
  IF (TG_TABLE_NAME = 'forum_topics') THEN
    IF (OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title) THEN
      INSERT INTO forum_edits (user_id, topic_id, previous_title, previous_content)
      VALUES (OLD.user_id, OLD.id, OLD.title, OLD.content);
      NEW.last_edited_at := now();
    END IF;
  END IF;

  -- Para a tabela forum_comments
  IF (TG_TABLE_NAME = 'forum_comments') THEN
    IF (OLD.content IS DISTINCT FROM NEW.content) THEN
      INSERT INTO forum_edits (user_id, comment_id, previous_content)
      VALUES (OLD.user_id, OLD.id, OLD.content);
      NEW.last_edited_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_edit_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_order_as_served"("order_id_param" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
  -- Atualiza todos os itens do pedido para 'SERVIDO'
    -- e adiciona o timestamp do novo status.
      UPDATE public.order_items
        SET
            status = 'SERVIDO', -- Valor corrigido
                status_timestamps = status_timestamps || jsonb_build_object('SERVIDO', now())
                  WHERE
                      order_id = order_id_param;
                      END;$$;


ALTER FUNCTION "public"."mark_order_as_served"("order_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moddatetime"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."moddatetime"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_reward"("p_customer_id" "uuid", "p_reward_id" "uuid", "p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    customer_points NUMERIC;
    reward RECORD;
    current_subtotal NUMERIC;
    discount_amount NUMERIC;
    current_user_id UUID;
BEGIN
    -- Get user_id from the session
    current_user_id := auth.uid();

    -- Get customer points
    SELECT loyalty_points INTO customer_points FROM public.customers WHERE id = p_customer_id AND user_id = current_user_id;

    -- Get reward details
    SELECT * INTO reward FROM public.loyalty_rewards WHERE id = p_reward_id AND user_id = current_user_id;

    -- Check if reward exists and is active
    IF NOT FOUND OR NOT reward.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Prêmio não encontrado ou inativo.');
    END IF;

    -- Check if customer has enough points
    IF customer_points IS NULL OR customer_points < reward.points_cost THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pontos insuficientes para resgatar este prêmio.');
    END IF;

    -- Deduct points and log movement
    UPDATE public.customers
    SET loyalty_points = loyalty_points - reward.points_cost
    WHERE id = p_customer_id;

    INSERT INTO public.loyalty_movements (user_id, customer_id, reward_id, points_change, description)
    VALUES (current_user_id, p_customer_id, p_reward_id, -reward.points_cost, 'Resgate do prêmio: ' || reward.name);

    -- Apply reward effect to order
    IF reward.reward_type = 'free_item' THEN
        -- Try to find and update an existing, non-redeemed, non-free item in the order
        UPDATE public.order_items
        SET
            price = 0,
            redeemed_reward_id = p_reward_id
        WHERE ctid = ( -- Use ctid to update a specific row
            SELECT ctid
            FROM public.order_items
            WHERE
                order_id = p_order_id
                AND recipe_id = reward.reward_value::UUID
                AND redeemed_reward_id IS NULL -- Not already redeemed
                AND price > 0 -- Not already free
            ORDER BY price DESC -- Apply to the most expensive one first if there are multiple
            LIMIT 1
        );

        -- Check if the update was successful
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'O item do prêmio não foi encontrado na conta do cliente. Adicione o item primeiro.');
        END IF;
    
    ELSIF reward.reward_type = 'discount_fixed' THEN
        INSERT INTO public.order_items (order_id, recipe_id, name, quantity, price, original_price, status, station_id, user_id, redeemed_reward_id, status_timestamps)
        VALUES (p_order_id, NULL, 'Desconto: ' || reward.name, 1, -reward.reward_value::NUMERIC, 0, 'SERVIDO', (SELECT id FROM stations WHERE user_id = current_user_id LIMIT 1), current_user_id, p_reward_id, jsonb_build_object('SERVIDO', now()));

    ELSIF reward.reward_type = 'discount_percentage' THEN
        -- Calculate current subtotal of positive, non-reward items in the order
        SELECT COALESCE(SUM(price * quantity), 0) INTO current_subtotal FROM public.order_items WHERE order_id = p_order_id AND price > 0 AND redeemed_reward_id IS NULL;
        discount_amount := current_subtotal * (reward.reward_value::NUMERIC / 100.0);

        INSERT INTO public.order_items (order_id, recipe_id, name, quantity, price, original_price, status, station_id, user_id, redeemed_reward_id, status_timestamps)
        VALUES (p_order_id, NULL, 'Desconto '|| reward.reward_value ||'%: ' || reward.name, 1, -discount_amount, 0, 'SERVIDO', (SELECT id FROM stations WHERE user_id = current_user_id LIMIT 1), current_user_id, p_reward_id, jsonb_build_object('SERVIDO', now()));

    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Prêmio resgatado com sucesso!');

EXCEPTION
    WHEN others THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ocorreu um erro interno: ' || SQLERRM);
END;
$$;


ALTER FUNCTION "public"."redeem_reward"("p_customer_id" "uuid", "p_reward_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_external_api_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_api_key text; -- Declara uma variável para guardar a nova chave
BEGIN
  -- Executa o UPDATE e usa a cláusula "INTO" para armazenar
  -- o valor retornado na nossa variável "new_api_key".
  UPDATE public.company_profile
  SET external_api_key = gen_random_uuid()
  WHERE user_id = auth.uid()
  RETURNING external_api_key INTO new_api_key;

  -- Retorna o valor que foi armazenado na variável.
  RETURN new_api_key;
END;
$$;


ALTER FUNCTION "public"."regenerate_external_api_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_store_manager"("permission_id_input" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Remove a permissão se o usuário logado for dono da loja associada à permissão
  DELETE FROM unit_permissions up
  WHERE id = permission_id_input 
  AND EXISTS (
      SELECT 1 FROM stores s WHERE s.id = up.store_id AND s.owner_id = auth.uid()
      UNION
      SELECT 1 FROM unit_permissions p WHERE p.store_id = up.store_id AND p.manager_id = auth.uid() AND p.role = 'owner'
  );
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."remove_store_manager"("permission_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_post_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.slug := public.slugify(NEW.title) || '-' || substr(md5(random()::text), 0, 7);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_post_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify"("v" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
  v := lower(v);
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := regexp_replace(v, E'^-*|-*$', '', 'g');
  RETURN v;
END;
$_$;


ALTER FUNCTION "public"."slugify"("v" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_store_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_manager_id UUID;
    allowed_stores JSONB;
    BEGIN
      -- Determinar qual usuário foi afetado (cobre INSERT, UPDATE e DELETE)
        IF TG_OP = 'DELETE' THEN
            target_manager_id := OLD.manager_id;
              ELSE
                  target_manager_id := NEW.manager_id;
                    END IF;

                      -- Agregar todas as lojas que este gerente tem acesso em um array JSONB
                        SELECT COALESCE(jsonb_agg(store_id), '[]'::jsonb)
                          INTO allowed_stores
                            FROM public.unit_permissions
                              WHERE manager_id = target_manager_id;

                                -- Atualizar o raw_app_meta_data do usuário na tabela auth.users
                                  UPDATE auth.users
                                    SET raw_app_meta_data = jsonb_set(
                                        COALESCE(raw_app_meta_data, '{}'::jsonb),
                                            '{stores}',
                                                allowed_stores
                                                  )
                                                    WHERE id = target_manager_id;

                                                      RETURN NULL;
                                                      END;
                                                      $$;


ALTER FUNCTION "public"."sync_user_store_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE forum_topics
    SET comment_count = comment_count + 1, updated_at = now()
    WHERE id = NEW.topic_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE forum_topics
    SET comment_count = comment_count - 1
    WHERE id = OLD.topic_id;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_item_status"("item_id" "uuid", "new_status" "public"."order_item_status") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.order_items
  set
    status = new_status,
    status_timestamps = status_timestamps || jsonb_build_object(new_status, now())
  where id = item_id;
end;
$$;


ALTER FUNCTION "public"."update_item_status"("item_id" "uuid", "new_status" "public"."order_item_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_movement_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE public.ingredients
    SET last_movement_at = now()
    WHERE id = NEW.ingredient_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_last_movement_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assets_depreciation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "purchase_value" numeric NOT NULL,
    "salvage_value" numeric DEFAULT 0,
    "lifespan_months" integer DEFAULT 60 NOT NULL,
    "monthly_depreciation" numeric GENERATED ALWAYS AS ((("purchase_value" - "salvage_value") / ("lifespan_months")::numeric)) STORED,
    "purchase_date" "date" NOT NULL,
    "transaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assets_depreciation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_testers" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nome" "text" NOT NULL,
    "nome_restaurante" "text" NOT NULL,
    "email" "text" NOT NULL,
    "telefone" "text" NOT NULL,
    "tipo_estabelecimento" "text" NOT NULL
);


ALTER TABLE "public"."beta_testers" OWNER TO "postgres";


COMMENT ON TABLE "public"."beta_testers" IS 'Collects information from users signing up for the beta program.';



COMMENT ON COLUMN "public"."beta_testers"."nome" IS 'Name of the person signing up.';



COMMENT ON COLUMN "public"."beta_testers"."nome_restaurante" IS 'Name of the restaurant.';



COMMENT ON COLUMN "public"."beta_testers"."email" IS 'Contact email, must be unique.';



COMMENT ON COLUMN "public"."beta_testers"."telefone" IS 'Contact phone number (WhatsApp).';



COMMENT ON COLUMN "public"."beta_testers"."tipo_estabelecimento" IS 'Type of establishment (e.g., Restaurant, Bar).';



ALTER TABLE "public"."beta_testers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."beta_testers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cashier_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opening_balance" numeric DEFAULT 0 NOT NULL,
    "total_revenue" numeric DEFAULT 0 NOT NULL,
    "total_expenses" numeric DEFAULT 0 NOT NULL,
    "expected_cash_in_drawer" numeric DEFAULT 0 NOT NULL,
    "counted_cash" numeric DEFAULT 0 NOT NULL,
    "difference" numeric DEFAULT 0 NOT NULL,
    "payment_summary" "jsonb",
    "notes" "text",
    "closed_by_employee_id" "uuid",
    "user_id" "uuid"
);

ALTER TABLE ONLY "public"."cashier_closings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."cashier_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "image_url" "text"
);

ALTER TABLE ONLY "public"."categories" REPLICA IDENTITY FULL;


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checklist_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "status" "text" NOT NULL,
    "notes" "text",
    "completed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "checklist_logs_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'pending'::"text", 'issue'::"text"])))
);


ALTER TABLE "public"."checklist_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checklist_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "section" "text" NOT NULL,
    "checklist_type" "text" NOT NULL,
    "task_description" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "checklist_templates_checklist_type_check" CHECK (("checklist_type" = ANY (ARRAY['opening'::"text", 'closing'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."checklist_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_profile" (
    "user_id" "uuid" NOT NULL,
    "company_name" "text" NOT NULL,
    "cnpj" "text" NOT NULL,
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "logo_url" "text",
    "phone" "text",
    "ifood_merchant_id" "text",
    "menu_cover_url" "text",
    "menu_header_url" "text",
    "external_api_key" "uuid",
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "time_clock_radius" integer DEFAULT 100,
    "focusnfe_token" "text",
    "focusnfe_cert_valid_until" "text"
);


ALTER TABLE "public"."company_profile" OWNER TO "postgres";


COMMENT ON COLUMN "public"."company_profile"."ifood_merchant_id" IS 'ID do Merchant (loja) na plataforma iFood.';



COMMENT ON COLUMN "public"."company_profile"."menu_cover_url" IS 'URL da imagem de capa principal para o cardápio online público.';



COMMENT ON COLUMN "public"."company_profile"."menu_header_url" IS 'URL da imagem do cabeçalho para o cardápio online público.';



CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "company" "text",
    "email" "text" NOT NULL,
    "phone" "text",
    "message" "text" NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


ALTER TABLE "public"."contacts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contacts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "cpf" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "loyalty_points" numeric DEFAULT 0 NOT NULL,
    "address" "text",
    "latitude" numeric,
    "longitude" numeric,
    "password_hash" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customers"."address" IS 'Endereço completo do cliente, usado para cálculo de distância de entrega.';



COMMENT ON COLUMN "public"."customers"."latitude" IS 'Latitude geográfica do endereço do cliente.';



COMMENT ON COLUMN "public"."customers"."longitude" IS 'Longitude geográfica do endereço do cliente.';



COMMENT ON COLUMN "public"."customers"."password_hash" IS 'Hash SHA256 da senha do cliente para login em aplicativos externos.';



CREATE TABLE IF NOT EXISTS "public"."delivery_drivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "vehicle_type" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "base_rate" numeric DEFAULT 0 NOT NULL,
    "rate_per_km" numeric DEFAULT 0 NOT NULL,
    "employee_id" "uuid",
    "last_latitude" real,
    "last_longitude" real,
    "last_updated_at" timestamp with time zone
);


ALTER TABLE "public"."delivery_drivers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."delivery_drivers"."employee_id" IS 'Vínculo opcional a um funcionário interno que também atua como entregador.';



COMMENT ON COLUMN "public"."delivery_drivers"."last_latitude" IS 'Última latitude conhecida do entregador.';



COMMENT ON COLUMN "public"."delivery_drivers"."last_longitude" IS 'Última longitude conhecida do entregador.';



COMMENT ON COLUMN "public"."delivery_drivers"."last_updated_at" IS 'Timestamp da última atualização de localização.';



CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "text",
    "pin" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "current_clock_in_id" "uuid",
    "salary_type" "text",
    "salary_rate" numeric,
    "overtime_rate_multiplier" numeric,
    "birth_date" "date",
    "cpf" "text",
    "rg" "text",
    "address" "text",
    "phone" "text",
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "hire_date" "date",
    "termination_date" "date",
    "bank_details" "jsonb",
    "role_id" "uuid",
    "photo_url" "text",
    CONSTRAINT "employees_salary_type_check" CHECK (("salary_type" = ANY (ARRAY['mensal'::"text", 'horista'::"text"])))
);

ALTER TABLE ONLY "public"."employees" REPLICA IDENTITY FULL;


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON COLUMN "public"."employees"."salary_type" IS 'Tipo de salário (ex: mensal, horista)';



COMMENT ON COLUMN "public"."employees"."salary_rate" IS 'Valor do salário ou da hora';



COMMENT ON COLUMN "public"."employees"."overtime_rate_multiplier" IS 'Multiplicador para cálculo de hora extra (ex: 1.5 para 50%)';



COMMENT ON COLUMN "public"."employees"."birth_date" IS 'Data de nascimento do funcionário';



COMMENT ON COLUMN "public"."employees"."cpf" IS 'Cadastro de Pessoa Física (CPF) do funcionário';



COMMENT ON COLUMN "public"."employees"."rg" IS 'Registro Geral (RG) do funcionário';



COMMENT ON COLUMN "public"."employees"."address" IS 'Endereço residencial do funcionário';



COMMENT ON COLUMN "public"."employees"."phone" IS 'Telefone de contato principal do funcionário';



COMMENT ON COLUMN "public"."employees"."emergency_contact_name" IS 'Nome do contato de emergência';



COMMENT ON COLUMN "public"."employees"."emergency_contact_phone" IS 'Telefone do contato de emergência';



COMMENT ON COLUMN "public"."employees"."hire_date" IS 'Data de contratação do funcionário';



COMMENT ON COLUMN "public"."employees"."termination_date" IS 'Data de demissão do funcionário (se aplicável)';



COMMENT ON COLUMN "public"."employees"."bank_details" IS 'Dados bancários para pagamento (banco, agência, conta, pix)';



CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_temp" numeric,
    "max_temp" numeric,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "financial_categories_type_check" CHECK (("type" = ANY (ARRAY['RECEITA'::"text", 'CUSTO_DIRETO'::"text", 'CUSTO_INDIRETO'::"text", 'DESPESA_OPERACIONAL'::"text", 'INVESTIMENTO'::"text"])))
);


ALTER TABLE "public"."financial_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "topic_id" "uuid",
    "comment_id" "uuid",
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    CONSTRAINT "topic_or_comment_id" CHECK (((("topic_id" IS NOT NULL) AND ("comment_id" IS NULL)) OR (("topic_id" IS NULL) AND ("comment_id" IS NOT NULL))))
);


ALTER TABLE "public"."forum_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "last_edited_at" timestamp with time zone
);


ALTER TABLE "public"."forum_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_edits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "topic_id" "uuid",
    "comment_id" "uuid",
    "previous_title" "text",
    "previous_content" "text" NOT NULL,
    CONSTRAINT "topic_or_comment_id_check" CHECK (((("topic_id" IS NOT NULL) AND ("comment_id" IS NULL)) OR (("topic_id" IS NULL) AND ("comment_id" IS NOT NULL))))
);


ALTER TABLE "public"."forum_edits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "view_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    "last_edited_at" timestamp with time zone
);


ALTER TABLE "public"."forum_topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."halls" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);

ALTER TABLE ONLY "public"."halls" REPLICA IDENTITY FULL;


ALTER TABLE "public"."halls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ifood_menu_sync" (
    "recipe_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ifood_item_id" "text" NOT NULL,
    "ifood_product_id" "text" NOT NULL,
    "ifood_category_id" "text" NOT NULL,
    "last_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sync_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ifood_menu_sync" OWNER TO "postgres";


COMMENT ON TABLE "public"."ifood_menu_sync" IS 'Mapeia receitas locais para IDs de itens e produtos do iFood, controlando o estado de sincronização.';



COMMENT ON COLUMN "public"."ifood_menu_sync"."last_sync_hash" IS 'Um hash gerado a partir dos dados do item (nome, preço, descrição) no momento da última sincronização bem-sucedida.';



CREATE TABLE IF NOT EXISTS "public"."ifood_webhook_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "merchant_id" "text",
    "ifood_order_id" "text",
    "event_code" "text",
    "raw_payload" "jsonb",
    "processing_status" "text",
    "error_message" "text"
);


ALTER TABLE "public"."ifood_webhook_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ifood_webhook_logs"."user_id" IS 'Vincula o log ao usuário do sistema (dono do restaurante)';



COMMENT ON COLUMN "public"."ifood_webhook_logs"."raw_payload" IS 'O corpo JSON completo recebido do iFood';



COMMENT ON COLUMN "public"."ifood_webhook_logs"."processing_status" IS 'O status final do processamento (ex: SUCCESS, ERROR_DUPLICATE_IGNORED)';



CREATE TABLE IF NOT EXISTS "public"."ingredient_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);

ALTER TABLE ONLY "public"."ingredient_categories" REPLICA IDENTITY FULL;


ALTER TABLE "public"."ingredient_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "unit" "public"."ingredient_unit" NOT NULL,
    "stock" numeric DEFAULT 0 NOT NULL,
    "cost" numeric DEFAULT 0 NOT NULL,
    "min_stock" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category_id" "uuid",
    "supplier_id" "uuid",
    "expiration_date" "date",
    "last_movement_at" timestamp with time zone,
    "user_id" "uuid",
    "is_sellable" boolean DEFAULT false,
    "price" numeric,
    "proxy_recipe_id" "uuid",
    "pos_category_id" "uuid",
    "station_id" "uuid",
    "external_code" "text",
    "is_portionable" boolean DEFAULT false NOT NULL,
    "is_yield_product" boolean DEFAULT false NOT NULL,
    "standard_portion_weight_g" numeric,
    "shelf_life_after_open_days" integer DEFAULT 3,
    "storage_conditions" "text" DEFAULT 'Refrigerado (0º a 5ºC)'::"text"
);

ALTER TABLE ONLY "public"."ingredients" REPLICA IDENTITY FULL;


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ingredients"."external_code" IS 'Código externo do produto (ex: codPDV do iFood) para mapeamento.';



COMMENT ON COLUMN "public"."ingredients"."standard_portion_weight_g" IS 'Peso padrão da porção em gramas, se aplicável (ex: 200 para um medalhão de 200g). Usado para o modo de registro "Por Quantidade".';



CREATE TABLE IF NOT EXISTS "public"."inventory_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit_cost" numeric NOT NULL,
    "total_cost" numeric GENERATED ALWAYS AS (("quantity" * "unit_cost")) STORED,
    "type" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "inventory_adjustments_type_check" CHECK (("type" = ANY (ARRAY['DESPERDICIO'::"text", 'VENCIMENTO'::"text", 'CONSUMO_INTERNO'::"text", 'CORTESIA'::"text", 'AJUSTE_INVENTARIO'::"text"])))
);


ALTER TABLE "public"."inventory_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "quantity_change" numeric NOT NULL,
    "previous_balance" numeric,
    "new_balance" numeric,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_lots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "lot_number" "text",
    "expiration_date" "date",
    "quantity" numeric DEFAULT 0 NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "unit_cost" numeric DEFAULT 0
);


ALTER TABLE "public"."inventory_lots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity_change" numeric NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "lot_id" "uuid"
);

ALTER TABLE ONLY "public"."inventory_movements" REPLICA IDENTITY FULL;


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."label_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "item_name" "text" NOT NULL,
    "quantity" numeric,
    "unit" "text",
    "lot_number" "text",
    "batch_id" "text",
    "manipulation_date" timestamp with time zone DEFAULT "now"(),
    "expiration_date" timestamp with time zone NOT NULL,
    "label_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "label_logs_label_type_check" CHECK (("label_type" = ANY (ARRAY['OPENING'::"text", 'PREPARED'::"text", 'PORTION'::"text", 'DEFROST'::"text", 'GENERIC'::"text"])))
);


ALTER TABLE "public"."label_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "status" "text" DEFAULT 'Pendente'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text",
    "manager_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachment_url" "text",
    CONSTRAINT "leave_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['Férias'::"text", 'Folga'::"text", 'Falta Justificada'::"text", 'Atestado'::"text"]))),
    CONSTRAINT "leave_requests_status_check" CHECK (("status" = ANY (ARRAY['Pendente'::"text", 'Aprovada'::"text", 'Rejeitada'::"text"])))
);


ALTER TABLE "public"."leave_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "reward_id" "uuid",
    "points_change" numeric NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "points_cost" numeric NOT NULL,
    "reward_type" "text" NOT NULL,
    "reward_value" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_rewards_points_cost_check" CHECK (("points_cost" > (0)::numeric)),
    CONSTRAINT "loyalty_rewards_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['discount_fixed'::"text", 'discount_percentage'::"text", 'free_item'::"text"])))
);


ALTER TABLE "public"."loyalty_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_settings" (
    "user_id" "uuid" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "points_per_real" numeric DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "recipe_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "notes" "text",
    "status" "public"."order_item_status" NOT NULL,
    "station_id" "uuid",
    "course" integer,
    "status_timestamps" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_id" "uuid",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "user_id" "uuid",
    "original_price" numeric NOT NULL,
    "discount_type" "text",
    "discount_value" numeric,
    "redeemed_reward_id" "uuid",
    "cancelled_by" "uuid",
    "added_by_employee_id" "uuid",
    "authorized_by_employee_id" "uuid",
    "unit_cost" numeric DEFAULT 0
);

ALTER TABLE ONLY "public"."order_items" REPLICA IDENTITY FULL;


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "table_number" integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_type" "public"."order_type" NOT NULL,
    "customer_name" "text",
    "customer_count" integer,
    "completed_at" timestamp with time zone,
    "user_id" "uuid",
    "customer_id" "uuid",
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "ifood_order_id" "text",
    "ifood_display_id" "text",
    "delivery_info" "jsonb",
    "ifood_order_timing" "text",
    "ifood_scheduled_at" timestamp with time zone,
    "ifood_payments" "jsonb",
    "ifood_benefits" "jsonb",
    "ifood_delivery_observations" "text",
    "ifood_pickup_code" "text",
    "ifood_dispute_details" "text",
    "ifood_dispute_id" "text",
    "notes" "text",
    "delivery_driver_id" "uuid",
    "delivery_status" "text",
    "delivery_distance_km" numeric,
    "delivery_cost" numeric,
    "nfce_ref" "text",
    "nfce_status" "text",
    "nfce_url" "text",
    "nfce_xml_path" "text",
    "nfce_chave" "text",
    "nfce_last_response" "jsonb",
    "discount_type" "text",
    "discount_value" numeric,
    "cancelled_by" "uuid",
    "created_by_employee_id" "uuid",
    "closed_by_employee_id" "uuid",
    "command_number" integer,
    "tab_name" "text",
    CONSTRAINT "orders_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed_value'::"text"])))
);

ALTER TABLE ONLY "public"."orders" REPLICA IDENTITY FULL;


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."order_type" IS 'Tipo do pedido (Dine-in, QuickSale, iFood-Delivery, iFood-Takeout).';



COMMENT ON COLUMN "public"."orders"."status" IS 'Status atual do pedido (OPEN, COMPLETED, CANCELLED). Substitui o antigo is_completed.';



COMMENT ON COLUMN "public"."orders"."ifood_order_id" IS 'ID único do pedido na plataforma iFood.';



COMMENT ON COLUMN "public"."orders"."ifood_display_id" IS 'ID amigável do pedido no iFood para exibição.';



COMMENT ON COLUMN "public"."orders"."delivery_info" IS 'Armazena dados de entrega do iFood, como endereço e tipo.';



COMMENT ON COLUMN "public"."orders"."ifood_order_timing" IS 'Armazena se o pedido é IMMEDIATE ou SCHEDULED.';



COMMENT ON COLUMN "public"."orders"."ifood_scheduled_at" IS 'Armazena a data e hora de entrega para pedidos agendados (SCHEDULED).';



COMMENT ON COLUMN "public"."orders"."ifood_payments" IS 'Armazena o array de pagamentos do iFood, contendo detalhes como bandeira do cartão e troco.';



COMMENT ON COLUMN "public"."orders"."ifood_benefits" IS 'Armazena o array de benefícios (descontos) do iFood, detalhando valores e quem arcou com o custo.';



COMMENT ON COLUMN "public"."orders"."ifood_delivery_observations" IS 'Armazena observações gerais sobre a entrega, fornecidas pelo cliente.';



COMMENT ON COLUMN "public"."orders"."ifood_pickup_code" IS 'Armazena o código que o entregador deve fornecer ao retirar o pedido.';



COMMENT ON COLUMN "public"."orders"."delivery_distance_km" IS 'Distância da rota em KM, calculada no momento da atribuição da entrega.';



COMMENT ON COLUMN "public"."orders"."delivery_cost" IS 'Custo total da entrega a ser pago ao entregador, calculado no momento da atribuição.';



CREATE TABLE IF NOT EXISTS "public"."payroll_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "period" "text" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payroll_adjustments_type_check" CHECK (("type" = ANY (ARRAY['BONUS'::"text", 'DEDUCTION'::"text"])))
);


ALTER TABLE "public"."payroll_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_permissions" (
    "plan_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL
);


ALTER TABLE "public"."plan_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."plan_permissions" IS 'Associa planos a chaves de permissão de módulos (rotas).';



CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "description" "text",
    "isMostPopular" boolean DEFAULT false,
    "preapproval_plan_id" character varying(255),
    "recurring" boolean DEFAULT true NOT NULL,
    "trial_period_days" integer,
    "max_stores" integer DEFAULT 1
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."plans" IS 'Define os planos de assinatura disponíveis (ex: Básico, Profissional).';



COMMENT ON COLUMN "public"."plans"."recurring" IS 'Define se o plano é uma assinatura recorrente (true) ou uma compra única de acesso temporário (false).';



COMMENT ON COLUMN "public"."plans"."trial_period_days" IS 'Para planos com preço = 0, especifica a duração do período de teste em dias.';



CREATE TABLE IF NOT EXISTS "public"."portioning_event_outputs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "ingredient_id" "uuid",
    "output_type" "public"."portioning_output_type" NOT NULL,
    "description" "text",
    "quantity_produced" numeric NOT NULL,
    "unit" "public"."ingredient_unit" NOT NULL,
    "unit_cost" numeric DEFAULT 0
);


ALTER TABLE "public"."portioning_event_outputs" OWNER TO "postgres";


COMMENT ON TABLE "public"."portioning_event_outputs" IS 'Armazena os resultados de um evento de porcionamento (porções, aparas, perdas).';



CREATE TABLE IF NOT EXISTS "public"."portioning_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "employee_id" "uuid",
    "notes" "text",
    "input_ingredient_id" "uuid" NOT NULL,
    "input_quantity" numeric NOT NULL,
    "total_input_cost" numeric NOT NULL,
    "yield_percentage" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."portioning_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."portioning_events" IS 'Registra cada evento de porcionamento de um insumo.';



CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "summary" "text",
    "content" "text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "author" "text"
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


COMMENT ON TABLE "public"."posts" IS 'Armazena todos os artigos do blog.';



ALTER TABLE "public"."posts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."production_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_date" "date" NOT NULL,
    "status" "public"."PlanStatus" DEFAULT 'Pendente'::"public"."PlanStatus" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."production_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "production_plan_id" "uuid" NOT NULL,
    "sub_recipe_id" "uuid",
    "station_id" "uuid" NOT NULL,
    "predicted_demand_quantity" numeric,
    "status" "public"."ProductionStatus" DEFAULT 'A Fazer'::"public"."ProductionStatus" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "custom_task_name" "text",
    "employee_id" "uuid",
    "quantity_to_produce" numeric DEFAULT 0 NOT NULL,
    "lot_number" "text",
    "total_cost" numeric,
    "quantity_produced" numeric,
    "completion_notes" "text",
    "expiration_date" timestamp with time zone,
    "priority" integer DEFAULT 0,
    "started_at" timestamp without time zone,
    "batch_code" "text",
    "source_batches" "jsonb",
    "completed_at" timestamp with time zone,
    "task_type" "text" DEFAULT 'production'::"text",
    "target_stock" numeric,
    CONSTRAINT "production_tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['production'::"text", 'thawing'::"text", 'prep'::"text"])))
);


ALTER TABLE "public"."production_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."production_tasks"."lot_number" IS 'Número do lote gerado para a produção desta tarefa.';



COMMENT ON COLUMN "public"."production_tasks"."total_cost" IS 'Custo total dos insumos utilizados para produzir a quantidade especificada nesta tarefa.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "favorite_tools" "text"[] DEFAULT '{}'::"text"[],
    CONSTRAINT "username_length" CHECK (("char_length"("username") >= 3))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Perfis públicos para os usuários do Kore Hub.';



COMMENT ON COLUMN "public"."profiles"."id" IS 'Referência ao ID do usuário em auth.users.';



CREATE TABLE IF NOT EXISTS "public"."promotion_recipes" (
    "promotion_id" "uuid" NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "discount_type" "public"."discount_type" NOT NULL,
    "discount_value" numeric NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."promotion_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "days_of_week" smallint[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "cost" numeric NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lot_number" "text",
    "expiration_date" "date",
    "unit_cost" numeric DEFAULT 0,
    CONSTRAINT "purchase_order_items_cost_check" CHECK (("cost" >= (0)::numeric)),
    CONSTRAINT "purchase_order_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "status" "text" DEFAULT 'Rascunho'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_by_employee_id" "uuid",
    "received_by_employee_id" "uuid"
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."realtime_events" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "restaurant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb"
);


ALTER TABLE "public"."realtime_events" OWNER TO "postgres";


ALTER TABLE "public"."realtime_events" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."realtime_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "recipe_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "preparation_id" "uuid",
    "user_id" "uuid",
    "correction_factor" numeric DEFAULT 1.0,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text")
);

ALTER TABLE ONLY "public"."recipe_ingredients" REPLICA IDENTITY FULL;


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."recipe_ingredients"."created_at" IS 'data de criacao';



CREATE TABLE IF NOT EXISTS "public"."recipe_preparations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "prep_instructions" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid"
);

ALTER TABLE ONLY "public"."recipe_preparations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."recipe_preparations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_sub_recipes" (
    "parent_recipe_id" "uuid" NOT NULL,
    "child_recipe_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."recipe_sub_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric NOT NULL,
    "category_id" "uuid",
    "prep_time_in_minutes" integer,
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operational_cost" numeric(10,2),
    "user_id" "uuid",
    "is_sub_recipe" boolean DEFAULT false NOT NULL,
    "source_ingredient_id" "uuid",
    "yield_quantity" numeric,
    "yield_unit" "public"."IngredientUnit",
    "image_url" "text",
    "external_code" "text",
    "ncm_code" character varying(8),
    "shelf_life_prepared_days" integer DEFAULT 2,
    "storage_conditions" "text" DEFAULT 'Refrigerado (0º a 5ºC)'::"text",
    "par_level" numeric DEFAULT 0,
    "labor_cost" numeric DEFAULT 0
);

ALTER TABLE ONLY "public"."recipes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."recipes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."recipes"."external_code" IS 'Código externo para integração com PDVs, iFood, etc. Corresponde ao "externalCode" do iFood.';



CREATE TABLE IF NOT EXISTS "public"."requisition_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requisition_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity_requested" numeric NOT NULL,
    "quantity_delivered" numeric,
    "unit" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."requisition_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."requisition_template_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."requisition_template_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."requisition_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "station_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."requisition_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."requisitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_by" "uuid",
    "station_id" "uuid",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "processed_by" "uuid",
    CONSTRAINT "requisitions_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text", 'DELIVERED'::"text", 'PARTIAL'::"text"])))
);


ALTER TABLE "public"."requisitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "booking_duration_minutes" integer DEFAULT 90 NOT NULL,
    "max_party_size" integer DEFAULT 8 NOT NULL,
    "min_party_size" integer DEFAULT 1 NOT NULL,
    "booking_notice_days" integer DEFAULT 30 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weekly_hours" "jsonb"
);


ALTER TABLE "public"."reservation_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_email" "text",
    "customer_phone" "text",
    "party_size" integer NOT NULL,
    "reservation_time" timestamp with time zone NOT NULL,
    "notes" "text",
    "status" "public"."reservation_status" DEFAULT 'PENDING'::"public"."reservation_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text")
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_permissions" IS 'Vincula os cargos (roles) a chaves de permissão específicas.';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."roles" IS 'Armazena os cargos personalizados e suas permissões.';



CREATE TABLE IF NOT EXISTS "public"."schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "notes" "text",
    "role_assigned" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_day_off" boolean DEFAULT false
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."station_stocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0,
    "last_restock_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."station_stocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auto_print_orders" boolean DEFAULT false NOT NULL,
    "printer_name" "text",
    "user_id" "uuid",
    "employee_id" "uuid"
);

ALTER TABLE ONLY "public"."stations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."stations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "public"."subscription_status" NOT NULL,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mercado_pago_subscription_id" "text",
    "store_id" "uuid"
);

ALTER TABLE ONLY "public"."subscriptions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscriptions" IS 'Gerencia a assinatura ativa de cada usuário.';



COMMENT ON COLUMN "public"."subscriptions"."mercado_pago_subscription_id" IS 'Armazena o ID da assinatura (preapproval_id) do Mercado Pago para gerenciar o ciclo de vida da assinatura (ex: cancelamento).';



CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "address" "text" DEFAULT ''::"text"
);

ALTER TABLE ONLY "public"."suppliers" REPLICA IDENTITY FULL;


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_admins" (
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_cache" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "number" integer NOT NULL,
    "hall_id" "uuid" NOT NULL,
    "status" "public"."table_status" DEFAULT 'LIVRE'::"public"."table_status" NOT NULL,
    "x" numeric NOT NULL,
    "y" numeric NOT NULL,
    "width" numeric NOT NULL,
    "height" numeric NOT NULL,
    "employee_id" "uuid",
    "customer_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);

ALTER TABLE ONLY "public"."tables" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."temperature_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "temperature" numeric NOT NULL,
    "notes" "text",
    "recorded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."temperature_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" bigint NOT NULL,
    CONSTRAINT "template_comments_content_check" CHECK (("char_length"("content") > 0))
);


ALTER TABLE "public"."template_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "workflow_json" "jsonb" NOT NULL,
    "tags" "text"[],
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text"
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."templates" IS 'Armazena os templates de workflow do n8n.';



COMMENT ON COLUMN "public"."templates"."category" IS 'categoria workflow';



ALTER TABLE "public"."templates" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."templates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."time_clock_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "clock_in_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clock_out_time" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "break_start_time" timestamp with time zone,
    "break_end_time" timestamp with time zone,
    "latitude" numeric(9,6),
    "longitude" numeric(9,6)
);


ALTER TABLE "public"."time_clock_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "description" "text" NOT NULL,
    "type" "public"."transaction_type" NOT NULL,
    "amount" numeric NOT NULL,
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "employee_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "financial_category_id" "uuid",
    "competence_date" "date" DEFAULT CURRENT_DATE,
    "is_recurring" boolean DEFAULT false,
    "recurrence_period" "text",
    CONSTRAINT "transactions_recurrence_period_check" CHECK (("recurrence_period" = ANY (ARRAY['MONTHLY'::"text", 'WEEKLY'::"text", 'YEARLY'::"text"])))
);

ALTER TABLE ONLY "public"."transactions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."unit_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_learning_progress" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "step_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_learning_progress" OWNER TO "postgres";


ALTER TABLE "public"."user_learning_progress" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_learning_progress_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_permissions" IS 'Armazena as permissões concedidas diretamente aos usuários, normalmente com base em seu plano de assinatura ativo.';



COMMENT ON COLUMN "public"."user_permissions"."user_id" IS 'Chave estrangeira para o usuário ao qual esta permissão pertence.';



COMMENT ON COLUMN "public"."user_permissions"."permission_key" IS 'A chave que identifica a permissão (ex: ''/dashboard'', ''/pos'').';



ALTER TABLE "public"."user_permissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_permissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_tool_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tool_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_email" "text"
);


ALTER TABLE "public"."user_tool_data" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_tool_data" IS 'Armazena dados salvos das ferramentas para cada usuário.';



COMMENT ON COLUMN "public"."user_tool_data"."user_id" IS 'Referencia o usuário do Supabase Auth que salvou os dados.';



COMMENT ON COLUMN "public"."user_tool_data"."tool_id" IS 'Identificador da ferramenta (ex: json-formatter, cron-generator).';



COMMENT ON COLUMN "public"."user_tool_data"."title" IS 'Título dado pelo usuário para os dados salvos.';



COMMENT ON COLUMN "public"."user_tool_data"."data" IS 'O payload de dados da ferramenta em formato JSONB.';



CREATE TABLE IF NOT EXISTS "public"."webhook_secrets" (
    "id" bigint NOT NULL,
    "restaurant_id" "text" NOT NULL,
    "webhook_secret" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_secrets" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_secrets" IS 'Stores the webhook signing secrets for each restaurant.';



ALTER TABLE "public"."webhook_secrets" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."webhook_secrets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."webhooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "secret" "text" NOT NULL,
    "events" "text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhooks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."assets_depreciation"
    ADD CONSTRAINT "assets_depreciation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_testers"
    ADD CONSTRAINT "beta_testers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."beta_testers"
    ADD CONSTRAINT "beta_testers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cashier_closings"
    ADD CONSTRAINT "cashier_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."checklist_logs"
    ADD CONSTRAINT "checklist_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_templates"
    ADD CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_profile"
    ADD CONSTRAINT "company_profile_external_api_key_key" UNIQUE ("external_api_key");



ALTER TABLE ONLY "public"."company_profile"
    ADD CONSTRAINT "company_profile_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_drivers"
    ADD CONSTRAINT "delivery_drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_categories"
    ADD CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_attachments"
    ADD CONSTRAINT "forum_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_edits"
    ADD CONSTRAINT "forum_edits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_topics"
    ADD CONSTRAINT "forum_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."halls"
    ADD CONSTRAINT "halls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."halls"
    ADD CONSTRAINT "halls_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."ifood_menu_sync"
    ADD CONSTRAINT "ifood_menu_sync_pkey" PRIMARY KEY ("recipe_id");



ALTER TABLE ONLY "public"."ifood_webhook_logs"
    ADD CONSTRAINT "ifood_webhook_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_categories"
    ADD CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_categories"
    ADD CONSTRAINT "ingredient_categories_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_lots"
    ADD CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."label_logs"
    ADD CONSTRAINT "label_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_movements"
    ADD CONSTRAINT "loyalty_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_adjustments"
    ADD CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_permissions"
    ADD CONSTRAINT "plan_permissions_pkey" PRIMARY KEY ("plan_id", "permission_key");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."portioning_event_outputs"
    ADD CONSTRAINT "portioning_event_outputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portioning_events"
    ADD CONSTRAINT "portioning_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."production_plans"
    ADD CONSTRAINT "production_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_plans"
    ADD CONSTRAINT "production_plans_user_id_plan_date_key" UNIQUE ("user_id", "plan_date");



ALTER TABLE ONLY "public"."production_tasks"
    ADD CONSTRAINT "production_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."promotion_recipes"
    ADD CONSTRAINT "promotion_recipes_pkey" PRIMARY KEY ("promotion_id", "recipe_id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."realtime_events"
    ADD CONSTRAINT "realtime_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("recipe_id", "ingredient_id");



ALTER TABLE ONLY "public"."recipe_preparations"
    ADD CONSTRAINT "recipe_preparations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_sub_recipes"
    ADD CONSTRAINT "recipe_sub_recipes_pkey" PRIMARY KEY ("parent_recipe_id", "child_recipe_id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."requisition_items"
    ADD CONSTRAINT "requisition_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."requisition_template_items"
    ADD CONSTRAINT "requisition_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."requisition_templates"
    ADD CONSTRAINT "requisition_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."requisitions"
    ADD CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_settings"
    ADD CONSTRAINT "reservation_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_settings"
    ADD CONSTRAINT "reservation_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_key");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_user_id_week_start_date_key" UNIQUE ("user_id", "week_start_date");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."station_stocks"
    ADD CONSTRAINT "station_stocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."station_stocks"
    ADD CONSTRAINT "station_stocks_station_id_ingredient_id_key" UNIQUE ("station_id", "ingredient_id");



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."system_admins"
    ADD CONSTRAINT "system_admins_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."system_cache"
    ADD CONSTRAINT "system_cache_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_number_hall_id_key" UNIQUE ("number", "hall_id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_user_id_hall_id_number_key" UNIQUE ("user_id", "hall_id", "number");



ALTER TABLE ONLY "public"."temperature_logs"
    ADD CONSTRAINT "temperature_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_comments"
    ADD CONSTRAINT "template_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_clock_entries"
    ADD CONSTRAINT "time_clock_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_permissions"
    ADD CONSTRAINT "unit_permissions_manager_id_store_id_key" UNIQUE ("manager_id", "store_id");



ALTER TABLE ONLY "public"."unit_permissions"
    ADD CONSTRAINT "unit_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_learning_progress"
    ADD CONSTRAINT "user_learning_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_learning_progress"
    ADD CONSTRAINT "user_learning_progress_user_id_step_path_key" UNIQUE ("user_id", "step_path");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_permission_key_key" UNIQUE ("user_id", "permission_key");



ALTER TABLE ONLY "public"."user_tool_data"
    ADD CONSTRAINT "user_tool_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_secrets"
    ADD CONSTRAINT "webhook_secrets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_secrets"
    ADD CONSTRAINT "webhook_secrets_restaurant_id_key" UNIQUE ("restaurant_id");



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_checklist_logs_date" ON "public"."checklist_logs" USING "btree" ("completed_at");



CREATE INDEX "idx_checklist_logs_store" ON "public"."checklist_logs" USING "btree" ("store_id");



CREATE INDEX "idx_checklist_templates_store" ON "public"."checklist_templates" USING "btree" ("store_id");



CREATE INDEX "idx_company_profile_ifood_merchant_id" ON "public"."company_profile" USING "btree" ("ifood_merchant_id");



CREATE INDEX "idx_customers_search_v2" ON "public"."customers" USING "btree" ("user_id", "phone", "cpf");



CREATE INDEX "idx_equipment_store" ON "public"."equipment" USING "btree" ("store_id");



CREATE INDEX "idx_ingredients_external_code" ON "public"."ingredients" USING "btree" ("external_code");



CREATE INDEX "idx_inventory_logs_date" ON "public"."inventory_logs" USING "btree" ("created_at");



CREATE INDEX "idx_inventory_logs_employee" ON "public"."inventory_logs" USING "btree" ("employee_id");



CREATE INDEX "idx_inventory_logs_ingredient" ON "public"."inventory_logs" USING "btree" ("ingredient_id");



CREATE INDEX "idx_label_logs_user_date" ON "public"."label_logs" USING "btree" ("user_id", "created_at");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_order_id_v2" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_command_number" ON "public"."orders" USING "btree" ("command_number");



CREATE INDEX "idx_orders_customer_id" ON "public"."orders" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "idx_orders_ifood_order_id" ON "public"."orders" USING "btree" ("ifood_order_id");



CREATE INDEX "idx_orders_status_timestamp" ON "public"."orders" USING "btree" ("user_id", "status", "timestamp" DESC);



CREATE INDEX "idx_orders_tab_name" ON "public"."orders" USING "btree" ("tab_name");



CREATE INDEX "idx_payroll_adjustments_employee" ON "public"."payroll_adjustments" USING "btree" ("employee_id");



CREATE INDEX "idx_payroll_adjustments_period" ON "public"."payroll_adjustments" USING "btree" ("user_id", "period");



CREATE INDEX "idx_production_tasks_priority" ON "public"."production_tasks" USING "btree" ("priority");



CREATE INDEX "idx_req_template_items_template" ON "public"."requisition_template_items" USING "btree" ("template_id");



CREATE INDEX "idx_req_templates_station" ON "public"."requisition_templates" USING "btree" ("station_id");



CREATE INDEX "idx_req_templates_user" ON "public"."requisition_templates" USING "btree" ("user_id");



CREATE INDEX "idx_requisitions_date" ON "public"."requisitions" USING "btree" ("created_at");



CREATE INDEX "idx_requisitions_status" ON "public"."requisitions" USING "btree" ("status");



CREATE INDEX "idx_station_stocks_ingredient" ON "public"."station_stocks" USING "btree" ("ingredient_id");



CREATE INDEX "idx_station_stocks_station" ON "public"."station_stocks" USING "btree" ("station_id");



CREATE INDEX "idx_stores_owner" ON "public"."stores" USING "btree" ("owner_id");



CREATE INDEX "idx_temperature_logs_date" ON "public"."temperature_logs" USING "btree" ("recorded_at");



CREATE INDEX "idx_temperature_logs_equipment" ON "public"."temperature_logs" USING "btree" ("equipment_id");



CREATE INDEX "idx_temperature_logs_store" ON "public"."temperature_logs" USING "btree" ("store_id");



CREATE INDEX "idx_time_clock_entries_employee_date" ON "public"."time_clock_entries" USING "btree" ("employee_id", "clock_in_time");



CREATE INDEX "idx_transactions_created_at" ON "public"."transactions" USING "btree" ("created_at");



CREATE INDEX "idx_transactions_date_v2" ON "public"."transactions" USING "btree" ("user_id", "date");



CREATE INDEX "idx_unit_permissions_manager" ON "public"."unit_permissions" USING "btree" ("manager_id");



CREATE INDEX "idx_unit_permissions_store" ON "public"."unit_permissions" USING "btree" ("store_id");



CREATE INDEX "ix_ifood_webhook_logs_user_id" ON "public"."ifood_webhook_logs" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "FORUM COMMENT" AFTER INSERT OR UPDATE ON "public"."forum_comments" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://n8n.zegnanutricion.com.mx/webhook/c34df183-995a-4ac7-b987-42afef54f822', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "before_comment_update" BEFORE UPDATE ON "public"."forum_comments" FOR EACH ROW EXECUTE FUNCTION "public"."log_edit_history"();



CREATE OR REPLACE TRIGGER "before_topic_update" BEFORE UPDATE ON "public"."forum_topics" FOR EACH ROW EXECUTE FUNCTION "public"."log_edit_history"();



CREATE OR REPLACE TRIGGER "handle_set_slug" BEFORE INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_post_slug"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."templates" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"();



CREATE OR REPLACE TRIGGER "inventory_movement_trigger" AFTER INSERT ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."update_last_movement_at"();



CREATE OR REPLACE TRIGGER "on_comment_change" AFTER INSERT OR DELETE ON "public"."forum_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_comment_count"();



CREATE OR REPLACE TRIGGER "on_leave_request_updated" BEFORE UPDATE ON "public"."leave_requests" FOR EACH ROW EXECUTE FUNCTION "public"."handle_leave_request_update"();



CREATE OR REPLACE TRIGGER "on_order_completed_add_loyalty_points" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."handle_loyalty_points_on_order_completion"();



CREATE OR REPLACE TRIGGER "on_unit_permissions_changed" AFTER INSERT OR DELETE OR UPDATE ON "public"."unit_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_user_store_permissions"();



CREATE OR REPLACE TRIGGER "on_updated_at" BEFORE UPDATE ON "public"."user_tool_data" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."assets_depreciation"
    ADD CONSTRAINT "assets_depreciation_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id");



ALTER TABLE ONLY "public"."assets_depreciation"
    ADD CONSTRAINT "assets_depreciation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cashier_closings"
    ADD CONSTRAINT "cashier_closings_closed_by_employee_id_fkey" FOREIGN KEY ("closed_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cashier_closings"
    ADD CONSTRAINT "cashier_closings_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_logs"
    ADD CONSTRAINT "checklist_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklist_logs"
    ADD CONSTRAINT "checklist_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_logs"
    ADD CONSTRAINT "checklist_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_templates"
    ADD CONSTRAINT "checklist_templates_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_profile"
    ADD CONSTRAINT "company_profile_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_drivers"
    ADD CONSTRAINT "delivery_drivers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_drivers"
    ADD CONSTRAINT "delivery_drivers_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_current_clock_in_id_fkey" FOREIGN KEY ("current_clock_in_id") REFERENCES "public"."time_clock_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_categories"
    ADD CONSTRAINT "financial_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."financial_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_categories"
    ADD CONSTRAINT "financial_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."forum_attachments"
    ADD CONSTRAINT "forum_attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."forum_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_attachments"
    ADD CONSTRAINT "forum_attachments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_attachments"
    ADD CONSTRAINT "forum_attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_edits"
    ADD CONSTRAINT "forum_edits_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."forum_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_edits"
    ADD CONSTRAINT "forum_edits_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_edits"
    ADD CONSTRAINT "forum_edits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_topics"
    ADD CONSTRAINT "forum_topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."halls"
    ADD CONSTRAINT "halls_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ifood_menu_sync"
    ADD CONSTRAINT "ifood_menu_sync_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ifood_menu_sync"
    ADD CONSTRAINT "ifood_menu_sync_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ifood_webhook_logs"
    ADD CONSTRAINT "ifood_webhook_logs_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredient_categories"
    ADD CONSTRAINT "ingredient_categories_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."ingredient_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pos_category_id_fkey" FOREIGN KEY ("pos_category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_proxy_recipe_id_fkey" FOREIGN KEY ("proxy_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."inventory_lots"
    ADD CONSTRAINT "inventory_lots_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_lots"
    ADD CONSTRAINT "inventory_lots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."label_logs"
    ADD CONSTRAINT "label_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."label_logs"
    ADD CONSTRAINT "label_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_movements"
    ADD CONSTRAINT "loyalty_movements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_movements"
    ADD CONSTRAINT "loyalty_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_movements"
    ADD CONSTRAINT "loyalty_movements_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_movements"
    ADD CONSTRAINT "loyalty_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_added_by_employee_id_fkey" FOREIGN KEY ("added_by_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_authorized_by_employee_id_fkey" FOREIGN KEY ("authorized_by_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_redeemed_reward_id_fkey" FOREIGN KEY ("redeemed_reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_closed_by_employee_id_fkey" FOREIGN KEY ("closed_by_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_created_by_employee_id_fkey" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_delivery_driver_id_fkey" FOREIGN KEY ("delivery_driver_id") REFERENCES "public"."delivery_drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_adjustments"
    ADD CONSTRAINT "payroll_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_adjustments"
    ADD CONSTRAINT "payroll_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_permissions"
    ADD CONSTRAINT "plan_permissions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portioning_event_outputs"
    ADD CONSTRAINT "portioning_event_outputs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."portioning_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portioning_event_outputs"
    ADD CONSTRAINT "portioning_event_outputs_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."portioning_events"
    ADD CONSTRAINT "portioning_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."portioning_events"
    ADD CONSTRAINT "portioning_events_input_ingredient_id_fkey" FOREIGN KEY ("input_ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."portioning_events"
    ADD CONSTRAINT "portioning_events_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_plans"
    ADD CONSTRAINT "production_plans_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_tasks"
    ADD CONSTRAINT "production_tasks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_tasks"
    ADD CONSTRAINT "production_tasks_production_plan_id_fkey" FOREIGN KEY ("production_plan_id") REFERENCES "public"."production_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_tasks"
    ADD CONSTRAINT "production_tasks_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id");



ALTER TABLE ONLY "public"."production_tasks"
    ADD CONSTRAINT "production_tasks_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_tasks"
    ADD CONSTRAINT "production_tasks_sub_recipe_id_fkey" FOREIGN KEY ("sub_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_recipes"
    ADD CONSTRAINT "promotion_recipes_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_recipes"
    ADD CONSTRAINT "promotion_recipes_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_recipes"
    ADD CONSTRAINT "promotion_recipes_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_created_by_employee_id_fkey" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_received_by_employee_id_fkey" FOREIGN KEY ("received_by_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_preparation_id_fkey" FOREIGN KEY ("preparation_id") REFERENCES "public"."recipe_preparations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_preparations"
    ADD CONSTRAINT "recipe_preparations_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_preparations"
    ADD CONSTRAINT "recipe_preparations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recipe_preparations"
    ADD CONSTRAINT "recipe_preparations_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_sub_recipes"
    ADD CONSTRAINT "recipe_sub_recipes_child_recipe_id_fkey" FOREIGN KEY ("child_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_sub_recipes"
    ADD CONSTRAINT "recipe_sub_recipes_parent_recipe_id_fkey" FOREIGN KEY ("parent_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_sub_recipes"
    ADD CONSTRAINT "recipe_sub_recipes_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_source_ingredient_id_fkey" FOREIGN KEY ("source_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requisition_items"
    ADD CONSTRAINT "requisition_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."requisition_items"
    ADD CONSTRAINT "requisition_items_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requisition_items"
    ADD CONSTRAINT "requisition_items_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requisition_template_items"
    ADD CONSTRAINT "requisition_template_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requisition_template_items"
    ADD CONSTRAINT "requisition_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."requisition_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requisition_templates"
    ADD CONSTRAINT "requisition_templates_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requisition_templates"
    ADD CONSTRAINT "requisition_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requisitions"
    ADD CONSTRAINT "requisitions_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."requisitions"
    ADD CONSTRAINT "requisitions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."requisitions"
    ADD CONSTRAINT "requisitions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id");



ALTER TABLE ONLY "public"."requisitions"
    ADD CONSTRAINT "requisitions_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservation_settings"
    ADD CONSTRAINT "reservation_settings_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."station_stocks"
    ADD CONSTRAINT "station_stocks_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."station_stocks"
    ADD CONSTRAINT "station_stocks_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."station_stocks"
    ADD CONSTRAINT "station_stocks_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_hall_id_fkey" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."temperature_logs"
    ADD CONSTRAINT "temperature_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."temperature_logs"
    ADD CONSTRAINT "temperature_logs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."temperature_logs"
    ADD CONSTRAINT "temperature_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_comments"
    ADD CONSTRAINT "template_comments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_comments"
    ADD CONSTRAINT "template_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_clock_entries"
    ADD CONSTRAINT "time_clock_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_clock_entries"
    ADD CONSTRAINT "time_clock_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_financial_category_id_fkey" FOREIGN KEY ("financial_category_id") REFERENCES "public"."financial_categories"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_permissions"
    ADD CONSTRAINT "unit_permissions_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_permissions"
    ADD CONSTRAINT "unit_permissions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_learning_progress"
    ADD CONSTRAINT "user_learning_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tool_data"
    ADD CONSTRAINT "user_tool_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_store_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage admins" ON "public"."system_admins" USING ("public"."is_system_admin"());



CREATE POLICY "Admins can view admins" ON "public"."system_admins" FOR SELECT USING ("public"."is_system_admin"());



CREATE POLICY "Allow authenticated read access" ON "public"."realtime_events" FOR SELECT USING (("auth"."uid"() = "restaurant_id"));



CREATE POLICY "Allow authenticated users to create attachments" ON "public"."forum_attachments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to create comments" ON "public"."forum_comments" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users to create topics" ON "public"."forum_topics" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users to insert" ON "public"."template_comments" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users to insert their own movements" ON "public"."inventory_movements" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to manage their loyalty movements" ON "public"."loyalty_movements" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to manage their own loyalty settings" ON "public"."loyalty_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to manage their own rewards" ON "public"."loyalty_rewards" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to manage their own schedules" ON "public"."schedules" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to manage their own shifts" ON "public"."shifts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to manage their own sync data" ON "public"."ifood_menu_sync" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to read plan permissions" ON "public"."plan_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read plans" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow individual access" ON "public"."user_learning_progress" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow owners to delete their attachments" ON "public"."forum_attachments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow owners to delete their comments" ON "public"."forum_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow owners to delete their topics" ON "public"."forum_topics" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow owners to update their comments" ON "public"."forum_comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow owners to update their topics" ON "public"."forum_topics" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow public form submissions" ON "public"."contacts" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow public read access" ON "public"."forum_attachments" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."forum_comments" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."forum_topics" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."template_comments" FOR SELECT USING (true);



CREATE POLICY "Allow public read access for rewards" ON "public"."loyalty_rewards" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Allow user access to their own cashier closings" ON "public"."cashier_closings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own employees" ON "public"."employees" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own halls" ON "public"."halls" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own ingredient categories" ON "public"."ingredient_categories" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own ingredients" ON "public"."ingredients" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own inventory movements" ON "public"."inventory_movements" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own order items" ON "public"."order_items" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own orders" ON "public"."orders" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own recipe categories" ON "public"."categories" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own recipe ingredients" ON "public"."recipe_ingredients" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own recipe preparations" ON "public"."recipe_preparations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own recipes" ON "public"."recipes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own stations" ON "public"."stations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own suppliers" ON "public"."suppliers" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own tables" ON "public"."tables" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user access to their own transactions" ON "public"."transactions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to delete their own comments" ON "public"."template_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to delete their own webhooks" ON "public"."webhooks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to insert their own webhooks" ON "public"."webhooks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to manage their own company profile" ON "public"."company_profile" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to manage their own purchase order items" ON "public"."purchase_order_items" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to manage their own purchase orders" ON "public"."purchase_orders" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to manage their own sub-recipe links" ON "public"."recipe_sub_recipes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to read their own subscription" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to see their own webhooks" ON "public"."webhooks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to update their own comments" ON "public"."template_comments" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to update their own webhooks" ON "public"."webhooks" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Anyone can create a reservation" ON "public"."reservations" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can manage their own reservations" ON "public"."reservations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their own settings" ON "public"."reservation_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can view employees" ON "public"."employees" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can view employees in their organization" ON "public"."employees" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees can manage their own leave requests" ON "public"."leave_requests" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."cashier_closings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."categories" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."employees" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."halls" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."ingredient_categories" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."ingredients" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."inventory_movements" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."order_items" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."orders" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."promotion_recipes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."promotions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."recipe_ingredients" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."recipe_preparations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."recipes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."stations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."suppliers" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."tables" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all access for authenticated users" ON "public"."transactions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable all for users based on user_id" ON "public"."time_clock_entries" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable delete for authenticated users" ON "public"."production_plans" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable delete for authenticated users" ON "public"."production_tasks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."production_plans" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."production_tasks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable read access for all users" ON "public"."company_profile" FOR SELECT USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."production_plans" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."production_tasks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable update for authenticated users" ON "public"."production_plans" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable update for authenticated users" ON "public"."production_tasks" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Managers can add new employees" ON "public"."employees" FOR INSERT WITH CHECK (((( SELECT 1
   FROM "public"."employees" "employees_1"
  WHERE (("employees_1"."user_id" = "auth"."uid"()) AND ("employees_1"."role" = 'Gerente'::"text"))
 LIMIT 1) = 1) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Managers can delete employees" ON "public"."employees" FOR DELETE USING (((( SELECT 1
   FROM "public"."employees" "employees_1"
  WHERE (("employees_1"."user_id" = "auth"."uid"()) AND ("employees_1"."role" = 'Gerente'::"text"))
 LIMIT 1) = 1) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Managers can manage employees" ON "public"."employees" USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_account_manager"()));



CREATE POLICY "Managers can update employee information" ON "public"."employees" FOR UPDATE USING (((( SELECT 1
   FROM "public"."employees" "employees_1"
  WHERE (("employees_1"."user_id" = "auth"."uid"()) AND ("employees_1"."role" = 'Gerente'::"text"))
 LIMIT 1) = 1) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Managers can view all leave requests" ON "public"."leave_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."employees"
  WHERE (("employees"."user_id" = "auth"."uid"()) AND ("employees"."role" = 'Gerente'::"text")))));



CREATE POLICY "Multi-tenant access policy" ON "public"."assets_depreciation" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."cashier_closings" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."company_profile" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."customers" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."employees" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."financial_categories" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."halls" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."ifood_webhook_logs" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."ingredients" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."inventory_adjustments" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."inventory_logs" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."order_items" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."orders" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."production_tasks" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."recipes" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."requisitions" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."reservations" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."schedules" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."suppliers" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."tables" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-tenant access policy" ON "public"."transactions" USING ("public"."has_access_to_store"("user_id")) WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Delete" ON "public"."cashier_closings" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."categories" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."company_profile" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."customers" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."delivery_drivers" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."employees" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."halls" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."ifood_menu_sync" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."ifood_webhook_logs" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."ingredient_categories" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."ingredients" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."inventory_lots" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."inventory_movements" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."label_logs" FOR DELETE USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Delete" ON "public"."leave_requests" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."loyalty_movements" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."loyalty_rewards" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."loyalty_settings" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."order_items" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."orders" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."payroll_adjustments" FOR DELETE USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Delete" ON "public"."portioning_event_outputs" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."portioning_events" "pe"
  WHERE (("pe"."id" = "portioning_event_outputs"."event_id") AND (("auth"."uid"() = "pe"."user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("pe"."user_id")::"text"))))));



CREATE POLICY "Multi-unit Access Delete" ON "public"."portioning_events" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."production_plans" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."production_tasks" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."promotion_recipes" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."promotions" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."purchase_order_items" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."purchase_orders" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."recipe_ingredients" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."recipe_preparations" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."recipe_sub_recipes" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."recipes" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."requisition_items" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."requisition_templates" FOR DELETE USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Delete" ON "public"."requisitions" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."reservation_settings" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."reservations" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."role_permissions" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."roles" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."schedules" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."shifts" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."station_stocks" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."stations" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."subscriptions" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."suppliers" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."tables" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."time_clock_entries" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."transactions" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete" ON "public"."webhooks" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Delete Items" ON "public"."requisition_template_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."requisition_templates" "rt"
  WHERE (("rt"."id" = "requisition_template_items"."template_id") AND "public"."has_access_to_store"("rt"."user_id")))));



CREATE POLICY "Multi-unit Access Delete checklist_templates" ON "public"."checklist_templates" FOR DELETE USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Delete equipment" ON "public"."equipment" FOR DELETE USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Insert" ON "public"."cashier_closings" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."categories" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."company_profile" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."customers" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."delivery_drivers" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."employees" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."halls" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."ifood_menu_sync" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."ifood_webhook_logs" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."ingredient_categories" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."ingredients" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."inventory_logs" FOR INSERT WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Insert" ON "public"."inventory_lots" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."inventory_movements" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."label_logs" FOR INSERT WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Insert" ON "public"."leave_requests" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."loyalty_movements" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."loyalty_rewards" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."loyalty_settings" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."order_items" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."orders" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."payroll_adjustments" FOR INSERT WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Insert" ON "public"."portioning_event_outputs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portioning_events" "pe"
  WHERE (("pe"."id" = "portioning_event_outputs"."event_id") AND (("auth"."uid"() = "pe"."user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("pe"."user_id")::"text"))))));



CREATE POLICY "Multi-unit Access Insert" ON "public"."portioning_events" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."production_plans" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."production_tasks" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."promotion_recipes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."promotions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."purchase_order_items" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."purchase_orders" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."recipe_ingredients" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."recipe_preparations" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."recipe_sub_recipes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."recipes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."requisition_items" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."requisition_templates" FOR INSERT WITH CHECK ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Insert" ON "public"."requisitions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."reservation_settings" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."reservations" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."role_permissions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."roles" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."schedules" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."shifts" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."station_stocks" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."stations" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."subscriptions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."suppliers" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."tables" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."time_clock_entries" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."transactions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert" ON "public"."webhooks" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Insert Items" ON "public"."requisition_template_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."requisition_templates" "rt"
  WHERE (("rt"."id" = "requisition_template_items"."template_id") AND "public"."has_access_to_store"("rt"."user_id")))));



CREATE POLICY "Multi-unit Access Insert checklist_logs" ON "public"."checklist_logs" FOR INSERT WITH CHECK ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Insert checklist_templates" ON "public"."checklist_templates" FOR INSERT WITH CHECK ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Insert equipment" ON "public"."equipment" FOR INSERT WITH CHECK ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Insert temperature_logs" ON "public"."temperature_logs" FOR INSERT WITH CHECK ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Select" ON "public"."cashier_closings" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."categories" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."company_profile" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."customers" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."delivery_drivers" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."employees" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."halls" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."ifood_menu_sync" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."ifood_webhook_logs" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."ingredient_categories" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."ingredients" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."inventory_logs" FOR SELECT USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Select" ON "public"."inventory_lots" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."inventory_movements" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."label_logs" FOR SELECT USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Select" ON "public"."leave_requests" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."loyalty_movements" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."loyalty_rewards" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."loyalty_settings" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."order_items" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."orders" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."payroll_adjustments" FOR SELECT USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Select" ON "public"."portioning_event_outputs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portioning_events" "pe"
  WHERE (("pe"."id" = "portioning_event_outputs"."event_id") AND (("auth"."uid"() = "pe"."user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("pe"."user_id")::"text"))))));



CREATE POLICY "Multi-unit Access Select" ON "public"."portioning_events" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."production_plans" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."production_tasks" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."promotion_recipes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."promotions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."purchase_order_items" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."purchase_orders" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."recipe_ingredients" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."recipe_preparations" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."recipe_sub_recipes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."recipes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."requisition_items" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."requisition_templates" FOR SELECT USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Select" ON "public"."requisitions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."reservation_settings" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."reservations" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."role_permissions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."roles" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."schedules" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."shifts" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."station_stocks" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."stations" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."subscriptions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."suppliers" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."tables" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."time_clock_entries" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."transactions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select" ON "public"."webhooks" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Select Items" ON "public"."requisition_template_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requisition_templates" "rt"
  WHERE (("rt"."id" = "requisition_template_items"."template_id") AND "public"."has_access_to_store"("rt"."user_id")))));



CREATE POLICY "Multi-unit Access Select checklist_logs" ON "public"."checklist_logs" FOR SELECT USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Select checklist_templates" ON "public"."checklist_templates" FOR SELECT USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Select equipment" ON "public"."equipment" FOR SELECT USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Select temperature_logs" ON "public"."temperature_logs" FOR SELECT USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Update" ON "public"."cashier_closings" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."categories" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."company_profile" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."customers" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."delivery_drivers" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."employees" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."halls" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."ifood_menu_sync" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."ifood_webhook_logs" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."ingredient_categories" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."ingredients" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."inventory_lots" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."inventory_movements" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."label_logs" FOR UPDATE USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Update" ON "public"."leave_requests" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."loyalty_movements" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."loyalty_rewards" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."loyalty_settings" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."order_items" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."orders" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."payroll_adjustments" FOR UPDATE USING ("public"."has_access_to_store"("user_id"));



CREATE POLICY "Multi-unit Access Update" ON "public"."portioning_event_outputs" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."portioning_events" "pe"
  WHERE (("pe"."id" = "portioning_event_outputs"."event_id") AND (("auth"."uid"() = "pe"."user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("pe"."user_id")::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portioning_events" "pe"
  WHERE (("pe"."id" = "portioning_event_outputs"."event_id") AND (("auth"."uid"() = "pe"."user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("pe"."user_id")::"text"))))));



CREATE POLICY "Multi-unit Access Update" ON "public"."portioning_events" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."production_plans" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."production_tasks" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."promotion_recipes" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."promotions" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."purchase_order_items" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."purchase_orders" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."recipe_ingredients" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."recipe_preparations" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."recipe_sub_recipes" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."recipes" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."requisition_items" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."requisitions" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."reservation_settings" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."reservations" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."role_permissions" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."roles" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."schedules" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."shifts" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."station_stocks" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."stations" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."subscriptions" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."suppliers" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."tables" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."time_clock_entries" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."transactions" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update" ON "public"."webhooks" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));



CREATE POLICY "Multi-unit Access Update checklist_logs" ON "public"."checklist_logs" FOR UPDATE USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Update checklist_templates" ON "public"."checklist_templates" FOR UPDATE USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Update equipment" ON "public"."equipment" FOR UPDATE USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Multi-unit Access Update temperature_logs" ON "public"."temperature_logs" FOR UPDATE USING ("public"."has_access_to_store"("store_id"));



CREATE POLICY "Perfis são visíveis para todos." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Permitir criação pública de itens de pedido" ON "public"."order_items" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir criação pública de pedidos" ON "public"."orders" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir inserção pública para testadores beta" ON "public"."beta_testers" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Permitir leitura de lojas" ON "public"."stores" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR (EXISTS ( SELECT 1
   FROM "public"."unit_permissions"
  WHERE (("unit_permissions"."manager_id" = "auth"."uid"()) AND ("unit_permissions"."store_id" = "stores"."id"))))));



CREATE POLICY "Permitir leitura pública" ON "public"."forum_edits" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública das permissões dos planos" ON "public"."plan_permissions" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública de categorias" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública de configurações de fidelidade" ON "public"."loyalty_settings" FOR SELECT USING (("is_enabled" = true));



CREATE POLICY "Permitir leitura pública de configurações de reserva" ON "public"."reservation_settings" FOR SELECT USING (("is_enabled" = true));



CREATE POLICY "Permitir leitura pública de estações" ON "public"."stations" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública de itens de pedido" ON "public"."order_items" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública de pedidos" ON "public"."orders" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública de promoções" ON "public"."promotions" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Permitir leitura pública de prêmios de fidelidade" ON "public"."loyalty_rewards" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Permitir leitura pública de receitas" ON "public"."recipes" FOR SELECT USING ((("is_available" = true) AND ("is_sub_recipe" = false)));



CREATE POLICY "Permitir leitura pública de receitas em promoção" ON "public"."promotion_recipes" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública do perfil da empresa" ON "public"."company_profile" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública dos planos" ON "public"."plans" FOR SELECT USING (true);



CREATE POLICY "Posts publicados são visíveis para todos." ON "public"."posts" FOR SELECT USING ((("published_at" IS NOT NULL) AND ("published_at" <= "now"())));



CREATE POLICY "Settings are public to read if enabled" ON "public"."reservation_settings" FOR SELECT USING (("is_enabled" = true));



CREATE POLICY "Stores can see their managers" ON "public"."unit_permissions" FOR SELECT USING (("auth"."uid"() = "store_id"));



CREATE POLICY "System cache is private" ON "public"."system_cache" USING (false);



CREATE POLICY "Templates publicados são visíveis para todos." ON "public"."templates" FOR SELECT USING ((("published_at" IS NOT NULL) AND ("published_at" <= "now"())));



CREATE POLICY "Users can delete requisition items of their own restaurant" ON "public"."requisition_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete requisitions of their own restaurant" ON "public"."requisitions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete station stocks of their own restaurant" ON "public"."station_stocks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own data" ON "public"."user_tool_data" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own stores" ON "public"."stores" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert requisition items for their own restaurant" ON "public"."requisition_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert requisitions for their own restaurant" ON "public"."requisitions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert station stocks for their own restaurant" ON "public"."station_stocks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own data" ON "public"."user_tool_data" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own stores" ON "public"."stores" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can manage permissions for their own roles." ON "public"."role_permissions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own customers" ON "public"."customers" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."cashier_closings" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."categories" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."employees" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."halls" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."ingredient_categories" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."ingredients" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."inventory_movements" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."order_items" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."orders" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."promotion_recipes" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."promotions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."recipe_ingredients" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."recipe_preparations" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."recipes" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."stations" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."suppliers" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."tables" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own data" ON "public"."transactions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own delivery drivers" ON "public"."delivery_drivers" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own employees" ON "public"."employees" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own inventory lots" ON "public"."inventory_lots" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own promotion recipes" ON "public"."promotion_recipes" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own promotions" ON "public"."promotions" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own roles." ON "public"."roles" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update requisition items of their own restaurant" ON "public"."requisition_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update requisitions of their own restaurant" ON "public"."requisitions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update station stocks of their own restaurant" ON "public"."station_stocks" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own data" ON "public"."user_tool_data" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile." ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own stores" ON "public"."stores" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view requisition items of their own restaurant" ON "public"."requisition_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view requisitions of their own restaurant" ON "public"."requisitions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view station stocks of their own restaurant" ON "public"."station_stocks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own data" ON "public"."user_tool_data" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own permissions" ON "public"."unit_permissions" FOR SELECT USING (("auth"."uid"() = "manager_id"));



CREATE POLICY "Users can view their own permissions" ON "public"."user_permissions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile." ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own stores" ON "public"."stores" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."unit_permissions"
  WHERE (("unit_permissions"."store_id" = "stores"."id") AND ("unit_permissions"."manager_id" = "auth"."uid"()))))));



CREATE POLICY "Usuários autenticados podem criar posts." ON "public"."posts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Usuários autenticados podem criar templates." ON "public"."templates" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Usuários podem atualizar seus próprios perfis." ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Usuários podem atualizar seus próprios posts." ON "public"."posts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem atualizar seus próprios templates." ON "public"."templates" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem criar seus próprios perfis." ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Usuários podem deletar seus próprios posts." ON "public"."posts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem deletar seus próprios templates." ON "public"."templates" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem visualizar seus próprios logs de webhook" ON "public"."ifood_webhook_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Visibilidade da Loja" ON "public"."stores" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR (EXISTS ( SELECT 1
   FROM "public"."unit_permissions"
  WHERE (("unit_permissions"."manager_id" = "auth"."uid"()) AND ("unit_permissions"."store_id" = "stores"."id"))))));



ALTER TABLE "public"."assets_depreciation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_testers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cashier_closings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checklist_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checklist_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_drivers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_edits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."halls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ifood_menu_sync" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ifood_webhook_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredient_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_lots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."label_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leave_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_rewards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portioning_event_outputs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portioning_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."realtime_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_preparations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_sub_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."requisition_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."requisition_template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."requisition_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."requisitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservation_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."station_stocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."temperature_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_clock_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unit_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_learning_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tool_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhooks" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































GRANT ALL ON FUNCTION "public"."acknowledge_attention"("item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."acknowledge_attention"("item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acknowledge_attention"("item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_stock"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_stock_by_lot"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text", "p_user_id" "uuid", "p_lot_id_for_exit" "uuid", "p_lot_number_for_entry" "text", "p_expiration_date_for_entry" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock_by_lot"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text", "p_user_id" "uuid", "p_lot_id_for_exit" "uuid", "p_lot_number_for_entry" "text", "p_expiration_date_for_entry" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock_by_lot"("p_ingredient_id" "uuid", "p_quantity_change" numeric, "p_reason" "text", "p_user_id" "uuid", "p_lot_id_for_exit" "uuid", "p_lot_number_for_entry" "text", "p_expiration_date_for_entry" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_and_delete_old_orders"() TO "anon";
GRANT ALL ON FUNCTION "public"."archive_and_delete_old_orders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_and_delete_old_orders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clean_system_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."clean_system_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clean_system_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_free_trial_subscription"("plan_id_to_subscribe" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_free_trial_subscription"("plan_id_to_subscribe" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_free_trial_subscription"("plan_id_to_subscribe" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_ingredient_with_lot"("p_user_id" "uuid", "p_name" "text", "p_unit" "text", "p_cost" numeric, "p_min_stock" numeric, "p_category_id" "uuid", "p_supplier_id" "uuid", "p_is_sellable" boolean, "p_price" numeric, "p_pos_category_id" "uuid", "p_station_id" "uuid", "p_proxy_recipe_id" "uuid", "p_initial_quantity" numeric, "p_lot_number" "text", "p_expiration_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_ingredient_with_lot"("p_user_id" "uuid", "p_name" "text", "p_unit" "text", "p_cost" numeric, "p_min_stock" numeric, "p_category_id" "uuid", "p_supplier_id" "uuid", "p_is_sellable" boolean, "p_price" numeric, "p_pos_category_id" "uuid", "p_station_id" "uuid", "p_proxy_recipe_id" "uuid", "p_initial_quantity" numeric, "p_lot_number" "text", "p_expiration_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ingredient_with_lot"("p_user_id" "uuid", "p_name" "text", "p_unit" "text", "p_cost" numeric, "p_min_stock" numeric, "p_category_id" "uuid", "p_supplier_id" "uuid", "p_is_sellable" boolean, "p_price" numeric, "p_pos_category_id" "uuid", "p_station_id" "uuid", "p_proxy_recipe_id" "uuid", "p_initial_quantity" numeric, "p_lot_number" "text", "p_expiration_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_new_store"("store_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_new_store"("store_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_new_store"("store_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_with_items"("p_restaurant_id" "uuid", "p_order_data" "jsonb", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_with_items"("p_restaurant_id" "uuid", "p_order_data" "jsonb", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_with_items"("p_restaurant_id" "uuid", "p_order_data" "jsonb", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_stock_for_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_stock_for_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_stock_for_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_store"("target_store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_store"("target_store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_store"("target_store_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_order_transaction"("p_order_id" "uuid", "p_user_id" "uuid", "p_table_id" "uuid", "p_payments" "jsonb", "p_closed_by_employee_id" "uuid", "p_tip_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_dre"("p_user_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_dre"("p_user_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_dre"("p_user_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_financial_summary"("p_user_id" "uuid", "p_start_date" timestamp without time zone, "p_end_date" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_financial_summary"("p_user_id" "uuid", "p_start_date" timestamp without time zone, "p_end_date" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_financial_summary"("p_user_id" "uuid", "p_start_date" timestamp without time zone, "p_end_date" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_menu_with_stock"("p_restaurant_id" "uuid", "p_is_available" boolean, "p_category_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_menu_with_stock"("p_restaurant_id" "uuid", "p_is_available" boolean, "p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_menu_with_stock"("p_restaurant_id" "uuid", "p_is_available" boolean, "p_category_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_store_managers"("store_id_input" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_store_managers"("store_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_store_managers"("store_id_input" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_active_permissions"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_active_permissions"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_active_permissions"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_leave_request_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_leave_request_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_leave_request_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_loyalty_points_on_order_completion"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_loyalty_points_on_order_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_loyalty_points_on_order_completion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_comunnity_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_comunnity_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_comunnity_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_plan_name" "text", "p_permissions" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_plan_name" "text", "p_permissions" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_plan_name" "text", "p_permissions" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_view_count"("topic_id_arg" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_view_count"("topic_id_arg" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_view_count"("topic_id_arg" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_manager_by_email"("email_input" "text", "role_input" "text", "store_id_input" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_manager_by_email"("email_input" "text", "role_input" "text", "store_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_manager_by_email"("email_input" "text", "role_input" "text", "store_id_input" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_account_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_account_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_account_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_system_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_system_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_system_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_edit_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_edit_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_edit_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_order_as_served"("order_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_order_as_served"("order_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_order_as_served"("order_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."moddatetime"() TO "anon";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_reward"("p_customer_id" "uuid", "p_reward_id" "uuid", "p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_reward"("p_customer_id" "uuid", "p_reward_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_reward"("p_customer_id" "uuid", "p_reward_id" "uuid", "p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."regenerate_external_api_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."regenerate_external_api_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."regenerate_external_api_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_store_manager"("permission_id_input" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_store_manager"("permission_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_store_manager"("permission_id_input" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_post_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_post_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_post_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify"("v" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify"("v" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify"("v" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_store_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_store_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_store_permissions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_comment_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_item_status"("item_id" "uuid", "new_status" "public"."order_item_status") TO "anon";
GRANT ALL ON FUNCTION "public"."update_item_status"("item_id" "uuid", "new_status" "public"."order_item_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_item_status"("item_id" "uuid", "new_status" "public"."order_item_status") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_last_movement_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_movement_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_movement_at"() TO "service_role";
























GRANT ALL ON TABLE "public"."assets_depreciation" TO "anon";
GRANT ALL ON TABLE "public"."assets_depreciation" TO "authenticated";
GRANT ALL ON TABLE "public"."assets_depreciation" TO "service_role";



GRANT ALL ON TABLE "public"."beta_testers" TO "anon";
GRANT ALL ON TABLE "public"."beta_testers" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_testers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."beta_testers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."beta_testers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."beta_testers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cashier_closings" TO "anon";
GRANT ALL ON TABLE "public"."cashier_closings" TO "authenticated";
GRANT ALL ON TABLE "public"."cashier_closings" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_logs" TO "anon";
GRANT ALL ON TABLE "public"."checklist_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_logs" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_templates" TO "anon";
GRANT ALL ON TABLE "public"."checklist_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_templates" TO "service_role";



GRANT ALL ON TABLE "public"."company_profile" TO "anon";
GRANT ALL ON TABLE "public"."company_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."company_profile" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_drivers" TO "anon";
GRANT ALL ON TABLE "public"."delivery_drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_drivers" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."equipment" TO "anon";
GRANT ALL ON TABLE "public"."equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment" TO "service_role";



GRANT ALL ON TABLE "public"."financial_categories" TO "anon";
GRANT ALL ON TABLE "public"."financial_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_categories" TO "service_role";



GRANT ALL ON TABLE "public"."forum_attachments" TO "anon";
GRANT ALL ON TABLE "public"."forum_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."forum_comments" TO "anon";
GRANT ALL ON TABLE "public"."forum_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_comments" TO "service_role";



GRANT ALL ON TABLE "public"."forum_edits" TO "anon";
GRANT ALL ON TABLE "public"."forum_edits" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_edits" TO "service_role";



GRANT ALL ON TABLE "public"."forum_topics" TO "anon";
GRANT ALL ON TABLE "public"."forum_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_topics" TO "service_role";



GRANT ALL ON TABLE "public"."halls" TO "anon";
GRANT ALL ON TABLE "public"."halls" TO "authenticated";
GRANT ALL ON TABLE "public"."halls" TO "service_role";



GRANT ALL ON TABLE "public"."ifood_menu_sync" TO "anon";
GRANT ALL ON TABLE "public"."ifood_menu_sync" TO "authenticated";
GRANT ALL ON TABLE "public"."ifood_menu_sync" TO "service_role";



GRANT ALL ON TABLE "public"."ifood_webhook_logs" TO "anon";
GRANT ALL ON TABLE "public"."ifood_webhook_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ifood_webhook_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ingredient_categories" TO "anon";
GRANT ALL ON TABLE "public"."ingredient_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredient_categories" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_logs" TO "anon";
GRANT ALL ON TABLE "public"."inventory_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_logs" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_lots" TO "anon";
GRANT ALL ON TABLE "public"."inventory_lots" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_lots" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."label_logs" TO "anon";
GRANT ALL ON TABLE "public"."label_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."label_logs" TO "service_role";



GRANT ALL ON TABLE "public"."leave_requests" TO "anon";
GRANT ALL ON TABLE "public"."leave_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_requests" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_movements" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_movements" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_rewards" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_settings" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_settings" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."payroll_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."plan_permissions" TO "anon";
GRANT ALL ON TABLE "public"."plan_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."portioning_event_outputs" TO "anon";
GRANT ALL ON TABLE "public"."portioning_event_outputs" TO "authenticated";
GRANT ALL ON TABLE "public"."portioning_event_outputs" TO "service_role";



GRANT ALL ON TABLE "public"."portioning_events" TO "anon";
GRANT ALL ON TABLE "public"."portioning_events" TO "authenticated";
GRANT ALL ON TABLE "public"."portioning_events" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."production_plans" TO "anon";
GRANT ALL ON TABLE "public"."production_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."production_plans" TO "service_role";



GRANT ALL ON TABLE "public"."production_tasks" TO "anon";
GRANT ALL ON TABLE "public"."production_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."production_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_recipes" TO "anon";
GRANT ALL ON TABLE "public"."promotion_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."promotions" TO "anon";
GRANT ALL ON TABLE "public"."promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotions" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."realtime_events" TO "anon";
GRANT ALL ON TABLE "public"."realtime_events" TO "authenticated";
GRANT ALL ON TABLE "public"."realtime_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."realtime_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."realtime_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."realtime_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_preparations" TO "anon";
GRANT ALL ON TABLE "public"."recipe_preparations" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_preparations" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_sub_recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipe_sub_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_sub_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."requisition_items" TO "anon";
GRANT ALL ON TABLE "public"."requisition_items" TO "authenticated";
GRANT ALL ON TABLE "public"."requisition_items" TO "service_role";



GRANT ALL ON TABLE "public"."requisition_template_items" TO "anon";
GRANT ALL ON TABLE "public"."requisition_template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."requisition_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."requisition_templates" TO "anon";
GRANT ALL ON TABLE "public"."requisition_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."requisition_templates" TO "service_role";



GRANT ALL ON TABLE "public"."requisitions" TO "anon";
GRANT ALL ON TABLE "public"."requisitions" TO "authenticated";
GRANT ALL ON TABLE "public"."requisitions" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_settings" TO "anon";
GRANT ALL ON TABLE "public"."reservation_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_settings" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "anon";
GRANT ALL ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."schedules" TO "anon";
GRANT ALL ON TABLE "public"."schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."schedules" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



GRANT ALL ON TABLE "public"."station_stocks" TO "anon";
GRANT ALL ON TABLE "public"."station_stocks" TO "authenticated";
GRANT ALL ON TABLE "public"."station_stocks" TO "service_role";



GRANT ALL ON TABLE "public"."stations" TO "anon";
GRANT ALL ON TABLE "public"."stations" TO "authenticated";
GRANT ALL ON TABLE "public"."stations" TO "service_role";



GRANT ALL ON TABLE "public"."stores" TO "anon";
GRANT ALL ON TABLE "public"."stores" TO "authenticated";
GRANT ALL ON TABLE "public"."stores" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."system_admins" TO "anon";
GRANT ALL ON TABLE "public"."system_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."system_admins" TO "service_role";



GRANT ALL ON TABLE "public"."system_cache" TO "anon";
GRANT ALL ON TABLE "public"."system_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."system_cache" TO "service_role";



GRANT ALL ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT ALL ON TABLE "public"."temperature_logs" TO "anon";
GRANT ALL ON TABLE "public"."temperature_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."temperature_logs" TO "service_role";



GRANT ALL ON TABLE "public"."template_comments" TO "anon";
GRANT ALL ON TABLE "public"."template_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."template_comments" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."templates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."templates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."templates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."time_clock_entries" TO "anon";
GRANT ALL ON TABLE "public"."time_clock_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."time_clock_entries" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."unit_permissions" TO "anon";
GRANT ALL ON TABLE "public"."unit_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."user_learning_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_learning_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_learning_progress" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_learning_progress_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_learning_progress_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_learning_progress_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_permissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_permissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_permissions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_tool_data" TO "anon";
GRANT ALL ON TABLE "public"."user_tool_data" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tool_data" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_secrets" TO "anon";
GRANT ALL ON TABLE "public"."webhook_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_secrets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."webhook_secrets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."webhook_secrets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."webhook_secrets_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."webhooks" TO "anon";
GRANT ALL ON TABLE "public"."webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."webhooks" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;

-- iFood Options Support
CREATE TABLE IF NOT EXISTS "public"."ifood_option_groups" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES "public"."stores"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "external_code" text,
    "min_required" integer DEFAULT 0,
    "max_options" integer DEFAULT 1,
    "sequence" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    "ifood_id" text
);

CREATE TABLE IF NOT EXISTS "public"."ifood_options" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES "public"."stores"("id") ON DELETE CASCADE,
    "ifood_option_group_id" uuid NOT NULL REFERENCES "public"."ifood_option_groups"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "external_code" text,
    "price" numeric(10,2) DEFAULT 0,
    "sequence" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    "ifood_product_id" text,
    "ifood_option_id" text
);

CREATE TABLE IF NOT EXISTS "public"."recipe_ifood_option_groups" (
    "recipe_id" uuid NOT NULL REFERENCES "public"."recipes"("id") ON DELETE CASCADE,
    "ifood_option_group_id" uuid NOT NULL REFERENCES "public"."ifood_option_groups"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "public"."stores"("id") ON DELETE CASCADE,
    PRIMARY KEY ("recipe_id", "ifood_option_group_id")
);

ALTER TABLE "public"."ifood_option_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ifood_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipe_ifood_option_groups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for authenticated users" ON "public"."ifood_option_groups" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Enable all access for authenticated users" ON "public"."ifood_options" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Enable all access for authenticated users" ON "public"."recipe_ifood_option_groups" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Permitir leitura publica" ON "public"."ifood_option_groups" FOR SELECT USING (true);
CREATE POLICY "Permitir leitura publica" ON "public"."ifood_options" FOR SELECT USING (true);
CREATE POLICY "Permitir leitura publica" ON "public"."recipe_ifood_option_groups" FOR SELECT USING (true);
