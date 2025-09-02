// To inform TypeScript about the global `process` object provided by the environment.
declare var process: {
  env: {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
  };
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
    throw new Error('Vercel environment variable `SUPABASE_URL` is not set.');
}

if (!supabaseAnonKey) {
    throw new Error('Vercel environment variable `SUPABASE_ANON_KEY` is not set.');
}

export const environment = {
  supabaseUrl,
  supabaseAnonKey,
};
