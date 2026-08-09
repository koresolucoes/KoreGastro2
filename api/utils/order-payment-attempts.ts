import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Logger } from './logger.js';

export class PaymentAttemptError extends Error {
  public code: string;
  public status: number;
  public details?: any;

  constructor(code: string, message: string, status = 400, details?: any) {
    super(message);
    this.name = 'PaymentAttemptError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface GetOrCreatePaymentAttemptParams {
  orderId: string;
  provider: string;
  paymentMethod: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, any>;
  restaurantId?: string;
}

export interface GetOrCreatePaymentAttemptResult {
  created: boolean;
  reused: boolean;
  attempt: {
    id: string;
    order_id: string;
    provider: string;
    payment_method: string;
    amount: number;
    status: string;
    idempotency_key: string | null;
    provider_payment_id: string | null;
    created_at: string;
    updated_at: string;
    metadata: Record<string, any>;
    [key: string]: any;
  };
}

function getServiceRoleClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  return createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder-key',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

/**
 * Server-side helper to create or retrieve an idempotent payment attempt.
 *
 * Algorithm:
 * 1. Validate minimal parameters & order existence/ownership.
 * 2. Attempt INSERT into order_payment_attempts with status = 'CREATED'.
 * 3. On success: return created attempt.
 * 4. On unique constraint conflict (provider, idempotency_key):
 *    Fetch existing attempt and compare payload (order_id, provider, payment_method, amount).
 *    - If identical payload -> return existing attempt (reused = true, created = false).
 *    - If payload differs -> throw IDEMPOTENCY_CONFLICT (409).
 */
export async function getOrCreateOrderPaymentAttempt(
  params: GetOrCreatePaymentAttemptParams,
  client?: SupabaseClient
): Promise<GetOrCreatePaymentAttemptResult> {
  const supabase = client || getServiceRoleClient();

  // 1. Validate mandatory idempotencyKey
  if (!params || typeof params.idempotencyKey !== 'string' || params.idempotencyKey.trim().length === 0) {
    throw new PaymentAttemptError(
      'INVALID_IDEMPOTENCY_KEY',
      'A chave de idempotência (idempotencyKey) é obrigatória e não pode ser vazia.',
      400
    );
  }

  // 2. Validate provider
  if (!params.provider || typeof params.provider !== 'string' || params.provider.trim().length === 0) {
    throw new PaymentAttemptError(
      'INVALID_PROVIDER',
      'O provedor de pagamento (provider) é obrigatório.',
      400
    );
  }

  // 3. Validate paymentMethod
  if (!params.paymentMethod || typeof params.paymentMethod !== 'string' || params.paymentMethod.trim().length === 0) {
    throw new PaymentAttemptError(
      'INVALID_PAYMENT_METHOD',
      'O método de pagamento (paymentMethod) é obrigatório.',
      400
    );
  }

  // 4. Validate amount
  const numericAmount = Number(params.amount);
  if (
    params.amount === undefined ||
    params.amount === null ||
    typeof params.amount !== 'number' ||
    isNaN(numericAmount) ||
    !isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw new PaymentAttemptError(
      'INVALID_AMOUNT',
      'O valor da tentativa de pagamento (amount) deve ser um número positivo maior que zero.',
      400
    );
  }

  // 5. Validate orderId
  if (!params.orderId || typeof params.orderId !== 'string' || params.orderId.trim().length === 0) {
    throw new PaymentAttemptError(
      'ORDER_NOT_FOUND',
      'ID do pedido (orderId) inválido ou não informado.',
      400
    );
  }

  const trimmedOrderId = params.orderId.trim();
  const trimmedProvider = params.provider.trim();
  const trimmedPaymentMethod = params.paymentMethod.trim();
  const trimmedIdempotencyKey = params.idempotencyKey.trim();

  // 6. Validate order existence and ownership
  const { data: orderData, error: orderErr } = await supabase
    .from('orders')
    .select('id, user_id')
    .eq('id', trimmedOrderId)
    .maybeSingle();

  if (orderErr || !orderData) {
    throw new PaymentAttemptError(
      'ORDER_NOT_FOUND',
      'Pedido não encontrado.',
      404
    );
  }

  if (params.restaurantId && orderData.user_id !== params.restaurantId) {
    throw new PaymentAttemptError(
      'ORDER_NOT_FOUND',
      'Pedido não pertence ao restaurante/estabelecimento especificado.',
      403
    );
  }

  // 7. Try INSERT into order_payment_attempts
  const attemptPayload = {
    order_id: trimmedOrderId,
    provider: trimmedProvider,
    payment_method: trimmedPaymentMethod,
    amount: numericAmount,
    status: 'CREATED',
    idempotency_key: trimmedIdempotencyKey,
    provider_payment_id: null,
    metadata: params.metadata || {}
  };

  const { data: createdData, error: insertErr } = await supabase
    .from('order_payment_attempts')
    .insert(attemptPayload)
    .select()
    .single();

  if (!insertErr && createdData) {
    Logger.info('Payment attempt created successfully', {
      attemptId: createdData.id,
      orderId: trimmedOrderId,
      provider: trimmedProvider,
      idempotencyKey: trimmedIdempotencyKey,
      result: 'created'
    });

    return {
      created: true,
      reused: false,
      attempt: createdData
    };
  }

  // 8. Check if insert failed due to unique constraint conflict on (provider, idempotency_key)
  const isUniqueViolation = insertErr && (
    insertErr.code === '23505' ||
    insertErr.message?.includes('duplicate key') ||
    insertErr.message?.includes('idx_order_payment_attempts_provider_idempotency') ||
    insertErr.details?.includes('idx_order_payment_attempts_provider_idempotency')
  );

  if (isUniqueViolation) {
    // Unique constraint violation: query existing record
    const { data: existingAttempt, error: fetchErr } = await supabase
      .from('order_payment_attempts')
      .select('*')
      .eq('provider', trimmedProvider)
      .eq('idempotency_key', trimmedIdempotencyKey)
      .single();

    if (fetchErr || !existingAttempt) {
      Logger.error('Error fetching existing payment attempt after unique violation', fetchErr, {
        orderId: trimmedOrderId,
        provider: trimmedProvider,
        idempotencyKey: trimmedIdempotencyKey
      });
      throw new PaymentAttemptError(
        'INTERNAL_ERROR',
        'Erro ao consultar tentativa de pagamento existente.',
        500,
        fetchErr
      );
    }

    // Compare fields between existing attempt and new request payload
    const isSameOrder = existingAttempt.order_id === trimmedOrderId;
    const isSameProvider = existingAttempt.provider === trimmedProvider;
    const isSamePaymentMethod = existingAttempt.payment_method === trimmedPaymentMethod;
    const existingNumAmount = Number(existingAttempt.amount);
    const isSameAmount =
      Math.abs(existingNumAmount - numericAmount) < 0.0001 ||
      Math.round(existingNumAmount * 100) === Math.round(numericAmount * 100);

    if (isSameOrder && isSameProvider && isSamePaymentMethod && isSameAmount) {
      Logger.info('Payment attempt reused (idempotent request)', {
        attemptId: existingAttempt.id,
        orderId: trimmedOrderId,
        provider: trimmedProvider,
        idempotencyKey: trimmedIdempotencyKey,
        result: 'reused'
      });

      return {
        created: false,
        reused: true,
        attempt: existingAttempt
      };
    } else {
      Logger.warn('Idempotency conflict detected', {
        orderId: trimmedOrderId,
        provider: trimmedProvider,
        idempotencyKey: trimmedIdempotencyKey,
        result: 'conflict'
      });

      throw new PaymentAttemptError(
        'IDEMPOTENCY_CONFLICT',
        'Conflito de idempotência: a chave fornecida já foi utilizada com dados de pagamento diferentes.',
        409,
        {
          idempotencyKey: trimmedIdempotencyKey,
          provider: trimmedProvider
        }
      );
    }
  }

  // 9. Any other DB error
  Logger.error('Failed to create order payment attempt', insertErr, {
    orderId: trimmedOrderId,
    provider: trimmedProvider,
    idempotencyKey: trimmedIdempotencyKey
  });

  throw new PaymentAttemptError(
    'INTERNAL_ERROR',
    `Erro ao criar tentativa de pagamento: ${insertErr?.message || 'Erro de banco de dados'}`,
    500,
    insertErr
  );
}
