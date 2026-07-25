-- This migration ensures that system_logs cannot be deleted by anyone, including admins.
-- This guarantees a tamper-proof audit trail for everything done in the admin panel.

-- Add new columns to menu_items to enrich the menu builder
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS promotional_price NUMERIC,
ADD COLUMN IF NOT EXISTS dietary_flags TEXT[],
ADD COLUMN IF NOT EXISTS availability_schedule TEXT;

-- Create policy to prevent deletion of system logs
-- First, ensure RLS is enabled on system_logs
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Drop any existing delete policy if it exists (highly unlikely to be named exactly this, but just in case)
DROP POLICY IF EXISTS "Prevent deletion of system_logs" ON public.system_logs;

-- Create a policy that explicitly rejects DELETE operations for everyone
CREATE POLICY "Prevent deletion of system_logs" 
ON public.system_logs 
FOR DELETE 
USING (false);

-- Also ensure we have a policy for INSERT and SELECT so the system can still write and read logs
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.system_logs;
CREATE POLICY "Allow insert for authenticated users"
ON public.system_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow select for authenticated users based on user_id" ON public.system_logs;
CREATE POLICY "Allow select for authenticated users based on user_id"
ON public.system_logs
FOR SELECT
USING (auth.uid() = user_id OR auth.uid() IN (
    SELECT auth_id FROM admin_users
));
