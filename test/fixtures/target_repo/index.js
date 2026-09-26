import express from 'express';
import { usersRouter }   from './src/routes/users.js';
import { ordersRouter }  from './src/routes/orders.js';
import { webhookRouter } from './src/routes/webhook.js';

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.use('/api/users',   usersRouter);
app.use('/api/orders',  ordersRouter);
app.use('/api/webhook', webhookRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'order-service' }));

const server = app.listen(PORT, () => {
  console.log(`[OrderService] Listening on port ${PORT}`);
});

export { app, server };

