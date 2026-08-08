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
  authType?: 'jwt' | 'api_key';
}

/**
 * Validates the API key provided in headers (Authorization: Bearer <key> or x-api-key)
 * It supports both Supabase JWT tokens and Company Profile external API keys.
 */
export async function validateApiKey(req: VercelRequest): Promise<ApiKeyValidationResult> {
  let providedToken: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      providedToken = authHeader.split(' ')[1]?.trim();
    } else {
      providedToken = authHeader.trim();
    }
  }

  if (!providedToken && req.headers['x-api-key']) {
    providedToken = (req.headers['x-api-key'] as string)?.trim();
  }

  if (!providedToken) {
    return {
      isValid: false,
      restaurantId: null,
      error: { message: 'Token de autenticação não fornecido nos cabeçalhos.' },
      status: 401
    };
  }

  const reqRestaurantId = (
    req.query?.restaurantId ||
    req.body?.restaurantId ||
    req.headers['x-restaurant-id']
  ) as string | undefined;

  try {
    // 1. Validar como JWT do Supabase primeiro
    if (providedToken.startsWith('eyJ')) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(providedToken);
      
      if (user && !authError) {
        const matchedRestaurantId = user.id;

        if (reqRestaurantId && reqRestaurantId !== matchedRestaurantId) {
          return {
            isValid: false,
            restaurantId: null,
            error: { message: 'O token JWT não pertence ao restaurante especificado.' },
            status: 403
          };
        }

        return {
          isValid: true,
          restaurantId: matchedRestaurantId,
          tenantId: matchedRestaurantId,
          authType: 'jwt'
        };
      }
    }

    // 2. Validar como API Key externa
    const apiKeyHash = crypto.createHash('sha256').update(providedToken).digest('hex');

    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('user_id, external_api_key')
      .eq('external_api_key', providedToken)
      .maybeSingle();

    if (profileError || !profile) {
      if (reqRestaurantId) {
        const { data: profileByRest } = await supabase
          .from('company_profile')
          .select('user_id, external_api_key')
          .eq('user_id', reqRestaurantId)
          .maybeSingle();

        if (profileByRest && profileByRest.external_api_key === providedToken) {
          return {
            isValid: true,
            restaurantId: reqRestaurantId,
            tenantId: reqRestaurantId,
            apiKeyHash,
            authType: 'api_key'
          };
        }
      }

      return {
        isValid: false,
        restaurantId: null,
        error: { message: 'Token ou chave de API inválida ou não encontrada.' },
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
      apiKeyHash,
      authType: 'api_key'
    };
  } catch (err: any) {
    return {
      isValid: false,
      restaurantId: null,
      error: { message: `Erro ao validar token: ${err.message}` },
      status: 500
    };
  }
}

