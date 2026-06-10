import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      console.log('Webhook LIO received:', payload);

      // Extract the order ID and status. The exact payload depends on Cielo's webhook format.
      // Usually it looks like: { id: "order-id", status: "PAID", ... }
      const orderId = payload?.id;
      const status = payload?.status;

      if (orderId && status) {
        console.log(`Order ${orderId} updated to status ${status}`);
        // Here you would find the payment in your database by the orderId and update it to PAID
        // For example, emitting a pusher event or updating Supabase DB
      }

      return res.status(200).send('OK');
    } catch (e: any) {
      console.error('Webhook LIO error:', e);
      return res.status(500).send('Error');
    }
  }

  // Se a Cielo fizer só um teste GET/OPTIONS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(405).send('Method Not Allowed');
}
