const fs = require('fs');
const sysTables = fs.readFileSync('supabase/migrations/20260808000000_system_tables.sql', 'utf8');
const mig10 = fs.readFileSync('supabase/migrations/20260809000010_repair_tenancy_hardening_regressions.sql', 'utf8');

const functionsToExtract = [
  "authenticate_menu_customer",
  "create_free_trial_subscription",
  "delete_store",
  "get_menu_customer_history",
  "get_menu_customer_profile",
  "get_menu_with_stock",
  "get_order_by_session",
  "get_store_managers",
  "get_user_active_permissions",
  "handle_new_comunnity_user",
  "handle_new_subscription",
  "handle_new_user",
  "invite_manager_by_email",
  "is_account_manager",
  "is_system_admin",
  "log_edit_history",
  "override_order_item_price",
  "public_call_waiter",
  "public_request_bill",
  "regenerate_external_api_key",
  "register_menu_customer",
  "remove_store_manager",
  "sync_user_store_permissions",
  "update_order_public",
  "validate_order_item_price"
];

let output = `-- Reparation Migration\n\n`;

function extractFunction(name, source) {
    const regex = new RegExp(`CREATE OR REPLACE FUNCTION "public"."${name}"[\\s\\S]*?\\$\\$;`, 'g');
    const matches = source.match(regex);
    if (matches) {
        return matches.join('\n\n');
    }
    return '';
}

for (const fn of functionsToExtract) {
    let fnBody = extractFunction(fn, sysTables);
    if (fnBody) {
        // Add tenancy guard if missing
        if (!fnBody.includes('has_access_to_store') && fnBody.includes('p_store_id')) {
           fnBody = fnBody.replace(/BEGIN/, "BEGIN\n    IF auth.role() = 'authenticated' AND NOT public.has_access_to_store(p_store_id) THEN\n        RAISE EXCEPTION 'FORBIDDEN: Access denied to store';\n    END IF;");
        }
        output += fnBody + '\n\n';
    }
}

// Now handle the revoke execute for sensitive RPCs
const sensitiveRPCs = [
  "adjust_stock",
  "adjust_stock_by_lot",
  "create_ingredient_with_lot",
  "create_order_with_items",
  "decrement_stock_for_order",
  "finalize_order_transaction",
  "get_daily_dre",
  "get_financial_summary",
  "mark_order_as_served",
  "update_item_status"
];

for (const rpc of sensitiveRPCs) {
  output += `REVOKE EXECUTE ON FUNCTION "public"."${rpc}" FROM PUBLIC, anon;\n`;
}

// Add WhatsApp RLS Fix
output += `
-- FIX KG-002 WhatsApp RLS
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."whatsapp_chats";
DROP POLICY IF EXISTS "Enable insert for all users" ON "public"."whatsapp_chats";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."whatsapp_chats";
DROP POLICY IF EXISTS "Enable delete for all users" ON "public"."whatsapp_chats";

DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."whatsapp_configs";
DROP POLICY IF EXISTS "Enable insert for all users" ON "public"."whatsapp_configs";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."whatsapp_configs";
DROP POLICY IF EXISTS "Enable delete for all users" ON "public"."whatsapp_configs";

DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."whatsapp_messages";
DROP POLICY IF EXISTS "Enable insert for all users" ON "public"."whatsapp_messages";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."whatsapp_messages";
DROP POLICY IF EXISTS "Enable delete for all users" ON "public"."whatsapp_messages";

CREATE POLICY "Enable read for store owner or managers" ON "public"."whatsapp_chats" FOR SELECT USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));
CREATE POLICY "Enable all for store owner or managers" ON "public"."whatsapp_chats" FOR ALL USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));

CREATE POLICY "Enable read for store owner or managers" ON "public"."whatsapp_configs" FOR SELECT USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));
CREATE POLICY "Enable all for store owner or managers" ON "public"."whatsapp_configs" FOR ALL USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));

CREATE POLICY "Enable read for store owner or managers" ON "public"."whatsapp_messages" FOR SELECT USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));
CREATE POLICY "Enable all for store owner or managers" ON "public"."whatsapp_messages" FOR ALL USING (auth.role() = 'authenticated' AND public.has_access_to_store(store_id));

REVOKE ALL ON "public"."whatsapp_chats" FROM anon;
REVOKE ALL ON "public"."whatsapp_configs" FROM anon;
REVOKE ALL ON "public"."whatsapp_messages" FROM anon;
`;

fs.writeFileSync('supabase/migrations/20260809000012_reparation.sql', output);
console.log('Migration generated.');
