import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

import { withAuth, supabase } from '../utils/api-handler.js';
import { z } from 'zod';

const reservationSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  party_size: z.number().int().positive('Party size must be a positive integer'),
  reservation_time: z.string().datetime('Invalid reservation time format'),
  notes: z.string().optional(),
  customer_phone: z.string().optional(),
  customer_email: z.string().email('Invalid email format').optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
  table_id: z.string().uuid('Invalid table_id format').optional()
});

const reservationPatchSchema = reservationSchema.partial();

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    switch (req.method) {
      case 'GET':
        await handleGet(req, res, restaurantId);
        break;
      case 'POST':
        await handlePost(req, res, restaurantId);
        break;
      case 'PATCH':
        await handlePatch(req, res, restaurantId);
        break;
      case 'DELETE':
        await handleDelete(req, res, restaurantId);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        res.status(405).json({ error: "An error occurred" });
    }
});

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id, action, start_date, end_date } = req.query;

    if (action === 'availability') {
        return await handleGetAvailability(req, res, restaurantId);
    }

    if (id && typeof id === 'string') {
        const { data, error } = await supabase.from('reservations').select('*').eq('user_id', restaurantId).eq('id', id).single();
        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ error: "An error occurred" });
            throw error;
        }
        return res.status(200).json(data);
    }
    
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string;

    let query = supabase.from('reservations').select('*').eq('user_id', restaurantId).is('deleted_at', null);

    if (start_date && end_date) {
        const [sY, sM, sD] = (start_date as string).split('-').map(Number);
        const [eY, eM, eD] = (end_date as string).split('-').map(Number);
        query = query
            .gte('reservation_time', new Date(Date.UTC(sY, sM - 1, sD, 0, 0, 0, 0)).toISOString())
            .lte('reservation_time', new Date(Date.UTC(eY, eM - 1, eD, 23, 59, 59, 999)).toISOString());
    }

    if (cursor) query = query.gt('reservation_time', cursor);

    const { data, error } = await query.order('reservation_time', { ascending: true }).limit(limit);
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handleGetAvailability(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { date, party_size } = req.query;
    if (!date || typeof date !== 'string' || !party_size || isNaN(Number(party_size))) {
        return res.status(400).json({ error: "An error occurred" });
    }
    
    const { data: settings, error: settingsError } = await supabase.from('reservation_settings').select('*').eq('user_id', restaurantId).eq('is_enabled', true).single();
    if (settingsError || !settings) {
        return res.status(404).json({ error: "An error occurred" });
    }

    const partySizeNum = Number(party_size);
    if (partySizeNum < settings.min_party_size || partySizeNum > settings.max_party_size) {
        return res.status(400).json({ error: "An error occurred" });
    }
    
    const [year, month, day] = (date as string).split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
    const { data: reservations, error } = await supabase.from('reservations').select('reservation_time').eq('user_id', restaurantId).gte('reservation_time', startOfDay.toISOString()).lte('reservation_time', endOfDay.toISOString()).in('status', ['PENDING', 'CONFIRMED']);
    if (error) throw error;

    const dayOfWeek = startOfDay.getDay();
    const daySettings = settings.weekly_hours?.find((d: any) => d.day_of_week === dayOfWeek);
    if (!daySettings || daySettings.is_closed) return res.status(200).json({ availability: [] });

    const availableSlots: string[] = [];
    const opening = new Date(`1970-01-01T${daySettings.opening_time}Z`);
    let closing = new Date(`1970-01-01T${daySettings.closing_time}Z`);
    if (closing <= opening) closing.setDate(closing.getDate() + 1);

    const existingTimes = new Set(reservations.map(r => new Date(r.reservation_time).toISOString().substring(11, 16)));
    let current = opening;
    while (current < closing) {
        const timeStr = `${String(current.getUTCHours()).padStart(2, '0')}:${String(current.getUTCMinutes()).padStart(2, '0')}`;
        if (!existingTimes.has(timeStr)) {
            availableSlots.push(timeStr);
        }
        current = new Date(current.getTime() + settings.booking_duration_minutes * 60000);
    }
    return res.status(200).json({ availability: availableSlots });
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const parsedBody = reservationSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ error: "An error occurred" });
    }

    const { customer_name, party_size, reservation_time, notes, customer_phone, customer_email, status, table_id } = parsedBody.data;
    
    const { data, error } = await supabase.from('reservations').insert({
        user_id: restaurantId, customer_name, party_size, reservation_time, notes, customer_phone, customer_email,
        status: status || 'PENDING',
        table_id
    }).select().single();
    if (error) throw error;
    return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "An error occurred" });
    }
    
    const parsedBody = reservationPatchSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ error: "An error occurred" });
    }

    const updatePayload = parsedBody.data;
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "An error occurred" });
    }
    const { data, error } = await supabase.from('reservations').update(updatePayload).eq('id', id).eq('user_id', restaurantId).select().single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: "An error occurred" });
        throw error;
    }
    return res.status(200).json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "An error occurred" });
    }
    const { error } = await supabase.from('reservations').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', restaurantId);
    if (error) throw error;
    return res.status(204).end();
}