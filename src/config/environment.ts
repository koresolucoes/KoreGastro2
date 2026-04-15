
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
   * Found in your Supabase project settings under "API".
   */
  supabaseUrl: '', // e.g., 'https://xxxxxxxx.supabase.co'

  /**
   * The anonymous public key for your Supabase project.
   * Found in your Supabase project settings under "API".
   */
  supabaseAnonKey: '',

  /**
   * Your API key for the Gemini API from Google AI Studio.
   * Found in Google AI Studio under "Get API key".
   */
  geminiApiKey: '',
};
