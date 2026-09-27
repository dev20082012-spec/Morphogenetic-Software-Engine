import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { config } from '../src/config';
import { recordTransaction, getAccountBalance } from '../src/core/ledger';
import { verifyWebhookSignature } from '../src/security/auth';

describe('Enterprise Payment Core Baseline Test Suite', () => {
  it('config resolves valid default port', () => {
    expect(config.port).toBe(8080);
    expect(config.nodeEnv).toBeDefined();
  });

  it('ledger double-entry records transactions with positive balances', async () => {
    const entry = await recordTransaction({
      transactionId: 'txn_test_baseline_01',
      sourceAccount: 'acc_source_100',
      destinationAccount: 'acc_dest_200',
      amountCents: 5000,
      currency: 'USD',
      reference: 'ref_baseline_test',
    });

    expect(entry.transactionId).toBe('txn_test_baseline_01');
    expect(entry.amountCents).toBe(5000);

    const balance = await getAccountBalance('acc_dest_200');
    expect(balance.clearedBalanceCents).toBe(5000);
  });

  it('ledger rejects zero or negative transaction amounts', async () => {
    await expect(recordTransaction({
      transactionId: 'txn_invalid',
      sourceAccount: 'acc_1',
      destinationAccount: 'acc_2',
      amountCents: -100,
      currency: 'USD',
      reference: 'ref_neg',
    })).rejects.toThrow('greater than zero');
  });

  it('auth helper verifyWebhookSignature properly validates HMAC signatures', () => {
    const payload = JSON.stringify({ event: 'test' });
    const secret = 'test_secret_123';
    
    // Missing signature or secret should fail
    expect(verifyWebhookSignature(payload, '', secret)).toBe(false);
    expect(verifyWebhookSignature(payload, 'sha256=abc', '')).toBe(false);

    // Compute valid signature to test helper correctness
    const hmac = crypto.createHmac('sha256', secret);
    const validSignature = 'sha256=' + hmac.update(payload).digest('hex');

    expect(verifyWebhookSignature(payload, validSignature, secret)).toBe(true);
    expect(verifyWebhookSignature(payload, 'sha256=tampered_signature', secret)).toBe(false);
  });
});
