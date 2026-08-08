import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../../utils/api-handler.js';
import crypto from 'crypto';
import { TimeClockEntry } from '../../../src/models/db.models.js';

// Haversine formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // in metres
}

function generatePontoSignature(data: any): string {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'default-secret';
    const payload = JSON.stringify(data);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('hex');
}

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    const { employeeId, pin, latitude, longitude } = req.body;

    if (!employeeId || !pin) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '\`employeeId\` and \`pin\` are required.' });
    }

    const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('id, name, pin, current_clock_in_id, cpf')
        .eq('id', employeeId)
        .eq('user_id', restaurantId)
        .single();
        
    if (empError || !employee) {
        return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: 'Employee not found.' });
    }

    if (employee.pin !== pin) {
        return res.status(403).json({ type: "about:blank", title: "Forbidden", status: 403, detail: 'Invalid PIN.' });
    }
        
    // --- Geolocation validation logic ---
    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('user_id, cnpj, latitude, longitude, time_clock_radius')
      .eq('user_id', restaurantId)
      .single();

    if (profileError) throw profileError;

    if (profile.latitude && profile.longitude && profile.time_clock_radius) {
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Localização do funcionário não fornecida.' });
        }
        
        const distance = getDistance(latitude, longitude, profile.latitude, profile.longitude);
        if (distance > profile.time_clock_radius) {
            return res.status(403).json({ type: "about:blank", title: "Forbidden", status: 403, detail: 'Você está muito longe do restaurante para bater o ponto.' });
        }
    }

    const now = new Date().toISOString();
        
    const generateReceipt = (action: string) => {
        const receiptData = {
            employeeId: employee.id,
            employeeName: employee.name,
            employeeCpf: employee.cpf || '',
            restaurantId: profile.user_id,
            restaurantCnpj: profile.cnpj || '',
            timestamp: now,
            action: action,
        };
        return generatePontoSignature(receiptData);
    };

    if (!employee.current_clock_in_id) { // Clocking in
        const sigData = generateReceipt('clock_in');
        const signatures = { clock_in: sigData };

        const { data: newEntry, error: insertError } = await supabase.from('time_clock_entries').insert({ 
             employee_id: employeeId, 
             user_id: restaurantId,
            latitude: latitude || null,
            longitude: longitude || null,
            clock_in_time: now,
            signatures: signatures
        }).select('id').single();

        if (insertError) throw insertError;

        await supabase.from('employees').update({ current_clock_in_id: newEntry.id }).eq('id', employeeId);

        return res.status(200).json({ status: 'TURNO_INICIADO', employeeName: employee.name, signatureData: sigData });

    } else { // Interacting with an active shift
        const { data: activeEntry, error: entryError } = await supabase.from('time_clock_entries').select('*').eq('id', employee.current_clock_in_id).single();

        if (entryError || !activeEntry) {
            await supabase.from('employees').update({ current_clock_in_id: null }).eq('id', employeeId);
            return res.status(409).json({ type: "about:blank", title: "Conflict", status: 409, detail: 'Shift data out of sync. Please try again.' });
        }

        const currentSignatures = activeEntry.signatures || {};

        if (!activeEntry.break_start_time) { // Starting break
            const sigData = generateReceipt('break_start');
            currentSignatures.break_start = sigData;
            await supabase.from('time_clock_entries').update({ break_start_time: now, signatures: currentSignatures }).eq('id', activeEntry.id);
            return res.status(200).json({ status: 'PAUSA_INICIADA', employeeName: employee.name, signatureData: sigData });

        } else if (!activeEntry.break_end_time) { // Ending break
            const sigData = generateReceipt('break_end');
            currentSignatures.break_end = sigData;
            await supabase.from('time_clock_entries').update({ break_end_time: now, signatures: currentSignatures }).eq('id', activeEntry.id);
            return res.status(200).json({ status: 'PAUSA_FINALIZADA', employeeName: employee.name, signatureData: sigData });

        } else { // Clocking out
            const sigData = generateReceipt('clock_out');
            currentSignatures.clock_out = sigData;
            await supabase.from('time_clock_entries').update({ clock_out_time: now, signatures: currentSignatures }).eq('id', activeEntry.id);
            await supabase.from('employees').update({ current_clock_in_id: null }).eq('id', employeeId);
            return res.status(200).json({ status: 'TURNO_FINALIZADO', employeeName: employee.name, signatureData: sigData });
        }
    }
});
