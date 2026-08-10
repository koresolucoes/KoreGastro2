import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { validateApiKey } from '../utils/api-key-auth.js';
import { checkRateLimit } from '../utils/redis.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const operationalTokenSecret = process.env.OPERATIONAL_TOKEN_SECRET || serviceRoleKey;

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  serviceRoleKey || 'placeholder-key'
);

interface AuthenticationResult {
  restaurantId: string;
  error?: { message: string };
  status?: number;
}

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  const allowed = typeof origin === 'string' && (
    origin === 'https://app.chefos.online' ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  );

  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://app.chefos.online');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Trace-ID');
}

async function accountCanAccessStore(accountId: string, storeId: string): Promise<boolean> {
  if (accountId === storeId) return true;

  const [ownedStore, delegatedAccess] = await Promise.all([
    supabase
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .eq('owner_id', accountId)
      .maybeSingle(),
    supabase
      .from('unit_permissions')
      .select('store_id')
      .eq('store_id', storeId)
      .eq('manager_id', accountId)
      .maybeSingle()
  ]);

  return !!ownedStore.data || !!delegatedAccess.data;
}

async function authenticateAndGetRestaurantId(req: VercelRequest): Promise<AuthenticationResult> {
  const restaurantId = (req.query.restaurantId || req.body?.restaurantId) as string | undefined;
  if (!restaurantId) {
    return { restaurantId: '', error: { message: '`restaurantId` is required.' }, status: 400 };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { restaurantId: '', error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { restaurantId: '', error: { message: 'Authorization token is missing.' }, status: 401 };
  }

  // First accept a normal Supabase session from the ChefOS frontend.
  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) {
    const hasAccess = await accountCanAccessStore(user.id, restaurantId);
    return hasAccess
      ? { restaurantId }
      : { restaurantId: '', error: { message: 'Access denied for the requested store.' }, status: 403 };
  }

  // External integrations may continue using the store API key.
  const apiKeyResult = await validateApiKey(req);
  if (!apiKeyResult.isValid || apiKeyResult.restaurantId !== restaurantId) {
    return {
      restaurantId: '',
      error: { message: apiKeyResult.error?.message || 'Invalid API key.' },
      status: apiKeyResult.status || 403
    };
  }

  return { restaurantId };
}

function plainPinMatches(storedPin: string, providedPin: string): boolean {
  const stored = Buffer.from(storedPin);
  const provided = Buffer.from(providedPin);
  return stored.length === provided.length && crypto.timingSafeEqual(stored, provided);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      type: 'about:blank',
      title: 'Method Not Allowed',
      status: 405,
      detail: `Method ${req.method} Not Allowed`
    });
  }

  if (!supabaseUrl || !serviceRoleKey || !operationalTokenSecret) {
    return res.status(503).json({ success: false, message: 'Authentication service is not configured.' });
  }

  try {
    const auth = await authenticateAndGetRestaurantId(req);
    if (auth.error) {
      return res.status(auth.status || 401).json({ success: false, error: auth.error });
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';
    const rateLimit = await checkRateLimit(`pin:${auth.restaurantId}:${clientIp}`, 12, 60);

    res.setHeader('X-RateLimit-Limit', '12');
    res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetMs / 1000)));
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return res.status(429).json({ success: false, message: 'Muitas tentativas. Aguarde e tente novamente.' });
    }

    const { employeeId, pin, roleName } = req.body || {};
    if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ success: false, message: 'PIN must contain 4 to 8 digits.' });
    }

    type EmployeePinRecord = {
      id: string;
      name: string;
      pin: string | null;
      role_id: string | null;
      user_id: string;
      current_clock_in_id: string | null;
    };

    let employeesToCheck: EmployeePinRecord[] = [];

    if (typeof employeeId === 'string' && employeeId) {
      const { data: employee } = await supabase
        .from('employees')
        .select('id, name, pin, role_id, user_id, current_clock_in_id')
        .eq('id', employeeId)
        .eq('user_id', auth.restaurantId)
        .is('deleted_at', null)
        .maybeSingle();
      if (employee) employeesToCheck = [employee as EmployeePinRecord];
    } else if (typeof roleName === 'string' && roleName) {
      const { data: role } = await supabase
        .from('roles')
        .select('id')
        .eq('user_id', auth.restaurantId)
        .ilike('name', roleName)
        .maybeSingle();

      if (role) {
        const { data: employees } = await supabase
          .from('employees')
          .select('id, name, pin, role_id, user_id, current_clock_in_id')
          .eq('role_id', role.id)
          .eq('user_id', auth.restaurantId)
          .is('deleted_at', null);
        employeesToCheck = (employees || []) as EmployeePinRecord[];
      }
    } else {
      return res.status(400).json({ success: false, message: 'Provide employeeId or roleName.' });
    }

    let matchedEmployee: EmployeePinRecord | null = null;
    for (const employee of employeesToCheck) {
      if (!employee.pin) continue;
      const matches = employee.pin.startsWith('$2')
        ? await bcrypt.compare(pin, employee.pin)
        : plainPinMatches(employee.pin, pin);
      if (matches) {
        matchedEmployee = employee;
        break;
      }
    }

    if (!matchedEmployee) {
      return res.status(403).json({ success: false, message: 'Invalid PIN.' });
    }

    const tokenPayload = {
      employeeId: matchedEmployee.id,
      restaurantId: auth.restaurantId,
      exp: Date.now() + 1000 * 60 * 60 * 8
    };
    const tokenString = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', operationalTokenSecret)
      .update(tokenString)
      .digest('base64url');

    return res.status(200).json({
      success: true,
      message: 'PIN verified successfully.',
      opToken: `${tokenString}.${signature}`,
      employee: {
        id: matchedEmployee.id,
        name: matchedEmployee.name,
        role_id: matchedEmployee.role_id,
        user_id: matchedEmployee.user_id,
        current_clock_in_id: matchedEmployee.current_clock_in_id
      }
    });
  } catch (error: any) {
    console.error('[API /rh/verificar-pin] Request failed', {
      message: error?.message || 'Unknown error'
    });
    return res.status(500).json({ success: false, message: 'Internal authentication error.' });
  }
}
