-- Modifiers and Add-ons Schema

-- 1. Modifier Groups (e.g., "Choose your sauce", "Extra toppings")
CREATE TABLE IF NOT EXISTS "public"."modifier_groups" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "min_required" INTEGER DEFAULT 0,
    "max_allowed" INTEGER DEFAULT 1,
    "created_at" TIMESTAMPTZ DEFAULT now()
);

-- 2. Modifiers (e.g., "Ketchup", "Extra Cheese")
CREATE TABLE IF NOT EXISTS "public"."modifiers" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "group_id" UUID NOT NULL REFERENCES "public"."modifier_groups"(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "extra_price" NUMERIC(10,2) DEFAULT 0.00,
    "is_available" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT now()
);

-- 3. Link Recipes to Modifier Groups
CREATE TABLE IF NOT EXISTS "public"."recipe_modifier_groups" (
    "recipe_id" UUID NOT NULL REFERENCES "public"."recipes"(id) ON DELETE CASCADE,
    "modifier_group_id" UUID NOT NULL REFERENCES "public"."modifier_groups"(id) ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY ("recipe_id", "modifier_group_id")
);

-- 4. Order Item Modifiers (Selected modifiers for a specific order item)
CREATE TABLE IF NOT EXISTS "public"."order_item_modifiers" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL REFERENCES "public"."order_items"(id) ON DELETE CASCADE,
    "modifier_id" UUID REFERENCES "public"."modifiers"(id) ON DELETE SET NULL,
    "name" TEXT NOT NULL, -- Snapshot of name
    "price" NUMERIC(10,2) NOT NULL, -- Snapshot of price
    "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "created_at" TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies

ALTER TABLE "public"."modifier_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."modifiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipe_modifier_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_item_modifiers" ENABLE ROW LEVEL SECURITY;

-- Modifier Groups Policies
CREATE POLICY "Users can manage their own modifier groups" ON "public"."modifier_groups"
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public can view modifier groups" ON "public"."modifier_groups"
    FOR SELECT USING (true);

-- Modifiers Policies
CREATE POLICY "Users can manage their own modifiers" ON "public"."modifiers"
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public can view modifiers" ON "public"."modifiers"
    FOR SELECT USING (true);

-- Recipe Modifier Groups Policies
CREATE POLICY "Users can manage their own recipe modifier groups" ON "public"."recipe_modifier_groups"
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public can view recipe modifier groups" ON "public"."recipe_modifier_groups"
    FOR SELECT USING (true);

-- Order Item Modifiers Policies
CREATE POLICY "Users can manage their own order item modifiers" ON "public"."order_item_modifiers"
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public can insert order item modifiers" ON "public"."order_item_modifiers"
    FOR INSERT WITH CHECK (true);

-- Grants
GRANT ALL ON TABLE "public"."modifier_groups" TO authenticated;
GRANT ALL ON TABLE "public"."modifiers" TO authenticated;
GRANT ALL ON TABLE "public"."recipe_modifier_groups" TO authenticated;
GRANT ALL ON TABLE "public"."order_item_modifiers" TO authenticated;

GRANT SELECT ON TABLE "public"."modifier_groups" TO anon;
GRANT SELECT ON TABLE "public"."modifiers" TO anon;
GRANT SELECT ON TABLE "public"."recipe_modifier_groups" TO anon;
GRANT INSERT, SELECT ON TABLE "public"."order_item_modifiers" TO anon;
