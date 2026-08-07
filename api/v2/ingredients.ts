import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    const { id } = req.query;

    if (id && typeof id === 'string') {
        const { data, error } = await supabase.from('ingredients').select('*').eq('user_id', restaurantId).eq('id', id).single();
        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Ingredient with id "${id}" not found.` });
            throw error;
        }
        return res.status(200).json(data);
    }

    const { data, error } = await supabase.from('ingredients').select('*').eq('user_id', restaurantId).order('name', { ascending: true });
    if (error) throw error;
    return res.status(200).json(data || []);
});
