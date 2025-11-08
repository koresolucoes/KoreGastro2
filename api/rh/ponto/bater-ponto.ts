import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { TimeClockEntry } from '../../../src/models/db.models.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function authenticateAndGetRestaurantId(request: VercelRequest): Promise<{ restaurantId: string; error?: { message: string }; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { restaurantId: '', error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;
    if (!restaurantId) {
        return { restaurantId: '', error: { message: '`restaurantId` is required.' }, status: 400 };
    }
    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();
    if (profileError || !profile || !profile.external_api_key) {
        return { restaurantId, error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }
    if (providedApiKey !== profile.external_api_key) {
        return { restaurantId, error: { message: 'Invalid API key.' }, status: 403 };
    }
    return { restaurantId };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }

    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }

    try {
        const { restaurantId, error, status } = await authenticateAndGetRestaurantId(request);
        if (error) {
            return response.status(status!).json({ error });
        }

        const { employeeId, pin, latitude, longitude } = request.body;
        if (!employeeId || !pin) {
            return response.status(400).json({ error: { message: '`employeeId` and `pin` are required.' } });
        }

        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('id, name, pin, current_clock_in_id')
            .eq('id', employeeId)
            .single();
        
        if (empError || !employee) {
            return response.status(404).json({ error: { message: 'Employee not found.' } });
        }
        if (employee.pin !== pin) {
            return response.status(403).json({ error: { message: 'Invalid PIN.' } });
        }

        const now = new Date().toISOString();

        if (!employee.current_clock_in_id) { // Clocking in
            const { data: newEntry, error: insertError } = await supabase.from('time_clock_entries').insert({ 
                employee_id: employeeId, 
                user_id: restaurantId,
                latitude: latitude || null,
                longitude: longitude || null
            }).select('id').single();
            if (insertError) throw insertError;
            await supabase.from('employees').update({ current_clock_in_id: newEntry.id }).eq('id', employeeId);
            return response.status(200).json({ status: 'TURNO_INICIADO', employeeName: employee.name });
        } else { // Interacting with an active shift
            const { data: activeEntry, error: entryError } = await supabase.from('time_clock_entries').select('*').eq('id', employee.current_clock_in_id).single();
            if (entryError || !activeEntry) {
                // This case can happen if the `current_clock_in_id` is stale. Let's fix it and ask the user to try again.
                await supabase.from('employees').update({ current_clock_in_id: null }).eq('id', employeeId);
                return response.status(409).json({ error: { message: 'Shift data out of sync. Please try again.' } });
            }

            if (!activeEntry.break_start_time) { // Starting break
                await supabase.from('time_clock_entries').update({ break_start_time: now }).eq('id', activeEntry.id);
                return response.status(200).json({ status: 'PAUSA_INICIADA', employeeName: employee.name });
            } else if (!activeEntry.break_end_time) { // Ending break
                await supabase.from('time_clock_entries').update({ break_end_time: now }).eq('id', activeEntry.id);
                return response.status(200).json({ status: 'PAUSA_FINALIZADA', employeeName: employee.name });
            } else { // Clocking out
                await supabase.from('time_clock_entries').update({ clock_out_time: now }).eq('id', activeEntry.id);
                await supabase.from('employees').update({ current_clock_in_id: null }).eq('id', employeeId);
                return response.status(200).json({ status: 'TURNO_FINALIZADO', employeeName: employee.name });
            }
        }
    } catch (error: any) {
        console.error('[API /rh/ponto/bater-ponto] Fatal error:', error);
        return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}