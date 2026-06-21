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

    const [{ data: ingredientsData }, { data: recipeIngredientsData }] =
      await Promise.all([
        supabase.from("ingredients").select("id, stock").eq("user_id", userId),
        supabase
          .from("recipe_ingredients")
          .select("recipe_id, ingredient_id, quantity")
          .eq("user_id", userId),
      ]);

    const stockMap = new Map(
      (ingredientsData || []).map((i) => [i.id, Number(i.stock || 0)]),
    );
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
          if ((stockMap.get(ing.ingredient_id) || 0) < ing.quantity) {
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
