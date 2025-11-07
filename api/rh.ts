import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { ALL_PERMISSION_KEYS } from '../src/config/permissions.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function handleError(response: VercelResponse, error: any, context: string) {
    console.error(`[API /api/rh.ts] Error in ${context}:`, error);
    const statusCode = error.code === 'PGRST116' ? 404 : 500;
    const message = error.code === 'PGRST116' ? 'Resource not found.' : error.message || 'An internal server error occurred.';
    return response.status(statusCode).json({ error: { message } });
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers at the top
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // This handler is for the root `/api/rh` path.
  // Any specific resources like `/api/rh/funcionarios` are handled by `api/rh/[...slug].ts`.
  // We can return a simple status or a 404 if no root action is defined.
  try {
    // You could add logic here for a GET /api/rh request if needed.
    return response.status(404).json({ error: { message: 'No endpoint defined for the root /api/rh path. Try a specific resource like /api/rh/funcionarios.' } });
  } catch (error) {
    return handleError(response, error, 'handler in api/rh.ts');
  }
}
