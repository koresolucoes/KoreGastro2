import { createClient, SupabaseClient } from '@supabase/supabase-js';

// This is a placeholder that will be initialized asynchronously by the config loader.
export let supabase: SupabaseClient;

/**
 * Initializes the global Supabase client instance.
 * This function is called from the config loader once the environment
 * variables have been fetched from the server.
 * @param url The Supabase project URL.
 * @param key The Supabase anon key.
 */
export function initializeSupabaseClient(url: string, key: string) {
    if (supabase) {
        return; // Already initialized
    }
    supabase = createClient(url, key, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
        },
    });
}
