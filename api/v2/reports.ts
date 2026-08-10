import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';

export const maxDuration = 300;

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method === 'GET') {
        await handleGet(req, res, restaurantId);
    } else {
        res.setHeader('Allow', ['GET']);
        res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }
});

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { action, startDate, endDate } = req.query;

    if (!startDate || typeof startDate !== 'string' || !endDate || typeof endDate !== 'string') {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`startDate` and `endDate` (YYYY-MM-DD or ISO string) query parameters are required.' });
    }

    const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
    const start = new Date(Date.UTC(sYear, sMonth - 1, sDay, 0, 0, 0, 0));
    
    let end;
    if (endDate.length === 10) {
        const [eYear, eMonth, eDay] = endDate.split('-').map(Number);
        end = new Date(Date.UTC(eYear, eMonth - 1, eDay, 23, 59, 59, 999));
    } else {
        end = new Date(endDate);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid date format.' });
    }

    if (action === 'sales') {
        const [transactionsRes, ordersRes] = await Promise.all([
            supabase
                .from('transactions')
                .select('amount,type')
                .eq('user_id', restaurantId)
                .gte('date', start.toISOString())
                .lte('date', end.toISOString())
                .is('deleted_at', null),
            supabase
                .from('orders')
                .select('id,order_items(quantity,price,unit_cost,status,deleted_at)')
                .eq('user_id', restaurantId)
                .eq('status', 'COMPLETED')
                .gte('completed_at', start.toISOString())
                .lte('completed_at', end.toISOString())
                .is('deleted_at', null)
        ]);

        if (transactionsRes.error) throw transactionsRes.error;
        if (ordersRes.error) throw ordersRes.error;

        const orders = ordersRes.data || [];
        const reportableItems = (items: any[]) => items.filter(item => item.status !== 'CANCELADO' && !item.deleted_at);
        const orderRevenue = orders.reduce((total, order) => total + reportableItems(order.order_items || []).reduce(
            (subtotal: number, item: any) => subtotal + Number(item.price || 0) * Number(item.quantity || 0), 0
        ), 0);
        const cogs = orders.reduce((total, order) => total + reportableItems(order.order_items || []).reduce(
            (subtotal: number, item: any) => subtotal + Number(item.unit_cost || 0) * Number(item.quantity || 0), 0
        ), 0);
        const transactionRevenue = (transactionsRes.data || [])
            .filter(transaction => transaction.type === 'Receita')
            .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
        const totalExpenses = (transactionsRes.data || [])
            .filter(transaction => transaction.type === 'Despesa')
            .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
        const grossRevenue = transactionRevenue || orderRevenue;
        const grossProfit = grossRevenue - cogs;
        const totalOrders = orders.length;

        return res.status(200).json({
            gross_revenue: grossRevenue,
            cogs,
            gross_profit: grossProfit,
            total_expenses: totalExpenses,
            net_profit: grossProfit - totalExpenses,
            total_orders: totalOrders,
            average_ticket: totalOrders > 0 ? grossRevenue / totalOrders : 0
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
                if (item.status === 'CANCELADO' || item.deleted_at) continue;
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

    return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid `action` query parameter. Use `sales` or `item_performance`.' });
}
