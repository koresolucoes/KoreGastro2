
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { OrderItem } from '../../src/models/db.models.js';
import { triggerWebhook } from '../webhook-emitter.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Payment {
  method: string;
  amount: number;
}

interface RequestBody {
  restaurantId: string;
  orderId: string;
  payments: Payment[];
  tip?: number;
}

async function authenticateRequest(request: VercelRequest): Promise<{ restaurantId?: string; error?: { message: string }; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = request.body.restaurantId as string;
    if (!restaurantId) {
        return { error: { message: '`restaurantId` is required.' }, status: 400 };
    }
    const { data: profile, error: profileError } = await supabase.from('company_profile').select('external_api_key').eq('user_id', restaurantId).single();
    if (profileError || !profile || !profile.external_api_key) {
        return { error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }
    if (providedApiKey !== profile.external_api_key) {
        return { error: { message: 'Invalid API key.' }, status: 403 };
    }
    return { restaurantId };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }
  
  if (request.method !== 'POST') {
    response.setHeader('Allow', ['POST']);
    return response.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  try {
    const authResult = await authenticateRequest(request);
    if (authResult.error) {
        return response.status(authResult.status!).json({ error: authResult.error });
    }
    const restaurantId = authResult.restaurantId!;

    const { orderId, payments, tip } = request.body as RequestBody;

    if (!orderId || !payments || !Array.isArray(payments) || payments.length === 0) {
      return response.status(400).json({ error: { message: '`orderId` and a non-empty `payments` array are required.' } });
    }

    // 1. Fetch order details for validation
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .eq('user_id', restaurantId)
      .eq('status', 'OPEN')
      .single();

    if (orderError) {
      if (orderError.code === 'PGRST116') return response.status(404).json({ error: { message: `Open order with id "${orderId}" not found.` } });
      throw orderError;
    }
    
    const orderItems = (order.order_items || []) as OrderItem[];
    const orderTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0) + (tip || 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    if (totalPaid < orderTotal - 0.01) {
      return response.status(400).json({ error: { message: `Payment amount is insufficient. Order total is ${orderTotal.toFixed(2)}, but received ${totalPaid.toFixed(2)}.` } });
    }

    // 2. Identify Table ID (if applicable)
    let tableId = null;
    if (order.table_number > 0) {
        const { data: table } = await supabase.from('tables').select('id').eq('number', order.table_number).eq('user_id', restaurantId).single();
        if (table) tableId = table.id;
    }

    // 3. Identify Employee (System/API User)
    // Since this is an external API call, we might not have a specific employee ID.
    // We try to find a generic 'Gerente' or use null.
    // Ideally, the external system should pass an employeeId if available, but for now we use null or a fallback.
    const { data: managerRole } = await supabase.from('roles').select('id').eq('user_id', restaurantId).eq('name', 'Gerente').limit(1).maybeSingle();
    let employeeId: string | null = null;
    if (managerRole) {
         const { data: manager } = await supabase.from('employees').select('id').eq('role_id', managerRole.id).limit(1).maybeSingle();
         if (manager) employeeId = manager.id;
    }

    // 4. Execute Transactional RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('finalize_order_transaction', {
        p_order_id: orderId,
        p_user_id: restaurantId,
        p_table_id: tableId,
        p_payments: payments,
        p_closed_by_employee_id: employeeId, // System/Manager
        p_tip_amount: tip || 0
    });

    if (rpcError) throw rpcError;
    
    const result = rpcResult as { success: boolean, message: string };
    if (!result.success) {
        throw new Error(result.message);
    }

    // 5. Stock Deduction (Async/Best Effort - outside of main transaction for performance/complexity reasons)
    // In a V3 this should move to inside the RPC or a trigger.
    if (orderItems.length > 0) {
        deductStockForOrderItems(orderItems, orderId, restaurantId).catch(stockError => {
            console.error(`[API /v2/payments] NON-FATAL: Stock deduction failed for order ${orderId}.`, stockError);
        });
    }
    
    // 6. Webhook
    const { data: updatedOrder } = await supabase.from('orders').select('*, customers(*), order_items(*), delivery_drivers(*)').eq('id', orderId).single();
    if (updatedOrder) {
        triggerWebhook(restaurantId, 'order.updated', updatedOrder).catch(console.error);
    }

    return response.status(200).json({ success: true, message: 'Payment processed and order completed successfully.' });

  } catch (error: any) {
    console.error('[API /v2/payments] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// Reuse logic for stock deduction (simplified for API)
async function deductStockForOrderItems(orderItems: OrderItem[], orderId: string, userId: string) {
    const recipeIds = [...new Set(orderItems.map(item => item.recipe_id).filter(Boolean))];
    if (recipeIds.length === 0) return;
    
    // Fetch recipes to check for source ingredients (Simple items) vs Composed items
    const { data: recipes } = await supabase.from('recipes').select('id, source_ingredient_id').in('id', recipeIds);
    // Explicitly type the map to avoid 'unknown' type errors when accessing properties
    const recipesMap = new Map<string, { id: string; source_ingredient_id: string | null }>(
        (recipes || []).map((r: any) => [r.id, r])
    );

    const totalDeductions = new Map<string, number>();

    // Note: This simplified version for V2 API assumes simple stock deduction for now.
    // Full composite deduction logic exists in the Frontend Service but is heavy to replicate here without shared libs.
    // We prioritize direct links (Simple Stock) first. 
    // TODO: Move complex deduction logic to a Postgres Function (RPC) for shared use.

    for (const item of orderItems) {
        if (!item.recipe_id) continue;
        const recipe = recipesMap.get(item.recipe_id);
        
        if (recipe && recipe.source_ingredient_id) {
             totalDeductions.set(recipe.source_ingredient_id, (totalDeductions.get(recipe.source_ingredient_id) || 0) + item.quantity);
        }
        // Complex recipes (sub-recipes/ingredients) are skipped in this lightweight API version 
        // until logic is moved to DB/RPC.
    }
    
    const reason = `Venda API Pedido #${orderId.slice(0, 8)}`;
    for (const [ingredientId, quantityChange] of totalDeductions.entries()) {
        if (quantityChange > 0) {
            await supabase.rpc('adjust_stock_by_lot', {
                p_ingredient_id: ingredientId,
                p_quantity_change: -quantityChange,
                p_reason: reason,
                p_user_id: userId,
            });
        }
    }
}
