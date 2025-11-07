import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { TimeClockEntry } from '../../src/models/db.models.js';
import { ALL_PERMISSION_KEYS } from '../../src/config/permissions.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Helper Functions ---

function handleError(response: VercelResponse, error: any, context: string) {
    console.error(`[API /api/rh/[...slug].ts] Error in ${context}:`, error);
    const statusCode = error.code === 'PGRST116' ? 404 : 500;
    const message = error.code === 'PGRST116' ? 'Resource not found.' : error.message || 'An internal server error occurred.';
    return response.status(statusCode).json({ error: { message } });
}

function calculateDurationInMs(entry: TimeClockEntry): number {
    if (!entry.clock_out_time) return 0;
    const start = new Date(entry.clock_in_time).getTime();
    const end = new Date(entry.clock_out_time).getTime();
    const totalDuration = end > start ? end - start : 0;
    let breakDuration = 0;
    if (entry.break_start_time && entry.break_end_time) {
        const breakStart = new Date(entry.break_start_time).getTime();
        const breakEnd = new Date(entry.break_end_time).getTime();
        if (breakEnd > breakStart) breakDuration = breakEnd - breakStart;
    }
    return Math.max(0, totalDuration - breakDuration);
}

const getWeekNumber = (d: Date): number => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return d.getUTCFullYear() * 100 + weekNo;
};

// --- Main Handler ---

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers at the top
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
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
      .from('company_profile').select('external_api_key').eq('user_id', restaurantId).single();

    if (profileError || !profile || !profile.external_api_key || providedApiKey !== profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid `restaurantId` or API key.' } });
    }

    const slug = request.query.slug as string[];
    if (!slug || slug.length === 0) {
        return response.status(404).json({ error: { message: 'Resource not specified.' } });
    }

    const resource = slug[0];
    const id = slug[1];
    const subResource = slug[2];

    switch (resource) {
      case 'funcionarios':
        return await handleFuncionarios(request, response, restaurantId, id);
      case 'cargos':
        return await handleCargos(request, response, restaurantId, id, subResource);
      case 'permissoes-disponiveis':
        return response.status(200).json(ALL_PERMISSION_KEYS);
      case 'ponto':
        return await handlePonto(request, response, restaurantId, id);
      case 'escalas':
        return await handleEscalas(request, response, restaurantId, id, subResource);
      case 'folha-pagamento':
        return await handleFolhaPagamento(request, response, restaurantId, id);
      default:
        response.status(404).json({ error: { message: 'Resource not found.' } });
    }
  } catch (error) {
    return handleError(response, error, 'mainHandler in api/rh/[...slug].ts');
  }
}

// --- Resource Handlers ---

async function handleFuncionarios(req: VercelRequest, res: VercelResponse, restaurantId: string, id?: string) {
    try {
        if (id) { // Item-level operations
            switch (req.method) {
                case 'GET':
                    const { data, error } = await supabase.from('employees').select('*, roles(name)').eq('id', id).eq('user_id', restaurantId).single();
                    if (error) throw error;
                    return res.status(200).json(data);
                case 'PATCH':
                    const { data: updatedEmp, error: patchError } = await supabase.from('employees').update(req.body).eq('id', id).eq('user_id', restaurantId).select().single();
                    if (patchError) throw patchError;
                    return res.status(200).json(updatedEmp);
                case 'DELETE':
                    const { error: deleteError } = await supabase.from('employees').delete().eq('id', id).eq('user_id', restaurantId);
                    if (deleteError) throw deleteError;
                    return res.status(204).end();
                default:
                    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
                    return res.status(405).end('Method Not Allowed');
            }
        } else { // Collection-level operations
            switch (req.method) {
                case 'GET':
                    const { data, error } = await supabase.from('employees').select('*, roles(name)').eq('user_id', restaurantId).order('name');
                    if (error) throw error;
                    return res.status(200).json(data || []);
                case 'POST':
                    const { data: newEmp, error: postError } = await supabase.from('employees').insert({ ...req.body, user_id: restaurantId }).select().single();
                    if (postError) throw postError;
                    return res.status(201).json(newEmp);
                default:
                    res.setHeader('Allow', ['GET', 'POST']);
                    return res.status(405).end('Method Not Allowed');
            }
        }
    } catch (error) {
        return handleError(res, error, 'handleFuncionarios');
    }
}


