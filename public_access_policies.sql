-- Habilitar leitura pública para o cardápio online
-- Estas políticas permitem que usuários não autenticados vejam o cardápio, promoções e fidelidade

-- 1. Receitas (Apenas as disponíveis e que não são sub-receitas)
DROP POLICY IF EXISTS "Permitir leitura pública de receitas" ON "public"."recipes";
CREATE POLICY "Permitir leitura pública de receitas" ON "public"."recipes"
FOR SELECT USING (is_available = true AND is_sub_recipe = false);

-- 2. Categorias
DROP POLICY IF EXISTS "Permitir leitura pública de categorias" ON "public"."categories";
CREATE POLICY "Permitir leitura pública de categorias" ON "public"."categories"
FOR SELECT USING (true);

-- 3. Promoções (Apenas as ativas)
DROP POLICY IF EXISTS "Permitir leitura pública de promoções" ON "public"."promotions";
CREATE POLICY "Permitir leitura pública de promoções" ON "public"."promotions"
FOR SELECT USING (is_active = true);

-- 4. Receitas em Promoção
DROP POLICY IF EXISTS "Permitir leitura pública de receitas em promoção" ON "public"."promotion_recipes";
CREATE POLICY "Permitir leitura pública de receitas em promoção" ON "public"."promotion_recipes"
FOR SELECT USING (true);

-- 5. Configurações de Fidelidade (Apenas se habilitado)
DROP POLICY IF EXISTS "Permitir leitura pública de configurações de fidelidade" ON "public"."loyalty_settings";
CREATE POLICY "Permitir leitura pública de configurações de fidelidade" ON "public"."loyalty_settings"
FOR SELECT USING (is_enabled = true);

-- 6. Prêmios de Fidelidade (Apenas os ativos)
DROP POLICY IF EXISTS "Permitir leitura pública de prêmios de fidelidade" ON "public"."loyalty_rewards";
CREATE POLICY "Permitir leitura pública de prêmios de fidelidade" ON "public"."loyalty_rewards"
FOR SELECT USING (is_active = true);

-- 7. Perfil da Empresa
DROP POLICY IF EXISTS "Permitir leitura pública do perfil da empresa" ON "public"."company_profile";
CREATE POLICY "Permitir leitura pública do perfil da empresa" ON "public"."company_profile"
FOR SELECT USING (true);

-- 8. Configurações de Reserva (Apenas se habilitado)
DROP POLICY IF EXISTS "Permitir leitura pública de configurações de reserva" ON "public"."reservation_settings";
CREATE POLICY "Permitir leitura pública de configurações de reserva" ON "public"."reservation_settings"
FOR SELECT USING (is_enabled = true);

-- 9. Criação de Pedidos (Delivery/Pickup Público)
GRANT SELECT ON TABLE "public"."company_profile" TO anon;
GRANT SELECT ON TABLE "public"."recipes" TO anon;
GRANT SELECT ON TABLE "public"."categories" TO anon;
GRANT SELECT ON TABLE "public"."promotions" TO anon;
GRANT SELECT ON TABLE "public"."promotion_recipes" TO anon;
GRANT SELECT ON TABLE "public"."loyalty_settings" TO anon;
GRANT SELECT ON TABLE "public"."loyalty_rewards" TO anon;
GRANT SELECT ON TABLE "public"."reservation_settings" TO anon;
GRANT INSERT, SELECT ON TABLE "public"."orders" TO anon;
GRANT INSERT, SELECT ON TABLE "public"."order_items" TO anon;

DROP POLICY IF EXISTS "Permitir criação pública de pedidos" ON "public"."orders";
CREATE POLICY "Permitir criação pública de pedidos" ON "public"."orders"
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura pública de pedidos" ON "public"."orders";
CREATE POLICY "Permitir leitura pública de pedidos" ON "public"."orders"
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir criação pública de itens de pedido" ON "public"."order_items";
CREATE POLICY "Permitir criação pública de itens de pedido" ON "public"."order_items"
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura pública de itens de pedido" ON "public"."order_items";
CREATE POLICY "Permitir leitura pública de itens de pedido" ON "public"."order_items"
FOR SELECT USING (true);
