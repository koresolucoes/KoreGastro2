import fs from 'fs';

let sql = fs.readFileSync('database.sql', 'utf8');

// 1. Optimize has_access_to_store
const newHasAccessToStore = `CREATE OR REPLACE FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  -- 1. O usuário é o dono da loja (acesso direto)
  IF auth.uid() = target_store_id THEN
    RETURN TRUE;
  END IF;

  -- 2. O usuário tem permissão delegada via app_metadata no JWT
  IF COALESCE((current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' -> 'stores'), '[]'::jsonb) ? target_store_id::text THEN
    RETURN TRUE;
  END IF;

  -- 3. Fallback para queries sem JWT (ex: webhooks, cron jobs)
  IF EXISTS (
    SELECT 1 FROM unit_permissions 
    WHERE manager_id = auth.uid() 
    AND store_id = target_store_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;`;

const oldFuncRegex = /CREATE OR REPLACE FUNCTION "public"\."has_access_to_store"\([\s\S]*?\$\$;/g;
sql = sql.replace(oldFuncRegex, newHasAccessToStore);


// 2. Fix target_unit_id policies in requisitions
const reqPolicyTargetMulti = `CREATE POLICY "Multi-tenant access policy" ON "public"."requisitions" USING (("public"."has_access_to_store"("user_id") OR ("target_unit_id" IS NOT NULL AND "public"."has_access_to_store"("target_unit_id")))) WITH CHECK (("public"."has_access_to_store"("user_id") OR ("target_unit_id" IS NOT NULL AND "public"."has_access_to_store"("target_unit_id"))));`;
// Requisitions has many policies. We will just find them and replace the specific ones.
// It is better to just replace the ones that are incorrect.

const reqInsertOld = `CREATE POLICY "Users can insert requisitions for their own restaurant" ON "public"."requisitions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));`;
const reqInsertNew = `CREATE POLICY "Users can insert requisitions for their own restaurant" ON "public"."requisitions" FOR INSERT WITH CHECK (("public"."has_access_to_store"("user_id")));`;

const reqUpdateOld = `CREATE POLICY "Users can update requisitions of their own restaurant" ON "public"."requisitions" FOR UPDATE USING (("auth"."uid"() = "user_id"));`;
const reqUpdateNew = `CREATE POLICY "Users can update requisitions of their own restaurant" ON "public"."requisitions" FOR UPDATE USING (("public"."has_access_to_store"("user_id") OR ("target_unit_id" IS NOT NULL AND "public"."has_access_to_store"("target_unit_id"))));`;

const reqDeleteOld = `CREATE POLICY "Users can delete requisitions of their own restaurant" ON "public"."requisitions" FOR DELETE USING (("auth"."uid"() = "user_id"));`;
const reqDeleteNew = `CREATE POLICY "Users can delete requisitions of their own restaurant" ON "public"."requisitions" FOR DELETE USING (("public"."has_access_to_store"("user_id")));`;

// For requisition_items
const reqItemsInsertOld = `CREATE POLICY "Users can insert requisition items for their own restaurant" ON "public"."requisition_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));`;
const reqItemsInsertNew = `CREATE POLICY "Users can insert requisition items for their own restaurant" ON "public"."requisition_items" FOR INSERT WITH CHECK (("public"."has_access_to_store"("user_id") OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND public.has_access_to_store(r.target_unit_id))));`;

const reqItemsUpdateOld = `CREATE POLICY "Users can update requisition items of their own restaurant" ON "public"."requisition_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));`;
const reqItemsUpdateNew = `CREATE POLICY "Users can update requisition items of their own restaurant" ON "public"."requisition_items" FOR UPDATE USING (("public"."has_access_to_store"("user_id") OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND public.has_access_to_store(r.target_unit_id))));`;

const reqItemsDeleteOld = `CREATE POLICY "Users can delete requisition items of their own restaurant" ON "public"."requisition_items" FOR DELETE USING (("auth"."uid"() = "user_id"));`;
const reqItemsDeleteNew = `CREATE POLICY "Users can delete requisition items of their own restaurant" ON "public"."requisition_items" FOR DELETE USING (("public"."has_access_to_store"("user_id") OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND public.has_access_to_store(r.target_unit_id))));`;


sql = sql.replace(reqInsertOld, reqInsertNew);
sql = sql.replace(reqUpdateOld, reqUpdateNew);
sql = sql.replace(reqDeleteOld, reqDeleteNew);

sql = sql.replace(reqItemsInsertOld, reqItemsInsertNew);
sql = sql.replace(reqItemsUpdateOld, reqItemsUpdateNew);
sql = sql.replace(reqItemsDeleteOld, reqItemsDeleteNew);


fs.writeFileSync('database.sql', sql);
console.log('Database fixes applied.');
