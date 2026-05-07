
-- Ensure all columns exist in menus
ALTER TABLE IF EXISTS public.menus ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE IF EXISTS public.menus ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE IF EXISTS public.menus ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE IF EXISTS public.menus ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE IF EXISTS public.menus ADD COLUMN IF NOT EXISTS type text DEFAULT 'online' NOT NULL;
ALTER TABLE IF EXISTS public.menus ADD COLUMN IF NOT EXISTS availability_hours jsonb;

-- Ensure all columns exist in menu_items
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS menu_category_id uuid;
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS recipe_id uuid;
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS custom_name text;
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS custom_description text;
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS custom_price numeric;
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS custom_image_url text;
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL;
ALTER TABLE IF EXISTS public.menu_items ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- Reload schema cache
NOTIFY pgrst, reload_schema;

-- Ensure all columns exist in menu_item_option_groups
ALTER TABLE IF EXISTS public.menu_item_option_groups ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE IF EXISTS public.menu_item_option_groups ADD COLUMN IF NOT EXISTS menu_item_id uuid;
ALTER TABLE IF EXISTS public.menu_item_option_groups ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE IF EXISTS public.menu_item_option_groups ADD COLUMN IF NOT EXISTS min_choices integer DEFAULT 0 NOT NULL;
ALTER TABLE IF EXISTS public.menu_item_option_groups ADD COLUMN IF NOT EXISTS max_choices integer DEFAULT 1 NOT NULL;
ALTER TABLE IF EXISTS public.menu_item_option_groups ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL;

-- Ensure all columns exist in menu_item_option_choices
ALTER TABLE IF EXISTS public.menu_item_option_choices ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE IF EXISTS public.menu_item_option_choices ADD COLUMN IF NOT EXISTS menu_item_option_id uuid;
ALTER TABLE IF EXISTS public.menu_item_option_choices ADD COLUMN IF NOT EXISTS recipe_id uuid;
ALTER TABLE IF EXISTS public.menu_item_option_choices ADD COLUMN IF NOT EXISTS custom_name text;
ALTER TABLE IF EXISTS public.menu_item_option_choices ADD COLUMN IF NOT EXISTS additional_price numeric DEFAULT 0 NOT NULL;
ALTER TABLE IF EXISTS public.menu_item_option_choices ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL;

-- Force schema reload for PostgREST cache
NOTIFY pgrst, reload_schema;
