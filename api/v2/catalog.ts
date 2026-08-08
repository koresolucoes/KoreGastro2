import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';
import { remember } from '../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    try {
        const cacheKey = `catalog:${restaurantId}`;
        const bypassCache = req.query?.nocache === 'true';

        const catalogFetcher = async () => {
            // Fetch all categories for this restaurant
            const { data: categoriesData } = await supabase
                .from('categories')
                .select('*')
                .eq('user_id', restaurantId);

            let menuData: any[] = [];
            const { data: rpcData1, error: rpcErr1 } = await supabase.rpc('get_menu_with_stock', {
                p_store_id: restaurantId,
                p_is_available: true,
                p_category_id: null
            });

            if (!rpcErr1 && rpcData1) {
                menuData = rpcData1;
            } else {
                const { data: rpcData2, error: rpcErr2 } = await supabase.rpc('get_menu_with_stock', {
                    p_restaurant_id: restaurantId,
                    p_is_available: true,
                    p_category_id: null
                });
                if (!rpcErr2 && rpcData2) {
                    menuData = rpcData2;
                } else {
                    const { data: fallbackRecipes } = await supabase
                        .from('recipes')
                        .select('*, categories(name)')
                        .or(`store_id.eq.${restaurantId},user_id.eq.${restaurantId}`)
                        .eq('is_available', true);

                    menuData = (fallbackRecipes || []).map((r: any) => ({
                        ...r,
                        has_stock: true,
                        estimated_cost: r.operational_cost || 0
                    }));
                }
            }

            // Fetch options and groups for customization
            const { data: optionGroups } = await supabase
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

            return Array.from(catalogMap.values()).filter(cat => cat.items.length > 0);
        };

        const categories = bypassCache
            ? await catalogFetcher()
            : await remember(cacheKey, 300, catalogFetcher); // 5 minutes cache

        res.setHeader('X-Cache-Key', cacheKey);
        return res.status(200).json({
            restaurantId,
            catalog: categories
        });

    } catch (error: any) {
        console.error('[Catalog API Error]', error);
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: 'Internal Server Error' });
    }
});
