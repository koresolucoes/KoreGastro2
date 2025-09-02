// This is a Vercel Serverless Function that exposes public environment variables.
// It should be placed in the `api` directory at the root of the project.

export default function handler(request: any, response: any) {
  // Ensure this is a GET request
  if (request.method !== 'GET') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  const config = {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
    geminiApiKey: process.env.VITE_API_KEY,
  };

  // Basic validation to ensure variables are present on the server
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.geminiApiKey) {
    console.error('One or more environment variables are not set on the Vercel server.');
    return response.status(500).json({ message: 'Server configuration error.' });
  }

  response.setHeader('Content-Type', 'application/json');
  response.status(200).json(config);
}
