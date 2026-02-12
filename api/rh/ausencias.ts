
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { LeaveRequestType, LeaveRequestStatus } from '../../src/models/db.models.js';
import { Buffer } from 'buffer';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// FIX RISCO A: Autenticação Segura via JWT
async function authenticateUser(request: VercelRequest): Promise<{ userId?: string; error?: { message: string }; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const token = authHeader.split(' ')[1];
    
    // Validar JWT com Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
        return { error: { message: 'Invalid or expired token.' }, status: 401 };
    }
    
    return { userId: user.id };
}

// Verifica se o usuário tem acesso à loja solicitada
async function checkStoreAccess(userId: string, restaurantId: string): Promise<boolean> {
    if (userId === restaurantId) return true; // Dono

    // Verificar se existe permissão delegada
    const { data } = await supabase
        .from('unit_permissions')
        .select('id')
        .eq('manager_id', userId)
        .eq('store_id', restaurantId)
        .single();
    
    return !!data;
}

/**
 * Sanitizes a filename to be URL-friendly for Supabase Storage.
 */
function sanitizeFilename(filename: string): string {
    const extensionMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
    const extension = extensionMatch ? extensionMatch[0] : '';
    const name = extensionMatch ? filename.slice(0, -extension.length) : filename;

    const sanitizedName = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s_.-]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100);

    return `${sanitizedName}${extension}`;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }

    try {
        // 1. Autenticar Usuário via JWT
        const { userId, error, status } = await authenticateUser(request);
        if (error) {
            return response.status(status!).json({ error });
        }

        // 2. Identificar Loja Alvo (Enviada no Body ou Query)
        const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;
        if (!restaurantId) {
             return response.status(400).json({ error: { message: '`restaurantId` is required.' } });
        }

        // 3. Verificar Permissão (Multi-Loja)
        const hasAccess = await checkStoreAccess(userId!, restaurantId);
        if (!hasAccess) {
             return response.status(403).json({ error: { message: 'You do not have permission to access this store.' } });
        }

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
        console.error('[API /rh/ausencias] Fatal error:', error);
        return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { employeeId, start_date, end_date } = req.query;

    let query = supabase
        .from('leave_requests')
        .select('*, employees(name)')
        .eq('user_id', restaurantId);
    
    if (employeeId) query = query.eq('employee_id', employeeId as string);
    if (start_date) query = query.gte('start_date', start_date as string);
    if (end_date) query = query.lte('end_date', end_date as string);

    query = query.order('start_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { employeeId, request_type, start_date, end_date, reason, attachment, attachment_filename } = req.body;
    
    if (!employeeId || !request_type || !start_date || !end_date) {
        return res.status(400).json({ error: { message: '`employeeId`, `request_type`, `start_date`, and `end_date` are required.' } });
    }

    const validTypes: LeaveRequestType[] = ['Férias', 'Folga', 'Falta Justificada', 'Atestado'];
    if (!validTypes.includes(request_type)) {
        return res.status(400).json({ error: { message: `Invalid \`request_type\`. Must be one of: ${validTypes.join(', ')}` } });
    }

    const { data: newRequest, error } = await supabase
        .from('leave_requests')
        .insert({
            user_id: restaurantId,
            employee_id: employeeId,
            request_type: request_type,
            start_date: start_date,
            end_date: end_date,
            reason: reason || null,
            status: 'Pendente'
        })
        .select()
        .single();
    
    if (error) throw error;

    let finalRequest = newRequest;

    if (attachment && attachment_filename) {
        try {
            const fileBuffer = Buffer.from(attachment, 'base64');
            const sanitizedFilename = sanitizeFilename(attachment_filename);
            const filePath = `public/leave_attachments/${restaurantId}/${newRequest.id}/${sanitizedFilename}`;

            const { error: uploadError } = await supabase.storage
                .from('restaurant_assets')
                .upload(filePath, fileBuffer, {});

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('restaurant_assets')
                .getPublicUrl(filePath);
            
            const { data: updatedRequest, error: updateError } = await supabase
                .from('leave_requests')
                .update({ attachment_url: urlData.publicUrl })
                .eq('id', newRequest.id)
                .select()
                .single();

            if (updateError) throw updateError;
            
            finalRequest = updatedRequest;
        } catch (uploadError: any) {
            console.error(`[API /rh/ausencias] Failed to upload attachment for leave request ${newRequest.id}:`, uploadError.message);
        }
    }
    
    return res.status(201).json(finalRequest);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    const { status, manager_notes } = req.body;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: 'A leave request `id` is required in the query parameters.' } });
    }

    const validStatuses: LeaveRequestStatus[] = ['Aprovada', 'Rejeitada'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: { message: `A valid 'status' ('Aprovada' or 'Rejeitada') is required in the request body.` } });
    }

    const updatePayload: { status: LeaveRequestStatus; manager_notes?: string | null, updated_at: string } = {
        status: status,
        updated_at: new Date().toISOString()
    };

    if (manager_notes !== undefined) {
        updatePayload.manager_notes = manager_notes;
    }

    const { data: updatedRequest, error } = await supabase
        .from('leave_requests')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select()
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') {
            return res.status(404).json({ error: { message: `Leave request with id "${id}" not found.` } });
        }
        throw error;
    }
    
    return res.status(200).json(updatedRequest);
}
