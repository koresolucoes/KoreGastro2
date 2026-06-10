import { Request, Response } from 'express';

export default async function (req: Request, res: Response) {
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
      ? 'https://api.cielo.com.br/sandbox/order-management/v1'
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
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type');
    
    let responseData;
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    res.status(response.status).json(responseData);
  } catch (error: any) {
    console.error('Cielo proxy error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
