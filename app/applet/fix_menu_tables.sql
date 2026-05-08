-- Fix script for Menu tables

-- 1. Create or update menus
CREATE TABLE IF NOT EXISTS public.menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    type text DEFAULT 'online' NOT NULL,
    availability_hours jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Ensure required columns on menus
ALTER TABLE public.menus ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.menus ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.menus ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.menus ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.menus ADD COLUMN IF NOT EXISTS type text DEFAULT 'online' NOT NULL;
ALTER TABLE public.menus ADD COLUMN IF NOT EXISTS availability_hours jsonb;

-- 2. Create or update menu_categories
CREATE TABLE IF NOT EXISTS public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    menu_id uuid,
    name text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Ensure required columns on menu_categories
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS menu_id uuid;
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL;

-- 3. Create or update menu_items
CREATE TABLE IF NOT EXISTS public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    menu_category_id uuid,
    recipe_id uuid,
    custom_name text,
    custom_description text,
    custom_price numeric,
    custom_image_url text,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Ensure required columns on menu_items exist
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS menu_category_id uuid;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS recipe_id uuid;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS custom_name text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS custom_description text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS custom_price numeric;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS custom_image_url text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- Relax old constraints (if they exist from a legacy version)
DO $$
BEGIN
    BEGIN ALTER TABLE public.menu_items ALTER COLUMN category_id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN END;
    BEGIN ALTER TABLE public.menu_items ALTER COLUMN name DROP NOT NULL; EXCEPTION WHEN OTHERS THEN END;
    BEGIN ALTER TABLE public.menu_items ALTER COLUMN price DROP NOT NULL; EXCEPTION WHEN OTHERS THEN END;
    BEGIN ALTER TABLE public.menu_items ALTER COLUMN "order" DROP NOT NULL; EXCEPTION WHEN OTHERS THEN END;
END $$;


-- 4. Create or update menu_item_option_groups
CREATE TABLE IF NOT EXISTS public.menu_item_option_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    menu_item_id uuid,
    name text NOT NULL,
    min_choices integer DEFAULT 0 NOT NULL,
    max_choices integer DEFAULT 1 NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.menu_item_option_groups ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.menu_item_option_groups ADD COLUMN IF NOT EXISTS menu_item_id uuid;
ALTER TABLE public.menu_item_option_groups ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.menu_item_option_groups ADD COLUMN IF NOT EXISTS min_choices integer DEFAULT 0 NOT NULL;
ALTER TABLE public.menu_item_option_groups ADD COLUMN IF NOT EXISTS max_choices integer DEFAULT 1 NOT NULL;
ALTER TABLE public.menu_item_option_groups ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL;

-- 5. Create or update menu_item_option_choices
CREATE TABLE IF NOT EXISTS public.menu_item_option_choices (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    menu_item_option_id uuid,
    recipe_id uuid,
    custom_name text,
    additional_price numeric DEFAULT 0 NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.menu_item_option_choices ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.menu_item_option_choices ADD COLUMN IF NOT EXISTS menu_item_option_id uuid;
ALTER TABLE public.menu_item_option_choices ADD COLUMN IF NOT EXISTS recipe_id uuid;
ALTER TABLE public.menu_item_option_choices ADD COLUMN IF NOT EXISTS custom_name text;
ALTER TABLE public.menu_item_option_choices ADD COLUMN IF NOT EXISTS additional_price numeric DEFAULT 0 NOT NULL;
ALTER TABLE public.menu_item_option_choices ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL;

-- 6. Setup RLS
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all based on user_id" ON public.menus;
CREATE POLICY "Enable all based on user_id" ON public.menus FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all based on user_id" ON public.menu_categories;
CREATE POLICY "Enable all based on user_id" ON public.menu_categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all based on user_id" ON public.menu_items;
CREATE POLICY "Enable all based on user_id" ON public.menu_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.menu_item_option_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all based on user_id" ON public.menu_item_option_groups;
CREATE POLICY "Enable all based on user_id" ON public.menu_item_option_groups FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.menu_item_option_choices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all based on user_id" ON public.menu_item_option_choices;
CREATE POLICY "Enable all based on user_id" ON public.menu_item_option_choices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Also allow reads for unauthenticated users if it's meant to be a public facing menu:
DROP POLICY IF EXISTS "Enable read access for all users" ON public.menus;
CREATE POLICY "Enable read access for all users" ON public.menus FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.menu_categories;
CREATE POLICY "Enable read access for all users" ON public.menu_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.menu_items;
CREATE POLICY "Enable read access for all users" ON public.menu_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.menu_item_option_groups;
CREATE POLICY "Enable read access for all users" ON public.menu_item_option_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.menu_item_option_choices;
CREATE POLICY "Enable read access for all users" ON public.menu_item_option_choices FOR SELECT USING (true);

-- Reload schema cache
NOTIFY pgrst, reload_schema;
