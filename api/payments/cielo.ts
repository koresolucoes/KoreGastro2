import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const merchantId = process.env.CIELO_MERCHANT_ID || process.env.VITE_CIELO_MERCHANT_ID;
    const merchantKey = process.env.CIELO_MERCHANT_KEY || process.env.VITE_CIELO_MERCHANT_KEY;

    if (!merchantId || !merchantKey) {
      console.error('[Cielo API] Cielo credentials not configured on server.');
      return res.status(500).json({ error: 'Cielo payment integration not configured on server.' });
    }

    const { action, amount, orderId, card } = req.body || {};

    if (!amount || !orderId) {
      return res.status(400).json({ error: 'Parameters "amount" and "orderId" are required.' });
    }

    const amountInCents = Math.round(Number(amount) * 100);
    const isProduction = process.env.CIELO_ENVIRONMENT === 'production';
    const baseUrl = isProduction
      ? 'https://api.cieloecommerce.cielo.com.br/1/sales/'
      : 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/';

    if (action === 'credit_card') {
      const payload = {
        MerchantOrderId: orderId,
        Customer: {
          Name: 'Comprador Teste',
          Identity: '11111111111',
          IdentityType: 'CPF'
        },
        Payment: {
          Type: 'CreditCard',
          Amount: amountInCents,
          Installments: 1,
          SoftDescriptor: 'CHEFOS',
          CreditCard: {
            CardNumber: card?.cardNumber || '0000000000000001',
            Holder: card?.holder || 'Teste Holder',
            ExpirationDate: card?.expirationDate || '12/2030',
            SecurityCode: card?.securityCode || '123',
            Brand: card?.brand || 'Visa'
          }
        }
      };

      const cieloRes = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MerchantId': merchantId,
          'MerchantKey': merchantKey
        },
        body: JSON.stringify(payload)
      });

      const responseText = await cieloRes.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { text: responseText };
      }

      if (!cieloRes.ok) {
        console.error('[Cielo API] Credit Card Payment Error:', responseText);
        return res.status(cieloRes.status).json({
          error: `Cielo payment failed: ${cieloRes.statusText}`,
          details: responseData
        });
      }

      return res.status(200).json(responseData);
    } else if (action === 'pix') {
      const payload = {
        MerchantOrderId: orderId,
        Customer: {
          Name: 'Comprador Teste',
          Identity: '11111111111',
          IdentityType: 'CPF'
        },
        Payment: {
          Type: 'Pix',
          Amount: amountInCents
        }
      };

      const cieloRes = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MerchantId': merchantId,
          'MerchantKey': merchantKey
        },
        body: JSON.stringify(payload)
      });

      const responseText = await cieloRes.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { text: responseText };
      }

      if (!cieloRes.ok) {
        console.error('[Cielo API] Pix Payment Error:', responseText);
        return res.status(cieloRes.status).json({
          error: `Cielo Pix payment failed: ${cieloRes.statusText}`,
          details: responseData
        });
      }

      return res.status(200).json(responseData);
    } else if (action === 'simulate_lio') {
      // Simulate LIO terminal processing on backend safely
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return res.status(200).json({
        success: true,
        message: 'LIO payment simulated successfully.',
        orderId
      });
    } else {
      return res.status(400).json({ error: `Invalid action "${action}". Supported actions: "credit_card", "pix", "simulate_lio".` });
    }
  } catch (error: any) {
    console.error('[Cielo API] Internal Server Error:', error);
    return res.status(500).json({ error: 'Internal server error processing payment.', message: error?.message });
  }
}
