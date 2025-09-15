import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
// FIX: Import the newly created IfoodOrder and IfoodOrderStatus types from the models file.
import type { IfoodOrder, IfoodOrderStatus } from '../src/models/db.models';

// This config is necessary for Vercel to provide the raw request body
export const config = {
  api: {
    bodyParser: false,
  },
};

// Initialize Supabase Admin Client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- HELPER FUNCTIONS ---

// 1. Read Raw Body from Request Stream
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// 2. Verify iFood's Signature
function verifySignature(signature: string, body: Buffer, secret: string): boolean {
  if (!signature || !body || !secret) {
    return false;
  }
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  const computedSignature = hmac.digest('hex');
  return computedSignature === signature;
}

// 3. Map iFood status codes to our internal status
function mapToInternalStatus(ifoodCode: string): IfoodOrderStatus | null {
    const statusMap: { [key: string]: IfoodOrderStatus } = {
        'PLC': 'RECEIVED',
        'CFM': 'CONFIRMED',
        'DSP': 'DISPATCHED',
        // FIX: Handle 'CON' (Concluded) and map it to a valid internal status.
        'CON': 'CONCLUDED',
        'CAN': 'CANCELLED',
    };
    return statusMap[ifoodCode] || null;
}


// --- MAIN WEBHOOK HANDLER ---

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== 'POST') {
    return response.status(405).send({ error: 'Method Not Allowed' });
  }

  const ifoodSecret = process.env.IFOOD_CLIENT_SECRET;
  if (!ifoodSecret) {
    console.error('IFOOD_CLIENT_SECRET is not set in environment variables.');
    return response.status(500).send({ error: 'Server configuration error.' });
  }

  try {
    const rawBody = await getRawBody(request);
    const signature = request.headers['x-ifood-signature'] as string;

    // IMPORTANT: Security validation
    if (!verifySignature(signature, rawBody, ifoodSecret)) {
      console.warn('Invalid signature received.');
      return response.status(401).send({ error: 'Invalid signature.' });
    }

    const payload = JSON.parse(rawBody.toString('utf-8'));

    // --- Event Handling Logic ---

    switch (payload.code) {
      case 'KEEPALIVE':
        console.log('Keepalive heartbeat received.');
        // Respond to heartbeat to keep the webhook active
        return response.status(202).send({ message: 'Accepted' });
      
      case 'PLC': // PLACED
        console.log(`New order received: ${payload.orderId}`);
        const { data: profile, error: profileError } = await supabase
            .from('company_profile')
            .select('user_id')
            .eq('ifood_merchant_id', payload.merchantId)
            .single();

        if (profileError || !profile) {
            console.error(`Merchant not found for ID: ${payload.merchantId}`);
            return response.status(404).send({ error: 'Merchant not found' });
        }
        
        // NOTE: The PLACED event does not contain full order details.
        // In a real-world scenario, you would now call the iFood API to get order details.
        // Here, we create a simplified mock order to make the KDS functional.
        const newOrder: Omit<IfoodOrder, 'id' | 'created_at'> = {
            user_id: profile.user_id,
            ifood_order_id: payload.orderId,
            display_id: payload.orderId.slice(-5).toUpperCase(),
            ifood_created_at: payload.createdAt,
            order_type: 'DELIVERY',
            customer_name: 'Cliente iFood',
            items: [{ 
                name: 'Pedido iFood', 
                quantity: 1, 
                unitPrice: 0, 
                totalPrice: 0, 
                observations: 'Detalhes completos do pedido serão carregados em breve.' 
            }],
            total_amount: 0,
            payment_method: 'Online',
            status: 'RECEIVED'
        };

        const { error: insertError } = await supabase.from('ifood_orders').insert(newOrder);
        if (insertError) {
            console.error('Error inserting iFood order:', insertError);
            return response.status(500).json({ error: 'Failed to save order.' });
        }
        break;

      case 'CFM': // CONFIRMED
      case 'DSP': // DISPATCHED
      case 'CON': // CONCLUDED
      case 'CAN': // CANCELLED
        console.log(`Status update for order ${payload.orderId}: ${payload.fullCode}`);
        const newStatus = mapToInternalStatus(payload.code);
        if (newStatus) {
            const { error: updateError } = await supabase
                .from('ifood_orders')
                .update({ status: newStatus })
                .eq('ifood_order_id', payload.orderId);

            if (updateError) {
                console.error(`Error updating status for order ${payload.orderId}:`, updateError);
                // Don't send 500, as iFood might retry. If it's a genuine DB error,
                // it's better to log it and let it fail silently for the client.
            }
        }
        break;

      default:
        console.log(`Received unhandled event code: ${payload.code}`);
        break;
    }

    return response.status(202).send({ message: 'Event received successfully.' });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return response.status(500).send({ error: 'Internal Server Error' });
  }
}