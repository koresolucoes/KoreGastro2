import { Request, Response } from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

export default function (req: Request, res: Response) {
  const { state } = req.query;

  if (!state) {
    return res.status(400).send('Missing state parameter (user_id)');
  }

  const clientId = process.env.MERCADOPAGO_CLIENT_ID || process.env.MERCADO_PAGO_CLIENT_ID;

  if (!clientId) {
     return res.status(500).send('Mercado Pago Client ID not configured on server.');
  }

  const redirectUri = process.env.VITE_PUBLIC_URL ? `${process.env.VITE_PUBLIC_URL}/api/mercadopago-oauth` : 'http://localhost:3000/api/mercadopago-oauth';

  const authUrl = `https://auth.mercadopago.com/authorization?client_id=${clientId}&response_type=code&platform_id=mp&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.redirect(authUrl);
}
