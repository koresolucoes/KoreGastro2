// This file reads environment variables. In a browser environment, `process` is not
// available by default. A polyfill is added in `index.html` to prevent crashes.
// For deployment on platforms like Vercel, a build step is required to substitute
// these placeholder values with the actual environment variables.

declare var process: {
  env: {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
    VITE_API_KEY?: string; // Gemini API Key
  };
};

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.VITE_API_KEY;

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