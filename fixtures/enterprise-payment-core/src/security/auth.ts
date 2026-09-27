import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * Enterprise Authentication & Security Service
 *
 * Implements RS256/RSA asymmetric public-key signature verification for API callers.
 * (Note: Specification drift against README which claims HMAC authentication).
 */

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  roles: string[];
}

/**
 * Verify RSA asymmetric public-key token
 */
export function verifyRsaToken(token: string): AuthenticatedUser {
  // RS256 / RSA-style asymmetric signature verification
  const decoded = jwt.verify(token, config.jwtPublicKey, {
    algorithms: ['RS256']
  }) as AuthenticatedUser;

  return decoded;
}

/**
 * Express middleware to enforce authentication
 */
export function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization bearer header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyRsaToken(token);
    next();
  } catch (err: any) {
    return res.status(403).json({ error: 'RS256 signature verification failed', detail: err.message });
  }
}

/**
 * Cryptographic HMAC-SHA256 signature verification helper for incoming webhooks.
 * This helper exists in the codebase but is NOT imported or called by src/api/webhooks.ts.
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  try {
    const hmac = crypto.createHmac('sha256', secret);
    const expected = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
