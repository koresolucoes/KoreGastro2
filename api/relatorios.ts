
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Main handler function
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    // 1. Authentication
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const restaurantId = request.query.restaurantId as string;

    if (!restaurantId) {
      return response.status(400).json({ error: { message: '`restaurantId` is required.' } });
    }

    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();

    if (profileError || !profile || !profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid `restaurantId` or API key not configured.' } });
    }

    if (providedApiKey !== profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid API key.' } });
    }

    // 2. Method Routing
    if (request.method === 'GET') {
      await handleGet(request, response, restaurantId);
    } else {
      response.setHeader('Allow', ['GET']);
      response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /relatorios] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Handler for GET requests ---
async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
  const { action, data_inicio, data_fim } = request.query;

  if (!data_inicio || typeof data_inicio !== 'string' || !data_fim || typeof data_fim !== 'string') {
    return response.status(400).json({ error: { message: '`data_inicio` and `data_fim` (YYYY-MM-DD) query parameters are required.' } });
  }

  const startDate = new Date(`${data_inicio}T00:00:00.000Z`);
  const endDate = new Date(`${data_fim}T23:59:59.999Z`);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
     return response.status(400).json({ error: { message: 'Invalid date format. Please use YYYY-MM-DD.' } });
  }

  // --- Optimization: Use RPC for Financial Summary (Fast Path) ---
  if (action === 'vendas') {
    const { data, error } = await supabase.rpc('get_financial_summary', {
        p_user_id: restaurantId,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString()
    });

    if (error) throw error;
    
    // The RPC returns a single row if called as .single() is not directly available on array RPC response in JS client sometimes,
    // but RPC normally returns array. get_financial_summary returns TABLE, so it's an array of 1.
    const result = (data && data.length > 0) ? data[0] : null;

    if (!result) {
        return response.status(200).json({
            faturamento_bruto: 0,
            custo_total_cmv: 0, // RPC currently doesn't calc CMV, we send 0 for now to keep interface
            lucro_bruto: 0,
            total_pedidos: 0,
            ticket_medio: 0
        });
    }

    // Map RPC snake_case to API camelCase expectation
    return response.status(200).json({
        faturamento_bruto: result.total_revenue,
        custo_total_cmv: 0, // Placeholder, optimization Phase 2 will handle this
        lucro_bruto: result.total_revenue, // Placeholder until CMV is integrated
        total_pedidos: result.total_orders,
        ticket_medio: result.average_ticket
    });
  }

  // --- Detailed Items Report (Heavy Path - Kept for specific request) ---
  if (action === 'performance_itens') {
    const [ordersRes, recipesRes] = await Promise.all([
        supabase
            .from('orders')
            .select('order_items(*)') // Only need items
            .eq('user_id', restaurantId)
            .eq('status', 'COMPLETED')
            .gte('completed_at', startDate.toISOString())
            .lte('completed_at', endDate.toISOString()),
        supabase
            .from('recipes')
            .select('id, name, operational_cost')
            .eq('user_id', restaurantId)
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (recipesRes.error) throw recipesRes.error;

    const orders = ordersRes.data || [];
    const recipesMap = new Map<string, { name: string, cost: number }>(recipesRes.data?.map(r => [r.id, { name: r.name, cost: r.operational_cost || 0 }]) || []);

    const itemsPerformance = new Map<string, {
        nome_item: string;
        quantidade_vendida: number;
        receita_total: number;
        custo_total: number;
    }>();

    for (const order of orders) {
        for (const item of order.order_items) {
            if (!item.recipe_id) continue;

            const recipeInfo = recipesMap.get(item.recipe_id);
            if (!recipeInfo) continue;

            const existing = itemsPerformance.get(item.recipe_id) || {
                nome_item: item.name,
                quantidade_vendida: 0,
                receita_total: 0,
                custo_total: 0,
            };

            existing.quantidade_vendida += item.quantity;
            existing.receita_total += item.price * item.quantity;
            existing.custo_total += recipeInfo.cost * item.quantity;
            
            itemsPerformance.set(item.recipe_id, existing);
        }
    }
    
    const result = Array.from(itemsPerformance.values()).map(item => {
        const lucro_total = item.receita_total - item.custo_total;
        const margem_lucro_percentual = item.receita_total > 0 ? (lucro_total / item.receita_total) * 100 : 0;
        return {
            ...item,
            lucro_total,
            margem_lucro_percentual
        };
    }).sort((a, b) => b.lucro_total - a.lucro_total);

    return response.status(200).json(result);
  }

  return response.status(400).json({ error: { message: 'Invalid or missing `action` query parameter. Use `vendas` or `performance_itens`.' } });
}
