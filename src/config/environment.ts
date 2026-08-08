
/**
 * Centralized configuration file for the application.
 *
 * IMPORTANT:
 * This file contains placeholder values. You must replace them with your actual
 * credentials from Supabase and Google AI Studio for the application to work.
 * 
 * iFood API credentials (IFOOD_CLIENT_ID, IFOOD_CLIENT_SECRET) are NOT set here.
 * They must be configured as server-side environment variables in your deployment
 * environment (e.g., Vercel project settings), as they are used by the API proxy functions.
 */
export const environment = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '') || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '') || '',
};

if (!environment.supabaseUrl || !environment.supabaseUrl.startsWith('http')) {
  console.warn('ChefOS: Invalid or missing SUPABASE_URL configuration. Please set it in your environment.');
}
if (!environment.supabaseAnonKey) {
  console.warn('ChefOS: Invalid or missing SUPABASE_ANON_KEY configuration. Please set it in your environment.');
}
