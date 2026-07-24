import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Logger } from '../utils/logger.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Trace-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  try {
    const traceId = (req.headers['x-trace-id'] || req.body?.traceId) as string;
    const { level = 'ERROR', message = 'Client error reported', context = {} } = req.body || {};

    const logContext = {
      ...context,
      traceId,
      source: 'client-telemetry',
      userAgent: req.headers['user-agent']
    };

    if (level === 'FATAL') {
      Logger.fatal(`[Client] ${message}`, undefined, logContext);
    } else if (level === 'WARN') {
      Logger.warn(`[Client] ${message}`, logContext);
    } else {
      Logger.error(`[Client] ${message}`, undefined, logContext);
    }

    return res.status(202).json({ status: 'accepted', traceId });
  } catch (error: any) {
    Logger.error('Failed to process telemetry payload', error);
    return res.status(500).json({ error: { message: 'Failed to record telemetry' } });
  }
}
