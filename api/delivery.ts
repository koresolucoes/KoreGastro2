import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { triggerWebhook } from './webhook-emitter.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function authenticate(request: VercelRequest): Promise<{ restaurantId: string | null, error?: any, status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { restaurantId: null, error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;

    if (!restaurantId) {
      return { restaurantId: null, error: { message: '`restaurantId` is required.' }, status: 400 };
    }

    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();

    if (profileError || !profile || !profile.external_api_key) {
      return { restaurantId: null, error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }

    if (providedApiKey !== profile.external_api_key) {
      return { restaurantId: null, error: { message: 'Invalid API key.' }, status: 403 };
    }
    
    return { restaurantId };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    const { restaurantId, error, status } = await authenticate(request);
    if (error) {
        return response.status(status!).json({ error });
    }

    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId!);
        break;
      case 'PATCH':
        await handlePatch(request, response, restaurantId!);
        break;
      default:
        response.setHeader('Allow', ['GET', 'PATCH']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (err: any) {
    console.error('[API /delivery] Fatal error:', err);
    return response.status(500).json({ error: { message: err.message || 'An internal server error occurred.' } });
  }
}


async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
  const { resource } = request.query;

  if (resource === 'drivers') {
    const { data, error } = await supabase
      .from('delivery_drivers')
      .select('id, name, phone, vehicle_type, is_active')
      .eq('user_id', restaurantId)
      .eq('is_active', true);
      
    if (error) throw error;
    return response.status(200).json(data || []);
  }

  if (resource === 'orders') {
    const { data, error } = await supabase
      .from('orders')
      .select('id, delivery_status, delivery_driver_id, customers(name, phone, address, latitude, longitude), order_items(name, quantity)')
      .eq('user_id', restaurantId)
      .eq('order_type', 'External-Delivery')
      .in('status', ['OPEN']) // Only active orders
      .order('timestamp', { ascending: true });

    if (error) throw error;
    return response.status(200).json(data || []);
  }

  return response.status(400).json({ error: { message: 'Invalid resource. Use ?resource=drivers or ?resource=orders' } });
}

async function handlePatch(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { action, orderId, newStatus, driverId } = request.body;

    if (!orderId) {
        return response.status(400).json({ error: { message: '`orderId` is required in the request body.' } });
    }
    
    // Default to 'update_status' if action is missing but newStatus is present (backward compatibility)
    const effectiveAction = action || (newStatus ? 'update_status' : null);

    if (!effectiveAction) {
        return response.status(400).json({ error: { message: 'An `action` (e.g., "update_status", "assign_driver") or `newStatus` is required.' } });
    }

    if (effectiveAction === 'update_status') {
        if (!newStatus) {
            return response.status(400).json({ error: { message: '`newStatus` is required for action `update_status`.' } });
        }
        const allowedStatuses = ['OUT_FOR_DELIVERY', 'ARRIVED_AT_DESTINATION', 'DELIVERED'];
        if (!allowedStatuses.includes(newStatus)) {
            return response.status(400).json({ error: { message: `Invalid newStatus. Must be one of: ${allowedStatuses.join(', ')}` } });
        }

        const updatePayload: { status?: string; delivery_status: string; completed_at?: string } = {
          delivery_status: newStatus,
        };
        
        if (newStatus === 'DELIVERED') {
            updatePayload.status = 'COMPLETED';
            updatePayload.completed_at = new Date().toISOString();
        }
        
        const { data: updatedOrder, error } = await supabase
            .from('orders')
            .update(updatePayload)
            .eq('id', orderId)
            .eq('user_id', restaurantId)
            .eq('status', 'OPEN')
            .select('*, customers(*), delivery_drivers(*)')
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return response.status(404).json({ error: { message: `Open delivery order with id "${orderId}" not found.` } });
            }
            throw error;
        }
        
        try {
            await triggerWebhook(restaurantId, 'delivery.status_updated', {
                orderId: updatedOrder.id,
                status: newStatus,
                driverId: updatedOrder.delivery_driver_id,
                timestamp: new Date().toISOString(),
                fullOrder: updatedOrder
            });
        } catch (whError: any) {
            console.error(`[API /delivery] Webhook trigger failed for delivery status update on order ${updatedOrder.id}:`, whError.message);
        }

        return response.status(200).json({ success: true, message: "Delivery status updated successfully." });
    
    } else if (effectiveAction === 'assign_driver') {
        if (!driverId) {
            return response.status(400).json({ error: { message: '`driverId` is required for action `assign_driver`.' } });
        }

        const { data: driver, error: driverError } = await supabase
            .from('delivery_drivers')
            .select('base_rate, rate_per_km')
            .eq('id', driverId)
            .eq('user_id', restaurantId)
            .single();

        if (driverError || !driver) {
            return response.status(404).json({ error: { message: `Driver with id "${driverId}" not found.` } });
        }
        
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('delivery_distance_km')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return response.status(404).json({ error: { message: `Order with id "${orderId}" not found.` } });
        }

        const distance = order.delivery_distance_km ?? 0;
        const deliveryCost = (driver.base_rate ?? 0) + ((driver.rate_per_km ?? 0) * distance);

        const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update({ 
                delivery_driver_id: driverId, 
                delivery_status: 'OUT_FOR_DELIVERY',
                delivery_cost: deliveryCost
            })
            .eq('id', orderId)
            .eq('user_id', restaurantId)
            .select('*, customers(*), delivery_drivers(*)')
            .single();

        if (updateError) {
            if (updateError.code === 'PGRST116') {
                return response.status(404).json({ error: { message: `Open delivery order with id "${orderId}" not found.` } });
            }
            throw updateError;
        }

        try {
            await triggerWebhook(restaurantId, 'delivery.status_updated', {
                orderId: updatedOrder.id,
                status: 'OUT_FOR_DELIVERY',
                driverId: driverId,
                timestamp: new Date().toISOString(),
                fullOrder: updatedOrder
            });
        } catch (whError: any) {
            console.error(`[API /delivery] Webhook trigger failed for driver assignment on order ${updatedOrder.id}:`, whError.message);
        }

        return response.status(200).json({ success: true, message: "Driver assigned successfully." });

    } else {
        return response.status(400).json({ error: { message: 'Invalid `action` provided. Use `update_status` or `assign_driver`.' } });
    }
}