import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../../utils/api-handler.js';
import { invalidateCachePattern } from '../../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    const form = req.body;

    if (!form.input_ingredient_id || !form.input_quantity || !form.outputs) {
        return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    try {
        // 1. Get input cost
        let inputUnitCost = 0;
        if (form.input_lot_id) {
            const { data: lot } = await supabase.from('inventory_lots').select('unit_cost').eq('id', form.input_lot_id).single();
            if (lot && lot.unit_cost) inputUnitCost = lot.unit_cost;
        }
        if (!inputUnitCost) {
            const { data: ing } = await supabase.from('ingredients').select('cost').eq('id', form.input_ingredient_id).single();
            if (ing && ing.cost) inputUnitCost = ing.cost;
        }
        
        const totalInputCost = inputUnitCost * form.input_quantity;

        const yieldOutputs = form.outputs.filter((o: any) => o.output_type === 'YIELD' && o.quantity_produced && o.quantity_produced > 0);
        const totalYieldQuantity = yieldOutputs.reduce((sum: number, o: any) => sum + (o.quantity_produced || 0), 0);
        
        const yieldPercentage = totalYieldQuantity > 0 ? (totalYieldQuantity / form.input_quantity) * 100 : 0;

        // 2. Create the main event record
        const { data: event, error: eventError } = await supabase
            .from('portioning_events')
            .insert({
                user_id: restaurantId,
                employee_id: form.employee_id,
                notes: form.notes,
                input_ingredient_id: form.input_ingredient_id,
                input_quantity: form.input_quantity,
                total_input_cost: totalInputCost,
                yield_percentage: yieldPercentage
            })
            .select()
            .single();
        
        if (eventError) throw eventError;

        // 3. Adjust stock for the input
        const { error: inputError } = await supabase.rpc('adjust_stock_by_lot', {
            p_ingredient_id: form.input_ingredient_id,
            p_quantity_change: -form.input_quantity,
            p_reason: `Porcionamento Evento #${event.id.slice(0, 8)}`,
            p_user_id: restaurantId,
            p_lot_id_for_exit: form.input_lot_id,
            p_lot_number_for_entry: null,
            p_expiration_date_for_entry: null,
        });
        if (inputError) throw inputError;

        // 4. Create outputs and adjust stock for them
        for (const output of form.outputs) {
            if (!output.quantity_produced || output.quantity_produced <= 0) continue;

            let outputUnitCost = 0;
            if (output.output_type === 'YIELD' && totalYieldQuantity > 0) {
                const costShare = totalInputCost * (output.quantity_produced / totalYieldQuantity);
                outputUnitCost = costShare / output.quantity_produced;
            }

            if (output.output_type === 'YIELD' || output.output_type === 'BYPRODUCT') {
                if (!output.ingredient_id) continue;
                
                const lotNumber = `PORCIONADO-${event.id.slice(0,4)}`;
                const { error: outputStockError } = await supabase.rpc('adjust_stock_by_lot', {
                    p_ingredient_id: output.ingredient_id,
                    p_quantity_change: output.quantity_produced,
                    p_reason: `Rendimento Porcionamento #${event.id.slice(0, 8)}`,
                    p_user_id: restaurantId,
                    p_lot_number_for_entry: lotNumber,
                    p_lot_id_for_exit: null,
                    p_expiration_date_for_entry: null,
                });
                if (outputStockError) throw outputStockError;
                
                if (outputUnitCost > 0) {
                    const { data: newLot } = await supabase.from('inventory_lots')
                        .select('id')
                        .eq('ingredient_id', output.ingredient_id)
                        .eq('lot_number', lotNumber)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                        
                    if (newLot) {
                        await supabase.from('inventory_lots').update({ unit_cost: outputUnitCost }).eq('id', newLot.id);
                    }
                    
                    const { data: currentIng } = await supabase.from('ingredients').select('stock, cost').eq('id', output.ingredient_id).single();
                    if (currentIng) {
                        const currentStock = currentIng.stock || 0;
                        const previousStock = Math.max(0, currentStock - output.quantity_produced);
                        const previousValue = previousStock * (currentIng.cost || 0);
                        const newValue = output.quantity_produced * outputUnitCost;
                        const newAvgCost = currentStock > 0 ? (previousValue + newValue) / currentStock : outputUnitCost;
                        
                        await supabase.from('ingredients').update({ cost: newAvgCost }).eq('id', output.ingredient_id);
                    }
                }
            }

            const { error: outputInsertError } = await supabase.from('portioning_event_outputs').insert({
                event_id: event.id,
                ingredient_id: output.ingredient_id,
                output_type: output.output_type,
                description: output.description,
                quantity_produced: output.quantity_produced,
                unit: output.unit,
                unit_cost: outputUnitCost
            });
            if (outputInsertError) throw outputInsertError;
        }

        await invalidateCachePattern(`ingredients:${restaurantId}`);
        return res.status(201).json({ success: true, event });

    } catch (error) {
        console.error("Error creating portioning event:", error);
        return res.status(500).json({ success: false, error });
    }
});