import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Client-Id, Access-Token, Merchant-Id, Is-Sandbox');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const { method, body, headers } = req;
    const cieloPath = (req.query.path as string) || '';

    // Extracted headers from client
    const merchantId = req.headers['merchant-id'] as string;
    const isSandbox = req.headers['is-sandbox'] === 'true';

    // Forward all other query parameters to the target URL
    const queryParams = { ...req.query };
    delete queryParams.path;
    const queryString = new URLSearchParams(queryParams as any).toString();

    let clientId = process.env.CIELO_LIO_CLIENT_ID;
    let accessToken = process.env.CIELO_LIO_ACCESS_TOKEN;

    if (isSandbox) {
       clientId = process.env.CIELO_LIO_SANDBOX_CLIENT_ID || clientId;
       accessToken = process.env.CIELO_LIO_SANDBOX_ACCESS_TOKEN || accessToken;
    }

    if (!clientId || !accessToken || !merchantId) {
      console.error('Missing Cielo credentials.', {
        clientIdPresent: !!clientId,
        accessTokenPresent: !!accessToken,
        merchantIdPresent: !!merchantId,
        isSandbox,
        receivedMerchantId: merchantId,
      });
      return res.status(400).json({ 
        message: 'Missing Cielo credentials.',
        details: {
          clientIdPresent: !!clientId,
          accessTokenPresent: !!accessToken,
          merchantIdPresent: !!merchantId,
          isSandbox
        }
      });
    }

    const baseUrl = isSandbox 
      ? 'https://api.cielo.com.br/sandbox-lio/order-management/v1'
      : 'https://api.cielo.com.br/order-management/v1';

    let targetUrl = `${baseUrl}${cieloPath}`;
    if (queryString) {
      targetUrl += `?${queryString}`;
    }

    const headersToSend: Record<string, string> = {
      'Client-Id': clientId,
      'Access-Token': accessToken,
      'Merchant-Id': merchantId,
      'Content-Type': 'application/json'
    };

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: headersToSend,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        if (typeof req.body === 'string') {
          fetchOptions.body = req.body;
        } else if (req.body != null) {
          fetchOptions.body = JSON.stringify(req.body);
        } else {
          fetchOptions.body = '{}'; // Provide empty object to prevent missing body errors
        }
      } catch (e) {
        fetchOptions.body = '{}';
      }
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type');
    
    let responseData;
    const textData = await response.text();
    if (textData) {
       try {
           responseData = JSON.parse(textData);
       } catch {
           responseData = textData;
       }
    } else {
       responseData = null;
    }

    if (!response.ok) {
       console.error(`Cielo proxy failing ${response.status} ${targetUrl}`, responseData);
    }

    res.status(response.status).json(responseData);
  } catch (error: any) {
    console.error('Cielo proxy error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
