import { Request, Response } from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

const MP_CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID || process.env.MERCADO_PAGO_CLIENT_ID;
const REDIRECT_URI = process.env.VITE_PUBLIC_URL ? `${process.env.VITE_PUBLIC_URL}/api/mercadopago-oauth` : 'http://localhost:3000/api/mercadopago-oauth';

export default function (req: Request, res: Response) {
  const { state } = req.query;

  if (!state) {
    return res.status(400).send('Missing state parameter (user_id)');
  }

  if (!MP_CLIENT_ID) {
     return res.status(500).send('Mercado Pago Client ID not configured on server.');
  }

  const authUrl = `https://auth.mercadopago.com/authorization?client_id=${MP_CLIENT_ID}&response_type=code&platform_id=mp&state=${state}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  res.redirect(authUrl);
}
