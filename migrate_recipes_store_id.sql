
-- 1. Adicionar a coluna store_id à tabela recipes
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;

-- 2. Migrar dados existentes: preencher store_id com o valor de user_id
-- Assumindo que para as lojas existentes, o user_id (que era usado como tenant ID) corresponde ao ID da loja.
UPDATE public.recipes SET store_id = user_id WHERE store_id IS NULL;

-- 3. Atualizar a restrição de unicidade (opcional, mas recomendado se quisermos nomes únicos por loja)
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_user_id_name_key;
ALTER TABLE public.recipes ADD CONSTRAINT recipes_store_id_name_key UNIQUE (store_id, name);

-- 4. Atualizar a função get_menu_with_stock para usar store_id
CREATE OR REPLACE FUNCTION public.get_menu_with_stock(p_store_id uuid, p_is_available boolean DEFAULT NULL::boolean, p_category_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH RECURSIVE 
    recipe_base_ingredients AS (
        SELECT id AS recipe_id, source_ingredient_id AS ingredient_id
        FROM public.recipes
        WHERE store_id = p_store_id AND source_ingredient_id IS NOT NULL
    ),
    recipe_direct_ingredients AS (
        SELECT recipe_id, ingredient_id, quantity
        FROM public.recipe_ingredients
        WHERE user_id = p_store_id -- Mantendo user_id aqui por enquanto se as outras tabelas não mudarem
    ),
    recipe_tree AS (
        SELECT 
            r.id AS root_recipe_id,
            r.id AS current_recipe_id,
            1::NUMERIC AS required_qty
        FROM public.recipes r
        WHERE r.store_id = p_store_id AND r.is_sub_recipe = FALSE
        
        UNION ALL
        
        SELECT 
            rt.root_recipe_id,
            rsr.child_recipe_id AS current_recipe_id,
            rt.required_qty * rsr.quantity AS required_qty
        FROM recipe_tree rt
        JOIN public.recipe_sub_recipes rsr ON rsr.parent_recipe_id = rt.current_recipe_id
        WHERE rsr.user_id = p_store_id
    ),
    required_ingredients AS (
        SELECT 
            rt.root_recipe_id,
            rdi.ingredient_id,
            SUM(rt.required_qty * rdi.quantity) AS total_required_qty
        FROM recipe_tree rt
        JOIN recipe_direct_ingredients rdi ON rdi.recipe_id = rt.current_recipe_id
        GROUP BY rt.root_recipe_id, rdi.ingredient_id
        
        UNION ALL
        
        SELECT 
            rt.root_recipe_id,
            rbi.ingredient_id,
            SUM(rt.required_qty) AS total_required_qty
        FROM recipe_tree rt
        JOIN recipe_base_ingredients rbi ON rbi.recipe_id = rt.current_recipe_id
        GROUP BY rt.root_recipe_id, rbi.ingredient_id
    ),
    stock_check AS (
        SELECT 
            ri.root_recipe_id,
            BOOL_AND(COALESCE(i.stock, 0) >= ri.total_required_qty) AS has_stock
        FROM required_ingredients ri
        JOIN public.ingredients i ON i.id = ri.ingredient_id
        GROUP BY ri.root_recipe_id
    ),
    final_menu AS (
        SELECT 
            r.*,
            jsonb_build_object('name', c.name) AS categories,
            COALESCE(sc.has_stock, TRUE) AS has_stock
        FROM public.recipes r
        LEFT JOIN public.categories c ON c.id = r.category_id
        LEFT JOIN stock_check sc ON sc.root_recipe_id = r.id
        WHERE r.store_id = p_store_id 
          AND r.is_sub_recipe = FALSE
          AND (p_is_available IS NULL OR r.is_available = p_is_available)
          AND (p_category_id IS NULL OR r.category_id = p_category_id)
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(fm.*)), '[]'::jsonb) INTO v_result FROM final_menu fm;

    RETURN v_result;
END;
$$;

-- 5. Atualizar RLS para usar store_id
DROP POLICY IF EXISTS "Allow user access to their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.recipes;
DROP POLICY IF EXISTS "Multi-tenant access policy" ON public.recipes;
DROP POLICY IF EXISTS "Multi-unit Access Select" ON public.recipes;
DROP POLICY IF EXISTS "Multi-unit Access Insert" ON public.recipes;
DROP POLICY IF EXISTS "Multi-unit Access Update" ON public.recipes;
DROP POLICY IF EXISTS "Multi-unit Access Delete" ON public.recipes;

CREATE POLICY "Multi-unit Access Select" ON public.recipes FOR SELECT USING (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Insert" ON public.recipes FOR INSERT WITH CHECK (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Update" ON public.recipes FOR UPDATE USING (public.has_access_to_store(store_id)) WITH CHECK (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Delete" ON public.recipes FOR DELETE USING (public.has_access_to_store(store_id));

-- Política para acesso público (Cardápio Digital)
DROP POLICY IF EXISTS "Permitir leitura pública de receitas" ON public.recipes;
CREATE POLICY "Permitir leitura pública de receitas" ON public.recipes FOR SELECT USING (is_available = true AND is_sub_recipe = false);
