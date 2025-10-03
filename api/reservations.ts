import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
    console.error('[API /reservas] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Handler for GET requests ---
async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { action, data, numero_pessoas } = request.query;

    if (action === 'disponibilidade') {
        if (!data || typeof data !== 'string' || !numero_pessoas || typeof numero_pessoas !== 'string') {
            return response.status(400).json({ error: { message: '`data` (YYYY-MM-DD) and `numero_pessoas` query parameters are required for availability check.' } });
        }

        const partySize = parseInt(numero_pessoas, 10);
        const reservationDateStr = data;

        // Fetch settings
        const { data: settings, error: settingsError } = await supabase
            .from('reservation_settings')
            .select('*')
            .eq('user_id', restaurantId)
            .eq('is_enabled', true)
            .single();
        
        if (settingsError || !settings) {
            return response.status(404).json({ error: { message: 'Reservation system not found or not enabled for this restaurant.' } });
        }
        
        if (partySize < settings.min_party_size || partySize > settings.max_party_size) {
            return response.status(400).json({ error: { message: `Party size must be between ${settings.min_party_size} and ${settings.max_party_size}.` } });
        }

        // Fetch existing reservations for the day
        const startOfDay = new Date(reservationDateStr);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(reservationDateStr);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const { data: existingReservations, error: reservationsError } = await supabase
            .from('reservations')
            .select('reservation_time')
            .eq('user_id', restaurantId)
            .gte('reservation_time', startOfDay.toISOString())
            .lte('reservation_time', endOfDay.toISOString())
            .in('status', ['PENDING', 'CONFIRMED']);

        if (reservationsError) throw reservationsError;

        // Generate time slots
        const dayOfWeek = startOfDay.getUTCDay(); // 0 = Sunday
        const daySettings = settings.weekly_hours?.find((d: any) => d.day_of_week === dayOfWeek);

        if (!daySettings || daySettings.is_closed) {
            return response.status(200).json({ availability: [] }); // No slots if closed
        }
        
        const availableSlots: string[] = [];
        const opening = new Date(`1970-01-01T${daySettings.opening_time}Z`);
        let closing = new Date(`1970-01-01T${daySettings.closing_time}Z`);

        if (closing <= opening) {
            closing.setDate(closing.getDate() + 1);
        }

        const existingTimes = new Set(existingReservations.map(r => {
            const d = new Date(r.reservation_time);
            return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        }));

        let current = opening;
        while (current < closing) {
            const timeStr = `${String(current.getUTCHours()).padStart(2, '0')}:${String(current.getUTCMinutes()).padStart(2, '0')}`;
            if (!existingTimes.has(timeStr)) {
                availableSlots.push(timeStr);
            }
            current = new Date(current.getTime() + settings.booking_duration_minutes * 60000);
        }

        return response.status(200).json({ availability: availableSlots });
    }
    
    return response.status(400).json({ error: { message: 'Invalid or missing `action` query parameter. Try `?action=disponibilidade`.' } });
}

// --- Handler for POST requests ---
async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { customer_name, customer_phone, party_size, reservation_time, notes, customer_email } = request.body;

    if (!customer_name || !party_size || !reservation_time) {
        return response.status(400).json({ error: { message: '`customer_name`, `party_size`, and `reservation_time` (ISO 8601 string) are required.' } });
    }
    
    const reservationDateTime = new Date(reservation_time);

    // Conflict check
    const { data: conflictingReservation, error: conflictError } = await supabase
        .from('reservations')
        .select('id')
        .eq('user_id', restaurantId)
        .eq('reservation_time', reservationDateTime.toISOString())
        .in('status', ['PENDING', 'CONFIRMED'])
        .limit(1);

    if (conflictError) throw conflictError;
    if (conflictingReservation && conflictingReservation.length > 0) {
        return response.status(409).json({ error: { message: 'The selected time slot is no longer available.' } });
    }
    
    // Insert new reservation
    const { data: newReservation, error } = await supabase
        .from('reservations')
        .insert({
            user_id: restaurantId,
            customer_name,
            customer_phone: customer_phone || null,
            customer_email: customer_email || null,
            party_size,
            reservation_time: reservationDateTime.toISOString(),
            notes: notes || null,
            status: 'PENDING' // External reservations are pending by default
        })
        .select()
        .single();
        
    if (error) throw error;
    
    return response.status(201).json(newReservation);
}
