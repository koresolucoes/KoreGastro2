import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Employee, TimeClockEntry, Schedule } from '../../src/models/db.models.js';

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

export default async function handler(request: VercelRequest, response: VercelResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }
    if (request.method !== 'GET') {
        response.setHeader('Allow', ['GET']);
        return response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }

    try {
        const { restaurantId, error, status } = await authenticateAndGetRestaurantId(request);
        if (error) {
            return response.status(status!).json({ error });
        }

        const { action, mes, ano } = request.query;

        if (action !== 'resumo' || !mes || !ano) {
            return response.status(400).json({ error: { message: '`action=resumo`, `mes`, and `ano` are required query parameters.' } });
        }
        
        const yearNum = parseInt(ano as string);
        const monthNum = parseInt(mes as string) - 1; // JS months are 0-indexed

        const startDate = new Date(yearNum, monthNum, 1);
        const endDate = new Date(yearNum, monthNum + 1, 0, 23, 59, 59);

        const [employeesRes, timeEntriesRes, schedulesRes, rolesRes] = await Promise.all([
            supabase.from('employees').select('*').eq('user_id', restaurantId),
            supabase.from('time_clock_entries').select('*').eq('user_id', restaurantId).gte('clock_in_time', startDate.toISOString()).lte('clock_in_time', endDate.toISOString()),
            supabase.from('schedules').select('*, shifts(*)').eq('user_id', restaurantId).gte('week_start_date', startDate.toISOString().split('T')[0]).lte('week_start_date', endDate.toISOString().split('T')[0]),
            supabase.from('roles').select('id, name').eq('user_id', restaurantId),
        ]);

        if (employeesRes.error || timeEntriesRes.error || schedulesRes.error || rolesRes.error) {
            throw new Error('Failed to fetch payroll data.');
        }
        
        const employees = employeesRes.data || [];
        const timeEntries = timeEntriesRes.data || [];
        const schedules = schedulesRes.data || [];
        const rolesMap = new Map((rolesRes.data || []).map(r => [r.id, r.name]));

        const getWeekNumber = (d: Date): number => {
            d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
            return d.getUTCFullYear() * 100 + weekNo;
        };

        const payrollResults = employees.map(employee => {
            const employeeEntries = timeEntries.filter(e => e.employee_id === employee.id);
            if(employeeEntries.length === 0) return null;

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
            const workedHours = totalWorkedMs / (1000 * 60 * 60);
            const overtimeHours = totalOvertimeMs / (1000 * 60 * 60);
            const regularHours = workedHours - overtimeHours;

            const employeeShifts = schedules.flatMap(s => s.shifts).filter(sh => sh.employee_id === employee.id && !sh.is_day_off);
            const scheduledHours = employeeShifts.reduce((acc, shift) => {
                if (!shift.end_time) return acc;
                const start = new Date(shift.start_time).getTime();
                const end = new Date(shift.end_time).getTime();
                return acc + (end > start ? (end - start) / (1000 * 60 * 60) : 0);
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
                cargo: rolesMap.get(employee.role_id!) || 'N/A',
                horas_programadas: scheduledHours,
                horas_trabalhadas: workedHours,
                horas_extras: overtimeHours,
                pago_base: basePay,
                pago_extra: overtimePay,
                total_a_pagar: basePay + overtimePay,
            };
        }).filter(Boolean);
        
        const totals = payrollResults.reduce((acc, curr) => {
            if (!curr) return acc;
            acc.total_a_pagar += curr.total_a_pagar;
            acc.total_horas_extras += curr.horas_extras;
            acc.total_horas_trabalhadas += curr.horas_trabalhadas;
            return acc;
        }, { total_a_pagar: 0, total_horas_extras: 0, total_horas_trabalhadas: 0 });

        const finalResponse = {
            periodo: `${(mes as string).padStart(2, '0')}/${ano}`,
            totales: totals,
            empleados: payrollResults,
        };

        return response.status(200).json(finalResponse);

    } catch (error: any) {
        console.error('[API /rh/folha-pagamento] Fatal error:', error);
        return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}
