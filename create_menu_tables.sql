-- Execute the following in the Supabase SQL Editor

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

-- Ensure menu_categories has proper fields
ALTER TABLE IF EXISTS public.menu_categories ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE IF EXISTS public.menu_categories ADD COLUMN IF NOT EXISTS menu_id uuid;
ALTER TABLE IF EXISTS public.menu_categories ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    menu_id uuid,
    name text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

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

-- ADD FOREIGN KEYS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_categories_menu_id_fkey') THEN
        ALTER TABLE public.menu_categories ADD CONSTRAINT menu_categories_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menus(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_menu_category_id_fkey') THEN
        ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_menu_category_id_fkey FOREIGN KEY (menu_category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_recipe_id_fkey') THEN
        ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_option_groups_menu_item_id_fkey') THEN
        ALTER TABLE public.menu_item_option_groups ADD CONSTRAINT menu_item_option_groups_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_option_choices_menu_item_option_id_fkey') THEN
        ALTER TABLE public.menu_item_option_choices ADD CONSTRAINT menu_item_option_choices_menu_item_option_id_fkey FOREIGN KEY (menu_item_option_id) REFERENCES public.menu_item_option_groups(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_option_choices_recipe_id_fkey') THEN
        ALTER TABLE public.menu_item_option_choices ADD CONSTRAINT menu_item_option_choices_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ENABLE RLS (Row Level Security) and Policies
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
