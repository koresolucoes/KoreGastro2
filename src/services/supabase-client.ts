
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../config/environment';

// Centralized check for Supabase keys.
// If keys are missing or are placeholders, stop the app and show a helpful error.
if (!environment.supabaseUrl || environment.supabaseUrl.includes('YOUR_SUPABASE_URL')) {
    document.body.innerHTML = `<div style="color: white; background-color: #111827; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; padding: 2rem;">
        <h1 style="color: #ef4444; font-size: 1.5rem;">Erro de Configuração</h1>
        <p style="margin-top: 0.5rem;">A URL do Supabase não foi configurada.</p>
        <p style="margin-top: 1rem; font-size: 0.875rem; color: #9ca3af;">Por favor, edite o arquivo <code>src/config/environment.ts</code> e insira sua URL do Supabase.</p>
    </div>`;
    throw new Error('Supabase URL not configured.');
}

if (!environment.supabaseAnonKey || environment.supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')) {
    document.body.innerHTML = `<div style="color: white; background-color: #111827; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; padding: 2rem;">
        <h1 style="color: #ef4444; font-size: 1.5rem;">Erro de Configuração</h1>
        <p style="margin-top: 0.5rem;">A Chave Anônima do Supabase não foi configurada.</p>
        <p style="margin-top: 1rem; font-size: 0.875rem; color: #9ca3af;">Por favor, edite o arquivo <code>src/config/environment.ts</code> e insira sua chave anônima do Supabase.</p>
    </div>`;
    throw new Error('Supabase Anon Key not configured.');
}

// The client is now initialized directly when this module is imported, ensuring it's
// always available as a singleton to any service that needs it.
export const supabase: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
    },
});

/**
 * This function is now deprecated. The Supabase client is initialized automatically
 * when this module is imported.
 * @deprecated
 */
export function initializeSupabaseClient(url: string, key: string) {
    // This function is no longer needed and does nothing.
    console.warn('initializeSupabaseClient is deprecated and has no effect. The client is initialized automatically.');
}
