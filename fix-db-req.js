import fs from 'fs';
let content = fs.readFileSync('database.sql', 'utf8');

content = content.replace(
    /"processed_by" "uuid",\s*CONSTRAINT "requisitions_status_check"/,
    '"processed_by" "uuid",\n    "target_unit_id" "uuid",\n    CONSTRAINT "requisitions_status_check"'
);

// also fix the policy for requisitions
content = content.replace(
    /CREATE POLICY "Multi-tenant access policy" ON "public"."requisitions"(.*?);/g,
    'CREATE POLICY "Multi-tenant access policy" ON "public"."requisitions" USING (("public"."has_access_to_store"("user_id") OR ("target_unit_id" IS NOT NULL AND "public"."has_access_to_store"("target_unit_id")))) WITH CHECK (("public"."has_access_to_store"("user_id") OR ("target_unit_id" IS NOT NULL AND "public"."has_access_to_store"("target_unit_id"))));'
);

// also add policy for requisition items
content = content.replace(
    /CREATE POLICY "Multi-unit Access Update" ON "public"."requisition_items"(.*?);/g,
    'CREATE POLICY "Multi-unit Access Update" ON "public"."requisition_items" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR EXISTS (SELECT 1 FROM "public"."requisitions" r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND "public"."has_access_to_store"(r.target_unit_id)) OR (COALESCE((("auth"."jwt"() -> \'app_metadata\'::"text") -> \'stores\'::"text"), \'[]\'::"jsonb") ? ("user_id")::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") OR EXISTS (SELECT 1 FROM "public"."requisitions" r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND "public"."has_access_to_store"(r.target_unit_id)) OR (COALESCE((("auth"."jwt"() -> \'app_metadata\'::"text") -> \'stores\'::"text"), \'[]\'::"jsonb") ? ("user_id")::"text")));'
);

content = content.replace(
    /CREATE POLICY "Multi-unit Access Select" ON "public"."requisition_items"(.*?);/g,
    'CREATE POLICY "Multi-unit Access Select" ON "public"."requisition_items" FOR SELECT USING ((("auth"."uid"() = "user_id") OR EXISTS (SELECT 1 FROM "public"."requisitions" r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND "public"."has_access_to_store"(r.target_unit_id)) OR (COALESCE((("auth"."jwt"() -> \'app_metadata\'::"text") -> \'stores\'::"text"), \'[]\'::"jsonb") ? ("user_id")::"text")));'
);

fs.writeFileSync('database.sql', content);
console.log('Fixed database.sql Requisition Multitenancy');