async function handleCargos(req: VercelRequest, res: VercelResponse, restaurantId: string, id?: string, subResource?: string) {
    try {
        if (id && subResource === 'permissoes') {
            if (req.method === 'GET') {
                const { data, error } = await supabase.from('role_permissions').select('permission_key').eq('role_id', id);
                if (error) throw error;
                return res.status(200).json((data || []).map(p => p.permission_key));
            }
            if (req.method === 'PUT') {
                const { permissions } = req.body;
                if (!Array.isArray(permissions)) return res.status(400).json({ error: { message: 'Body must contain a `permissions` array.' } });
                
                await supabase.from('role_permissions').delete().eq('role_id', id);
                if (permissions.length > 0) {
                    const toInsert = permissions.map(key => ({ role_id: id, permission_key: key, user_id: restaurantId }));
                    const { error: insertError } = await supabase.from('role_permissions').insert(toInsert);
                    if (insertError) throw insertError;
                }
                return res.status(200).json({ success: true, message: 'Permissions updated.' });
            }
            res.setHeader('Allow', ['GET', 'PUT']);
            return res.status(405).end('Method Not Allowed');
        } else if (!id) { // Collection-level
            if (req.method === 'GET') {
                const { data, error } = await supabase.from('roles').select('*').eq('user_id', restaurantId);
                if (error) throw error;
                return res.status(200).json(data || []);
            }
            res.setHeader('Allow', ['GET']);
            return res.status(405).end('Method Not Allowed');
        } else {
            return res.status(404).json({ error: { message: 'Not Found' } });
        }
    } catch (error) {
        return handleError(res, error, 'handleCargos');
    }
}


async function handlePonto(req: VercelRequest, res: VercelResponse, restaurantId: string, id?: string) {
    try {
        if (req.method === 'POST' && id === 'bater-ponto') {
            const { pin, employeeId } = req.body;
            if (!pin || !employeeId) return res.status(400).json({ error: { message: '`pin` and `employeeId` are required.' } });
            
            const { data: emp, error: pinError } = await supabase.from('employees').select('id, name, current_clock_in_id').eq('id', employeeId).eq('pin', pin).eq('user_id', restaurantId).single();
            if (pinError || !emp) return res.status(404).json({ error: { message: 'Employee not found or PIN is incorrect.' } });
            
            if (!emp.current_clock_in_id) {
                const { data: newEntry, error } = await supabase.from('time_clock_entries').insert({ employee_id: emp.id, user_id: restaurantId }).select('id').single();
                if (error) throw error;
                await supabase.from('employees').update({ current_clock_in_id: newEntry.id }).eq('id', emp.id);
                return res.status(200).json({ status: 'TURNO_INICIADO', employeeName: emp.name });
            } else {
                const { data: entry, error: entryError } = await supabase.from('time_clock_entries').select('*').eq('id', emp.current_clock_in_id).single();
                if (entryError) throw entryError;
                
                if (!entry.break_start_time) {
                     await supabase.from('time_clock_entries').update({ break_start_time: new Date().toISOString() }).eq('id', entry.id);
                     return res.status(200).json({ status: 'PAUSA_INICIADA', employeeName: emp.name });
                } else if (!entry.break_end_time) {
                     await supabase.from('time_clock_entries').update({ break_end_time: new Date().toISOString() }).eq('id', entry.id);
                     return res.status(200).json({ status: 'PAUSA_FINALIZADA', employeeName: emp.name });
                } else {
                     await supabase.from('time_clock_entries').update({ clock_out_time: new Date().toISOString() }).eq('id', entry.id);
                     await supabase.from('employees').update({ current_clock_in_id: null }).eq('id', emp.id);
                     return res.status(200).json({ status: 'TURNO_FINALIZADO', employeeName: emp.name });
                }
            }
        }
        
        if (req.method === 'PATCH' && id) {
             const { data: updatedEntry, error } = await supabase.from('time_clock_entries').update(req.body).eq('id', id).select().single();
             if (error) throw error;
             return res.status(200).json(updatedEntry);
        }

        if (req.method === 'GET' && !id) {
            const { data_inicio, data_fim, employeeId: empIdQuery } = req.query;
            let query = supabase.from('time_clock_entries').select('*, employees(name)').eq('user_id', restaurantId);
            if (data_inicio) query = query.gte('clock_in_time', `${data_inicio}T00:00:00`);
            if (data_fim) query = query.lte('clock_in_time', `${data_fim}T23:59:59`);
            if (empIdQuery) query = query.eq('employee_id', empIdQuery as string);
            const { data, error } = await query.order('clock_in_time', { ascending: false });
            if (error) throw error;
            return res.status(200).json(data || []);
        }

        if(req.method === 'POST' && !id) {
            const { data: newEntry, error } = await supabase.from('time_clock_entries').insert({ ...req.body, user_id: restaurantId }).select().single();
            if (error) throw error;
            return res.status(201).json(newEntry);
        }

        return res.status(404).json({ error: { message: 'Not Found' } });
    } catch (error) {
        return handleError(res, error, 'handlePonto');
    }
}


