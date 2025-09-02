// This file reads environment variables using `import.meta.env`, which is the
// standard method for Vite-based environments like Vercel's build process.
// Vercel will replace these variables with your project's environment variables
// at build time, but only if they are prefixed with `VITE_`.

// TypeScript needs to know about `import.meta.env`.
// We declare the shape of the env variables we expect.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_KEY: string;
}

// FIX: Augment the global ImportMeta interface to include the `env` property.
// This must be done inside a `declare global` block when inside a module.
declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const geminiApiKey = import.meta.env.VITE_API_KEY;

// We throw errors if the variables aren't set.
// This provides a clear failure mode during development or if the Vercel deployment is misconfigured.
if (!supabaseUrl) {
    throw new Error('Configuration error: Vercel environment variable `VITE_SUPABASE_URL` is not set.');
}
if (!supabaseAnonKey) {
    throw new Error('Configuration error: Vercel environment variable `VITE_SUPABASE_ANON_KEY` is not set.');
}
if (!geminiApiKey) {
    throw new Error('Configuration error: Vercel environment variable `VITE_API_KEY` for Gemini is not set.');
}

export const environment = {
  supabaseUrl,
  supabaseAnonKey,
  geminiApiKey,
};
