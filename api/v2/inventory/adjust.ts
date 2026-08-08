import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../../utils/api-handler.js';
import { invalidateCachePattern } from '../../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    const {
        ingredientId,
        quantityChange,
        reason,
        lotIdForExit = null,
        lotNumberForEntry = null,
        expirationDateForEntry = null,
        employeeId = null,
        unitCostForEntry
    } = req.body;

    if (!ingredientId || quantityChange === undefined || !reason) {
        return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    const { data: originalIngredient, error: fetchError } = await supabase
        .from('ingredients')
        .select('name, stock, unit')
        .eq('id', ingredientId)
        .eq('user_id', restaurantId)
        .single();
    
    if (fetchError) {
        return res.status(404).json({ success: false, error: fetchError });
    }
        
    const { error } = await supabase.rpc('adjust_stock_by_lot', {
        p_ingredient_id: ingredientId,
        p_quantity_change: quantityChange,
        p_reason: reason,
        p_user_id: restaurantId,
        p_lot_id_for_exit: lotIdForExit,
        p_lot_number_for_entry: lotNumberForEntry,
        p_expiration_date_for_entry: expirationDateForEntry
    });

    if (error) {
        console.error("RPC adjust_stock_by_lot failed:", error);
        // Fallback: manually update existing stock if RPC throws FK violation or similar.
        const newStock = originalIngredient.stock + quantityChange;
        
        const { data: updatedData, error: fallbackError } = await supabase.from('ingredients')
                                          .update({ stock: newStock, updated_at: new Date().toISOString() })
                                          .eq('id', ingredientId)
                                          .eq('user_id', restaurantId)
                                          .select('id');
                                          
        if (fallbackError || !updatedData || updatedData.length === 0) {
             return res.status(409).json({ success: false, error: 'Concurrent modification detected or fallback update failed' });
        }

        // FEFO Lot deduction fallback for stock exits
        if (quantityChange < 0) {
            if (lotIdForExit) {
                const { data: targetLot } = await supabase.from('inventory_lots').select('quantity').eq('id', lotIdForExit).single();
                if (targetLot) {
                    const newLotQty = Math.max(0, targetLot.quantity + quantityChange);
                    await supabase.from('inventory_lots').update({ quantity: newLotQty }).eq('id', lotIdForExit);
                }
            } else {
                const { data: activeLots } = await supabase
                    .from('inventory_lots')
                    .select('id, quantity')
                    .eq('ingredient_id', ingredientId)
                    .gt('quantity', 0)
                    .order('expiration_date', { ascending: true, nullsFirst: false });

                if (activeLots && activeLots.length > 0) {
                    let toDeduct = Math.abs(quantityChange);
                    for (const lot of activeLots) {
                        if (toDeduct <= 0) break;
                        const deduct = Math.min(lot.quantity, toDeduct);
                        await supabase.from('inventory_lots').update({ quantity: lot.quantity - deduct }).eq('id', lot.id);
                        toDeduct -= deduct;
                    }
                }
            }
        }
    }

    if (quantityChange > 0 && unitCostForEntry !== undefined) {
        const query = supabase.from('inventory_lots')
            .select('id')
            .eq('ingredient_id', ingredientId)
            .order('created_at', { ascending: false })
            .limit(1);
            
        if (lotNumberForEntry) {
            query.eq('lot_number', lotNumberForEntry);
        } else {
            query.is('lot_number', null);
        }
        
        const { data: lot } = await query.single();
        if (lot) {
            await supabase.from('inventory_lots').update({ unit_cost: unitCostForEntry }).eq('id', lot.id);
        }
    }
    
    const newStock = originalIngredient.stock + quantityChange;
    await supabase.from('inventory_logs').insert({
        user_id: restaurantId,
        ingredient_id: ingredientId,
        employee_id: employeeId,
        quantity_change: quantityChange,
        previous_balance: originalIngredient.stock,
        new_balance: newStock,
        reason: reason
    });

    await invalidateCachePattern(`ingredients:${restaurantId}`);
    await invalidateCachePattern(`ingredient:${restaurantId}:${ingredientId}`);

    return res.status(200).json({ success: true, newStock });
});
