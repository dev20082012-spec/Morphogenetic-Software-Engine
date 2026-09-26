import { pool } from '../db/pool.js';

const DATABASE_URL = process.env.DATABASE_URL;

export async function listOrders(req, res) {
  try {
    const orders = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ orders: orders.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createOrder(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query(
      'INSERT INTO orders (user_id, items, total) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, req.body.items, req.body.total]
    );
    await client.query(
      'INSERT INTO order_events (order_id, event) VALUES ($1, $2)',
      [order.rows[0].id, 'CREATED']
    );
    await client.query('COMMIT');
    res.status(201).json(order.rows[0]);
  } catch (err) {
    client.release();
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

