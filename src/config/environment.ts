import { initializeSupabaseClient } from '../services/supabase-client';

/**
 * This module is responsible for fetching the application's runtime configuration
 * from a serverless function. This ensures that environment variables from Vercel
 * are securely passed to the client-side application without being exposed in the build.
 */

// This will hold the fetched config and be imported by other services.
export let appConfig: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string;
};

/**
 * Fetches the configuration from the `/api/config` endpoint, populates
 * the `appConfig` object, and initializes the Supabase client. This function must
 * be called and awaited in the application's entry point (`index.ts`) before bootstrapping Angular.
 */
export async function loadEnvironmentConfig(): Promise<void> {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
    }
    const config = await response.json();
    if (!config.supabaseUrl || !config.supabaseAnonKey || !config.geminiApiKey) {
      throw new Error('One or more required config keys are missing from the API response.');
    }
    appConfig = config;

    // Initialize services that depend on the config
    initializeSupabaseClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey);

  } catch (error) {
    console.error('FATAL: Failed to load application configuration.', error);
    // Display a user-friendly error message if the app cannot load.
    document.body.innerHTML = `<div style="color: white; background-color: #111827; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; padding: 2rem;">
        <h1 style="color: #ef4444; font-size: 1.5rem;">Erro Crítico</h1>
        <p style="margin-top: 0.5rem;">Não foi possível carregar a configuração da aplicação.</p>
        <p style="margin-top: 1rem; font-size: 0.875rem; color: #9ca3af;">Por favor, verifique se as variáveis de ambiente estão configuradas corretamente em Vercel e se a aplicação foi reimplantada.</p>
    </div>`;
    throw error; // Re-throw the error to stop the application execution.
  }
}
