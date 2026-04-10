-- 1. Remover políticas que concedem acesso total público indevidamente
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."categories";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."employees";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."halls";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."ingredient_categories";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."ingredients";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."inventory_movements";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."order_items";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."orders";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."recipe_ingredients";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."recipes";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."stations";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."suppliers";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."tables";
DROP POLICY IF EXISTS "Permitir acesso total publico" ON "public"."transactions";

DROP POLICY IF EXISTS "Permitir acesso total publico aos fornecedores" ON "public"."suppliers";
DROP POLICY IF EXISTS "Permitir acesso total publico aos itens de pedido" ON "public"."order_items";
DROP POLICY IF EXISTS "Permitir acesso total publico aos pedidos" ON "public"."orders";
DROP POLICY IF EXISTS "Permitir acesso total publico aos saloes" ON "public"."halls";
DROP POLICY IF EXISTS "Permitir acesso total publico as categorias" ON "public"."categories";
DROP POLICY IF EXISTS "Permitir acesso total publico as categorias de ingredientes" ON "public"."ingredient_categories";
DROP POLICY IF EXISTS "Permitir acesso total publico as estacoes" ON "public"."stations";
DROP POLICY IF EXISTS "Permitir acesso total publico as mesas" ON "public"."tables";
DROP POLICY IF EXISTS "Permitir acesso total publico as receitas" ON "public"."recipes";
DROP POLICY IF EXISTS "Permitir acesso total publico as transacoes" ON "public"."transactions";

DROP POLICY IF EXISTS "Allow full public access to tables" ON "public"."tables";
DROP POLICY IF EXISTS "Allow public creation of orders" ON "public"."orders";
DROP POLICY IF EXISTS "Enable all access for all users" ON "public"."recipe_preparations";

-- 2. Remover políticas públicas perigosas em tabelas sensíveis
DROP POLICY IF EXISTS "Permitir inserção pública na tabela de fechamentos" ON "public"."cashier_closings";
DROP POLICY IF EXISTS "Permitir leitura pública na tabela de fechamentos" ON "public"."cashier_closings";
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."webhook_secrets";

-- 3. Adicionar políticas Multi-tenant para tabelas que estavam dependendo das políticas públicas
-- Para inventory_movements
CREATE POLICY "Multi-unit Access Select" ON "public"."inventory_movements" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));
CREATE POLICY "Multi-unit Access Insert" ON "public"."inventory_movements" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));
CREATE POLICY "Multi-unit Access Update" ON "public"."inventory_movements" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));
CREATE POLICY "Multi-unit Access Delete" ON "public"."inventory_movements" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));

-- Para time_clock_entries
CREATE POLICY "Multi-unit Access Select" ON "public"."time_clock_entries" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));
CREATE POLICY "Multi-unit Access Insert" ON "public"."time_clock_entries" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));
CREATE POLICY "Multi-unit Access Update" ON "public"."time_clock_entries" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));
CREATE POLICY "Multi-unit Access Delete" ON "public"."time_clock_entries" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));
