import { createClient } from '@supabase/supabase-js';
import { environment } from '../config/environment';

// Create a single, shared Supabase client to be used across the application.
// This prevents the "Multiple GoTrueClient instances" warning and ensures consistency.
export const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
    },
});
