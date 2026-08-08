import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../../utils/api-handler.js';
import { invalidateCachePattern } from '../../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    const { orderId, employeeId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'Missing orderId' });
    }

    // 1. Fetch order and items
    const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(name), purchase_order_items(*)')
        .eq('id', orderId)
        .eq('user_id', restaurantId)
        .single();
    
    if (orderError || !order) {
        return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    if (!order.purchase_order_items || order.purchase_order_items.length === 0) {
        return res.status(400).json({ success: false, error: 'Purchase order has no items' });
    }

    const supplierName = order.suppliers?.name;

    for (const item of order.purchase_order_items) {
        const reason = `Compra de Fornecedor${supplierName ? ` - ${supplierName}` : ''}`;
        
        // Adjust stock by lot via RPC
        const { error: rpcError } = await supabase.rpc('adjust_stock_by_lot', {
            p_ingredient_id: item.ingredient_id,
            p_quantity_change: item.quantity,
            p_reason: reason,
            p_user_id: restaurantId,
            p_lot_id_for_exit: null,
            p_lot_number_for_entry: item.lot_number,
            p_expiration_date_for_entry: item.expiration_date
        });
        
        if (rpcError) {
             return res.status(500).json({ success: false, error: `Failed to update stock for item ${item.ingredient_id}` });
        }
        
        // Update lot unit cost
        if (item.cost > 0) {
            const query = supabase.from('inventory_lots')
                .select('id')
                .eq('ingredient_id', item.ingredient_id)
                .order('created_at', { ascending: false })
                .limit(1);
                
            if (item.lot_number) {
                query.eq('lot_number', item.lot_number);
            } else {
                query.is('lot_number', null);
            }
            
            const { data: lot } = await query.single();
            if (lot) {
                await supabase.from('inventory_lots').update({ unit_cost: item.cost }).eq('id', lot.id);
            }

            // Weighted average cost calculation
            const { data: currentIngredient } = await supabase
                .from('ingredients')
                .select('stock, cost')
                .eq('id', item.ingredient_id)
                .single();
                
            if (currentIngredient) {
                // Because we just called adjust_stock_by_lot, the stock is already updated in DB.
                // We need to carefully recalculate the cost.
                // Wait, if stock is ALREADY updated, currentIngredient.stock is the NEW stock.
                const newTotalStock = currentIngredient.stock || 0;
                const oldStock = Math.max(0, newTotalStock - item.quantity);
                const currentTotalValue = oldStock * (currentIngredient.cost || 0);
                const newPurchaseValue = item.quantity * item.cost;
                
                let newUnitCost = item.cost;
                if (newTotalStock > 0) {
                    newUnitCost = (currentTotalValue + newPurchaseValue) / newTotalStock;
                }

                await supabase.from('ingredients').update({ cost: newUnitCost }).eq('id', item.ingredient_id);
            }
        }
        
        // Log
        const { data: latestIng } = await supabase.from('ingredients').select('stock').eq('id', item.ingredient_id).single();
        const newStock = latestIng ? latestIng.stock : item.quantity;
        const oldStock = Math.max(0, newStock - item.quantity);
        await supabase.from('inventory_logs').insert({
            user_id: restaurantId,
            ingredient_id: item.ingredient_id,
            employee_id: employeeId,
            quantity_change: item.quantity,
            previous_balance: oldStock,
            new_balance: newStock,
            reason: reason
        });
    }

    // Update status
    const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({ status: 'Recebida', received_by_employee_id: employeeId })
        .eq('id', orderId);
        
    if (updateError) {
        return res.status(500).json({ success: false, error: updateError });
    }

    await invalidateCachePattern(`purchase-orders:${restaurantId}`);
    await invalidateCachePattern(`ingredients:${restaurantId}`);

    return res.status(200).json({ success: true });
});
