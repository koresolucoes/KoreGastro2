import type { VercelRequest, VercelResponse } from '@vercel/node';

// This file is intentionally left with a minimal handler to avoid Vercel routing conflicts.
// The primary logic has been merged into /api/rh.ts, which acts as a manual router.
export default function handler(request: VercelRequest, response: VercelResponse) {
  response.status(404).json({ error: { message: 'This endpoint is deprecated. Use /api/rh/[resource] instead.' } });
}
