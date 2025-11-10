import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Customer } from '../src/models/db.models.js';
import { createHash, timingSafeEqual } from 'crypto';
import { Buffer } from 'buffer';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PUBLIC_CUSTOMER_COLUMNS = 'id, name, phone, email, cpf, notes, loyalty_points, user_id, created_at, address, latitude, longitude';

// --- Handler for Login requests ---
async function handleLogin(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { identifier, password } = request.body;

    if (!identifier || !password) {
        return response.status(400).json({ error: { message: 'Identifier (email, phone, or cpf) and password are required.' } });
    }

    const { data: customer, error: fetchError } = await supabase
        .from('customers')
        .select('id, password_hash')
        .eq('user_id', restaurantId)
        .or(`email.eq.${identifier},phone.eq.${identifier},cpf.eq.${identifier}`)
        .maybeSingle();
    
    if (fetchError || !customer || !customer.password_hash) {
        return response.status(401).json({ error: { message: 'Invalid credentials.' } });
    }

    const passwordHash = createHash('sha256').update(password).digest('hex');
    const storedHash = customer.password_hash;
    
    try {
        const areEqual = timingSafeEqual(Buffer.from(passwordHash), Buffer.from(storedHash));

        if (areEqual) {
            const { data: customerPublicData, error: publicFetchError } = await supabase
                .from('customers')
                .select(PUBLIC_CUSTOMER_COLUMNS)
                .eq('id', customer.id)
                .single();
            
            if (publicFetchError) throw publicFetchError;

            return response.status(200).json(customerPublicData);
        } else {
            return response.status(401).json({ error: { message: 'Invalid credentials.' } });
        }
    } catch (e) {
        // This will catch errors from timingSafeEqual if hashes have different lengths
        return response.status(401).json({ error: { message: 'Invalid credentials.' } });
    }
}


// Main handler function
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
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
    
    // Custom action routing
    if (request.query.action === 'login' && request.method === 'POST') {
        await handleLogin(request, response, restaurantId);
        return;
    }

    // 2. Method Routing
    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId);
        break;
      case 'POST':
        await handlePost(request, response, restaurantId);
        break;
      case 'PATCH':
        await handlePatch(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'POST', 'PATCH']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /clientes] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Handler for GET requests ---
async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
  const { id, search } = request.query;

  if (id) {
    // Get a single customer by ID
    const { data, error } = await supabase
      .from('customers')
      .select(PUBLIC_CUSTOMER_COLUMNS)
      .eq('user_id', restaurantId)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "No rows found"
    if (!data) return response.status(404).json({ error: { message: 'Customer not found.' } });
    return response.status(200).json(data);
  }

  if (search && typeof search === 'string') {
    // Search for customers
    const searchTerm = `%${search}%`;
    const { data, error } = await supabase
      .from('customers')
      .select(PUBLIC_CUSTOMER_COLUMNS)
      .eq('user_id', restaurantId)
      .or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},cpf.ilike.${searchTerm},email.ilike.${searchTerm}`);
    
    if (error) throw error;
    return response.status(200).json(data || []);
  }

  // Get all customers for the restaurant if no specific query
  const { data, error } = await supabase
    .from('customers')
    .select(PUBLIC_CUSTOMER_COLUMNS)
    .eq('user_id', restaurantId)
    .order('name', { ascending: true });

  if (error) throw error;
  return response.status(200).json(data || []);
}

// --- Handler for POST requests ---
async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
  const body: Partial<Customer> & { password?: string } = request.body;

  if (!body.name) {
    return response.status(400).json({ error: { message: '`name` is a required field.' } });
  }

  // Check for duplicates
  if (body.cpf || body.phone) {
    const orConditions = [];
    if (body.cpf) orConditions.push(`cpf.eq.${body.cpf}`);
    if (body.phone) orConditions.push(`phone.eq.${body.phone}`);
    
    if (orConditions.length > 0) {
      const { data: existing, error: checkError } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', restaurantId)
        .or(orConditions.join(','))
        .limit(1);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        return response.status(409).json({ error: { message: 'A customer with this CPF or phone number already exists.' } });
      }
    }
  }

  let password_hash: string | null = null;
  if (body.password) {
      if (typeof body.password !== 'string' || body.password.length < 6) {
          return response.status(400).json({ error: { message: 'Password must be a string of at least 6 characters.' } });
      }
      password_hash = createHash('sha256').update(body.password).digest('hex');
  }

  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      user_id: restaurantId,
      name: body.name,
      phone: body.phone || null,
      email: body.email || null,
      cpf: body.cpf || null,
      notes: body.notes || null,
      address: body.address || null,
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      loyalty_points: body.loyalty_points || 0,
      password_hash: password_hash
    })
    .select(PUBLIC_CUSTOMER_COLUMNS)
    .single();

  if (error) throw error;
  return response.status(201).json(newCustomer);
}

// --- Handler for PATCH requests ---
async function handlePatch(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { id } = request.query;
    const { loyalty_points_change, description, password, ...otherFields } = request.body;

    if (!id || typeof id !== 'string') {
        return response.status(400).json({ error: { message: 'A customer `id` is required in the query parameters.' } });
    }

    // --- Loyalty Points Update (special case) ---
    if (loyalty_points_change !== undefined) {
        if (typeof loyalty_points_change !== 'number' || !description || typeof description !== 'string') {
            return response.status(400).json({ error: { message: '`loyalty_points_change` (number) and `description` are required for loyalty updates.' } });
        }
        
        const { data: customer, error: fetchError } = await supabase.from('customers').select('loyalty_points').eq('id', id).eq('user_id', restaurantId).single();
        if (fetchError) throw new Error(`Could not find customer to update points: ${fetchError.message}`);
        
        const newPoints = (customer.loyalty_points || 0) + loyalty_points_change;
        const { data: updatedCustomer, error: updateError } = await supabase.from('customers').update({ loyalty_points: newPoints }).eq('id', id).select(PUBLIC_CUSTOMER_COLUMNS).single();
        if (updateError) throw new Error(`Could not update customer points: ${updateError.message}`);
        
        const { error: logError } = await supabase.from('loyalty_movements').insert({ user_id: restaurantId, customer_id: id, points_change: loyalty_points_change, description: description });
        if(logError) console.error("Failed to log loyalty movement:", logError.message);
        
        return response.status(200).json(updatedCustomer);
    }

    // --- General Field & Password Update ---
    const updatePayload: { [key: string]: any } = {};
    const allowedFields: (keyof Customer)[] = ['name', 'phone', 'email', 'cpf', 'notes', 'address', 'latitude', 'longitude'];
    for (const field of allowedFields) {
        if (request.body[field] !== undefined) {
            updatePayload[field] = request.body[field];
        }
    }

    if (password) {
        if (typeof password !== 'string' || password.length < 6) {
            return response.status(400).json({ error: { message: 'Password must be a string of at least 6 characters.' } });
        }
        updatePayload.password_hash = createHash('sha256').update(password).digest('hex');
    }

    if (Object.keys(updatePayload).length > 0) {
        const { data: updatedCustomer, error: updateError } = await supabase
            .from('customers')
            .update(updatePayload)
            .eq('id', id)
            .eq('user_id', restaurantId)
            .select(PUBLIC_CUSTOMER_COLUMNS)
            .single();

        if (updateError) throw updateError;
        return response.status(200).json(updatedCustomer);
    }
    
    return response.status(400).json({ error: { message: 'No valid update fields provided.' } });
}