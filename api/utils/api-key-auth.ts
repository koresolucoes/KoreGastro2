import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

export interface ApiKeyValidationResult {
  isValid: boolean;
  restaurantId: string | null;
  tenantId?: string | null;
  apiKeyHash?: string;
  error?: { message: string };
  status?: number;
}

/**
 * Validates the API key provided in headers (Authorization: Bearer <key> or x-api-key)
 * or query/body parameters against `company_profile.external_api_key`.
 */
export async function validateApiKey(req: VercelRequest): Promise<ApiKeyValidationResult> {
  let providedApiKey: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      providedApiKey = authHeader.split(' ')[1]?.trim();
    } else {
      providedApiKey = authHeader.trim();
    }
  }

  if (!providedApiKey && req.headers['x-api-key']) {
    providedApiKey = (req.headers['x-api-key'] as string)?.trim();
  }

  if (!providedApiKey && req.query?.apiKey) {
    providedApiKey = req.query.apiKey as string;
  }

  if (!providedApiKey && req.body?.apiKey) {
    providedApiKey = req.body.apiKey as string;
  }

  if (!providedApiKey) {
    return {
      isValid: false,
      restaurantId: null,
      error: { message: 'Chave de API (x-api-key ou Bearer token) não fornecida.' },
      status: 401
    };
  }

  const apiKeyHash = crypto.createHash('sha256').update(providedApiKey).digest('hex');

  const reqRestaurantId = (
    req.query?.restaurantId ||
    req.body?.restaurantId ||
    req.headers['x-restaurant-id']
  ) as string | undefined;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('user_id, external_api_key')
      .eq('external_api_key', providedApiKey)
      .maybeSingle();

    if (profileError || !profile) {
      if (reqRestaurantId) {
        const { data: profileByRest } = await supabase
          .from('company_profile')
          .select('user_id, external_api_key')
          .eq('user_id', reqRestaurantId)
          .maybeSingle();

        if (profileByRest && profileByRest.external_api_key === providedApiKey) {
          return {
            isValid: true,
            restaurantId: reqRestaurantId,
            tenantId: reqRestaurantId,
            apiKeyHash
          };
        }
      }

      return {
        isValid: false,
        restaurantId: null,
        error: { message: 'Chave de API inválida ou não encontrada.' },
        status: 403
      };
    }

    const matchedRestaurantId = profile.user_id;

    if (reqRestaurantId && reqRestaurantId !== matchedRestaurantId) {
      return {
        isValid: false,
        restaurantId: null,
        error: { message: 'A chave de API não pertence ao restaurante especificado.' },
        status: 403
      };
    }

    return {
      isValid: true,
      restaurantId: matchedRestaurantId,
      tenantId: matchedRestaurantId,
      apiKeyHash
    };
  } catch (err: any) {
    return {
      isValid: false,
      restaurantId: null,
      error: { message: `Erro ao validar chave de API: ${err.message}` },
      status: 500
    };
  }
}

