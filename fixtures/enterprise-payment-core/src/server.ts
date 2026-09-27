import express from 'express';
import { config } from './config';
import { webhookRouter } from './api/webhooks';
import { requireAuth } from './security/auth';
import { recordTransaction, getAccountBalance } from './core/ledger';

/**
 * Enterprise Payment Core Server
 * Main application bootstrap and HTTP route registration.
 */

export const app = express();
app.use(express.json());

// Ingress: Public webhook router
app.use(webhookRouter);

// System health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'enterprise-payment-core',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// Guarded API: Query account balance
app.get('/api/v1/ledger/balance/:id', requireAuth, async (req, res) => {
  try {
    const balance = await getAccountBalance(req.params.id);
    res.json(balance);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Guarded API: Direct ledger transaction injection
app.post('/api/v1/ledger/transactions', requireAuth, async (req, res) => {
  try {
    const entry = await recordTransaction(req.body);
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Start HTTP server on configured port (defaults to 8080)
const PORT = config.port;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Enterprise Payment Core] Listening on port ${PORT} in ${config.nodeEnv} mode`);
  });
}
