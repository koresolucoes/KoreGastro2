-- S0A.1 - Subscription Mutation Lockdown

-- 1. Drop mutation policies for authenticated/anon on public.subscriptions
DROP POLICY IF EXISTS "Multi-unit Access Insert" ON "public"."subscriptions";
DROP POLICY IF EXISTS "Multi-unit Access Update" ON "public"."subscriptions";
DROP POLICY IF EXISTS "Multi-unit Access Delete" ON "public"."subscriptions";

-- Also dropping any default generated policies for completeness, though they might not exist
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "public"."subscriptions";
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON "public"."subscriptions";
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON "public"."subscriptions";

-- 2. Revoke all privileges from anon and authenticated
REVOKE ALL ON TABLE "public"."subscriptions" FROM "anon";
REVOKE ALL ON TABLE "public"."subscriptions" FROM "authenticated";

-- 3. Grant ONLY SELECT back to authenticated so they can read their own subscriptions
GRANT SELECT ON TABLE "public"."subscriptions" TO "authenticated";
-- (The existing "Allow users to read their own subscription" or "Multi-unit Access Select" policies will cover the RLS logic for SELECT)

-- 4. Revoke EXECUTE on bypass RPCs
REVOKE EXECUTE ON FUNCTION "public"."create_free_trial_subscription"("uuid") FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."create_free_trial_subscription"("uuid") FROM "authenticated";

REVOKE EXECUTE ON FUNCTION "public"."handle_new_subscription"("uuid", "uuid", "text", "text"[]) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."handle_new_subscription"("uuid", "uuid", "text", "text"[]) FROM "authenticated";
