import { VercelRequest } from '@vercel/node';
import { createHmac } from 'crypto';
// FIX: Import Buffer to make it available in environments where it's not a global.
import { Buffer } from 'buffer';

/**
 * Asynchronously reads the raw body from a Vercel request stream.
 * @param req The VercelRequest object.
 * @returns A Buffer containing the raw request body.
 */
export async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Verifies the iFood webhook signature against the computed HMAC-SHA256 hash.
 * @param signature The signature from the 'x-ifood-signature' header.
 * @param body The raw request body as a Buffer.
 * @param secret The iFood client secret.
 * @returns True if the signature is valid, false otherwise.
 */
export function verifySignature(signature: string, body: Buffer, secret: string): boolean {
  if (!signature || !body || !secret) {
    return false;
  }
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  const computedSignature = hmac.digest('hex');
  return computedSignature === signature;
}

/**
 * Safely extracts the iFood Order ID from a webhook payload.
 * Notification payloads (e.g., PLACED) have `orderId` for the order and `id` for the event.
 * Full order detail payloads have `id` for the order. This function correctly prioritizes `orderId`.
 * @param payload The webhook payload.
 * @returns The correct iFood Order ID string or null if not found.
 */
export function getOrderIdFromPayload(payload: any): string | null {
  if (payload && typeof payload.orderId === 'string' && payload.orderId) {
    return payload.orderId;
  }
  if (payload && typeof payload.id === 'string' && payload.id) {
    return payload.id;
  }
  return null;
}