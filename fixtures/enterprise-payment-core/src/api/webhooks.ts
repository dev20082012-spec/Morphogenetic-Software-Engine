import express from 'express';
import { recordTransaction } from '../core/ledger';

/**
 * External Webhook Ingestion Router
 * Receives asynchronous settlement events from payment processors.
 *
 * VULNERABILITY (DEMO FINDING #2):
 * This route handler receives untrusted external webhook payloads and directly
 * triggers ledger movements without validating HMAC-SHA256 signatures.
 * The cryptographic verification helper exists in `src/security/auth.ts`
 * but is not imported or called here.
 */

export const webhookRouter = express.Router();

webhookRouter.post('/webhooks/stripe', async (req, res) => {
  const event = req.body;
  const signature = req.headers['x-stripe-signature'] || req.headers['x-hub-signature-256'];

  try {
    // VULNERABILITY: No signature verification is performed here!
    // An attacker can forge arbitrary payment events and credit ledger balances.
    
    if (event.type === 'payment_intent.succeeded') {
      await recordTransaction({
        transactionId: `txn_stripe_${event.data?.object?.id || Date.now()}`,
        sourceAccount: 'acc_external_clearing',
        destinationAccount: event.data?.object?.metadata?.accountId || 'acc_merchant_settlement',
        amountCents: event.data?.object?.amount || 10000,
        currency: event.data?.object?.currency || 'USD',
        reference: `stripe_charge_${Date.now()}`,
      });
    }

    res.json({ received: true, eventId: event.id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to process webhook event', detail: err.message });
  }
});
