
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Employee, TimeClockEntry } from '../src/models/db.models.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Main handler function
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    // 1. Authentication
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;

    if (!restaurantId) {
      return response.status(400).json({ error: { message: '`restaurantId` is required.' } });
    }

    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();

    if (profileError || !profile || !profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid `restaurantId` or API key not configured.' } });
    }

    if (providedApiKey !== profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid API key.' } });
    }

    // 2. Method Routing
    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId);
        break;
      case 'POST':
        await handlePost(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'POST']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /rh] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Handler for GET requests ---
async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
  const { action } = request.query;

  if (action === 'employees') {
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, photo_url, current_clock_in_id, roles(name)')
      .eq('user_id', restaurantId)
      .order('name', { ascending: true });

    if (error) throw error;
    
    const employeesWithRole = (data || []).map((emp: any) => ({
        id: emp.id,
        name: emp.name,
        role: emp.roles?.name || 'Sem Cargo',
        photo_url: emp.photo_url,
        is_clocked_in: !!emp.current_clock_in_id,
    }));
    
    return response.status(200).json(employeesWithRole);
  }

  return response.status(400).json({ error: { message: 'Invalid or missing `action` query parameter. Use `employees`.' } });
}

// --- Handler for POST requests ---
async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { employeeId, pin, action } = request.body;
    
    if (!employeeId || !pin || !action) {
        return response.status(400).json({ error: { message: '`employeeId`, `pin`, and `action` are required.' } });
    }
    
    const { data: employee, error: pinError } = await supabase
        .from('employees')
        .select('id, name, pin, current_clock_in_id')
        .eq('id', employeeId)
        .eq('user_id', restaurantId)
        .single();
    
    if (pinError || !employee) {
        return response.status(404).json({ error: { message: 'Employee not found.' } });
    }

    if (employee.pin !== pin) {
        return response.status(401).json({ error: { message: 'Invalid PIN.' } });
    }

    const currentClockInId = employee.current_clock_in_id;

    switch (action) {
        case 'clock_in':
            if (currentClockInId) {
                return response.status(409).json({ error: { message: `${employee.name} is already clocked in.` } });
            }
            const { data: newEntry, error: inError } = await supabase.from('time_clock_entries').insert({ employee_id: employee.id, user_id: restaurantId }).select('id').single();
            if (inError) throw inError;
            await supabase.from('employees').update({ current_clock_in_id: newEntry.id }).eq('id', employee.id);
            return response.status(200).json({ success: true, message: `Clock-in successful for ${employee.name}.` });

        case 'clock_out':
        case 'start_break':
        case 'end_break':
            if (!currentClockInId) {
                 return response.status(409).json({ error: { message: `${employee.name} is not clocked in.` } });
            }
            const { data: currentEntry, error: fetchError } = await supabase.from('time_clock_entries').select('*').eq('id', currentClockInId).single();
            if (fetchError || !currentEntry) throw fetchError || new Error('Active shift record not found');

            if (action === 'start_break') {
                if (currentEntry.break_start_time) return response.status(409).json({ error: { message: 'Already on a break.' } });
                const { error } = await supabase.from('time_clock_entries').update({ break_start_time: new Date().toISOString() }).eq('id', currentEntry.id);
                if (error) throw error;
                return response.status(200).json({ success: true, message: `Break started for ${employee.name}.` });
            }
            if (action === 'end_break') {
                if (!currentEntry.break_start_time || currentEntry.break_end_time) return response.status(409).json({ error: { message: 'Not on an active break.' } });
                const { error } = await supabase.from('time_clock_entries').update({ break_end_time: new Date().toISOString() }).eq('id', currentEntry.id);
                if (error) throw error;
                return response.status(200).json({ success: true, message: `Break ended for ${employee.name}.` });
            }
            if (action === 'clock_out') {
                const { error } = await supabase.from('time_clock_entries').update({ clock_out_time: new Date().toISOString() }).eq('id', currentEntry.id);
                if (error) throw error;
                await supabase.from('employees').update({ current_clock_in_id: null }).eq('id', employee.id);
                return response.status(200).json({ success: true, message: `Clock-out successful for ${employee.name}.` });
            }
            break;
            
        default:
            return response.status(400).json({ error: { message: `Invalid action: ${action}` } });
    }
}
