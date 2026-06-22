-- MULTI-UNIT ACCESS POLICIES PARA O CARDÁPIO (MENUS E DERIVADOS)
-- Este script permite o suporte completo a multi-filiais nas tabelas do criador de cardápios.

DO $$ 
BEGIN

-- 1. MENUS
DROP POLICY IF EXISTS "Multi-unit Access Insert menus" ON "public"."menus";
CREATE POLICY "Multi-unit Access Insert menus" ON "public"."menus" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

DROP POLICY IF EXISTS "Multi-unit Access Update menus" ON "public"."menus";
CREATE POLICY "Multi-unit Access Update menus" ON "public"."menus" FOR UPDATE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));

DROP POLICY IF EXISTS "Multi-unit Access Delete menus" ON "public"."menus";
CREATE POLICY "Multi-unit Access Delete menus" ON "public"."menus" FOR DELETE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

-- 2. MENU CATEGORIES
DROP POLICY IF EXISTS "Multi-unit Access Insert menu_categories" ON "public"."menu_categories";
CREATE POLICY "Multi-unit Access Insert menu_categories" ON "public"."menu_categories" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

DROP POLICY IF EXISTS "Multi-unit Access Update menu_categories" ON "public"."menu_categories";
CREATE POLICY "Multi-unit Access Update menu_categories" ON "public"."menu_categories" FOR UPDATE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));

DROP POLICY IF EXISTS "Multi-unit Access Delete menu_categories" ON "public"."menu_categories";
CREATE POLICY "Multi-unit Access Delete menu_categories" ON "public"."menu_categories" FOR DELETE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

-- 3. MENU ITEMS
DROP POLICY IF EXISTS "Multi-unit Access Insert menu_items" ON "public"."menu_items";
CREATE POLICY "Multi-unit Access Insert menu_items" ON "public"."menu_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

DROP POLICY IF EXISTS "Multi-unit Access Update menu_items" ON "public"."menu_items";
CREATE POLICY "Multi-unit Access Update menu_items" ON "public"."menu_items" FOR UPDATE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));

DROP POLICY IF EXISTS "Multi-unit Access Delete menu_items" ON "public"."menu_items";
CREATE POLICY "Multi-unit Access Delete menu_items" ON "public"."menu_items" FOR DELETE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

-- 4. MENU ITEM OPTION GROUPS
DROP POLICY IF EXISTS "Multi-unit Access Insert menu_item_option_groups" ON "public"."menu_item_option_groups";
CREATE POLICY "Multi-unit Access Insert menu_item_option_groups" ON "public"."menu_item_option_groups" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

DROP POLICY IF EXISTS "Multi-unit Access Update menu_item_option_groups" ON "public"."menu_item_option_groups";
CREATE POLICY "Multi-unit Access Update menu_item_option_groups" ON "public"."menu_item_option_groups" FOR UPDATE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));

DROP POLICY IF EXISTS "Multi-unit Access Delete menu_item_option_groups" ON "public"."menu_item_option_groups";
CREATE POLICY "Multi-unit Access Delete menu_item_option_groups" ON "public"."menu_item_option_groups" FOR DELETE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

-- 5. MENU ITEM OPTION CHOICES
DROP POLICY IF EXISTS "Multi-unit Access Insert menu_item_option_choices" ON "public"."menu_item_option_choices";
CREATE POLICY "Multi-unit Access Insert menu_item_option_choices" ON "public"."menu_item_option_choices" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

DROP POLICY IF EXISTS "Multi-unit Access Update menu_item_option_choices" ON "public"."menu_item_option_choices";
CREATE POLICY "Multi-unit Access Update menu_item_option_choices" ON "public"."menu_item_option_choices" FOR UPDATE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text")));

DROP POLICY IF EXISTS "Multi-unit Access Delete menu_item_option_choices" ON "public"."menu_item_option_choices";
CREATE POLICY "Multi-unit Access Delete menu_item_option_choices" ON "public"."menu_item_option_choices" FOR DELETE USING (("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") -> 'stores'::"text"), '[]'::"jsonb") ? ("user_id")::"text"));

END $$;
