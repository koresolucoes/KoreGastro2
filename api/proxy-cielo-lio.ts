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
    const { method, path, body, headers } = req;
    const cieloPath = (req.query.path as string) || '';

    // Extracted headers from client
    const clientId = req.headers['client-id'] as string;
    const accessToken = req.headers['access-token'] as string;
    const merchantId = req.headers['merchant-id'] as string;
    const isSandbox = req.headers['is-sandbox'] === 'true';

    if (!clientId || !accessToken || !merchantId) {
      return res.status(400).json({ message: 'Missing Cielo credentials in headers' });
    }

    const baseUrl = isSandbox 
      ? 'https://api.cielo.com.br/sandbox-lio/order-management/v1'
      : 'https://api.cielo.com.br/order-management/v1';

    const targetUrl = `${baseUrl}${cieloPath}`;

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

    res.status(response.status).json(responseData);
  } catch (error: any) {
    console.error('Cielo proxy error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
