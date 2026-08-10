import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePublicTableAction } from './utils/public-table-action.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handlePublicTableAction(req, res, 'CHAMANDO_GARCOM', 'public-call-waiter');
}
