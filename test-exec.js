import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function run() {
    const { data: stores } = await supabase.from('stores').select('id');
    const storeId = stores[0].id;
    
    // Create a new ingredient
    const { data: ing } = await supabase.from('ingredients').insert({
        user_id: storeId,
        name: 'Test Internal Transfer Ing',
        unit: 'kg',
        stock: 50, // Initial stock 50
    }).select().single();

    // Create a new station
    const { data: st } = await supabase.from('stations').insert({
        user_id: storeId,
        name: 'Internal Station 1',
    }).select().single();

    // Create a requisition
    const { data: req } = await supabase.from('requisitions').insert({
        user_id: storeId,
        target_unit_id: null,
        station_id: st.id,
        status: 'PENDING',
    }).select().single();

    const { data: reqItem } = await supabase.from('requisition_items').insert({
        user_id: storeId,
        requisition_id: req.id,
        ingredient_id: ing.id,
        quantity_requested: 10,
        unit: 'kg'
    }).select().single();

    console.log(`Created req ${req.id} for ingredient ${ing.id} at station ${st.id}`);

    // Wait, let's pretend to call what the UI calls:
    // UI -> updateRequisitionStatus(id, 'APPROVED', [{id: reqItem.id, quantity_delivered: 5}])

    console.log('Simulating APPROVED...');
    await supabase.from('requisitions').update({ status: 'APPROVED' }).eq('id', req.id);
    await supabase.from('requisition_items').update({ quantity_delivered: 5 }).eq('id', reqItem.id);
    // Deduct stock (as done in code)
    await supabase.from('ingredients').update({ stock: 45 }).eq('id', ing.id);

    // UI -> receiveExternalDelivery(req) -> updateRequisitionStatus(id, 'DELIVERED', items)
    console.log('Simulating processDelivery...');
    // In processDelivery, it inserts to station_stocks using requisition.user_id
    // I want to see if the RLS allows inserting station_stocks. Because I'm using Service Role, RLS is bypassed. 
    // Wait, the fix I made was in `requisition.service.ts` to replace `userId` with `requisition.user_id`. Since `userId` is the `auth.uid()`, if `auth.uid()` was an employee, it violated the FK constraint `station_stocks_store_id_fkey` which specifies `user_id references stores(id)`. Let's verify this FK exists!
    const { data, error } = await supabase.rpc('exec_sql', { sql: `
        SELECT conname, pg_get_constraintdef(c.oid) 
        FROM pg_constraint c 
        JOIN pg_class t ON c.conrelid = t.oid 
        WHERE t.relname = 'station_stocks';
    ` });
    console.log("Constraints:", data);
}
run();
