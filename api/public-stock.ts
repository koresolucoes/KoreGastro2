import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

export default async function handler(req: any, res: any) {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const [
        { data: ingredientsData }, 
        { data: stationStocksData },
        { data: recipeIngredientsData }
    ] = await Promise.all([
        supabase.from("ingredients").select("id, stock").eq("user_id", userId),
        supabase.from("station_stocks").select("ingredient_id, quantity").eq("user_id", userId),
        supabase
          .from("recipe_ingredients")
          .select("recipe_id, ingredient_id, quantity, correction_factor")
          .eq("user_id", userId),
      ]);

    const stockMap = new Map<string, number>(
      (ingredientsData || []).map((i) => [i.id, Number(i.stock || 0)]),
    );
    
    // Add station stocks
    for (const ss of stationStocksData || []) {
        const current = stockMap.get(ss.ingredient_id) || 0;
        stockMap.set(ss.ingredient_id, current + Number(ss.quantity || 0));
    }

    const recipeIngredientsMap = new Map<string, any[]>();
    for (const ri of recipeIngredientsData || []) {
      const arr = recipeIngredientsMap.get(ri.recipe_id) || [];
      arr.push(ri);
      recipeIngredientsMap.set(ri.recipe_id, arr);
    }

    const outOfStockRecipeIds: string[] = [];

    // Find all unique recipe IDs
    const allRecipeIds = Array.from(recipeIngredientsMap.keys());
    for (const recipeId of allRecipeIds) {
      const ingredients = recipeIngredientsMap.get(recipeId);
      if (ingredients) {
        for (const ing of ingredients) {
          const factor = ing.correction_factor && ing.correction_factor > 0 ? ing.correction_factor : 1;
          const requiredQty = ing.quantity * factor;
          if ((stockMap.get(ing.ingredient_id) || 0) < requiredQty) {
            outOfStockRecipeIds.push(recipeId);
            break;
          }
        }
      }
    }

    return res.status(200).json({ outOfStockRecipeIds });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
