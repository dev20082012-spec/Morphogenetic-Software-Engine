import jwt from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL   = process.env.REDIS_URL;

export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const token = authHeader.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token verification failed' });
  }
}

export async function listUsers(req, res) {
  try {
    const users = await simulateDbQuery(DATABASE_URL, 'SELECT * FROM users WHERE active = true');
    res.json({ users, count: users.length });
  } catch (err) {
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
}

export async function createUser(req, res) {
  const user = await simulateDbQuery(DATABASE_URL, 'INSERT INTO users', req.body);
  res.status(201).json(user);
}

async function simulateDbQuery(url, sql, params) {
  if (!url) throw new Error('DATABASE_URL not set');
  await new Promise(r => setTimeout(r, 1));
  return params || [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
}