async function handleEscalas(req: VercelRequest, res: VercelResponse, restaurantId: string, id?: string, subResource?: string) {
    try {
        if (req.method === 'POST' && id && subResource === 'publicar') {
            const { publish } = req.body;
            if (publish === undefined) return res.status(400).json({ error: { message: '`publish` (boolean) is required.' } });
            const { error } = await supabase.from('schedules').update({ is_published: !!publish }).eq('id', id);
            if (error) throw error;
            return res.status(200).json({ success: true, message: `Schedule ${id} publish state set to ${!!publish}.` });
        }
        if (req.method === 'GET' && !id) {
            let query = supabase.from('schedules').select('*, shifts(*)').eq('user_id', restaurantId);
            if(req.query.data_inicio) query = query.gte('week_start_date', req.query.data_inicio as string);
            if(req.query.data_fim) query = query.lte('week_start_date', req.query.data_fim as string);
            const { data, error } = await query;
            if(error) throw error;
            return res.status(200).json(data || []);
        }
        return res.status(404).json({ error: { message: 'Not Found' } });
    } catch (error) {
        return handleError(res, error, 'handleEscalas');
    }
}

async function handleFolhaPagamento(req: VercelRequest, res: VercelResponse, restaurantId: string, id?: string) {
    if (req.method !== 'GET' || id !== 'resumo') {
        return res.status(404).json({ error: { message: 'Not found. Use GET /api/rh/folha-pagamento/resumo?mes=MM&ano=YYYY' } });
    }
    
    try {
        const { mes, ano } = req.query;
        if (!mes || !ano) return res.status(400).json({ error: { message: 'Query params `mes` and `ano` are required.' } });
        
        const month = parseInt(mes as string) -1;
        const year = parseInt(ano as string);
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);

        const [employeesRes, entriesRes, schedulesRes, rolesRes] = await Promise.all([
            supabase.from('employees').select('*').eq('user_id', restaurantId),
            supabase.from('time_clock_entries').select('*').eq('user_id', restaurantId).gte('clock_in_time', startDate.toISOString()).lte('clock_in_time', endDate.toISOString()),
            supabase.from('schedules').select('*, shifts(*)').eq('user_id', restaurantId).gte('week_start_date', startDate.toISOString().split('T')[0]).lte('week_start_date', endDate.toISOString().split('T')[0]),
            supabase.from('roles').select('id, name').eq('user_id', restaurantId)
        ]);
        
        if (employeesRes.error || entriesRes.error || schedulesRes.error || rolesRes.error) throw employeesRes.error || entriesRes.error || schedulesRes.error || rolesRes.error;
        
        const rolesMap = new Map((rolesRes.data || []).map(r => [r.id, r.name]));

        const payrollData = (employeesRes.data || []).map(employee => {
            const employeeEntries = (entriesRes.data || []).filter(e => e.employee_id === employee.id);
            const employeeShifts = (schedulesRes.data || []).flatMap(s => s.shifts).filter(sh => sh.employee_id === employee.id && !sh.is_day_off);
            
            let totalOvertimeMs = 0;
            const dailyRegularMsMap = new Map<string, number>();
            const entriesByDay = new Map<string, TimeClockEntry[]>();
            
            employeeEntries.forEach(entry => {
                const dayKey = new Date(entry.clock_in_time).toISOString().split('T')[0];
                if (!entriesByDay.has(dayKey)) entriesByDay.set(dayKey, []);
                entriesByDay.get(dayKey)!.push(entry);
            });

            for (const [dayKey, dayEntries] of entriesByDay.entries()) {
                const dailyWorkedMs = dayEntries.reduce((acc, entry) => acc + calculateDurationInMs(entry), 0);
                const dailyOvertimeMs = Math.max(0, dailyWorkedMs - (9 * 60 * 60 * 1000));
                totalOvertimeMs += dailyOvertimeMs;
                dailyRegularMsMap.set(dayKey, dailyWorkedMs - dailyOvertimeMs);
            }

            const weeklyRegularMsMap = new Map<number, number>();
            for (const [dayKey, regularMs] of dailyRegularMsMap.entries()) {
                const weekKey = getWeekNumber(new Date(dayKey + 'T12:00:00Z'));
                weeklyRegularMsMap.set(weekKey, (weeklyRegularMsMap.get(weekKey) || 0) + regularMs);
            }

            for (const weeklyMs of weeklyRegularMsMap.values()) {
                const weeklyOvertimeMs = Math.max(0, weeklyMs - (44 * 60 * 60 * 1000));
                totalOvertimeMs += weeklyOvertimeMs;
            }

            const totalWorkedMs = employeeEntries.reduce((acc, entry) => acc + calculateDurationInMs(entry), 0);
            const workedHours = totalWorkedMs / 3600000;
            const overtimeHours = totalOvertimeMs / 3600000;
            const regularHours = workedHours - overtimeHours;

            const scheduledHours = employeeShifts.reduce((acc, shift) => {
                if (!shift.end_time) return acc;
                const start = new Date(shift.start_time).getTime();
                const end = new Date(shift.end_time).getTime();
                return acc + (end > start ? (end - start) / 3600000 : 0);
            }, 0);

            let basePay = 0, overtimePay = 0;
            const { salary_type, salary_rate, overtime_rate_multiplier } = employee;
            if (salary_type && salary_rate) {
                if (salary_type === 'mensal') {
                    const effectiveHourlyRate = salary_rate / 220;
                    basePay = regularHours * effectiveHourlyRate;
                    overtimePay = overtimeHours * effectiveHourlyRate * (overtime_rate_multiplier || 1.5);
                } else { // horista
                    basePay = regularHours * salary_rate;
                    overtimePay = overtimeHours * salary_rate * (overtime_rate_multiplier || 1.5);
                }
            }
            
            return {
                employeeId: employee.id,
                name: employee.name,
                cargo: employee.role_id ? rolesMap.get(employee.role_id) || 'N/A' : 'N/A',
                horas_programadas: scheduledHours,
                horas_trabalhadas: workedHours,
                horas_extras: overtimeHours,
                pago_base: basePay,
                pago_extra: overtimePay,
                total_a_pagar: basePay + overtimePay
            };
        }).filter(p => p.horas_trabalhadas > 0 || p.horas_programadas > 0);
        
        const totais = payrollData.reduce((acc, curr) => ({
            total_a_pagar: acc.total_a_pagar + curr.total_a_pagar,
            total_horas_extras: acc.total_horas_extras + curr.horas_extras,
            total_horas_trabalhadas: acc.total_horas_trabalhadas + curr.horas_trabalhadas
        }), { total_a_pagar: 0, total_horas_extras: 0, total_horas_trabalhadas: 0 });

        const responsePayload = {
            periodo: `${new Date(year, month).toLocaleString('pt-BR', { month: 'long' })}/${year}`,
            totais,
            funcionarios: payrollData
        };

        return res.status(200).json(responsePayload);
    } catch(error) {
         return handleError(res, error, 'handleFolhaPagamento');
    }
}
