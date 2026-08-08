-- Migration: System Tables for System Admins and Distributed Cache Fallback
-- Created: 2026-08-08

-- 1. Create system_admins table for administrative access control
CREATE TABLE IF NOT EXISTS public.system_admins (
    email TEXT PRIMARY KEY,
    name TEXT,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on system_admins
ALTER TABLE public.system_admins ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role or authenticated system admins can read system_admins
CREATE POLICY "System admins read access" ON public.system_admins
    FOR SELECT
    USING (auth.jwt() ->> 'email' IN (SELECT email FROM public.system_admins));

-- 2. Create system_cache table for database fallback cache (when Redis is unconfigured)
CREATE TABLE IF NOT EXISTS public.system_cache (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on expires_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_system_cache_expires_at ON public.system_cache(expires_at);

-- Enable RLS on system_cache
ALTER TABLE public.system_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role / authenticated backend access
CREATE POLICY "System cache access" ON public.system_cache
    FOR ALL
    USING (true)
    WITH CHECK (true);
