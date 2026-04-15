-- ===============================================================
-- CHEFOS SECURITY HARDENING - PROTEÇÃO CONTRA FRAUDES E VAZAMENTOS
-- ===============================================================
-- Este script blinda o sistema de delivery contra ataques comuns.
-- Execute este código no SQL Editor do seu painel Supabase.

-- 1. PROTEÇÃO CONTRA FRAUDE DE PREÇOS
-- Impede que um hacker altere o preço de um item no navegador antes de enviar o pedido.
CREATE OR REPLACE FUNCTION public.validate_order_item_price()
RETURNS TRIGGER AS $$
DECLARE
    real_price DECIMAL;
    recipe_user_id UUID;
BEGIN
    -- 1. Busca o preço real e o dono da receita
    SELECT price, user_id INTO real_price, recipe_user_id 
    FROM public.recipes 
    WHERE id = NEW.recipe_id;
    
    -- 2. Verifica se a receita existe
    IF real_price IS NULL THEN
        RAISE EXCEPTION 'Receita inválida ou inexistente (ID: %)', NEW.recipe_id;
    END IF;

    -- 3. Validação de Segurança: O preço enviado não pode ser menor que o preço oficial
    -- Permitimos uma pequena margem para arredondamentos se necessário, mas não para descontos não autorizados.
    IF NEW.price < (real_price - 0.01) THEN
        RAISE EXCEPTION 'FRAUDE DETECTADA: O preço enviado (R$ %) é menor que o preço oficial (R$ %)', NEW.price, real_price;
    END IF;

    -- 4. Validação de Tenant: Garante que o item pertence ao mesmo dono do pedido
    IF NEW.user_id != recipe_user_id THEN
        RAISE EXCEPTION 'Tentativa de injeção de item de outro restaurante detectada.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ativa o gatilho de validação
DROP TRIGGER IF EXISTS tr_validate_order_item_price ON public.order_items;
CREATE TRIGGER tr_validate_order_item_price
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_price();


-- 2. BLINDAGEM DE DADOS (RLS)
-- Removemos as políticas "abertas" e aplicamos regras restritivas.

-- Hardening Orders: Público pode inserir, mas NUNCA listar todos os pedidos.
DROP POLICY IF EXISTS "Permitir leitura pública de pedidos" ON "public"."orders";
CREATE POLICY "Permitir leitura pública de pedidos" ON "public"."orders" 
FOR SELECT USING (false); -- Bloqueia 'SELECT * FROM orders' para o público.

DROP POLICY IF EXISTS "Permitir criação pública de pedidos" ON "public"."orders";
CREATE POLICY "Permitir criação pública de pedidos" ON "public"."orders"
FOR INSERT WITH CHECK (true); -- Permite apenas a criação.

-- Hardening Order Items: Público pode inserir, mas nunca bisbilhotar itens de outros.
DROP POLICY IF EXISTS "Permitir leitura pública de itens de pedido" ON "public"."order_items";
CREATE POLICY "Permitir leitura pública de itens de pedido" ON "public"."order_items" 
FOR SELECT USING (false); -- Bloqueia 'SELECT * FROM order_items' para o público.

DROP POLICY IF EXISTS "Permitir criação pública de itens de pedido" ON "public"."order_items";
CREATE POLICY "Permitir criação pública de itens de pedido" ON "public"."order_items"
FOR INSERT WITH CHECK (true);


-- 3. SEGURANÇA DE INFRAESTRUTURA (GRANTS)
-- Garante que o usuário anônimo tenha apenas o mínimo necessário.

-- Revoga permissões desnecessárias por segurança (opcional, mas recomendado)
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Concede apenas o essencial para o cardápio funcionar
GRANT SELECT ON TABLE "public"."company_profile" TO anon;
GRANT SELECT ON TABLE "public"."recipes" TO anon;
GRANT SELECT ON TABLE "public"."categories" TO anon;
GRANT SELECT ON TABLE "public"."promotions" TO anon;
GRANT SELECT ON TABLE "public"."promotion_recipes" TO anon;
GRANT SELECT ON TABLE "public"."loyalty_settings" TO anon;
GRANT SELECT ON TABLE "public"."loyalty_rewards" TO anon;
GRANT SELECT ON TABLE "public"."reservation_settings" TO anon;
GRANT SELECT ON TABLE "public"."stations" TO anon;

-- Permissões de escrita controlada
GRANT INSERT ON TABLE "public"."orders" TO anon;
GRANT INSERT ON TABLE "public"."order_items" TO anon;

-- 4. LOG DE SEGURANÇA (Opcional)
-- Você pode criar uma tabela de 'security_logs' para registrar as tentativas de fraude bloqueadas pelo trigger acima.
