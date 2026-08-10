import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, validateApiKey } from './api-key-auth.js';

export interface StoreAuthenticationResult {
  success: boolean;
  restaurantId: string | null;
  principalType?: 'api-key' | 'session';
  accountId?: string;
  error?: { message: string };
  status?: number;
}

function requestedStoreId(req: VercelRequest, explicitStoreId?: string): string | undefined {
  const value = explicitStoreId
    || req.query?.restaurantId
    || req.body?.restaurantId
    || req.headers['x-restaurant-id'];
  return Array.isArray(value) ? value[0] : value as string | undefined;
}

async function accountCanAccessStore(accountId: string, storeId: string): Promise<boolean> {
  if (accountId === storeId) return true;

  const [ownedStore, delegatedAccess] = await Promise.all([
    supabase.from('stores').select('id').eq('id', storeId).eq('owner_id', accountId).maybeSingle(),
    supabase.from('unit_permissions').select('store_id').eq('store_id', storeId).eq('manager_id', accountId).maybeSingle()
  ]);

  return !!ownedStore.data || !!delegatedAccess.data;
}

/**
 * Accepts either an external restaurant API key or a normal Supabase session.
 * The resolved store is always checked against the credential/account tenant.
 */
export async function authenticateStoreRequest(
  req: VercelRequest,
  explicitStoreId?: string
): Promise<StoreAuthenticationResult> {
  const targetStoreId = requestedStoreId(req, explicitStoreId);
  const apiKeyResult = await validateApiKey(req);

  if (apiKeyResult.isValid && apiKeyResult.restaurantId) {
    if (targetStoreId && targetStoreId !== apiKeyResult.restaurantId) {
      return {
        success: false,
        restaurantId: null,
        error: { message: 'The API key does not belong to the requested restaurant.' },
        status: 403
      };
    }
    return {
      success: true,
      restaurantId: apiKeyResult.restaurantId,
      principalType: 'api-key'
    };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      success: false,
      restaurantId: null,
      error: { message: apiKeyResult.error?.message || 'Missing Authorization header.' },
      status: apiKeyResult.status || 401
    };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  // External API keys are UUIDs. If validation already failed, preserve its
  // 401/403 instead of reporting the key as an "expired JWT".
  if (!token.includes('.')) {
    return {
      success: false,
      restaurantId: null,
      error: { message: apiKeyResult.error?.message || 'Invalid API key.' },
      status: apiKeyResult.status || 403
    };
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return {
      success: false,
      restaurantId: null,
      error: { message: 'Invalid or expired session token.' },
      status: 401
    };
  }

  const storeId = targetStoreId || user.id;
  if (!(await accountCanAccessStore(user.id, storeId))) {
    return {
      success: false,
      restaurantId: null,
      error: { message: 'Access denied for the requested restaurant.' },
      status: 403
    };
  }

  return {
    success: true,
    restaurantId: storeId,
    principalType: 'session',
    accountId: user.id
  };
}

export function setStoreApiCorsHeaders(req: VercelRequest, res: VercelResponse, methods: string[]) {
  const origin = req.headers.origin;
  const allowed = typeof origin === 'string' && (
    origin === 'https://app.chefos.online'
    || origin.startsWith('http://localhost:')
    || origin.startsWith('http://127.0.0.1:')
  );

  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://app.chefos.online');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-restaurant-id, X-Trace-ID');
}
