// This file reads environment variables from `process.env`.
// We expect Vercel's build process to perform a static replacement of these
// variables with the values from your project's environment variables.
// A polyfill for `process` is included in `index.html` to prevent runtime errors in the browser.

// Tell TypeScript that `process` exists globally, as it will be polyfilled.
declare const process: any;

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.VITE_API_KEY;

// After Vercel's build, these variables should be replaced with string literals.
// If the replacement doesn't happen, `process.env.VAR` will resolve to `undefined`.
// This check ensures the app fails fast with a clear error if configuration is missing.
if (!supabaseUrl) {
    throw new Error('Configuration error: Vercel environment variable `VITE_SUPABASE_URL` is not set or was not injected at build time.');
}
if (!supabaseAnonKey) {
    throw new Error('Configuration error: Vercel environment variable `VITE_SUPABASE_ANON_KEY` is not set or was not injected at build time.');
}
if (!geminiApiKey) {
    throw new Error('Configuration error: Vercel environment variable `VITE_API_KEY` for Gemini is not set or was not injected at build time.');
}

export const environment = {
  supabaseUrl,
  supabaseAnonKey,
  geminiApiKey,
};