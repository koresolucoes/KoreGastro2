

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Customer } from '../src/models/db.models.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      .select('*')
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
      .select('*')
      .eq('user_id', restaurantId)
      .or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},cpf.ilike.${searchTerm},email.ilike.${searchTerm}`);
    
    if (error) throw error;
    return response.status(200).json(data || []);
  }

  // Get all customers for the restaurant if no specific query
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', restaurantId)
    .order('name', { ascending: true });

  if (error) throw error;
  return response.status(200).json(data || []);
}

// --- Handler for POST requests ---
async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
  const body: Partial<Customer> = request.body;

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
      loyalty_points: body.loyalty_points || 0
    })
    .select()
    .single();

  if (error) throw error;
  return response.status(201).json(newCustomer);
}

// --- Handler for PATCH requests ---
async function handlePatch(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { id } = request.query;
    const { loyalty_points_change, description } = request.body;

    if (!id || typeof id !== 'string') {
        return response.status(400).json({ error: { message: 'A customer `id` is required in the query parameters.' } });
    }

    if (loyalty_points_change === undefined || typeof loyalty_points_change !== 'number') {
        return response.status(400).json({ error: { message: '`loyalty_points_change` (number) is required in the request body.' } });
    }
    
    if (!description || typeof description !== 'string') {
        return response.status(400).json({ error: { message: '`description` (string) is required in the request body for logging.' } });
    }

    // This manual, non-atomic approach is a fallback. The ideal solution is an RPC function.
    // It's acceptable for many scenarios but can have race conditions under heavy load.
    const { data: customer, error: fetchError } = await supabase
        .from('customers')
        .select('loyalty_points')
        .eq('id', id)
        .eq('user_id', restaurantId)
        .single();
    
    if (fetchError) throw new Error(`Could not find customer to update points: ${fetchError.message}`);

    const newPoints = (customer.loyalty_points || 0) + loyalty_points_change;

    const { data: updatedCustomer, error: updateError } = await supabase
        .from('customers')
        .update({ loyalty_points: newPoints })
        .eq('id', id)
        .select()
        .single();
    
    if (updateError) throw new Error(`Could not update customer points: ${updateError.message}`);
    
    // Log the movement for traceability
    const { error: logError } = await supabase.from('loyalty_movements').insert({
       user_id: restaurantId,
       customer_id: id,
       points_change: loyalty_points_change,
       description: description
    });
    
    if(logError) console.error("Failed to log loyalty movement after manual update:", logError.message);
    
    return response.status(200).json(updatedCustomer);
}