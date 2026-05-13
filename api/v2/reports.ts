import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { withAuth, supabase } from '../utils/api-handler.js';

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    if (request.method === 'GET') {
        await handleGet(request, response, restaurantId);
    } else {
        response.setHeader('Allow', ['GET']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
});

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { action, startDate, endDate } = req.query;

    if (!startDate || typeof startDate !== 'string' || !endDate || typeof endDate !== 'string') {
        return res.status(400).json({ error: { message: '`startDate` and `endDate` (YYYY-MM-DD or ISO string) query parameters are required.' } });
    }

    const start = new Date(startDate);
    let endStr = endDate;
    if (endDate.length === 10) {
        endStr = `${endDate}T23:59:59.999Z`;
    }
    const end = new Date(endStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: { message: 'Invalid date format.' } });
    }

    if (action === 'sales') {
        const { data, error } = await supabase.rpc('get_financial_summary', {
            p_user_id: restaurantId,
            p_start_date: start.toISOString(),
            p_end_date: end.toISOString()
        });

        if (error) throw error;
        
        const result = (data && data.length > 0) ? data[0] : null;

        if (!result) {
            return res.status(200).json({
                gross_revenue: 0,
                cogs: 0,
                gross_profit: 0,
                total_orders: 0,
                average_ticket: 0
            });
        }

        return res.status(200).json({
            gross_revenue: result.total_revenue,
            cogs: 0,
            gross_profit: result.total_revenue,
            total_orders: result.total_orders,
            average_ticket: result.average_ticket
        });
    }

    if (action === 'item_performance') {
        const [ordersRes, recipesRes] = await Promise.all([
            supabase
                .from('orders')
                .select('order_items(*)')
                .eq('user_id', restaurantId)
                .eq('status', 'COMPLETED')
                .gte('completed_at', start.toISOString())
                .lte('completed_at', end.toISOString()),
            supabase
                .from('recipes')
                .select('id, name, operational_cost')
                .eq('user_id', restaurantId)
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (recipesRes.error) throw recipesRes.error;

        const orders = ordersRes.data || [];
        const recipesMap = new Map<string, { name: string, cost: number }>(recipesRes.data?.map(r => [r.id, { name: r.name, cost: r.operational_cost || 0 }]) || []);

        const itemsPerformance = new Map<string, {
            item_id: string;
            item_name: string;
            quantity_sold: number;
            total_revenue: number;
            total_cost: number;
        }>();

        for (const order of orders) {
            for (const item of (order.order_items || [])) {
                if (!item.recipe_id) continue;

                const recipeInfo = recipesMap.get(item.recipe_id);
                if (!recipeInfo) continue;

                const existing = itemsPerformance.get(item.recipe_id) || {
                    item_id: item.recipe_id,
                    item_name: item.name,
                    quantity_sold: 0,
                    total_revenue: 0,
                    total_cost: 0,
                };

                existing.quantity_sold += item.quantity;
                existing.total_revenue += item.price * item.quantity;
                existing.total_cost += recipeInfo.cost * item.quantity;
                
                itemsPerformance.set(item.recipe_id, existing);
            }
        }
        
        const result = Array.from(itemsPerformance.values()).map(item => {
            const total_profit = item.total_revenue - item.total_cost;
            const profit_margin_percent = item.total_revenue > 0 ? (total_profit / item.total_revenue) * 100 : 0;
            return {
                ...item,
                total_profit,
                profit_margin_percent
            };
        }).sort((a, b) => b.total_profit - a.total_profit);

        return res.status(200).json(result);
    }

    return res.status(400).json({ error: { message: 'Invalid `action` query parameter. Use `sales` or `item_performance`.' } });
}
