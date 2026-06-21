import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.example' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const sql = `
    DROP POLICY IF EXISTS "Public insertion allowed ONLY into OPEN orders" ON public.order_items;
    DROP POLICY IF EXISTS "Permitir criação pública de itens de pedido anon" ON public.order_items;

    CREATE POLICY "Public insertion allowed ONLY into OPEN orders" ON public.order_items
    FOR INSERT TO anon WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id AND o.status = 'OPEN'
        )
    );

    CREATE OR REPLACE FUNCTION override_order_item_price()
    RETURNS TRIGGER 
    SECURITY DEFINER 
    AS $$
    DECLARE
      v_recipe_price numeric;
      v_recipe_cost numeric;
    BEGIN
      IF NEW.recipe_id IS NOT NULL THEN
        SELECT price, operational_cost INTO v_recipe_price, v_recipe_cost
        FROM public.recipes 
        WHERE id = NEW.recipe_id;
        
        IF v_recipe_price IS NOT NULL THEN
           NEW.original_price := v_recipe_price;
           NEW.unit_cost := COALESCE(v_recipe_cost, 0);

           IF NEW.discount_type = 'percentage' THEN
              NEW.price := NEW.original_price - (NEW.original_price * COALESCE(NEW.discount_value, 0) / 100.0);
           ELSIF NEW.discount_type = 'amount' THEN
              NEW.price := NEW.original_price - COALESCE(NEW.discount_value, 0);
           ELSE
              NEW.price := NEW.original_price;
           END IF;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;

  const { error } = await supabase.rpc('exec_sql', { sql });
  console.log('Result:', error);
}

run();
