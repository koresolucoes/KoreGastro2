import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    if (request.method !== 'GET') {
        response.setHeader('Allow', ['GET']);
        return response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }

    const { id } = request.query;

    if (id && typeof id === 'string') {
        const { data, error } = await supabase.from('employees').select('id, name, role_id, created_at, user_id, current_clock_in_id, email').eq('user_id', restaurantId).eq('id', id).single();
        if (error) {
            if (error.code === 'PGRST116') return response.status(404).json({ error: { message: `Employee with id "${id}" not found.` } });
            throw error;
        }
        return response.status(200).json(data);
    }

    const { data, error } = await supabase.from('employees').select('id, name, role_id, created_at, user_id, current_clock_in_id, email').eq('user_id', restaurantId).order('name', { ascending: true });
    if (error) throw error;
    return response.status(200).json(data || []);
});
