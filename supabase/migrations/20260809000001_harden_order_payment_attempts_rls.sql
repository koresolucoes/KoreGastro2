-- Migration: Harden RLS on order_payment_attempts
-- Description: Restrict order_payment_attempts mutations to backend (service role) and allow only SELECT for authenticated store users.

-- 1. Drop existing permissive policy (which allowed ALL ops to authenticated users)
DROP POLICY IF EXISTS "Multi-tenant access policy via order" ON public.order_payment_attempts;

-- 2. Create SELECT-only policy for authenticated users with store access validation
CREATE POLICY "Multi-tenant select policy via order" ON public.order_payment_attempts
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.orders o
            WHERE o.id = order_payment_attempts.order_id
              AND public.has_access_to_store(o.user_id)
        )
    );
