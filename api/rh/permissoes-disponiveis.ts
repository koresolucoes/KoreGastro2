
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ALL_PERMISSION_KEYS } from '../../src/config/permissions.js';
import { authenticateStoreRequest, setStoreApiCorsHeaders } from '../utils/store-auth.js';

export default async function handler(req: any, res: any) {
    setStoreApiCorsHeaders(req, res, ['GET']);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: 'Method Not Allowed' });
    }

    try {
        const auth = await authenticateStoreRequest(req);
        if (!auth.success) {
            return res.status(auth.status!).json({ error: auth.error });
        }
        
        return res.status(200).json(ALL_PERMISSION_KEYS);

    } catch (error: any) {
        console.error('[API /rh/permissoes-disponiveis] Fatal error:', error);
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: error.message || 'An internal server error occurred.' });
    }
}
