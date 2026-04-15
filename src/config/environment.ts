
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
  /**
   * The public URL of your Supabase project.
   */
  supabaseUrl: typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '',

  /**
   * The anonymous public key for your Supabase project.
   */
  supabaseAnonKey: typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '',

  /**
   * Your API key for the Gemini API from Google AI Studio.
   */
  geminiApiKey: typeof GEMINI_API_KEY !== 'undefined' ? GEMINI_API_KEY : '',
};
