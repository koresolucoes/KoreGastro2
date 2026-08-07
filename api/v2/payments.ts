
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { OrderItem } from '../../src/models/db.models.js';
import { triggerWebhook } from '../webhook-emitter.js';

import { withAuth, supabase } from '../utils/api-handler.js';
import { z } from 'zod';

const paymentSchema = z.object({
  method: z.string().min(1, 'Payment method is required'),
  amount: z.number().positive('Payment amount must be positive')
});

const requestBodySchema = z.object({
  orderId: z.string().uuid('Invalid orderId format'),
  payments: z.array(paymentSchema).min(1, 'At least one payment is required'),
  tip: z.number().nonnegative('Tip cannot be negative').optional()
});

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', ['POST']);
    return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: 'Method Not Allowed' });
  }

  const parsedBody = requestBodySchema.safeParse(request.body);
  if (!parsedBody.success) {
      return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid request body' });
  }

  const { orderId, payments, tip } = parsedBody.data;

    // 1. Fetch order details for validation
    const [orderResponse, profileResponse] = await Promise.all([
      supabase.from('orders').select('*, order_items(*)').eq('id', orderId).eq('user_id', restaurantId).eq('status', 'OPEN').single(),
      supabase.from('company_profile').select('payment_methods').eq('user_id', restaurantId).single()
    ]);

    const { data: order, error: orderError } = orderResponse;
    const { data: profile } = profileResponse;

    if (orderError) {
      if (orderError.code === 'PGRST116') return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Open order with id "${orderId}" not found.` });
      throw orderError;
    }
    
    // Validate payment methods
    const validMethods = profile?.payment_methods || [];
    if (validMethods && Array.isArray(validMethods) && validMethods.length > 0) {
        const invalidPayments = payments.filter(p => !validMethods.includes(p.method));
        if (invalidPayments.length > 0) {
            return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: `Invalid payment methods: ${invalidPayments.map(p => p.method).join(' });
        }
    }
    
    const orderItems = (order.order_items || []) as OrderItem[];
    const orderTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0) + (tip || 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    if (totalPaid < orderTotal - 0.01) {
      return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: `Payment amount is insufficient. Order total is ${orderTotal.toFixed(2)}, but received ${totalPaid.toFixed(2)}.` });
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

    // 5. Webhook
    const { data: updatedOrder } = await supabase.from('orders').select('*, customers(*), order_items(*), delivery_drivers(*)').eq('id', orderId).single();
    if (updatedOrder) {
        await triggerWebhook(restaurantId, 'order.updated', updatedOrder).catch(console.error);
    }

    return response.status(200).json({ success: true, message: 'Payment processed, stock deducted, and order completed successfully.' });
});
