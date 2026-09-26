import express from 'express';

export const webhookRouter = express.Router();

webhookRouter.post('/github', async (req, res) => {
  const event   = req.headers['x-github-event'] || 'unknown';
  const payload = req.body;

  try {
    await processGitHubEvent(event, payload);
    res.json({ received: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function processGitHubEvent(event, payload) {
  await new Promise(r => setTimeout(r, 1));
  console.log(`[Webhook] Processing event: ${event}`);
}

