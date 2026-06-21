import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function run() {
    const { data: stores } = await supabase.from('stores').select('id');
    const storeId = stores[0].id;
    
    const { data: ingredients } = await supabase.from('ingredients').select('id, name').eq('user_id', storeId).limit(1);
    const ingredientId = ingredients[0].id;

    const { data: stations } = await supabase.from('stations').select('id').eq('user_id', storeId).limit(1);
    const stationId = stations[0].id;

    console.log(`Store: ${storeId}, Ing: ${ingredientId}, Station: ${stationId}`);

    const { data: req, error } = await supabase.from('requisitions').insert({
        user_id: storeId,
        target_unit_id: null,
        station_id: stationId,
        status: 'DELIVERED',
    }).select().single();

    if (error) { console.error(error); return; }

    const { data: reqItem, error: errItem } = await supabase.from('requisition_items').insert({
        user_id: storeId,
        requisition_id: req.id,
        ingredient_id: ingredientId,
        quantity_requested: 10,
        quantity_delivered: 10,
        unit: 'kg'
    }).select().single();

    if (errItem) { console.error(errItem); return; }
    
    console.log("Success inserting req!");
}
run();
