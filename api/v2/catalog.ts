import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';

export default withAuth(async function handler(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } });
    }

    try {
        // Fetch all categories for this restaurant
        const { data: categoriesData, error: catError } = await supabase
            .from('categories')
            .select('*')
            .eq('user_id', restaurantId);

        // Even though recipes also returns categories, querying them directly helps to get all of them.
        // But let's check `get_menu_with_stock` first
        const { data: menuData, error: menuError } = await supabase.rpc('get_menu_with_stock', {
            p_restaurant_id: restaurantId,
            p_is_available: true,
            p_category_id: null
        });

        if (menuError) {
            throw new Error(`Failed to fetch menu data: ${menuError.message}`);
        }

        // Fetch options and groups for customization
        const { data: optionGroups, error: optionsError } = await supabase
             .from('ifood_option_groups')
             .select('*, ifood_options(*)');

        const groupsByRecipe = new Map();
        if (optionGroups) {
            for (const group of optionGroups) {
                 if (group.recipe_id) {
                     const groups = groupsByRecipe.get(group.recipe_id) || [];
                     groups.push(group);
                     groupsByRecipe.set(group.recipe_id, groups);
                 }
            }
        }

        // Group items by category
        const catalogMap = new Map();

        // Initialize with predefined categories if they exist (to preserve order or empty categories)
        if (categoriesData) {
            categoriesData.forEach(cat => {
                catalogMap.set(cat.id, {
                    id: cat.id,
                    name: cat.name,
                    items: []
                });
            });
        }

        const items = menuData || [];
        for (const item of items) {
            const catId = item.category_id;
            
            // Attach nested options
            const customizations = groupsByRecipe.get(item.id) || [];

            const catalogItem = {
                id: item.id,
                name: item.name,
                description: item.description,
                price: item.price,
                imageUrl: item.image_url,
                isAvailable: item.is_available,
                hasStock: item.has_stock,
                cost: item.estimated_cost,
                customizations: customizations.map((g: any) => ({
                    id: g.id,
                    name: g.name,
                    min: g.min,
                    max: g.max,
                    options: (g.ifood_options || []).map((o: any) => ({
                        id: o.id,
                        name: o.name,
                        price: o.price,
                        productId: o.ifood_product_id
                    }))
                }))
            };

            if (catId) {
                if (!catalogMap.has(catId)) {
                    catalogMap.set(catId, { id: catId, name: item.categories?.name || 'Sem Categoria', items: [] });
                }
                catalogMap.get(catId).items.push(catalogItem);
            } else {
                let uncat = catalogMap.get('uncategorized');
                if (!uncat) {
                    uncat = { id: 'uncategorized', name: 'Sem Categoria', items: [] };
                    catalogMap.set('uncategorized', uncat);
                }
                uncat.items.push(catalogItem);
            }
        }

        // Convert map to array and remove empty categories if desired (optional)
        const categories = Array.from(catalogMap.values()).filter(cat => cat.items.length > 0);

        return res.status(200).json({
            restaurantId,
            catalog: categories
        });

    } catch (error: any) {
        console.error('[Catalog API Error]', error);
        return res.status(500).json({ error: { message: 'Internal Server Error', details: error.message } });
    }
});
