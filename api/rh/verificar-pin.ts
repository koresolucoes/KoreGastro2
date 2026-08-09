import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

async function authenticateAndGetRestaurantId(req: VercelRequest): Promise<{ restaurantId: string; error?: { message: string }; status?: number }> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { restaurantId: '', error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (req.query.restaurantId || req.body.restaurantId) as string;
    if (!restaurantId) {
        return { restaurantId: '', error: { message: '`restaurantId` is required.' }, status: 400 };
    }
    const { data: creds, error: credsError } = await supabase
      .from('store_integration_credentials')
      .select('external_api_key')
      .eq('store_id', restaurantId)
      .single();
    if (credsError || !creds || !creds.external_api_key) {
        return { restaurantId, error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }
    if (providedApiKey !== creds.external_api_key) {
        return { restaurantId, error: { message: 'Invalid API key.' }, status: 403 };
    }
    return { restaurantId };
}

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    try {
        const { restaurantId, error, status } = await authenticateAndGetRestaurantId(req);
        if (error) {
            return res.status(status!).json({ error });
        }

        
        const { employeeId, pin, roleName } = req.body;
        if (!pin) {
            return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`pin` is required.' });
        }

        let employeesToCheck = [];

        if (employeeId) {
            const { data: employee, error: empError } = await supabase
                .from('employees')
                .select('id, name, pin')
                .eq('id', employeeId)
                .eq('user_id', restaurantId)
                .single();
            if (!empError && employee) {
                employeesToCheck.push(employee);
            }
        } else if (roleName) {
            // Find role id
            const { data: roleData } = await supabase
                .from('roles')
                .select('id')
                .eq('name', roleName)
                .eq('user_id', restaurantId)
                .single();
            
            if (roleData) {
                const { data: emps } = await supabase
                    .from('employees')
                    .select('id, name, pin')
                    .eq('role_id', roleData.id)
                    .eq('user_id', restaurantId);
                if (emps) {
                    employeesToCheck = emps;
                }
            }
        } else {
            return res.status(400).json({ error: "Provide employeeId or roleName" });
        }

        if (employeesToCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'Invalid PIN.' });
        }

        let matchedEmployee = null;

        for (const emp of employeesToCheck) {
            if (emp.pin && emp.pin.startsWith('$2')) {
                const isMatch = await bcrypt.compare(pin, emp.pin);
                if (isMatch) {
                    matchedEmployee = emp;
                    break;
                }
            } else {
                if (emp.pin === pin) {
                    matchedEmployee = emp;
                    break;
                }
            }
        }

        if (!matchedEmployee) {
            return res.status(403).json({ success: false, message: 'Invalid PIN.' });
        }

        const employee = matchedEmployee;

        // Emit short-lived operational token (signed with SUPABASE_SERVICE_ROLE_KEY as secret)
        const tokenPayload = { employeeId: employee.id, restaurantId, exp: Date.now() + 1000 * 60 * 60 * 8 }; // 8 hours
        const tokenStr = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const signature = crypto.createHmac('sha256', supabaseKey).update(tokenStr).digest('hex');
        const opToken = `${tokenStr}.${signature}`;



        return res.status(200).json({
            opToken, 
            success: true, 
            message: 'PIN verified successfully.',
            employee: {
                id: employee.id,
                name: employee.name
            }
        });

    } catch (error: any) {
        console.error('[API /rh/verificar-pin] Fatal error:', error);
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: error.message || 'An internal server error occurred.' });
    }
}