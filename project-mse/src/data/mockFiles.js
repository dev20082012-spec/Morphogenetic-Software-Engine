export const REPOSITORY_FILES = {
  'src/routes/webhook.js': {
    name: 'webhook.js',
    path: 'src/routes/webhook.js',
    language: 'javascript',
    badge: '1 CRITICAL',
    badgeTone: 'danger',
    content: `import express from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool.js';

export const webhookRouter = express.Router();

webhookRouter.post('/github', async (req, res) => {
  const event = req.headers['x-github-event'] || 'unknown';
  const payload = req.body;

  try {
    await processGitHubEvent(event, payload);
    res.json({ received: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function processGitHubEvent(event, payload) {
  await new Promise(r => setTimeout(r, 10));
  console.log(\`[Webhook] Processing event: \${event}\`);
  await pool.query('INSERT INTO audit_events (type, data) VALUES ($1, $2)', [event, JSON.stringify(payload)]);
}
`,
    astNodes: [
      { id: 'ast-1', line: 5, type: 'CallExpression', name: 'webhookRouter.post', desc: 'Route registration with missing auth/signature guard middleware' },
      { id: 'ast-2', line: 9, type: 'TryStatement', name: 'processGitHubEvent invocation', desc: 'State mutation triggered from unauthenticated ingress' }
    ]
  },

  'src/routes/users.js': {
    name: 'users.js',
    path: 'src/routes/users.js',
    language: 'javascript',
    badge: '1 HIGH',
    badgeTone: 'warning',
    content: `import express from 'express';
import { listUsers, createUser, getUser } from '../controllers/usersController.js';

export const usersRouter = express.Router();

usersRouter.get('/', listUsers);
usersRouter.get('/:id', getUser);

usersRouter.post('/', async (req, res) => {
  const user = await createUser(req.body);
  res.status(201).json(user);
});
`,
    astNodes: [
      { id: 'ast-3', line: 11, type: 'ArrowFunctionExpression', name: 'post / handler', desc: 'State mutation without token validation scope' }
    ]
  },

  'src/routes/orders.js': {
    name: 'orders.js',
    path: 'src/routes/orders.js',
    language: 'javascript',
    content: `import express from 'express';
import { requireAuth } from '../controllers/usersController.js';
import { listOrders, createOrder } from '../controllers/ordersController.js';

export const ordersRouter = express.Router();

ordersRouter.get('/', requireAuth, listOrders);
ordersRouter.post('/', requireAuth, createOrder);
`,
    astNodes: [
      { id: 'ast-4', line: 7, type: 'CallExpression', name: 'ordersRouter.get', desc: 'Protected order read route' }
    ]
  },

  'src/controllers/webhookController.js': {
    name: 'webhookController.js',
    path: 'src/controllers/webhookController.js',
    language: 'javascript',
    content: `import crypto from 'crypto';

export function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
`,
    astNodes: []
  },

  'src/controllers/ordersController.js': {
    name: 'ordersController.js',
    path: 'src/controllers/ordersController.js',
    language: 'javascript',
    content: `import { pool } from '../db/pool.js';

export async function listOrders(req, res) {
  const result = await pool.query('SELECT * FROM orders WHERE user_id = $1', [req.user.id]);
  res.json({ orders: result.rows });
}

export async function createOrder(req, res) {
  const { amount, currency, items } = req.body;
  const result = await pool.query(
    'INSERT INTO orders (user_id, amount, currency, status) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.user.id, amount, currency, 'PENDING']
  );
  res.status(201).json({ order: result.rows[0] });
}
`,
    astNodes: []
  },

  'src/controllers/usersController.js': {
    name: 'usersController.js',
    path: 'src/controllers/usersController.js',
    language: 'javascript',
    content: `import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid bearer token' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid authentication token' });
  }
}

export async function listUsers(req, res) {
  res.json({ users: [] });
}

export async function getUser(req, res) {
  res.json({ user: { id: req.params.id } });
}

export async function createUser(data) {
  return { id: 'usr_' + Date.now(), ...data };
}
`,
    astNodes: []
  },

  'src/db/pool.js': {
    name: 'pool.js',
    path: 'src/db/pool.js',
    language: 'javascript',
    badge: '1 CRITICAL',
    badgeTone: 'danger',
    content: `const state = {
  activeClients: 0,
  inTransaction: false,
};

export const pool = {
  async query(text, params) {
    return { rows: [], rowCount: 0 };
  },

  async beginTransaction() {
    state.inTransaction = true;
    return this.query('BEGIN');
  },

  async commit() {
    state.inTransaction = false;
    return this.query('COMMIT');
  }
};
`,
    astNodes: [
      { id: 'ast-5', line: 15, type: 'MethodDefinition', name: 'beginTransaction', desc: 'Transaction boundary without rollback handler guarantee' }
    ]
  },

  'contracts/IdempotencyLease.ts': {
    name: 'IdempotencyLease.ts',
    path: 'contracts/IdempotencyLease.ts',
    language: 'typescript',
    content: `export interface IdempotencyLeaseContract {
  key: string;
  scope: 'WEBHOOK' | 'PAYMENT' | 'MUTEX';
  acquiredAt: number;
  ttlMs: number;
  ownerId: string;
  isLocked(): boolean;
  release(): Promise<boolean>;
}

export class DistributedLeaseManager {
  private activeLeases = new Map<string, IdempotencyLeaseContract>();

  async acquire(key: string, ttlMs = 5000): Promise<boolean> {
    const existing = this.activeLeases.get(key);
    if (existing && existing.isLocked()) {
      return false;
    }
    this.activeLeases.set(key, {
      key,
      scope: 'WEBHOOK',
      acquiredAt: Date.now(),
      ttlMs,
      ownerId: 'proc_' + Math.random().toString(36).substr(2, 6),
      isLocked: () => true,
      release: async () => true,
    });
    return true;
  }
}
`,
    astNodes: []
  },

  'contracts/RaftConsensus.proto': {
    name: 'RaftConsensus.proto',
    path: 'contracts/RaftConsensus.proto',
    language: 'protobuf',
    content: `syntax = "proto3";

package mse.consensus;

service RaftService {
  rpc RequestVote (VoteRequest) returns (VoteResponse);
  rpc AppendEntries (AppendEntriesRequest) returns (AppendEntriesResponse);
  rpc InstallSnapshot (SnapshotRequest) returns (SnapshotResponse);
}

message VoteRequest {
  int64 term = 1;
  string candidateId = 2;
  int64 lastLogIndex = 3;
  int64 lastLogTerm = 4;
}

message VoteResponse {
  int64 term = 1;
  bool voteGranted = 2;
}

message AppendEntriesRequest {
  int64 term = 1;
  string leaderId = 2;
  int64 prevLogIndex = 3;
  int64 prevLogTerm = 4;
  repeated bytes entries = 5;
  int64 leaderCommit = 6;
}

message AppendEntriesResponse {
  int64 term = 1;
  bool success = 2;
  int64 matchIndex = 3;
}
`,
    astNodes: []
  },

  'specs/openapi.yaml': {
    name: 'openapi.yaml',
    path: 'specs/openapi.yaml',
    language: 'yaml',
    badge: 'DRIFT',
    badgeTone: 'warning',
    content: `openapi: 3.0.3
info:
  title: Target Microservice API
  version: 1.0.0
  description: Microservice documentation scanned by MSE Subagent Beta
servers:
  - url: http://localhost:8080
    description: Bound port in code
paths:
  /webhook/github:
    post:
      summary: GitHub Webhook Receptor
      parameters:
        - name: X-Hub-Signature-256
          in: header
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Event successfully processed
        '401':
          description: Missing or invalid HMAC signature
`,
    astNodes: []
  },

  'specs/README.md': {
    name: 'README.md',
    path: 'specs/README.md',
    language: 'markdown',
    badge: 'DRIFT',
    badgeTone: 'warning',
    content: `# Payment Gateway Microservice

Configuration and Ports:
- Service Port: 3000 (Divergence: code binds to port 8080)
- Auth Scheme: HMAC-SHA256 required for webhooks
- Database: PostgreSQL on port 5432 with auto-rollback transactions

System Invariants:
1. All state mutations must be authenticated.
2. Webhook endpoints must reject replay payloads within 5000ms.
`,
    astNodes: []
  },

  'invariants/discovered_invariants.json': {
    name: 'discovered_invariants.json',
    path: 'invariants/discovered_invariants.json',
    language: 'json',
    content: `{
  "schemaVersion": "1.0.0",
  "totalFilesScanned": 12,
  "invariants": [
    {
      "id": "INV-001",
      "name": "Unguarded Async State Mutation",
      "type": "SECURITY",
      "severity": "CRITICAL",
      "targetFile": "src/routes/webhook.js",
      "line": 5,
      "astNode": "CallExpression (webhookRouter.post)",
      "energyPenalty": 0.35,
      "proofStatus": "RED_FAILING"
    },
    {
      "id": "INV-002",
      "name": "Missing HMAC-SHA256 Webhook Guard",
      "type": "SECURITY",
      "severity": "CRITICAL",
      "targetFile": "src/routes/webhook.js",
      "line": 9,
      "astNode": "TryStatement (processGitHubEvent)",
      "energyPenalty": 0.40,
      "proofStatus": "RED_FAILING"
    },
    {
      "id": "DRIFT-PM-001",
      "name": "Documented Port Mismatch (3000 vs 8080)",
      "type": "EPIGENETIC_DRIFT",
      "severity": "HIGH",
      "targetFile": "specs/README.md",
      "line": 6,
      "astNode": "ProseClaim (Service Port: 3000)",
      "energyPenalty": 0.25,
      "proofStatus": "RECONCILED"
    },
    {
      "id": "INV-003",
      "name": "Unclosed Transaction Boundary",
      "type": "DATA_INTEGRITY",
      "severity": "CRITICAL",
      "targetFile": "src/db/pool.js",
      "line": 15,
      "astNode": "MethodDefinition (beginTransaction)",
      "energyPenalty": 0.30,
      "proofStatus": "RED_FAILING"
    }
  ]
}
`,
    astNodes: []
  },

  'cegis-antigens/INV-001.antigen.test.js': {
    name: 'INV-001.antigen.test.js',
    path: 'cegis-antigens/INV-001.antigen.test.js',
    language: 'javascript',
    badge: 'ANTIGEN',
    badgeTone: 'neutral',
    content: `import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { webhookRouter } from '../src/routes/webhook.js';

const app = express();
app.use(express.json());
app.use('/webhook', webhookRouter);

describe('Antigen INV-001: Webhook Security Invariant Proof', () => {
  it('RED: rejects webhook call when X-Hub-Signature-256 is absent', async () => {
    const res = await request(app)
      .post('/webhook/github')
      .send({ action: 'push', repository: 'target_repo' });

    expect(res.status).toBe(401);
  });

  it('GREEN: accepts webhook call with valid HMAC-SHA256 signature', async () => {
    const payload = JSON.stringify({ action: 'push' });
    const secret = 'test-webhook-secret';
    const sig = 'sha256=' + require('crypto').createHmac('sha256', secret).update(payload).digest('hex');

    const res = await request(app)
      .post('/webhook/github')
      .set('X-Hub-Signature-256', sig)
      .send({ action: 'push' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});
`,
    astNodes: []
  }
};

export const UNIFIED_DIFFS = {
  'src/routes/webhook.js': {
    prTitle: 'PR #142: Inject HMAC-SHA256 Signature Guard on Webhook Receptor',
    branch: 'mse/auto-patch/inv-001-webhook-hmac-guard',
    author: 'MSE Subagent Gamma (Immune Core v1.0.0)',
    verifiedGreen: true,
    blastRadius: '1 file changed, 14 insertions(+), 2 deletions(-)',
    confidence: '99.8%',
    energyReduction: '-0.450 E(S)',
    chunks: [
      {
        header: '@@ -4,8 +4,17 @@ export const webhookRouter = express.Router();',
        lines: [
          { type: 'context', oldNum: 4, newNum: 4, text: "export const webhookRouter = express.Router();" },
          { type: 'context', oldNum: 5, newNum: 5, text: "" },
          { type: 'remove',  oldNum: 6, newNum: null, text: "-webhookRouter.post('/github', async (req, res) => {" },
          { type: 'remove',  oldNum: 7, newNum: null, text: "-  const event = req.headers['x-github-event'] || 'unknown';" },
          { type: 'add',     oldNum: null, newNum: 6, text: "+import { verifyWebhookSignature } from '../controllers/webhookController.js';" },
          { type: 'add',     oldNum: null, newNum: 7, text: "+" },
          { type: 'add',     oldNum: null, newNum: 8, text: "+webhookRouter.post('/github', async (req, res) => {" },
          { type: 'add',     oldNum: null, newNum: 9, text: "+  const sig = req.headers['x-hub-signature-256'];" },
          { type: 'add',     oldNum: null, newNum: 10, text: "+  const secret = process.env.WEBHOOK_SECRET;" },
          { type: 'add',     oldNum: null, newNum: 11, text: "+  if (!verifyWebhookSignature(JSON.stringify(req.body), sig, secret)) {" },
          { type: 'add',     oldNum: null, newNum: 12, text: "+    return res.status(401).json({ error: 'Invalid or missing HMAC signature' });" },
          { type: 'add',     oldNum: null, newNum: 13, text: "+  }" },
          { type: 'add',     oldNum: null, newNum: 14, text: "+  const event = req.headers['x-github-event'] || 'unknown';" },
          { type: 'context', oldNum: 8, newNum: 15, text: "   const payload = req.body;" },
          { type: 'context', oldNum: 9, newNum: 16, text: "   try {" },
          { type: 'context', oldNum: 10, newNum: 17, text: "     await processGitHubEvent(event, payload);" }
        ]
      }
    ]
  },

  'src/db/pool.js': {
    prTitle: 'PR #143: Wrap Database Transactions in Rollback Mutex',
    branch: 'mse/auto-patch/inv-003-transaction-rollback',
    author: 'MSE Subagent Gamma (Immune Core v1.0.0)',
    verifiedGreen: true,
    blastRadius: '1 file changed, 9 insertions(+), 1 deletion(-)',
    confidence: '98.4%',
    energyReduction: '-0.300 E(S)',
    chunks: [
      {
        header: '@@ -14,6 +14,14 @@ export const pool = {',
        lines: [
          { type: 'context', oldNum: 14, newNum: 14, text: "   async beginTransaction() {" },
          { type: 'context', oldNum: 15, newNum: 15, text: "     state.inTransaction = true;" },
          { type: 'remove',  oldNum: 16, newNum: null, text: "-    return this.query('BEGIN');" },
          { type: 'add',     oldNum: null, newNum: 16, text: "+    await this.query('BEGIN');" },
          { type: 'add',     oldNum: null, newNum: 17, text: "+    return {" },
          { type: 'add',     oldNum: null, newNum: 18, text: "+      commit: () => this.commit()," },
          { type: 'add',     oldNum: null, newNum: 19, text: "+      rollback: () => this.query('ROLLBACK').then(() => { state.inTransaction = false; })" },
          { type: 'add',     oldNum: null, newNum: 20, text: "+    };" },
          { type: 'context', oldNum: 17, newNum: 21, text: "   }," }
        ]
      }
    ]
  },

  'specs/README.md': {
    prTitle: 'PR #144: Reconcile Documented Port and Auth Schema Drift',
    branch: 'mse/doc-reconcile/port-drift',
    author: 'MSE Subagent Beta (Symbiote v1.0.0)',
    verifiedGreen: true,
    blastRadius: '1 file changed, 3 insertions(+), 1 deletion(-)',
    confidence: '100%',
    energyReduction: '-0.250 E(S)',
    chunks: [
      {
        header: '@@ -5,4 +5,6 @@',
        lines: [
          { type: 'context', oldNum: 5, newNum: 5, text: " Configuration and Ports:" },
          { type: 'remove',  oldNum: 6, newNum: null, text: "- - Service Port: 3000 (Divergence: code binds to port 8080)" },
          { type: 'add',     oldNum: null, newNum: 6, text: "+ - Service Port: 8080 (Synchronized with AST server binding)" },
          { type: 'add',     oldNum: null, newNum: 7, text: "+ - Living Spec Checksum: sha256:4f8a29b0e (Verified by Symbiote)" },
          { type: 'context', oldNum: 7, newNum: 8, text: " - Auth Scheme: HMAC-SHA256 required for webhooks" }
        ]
      }
    ]
  }
};

export const SYSTEM_INVARIANTS = [
  {
    id: 'INV-001',
    title: 'Unguarded Async State Mutation',
    type: 'SECURITY',
    severity: 'CRITICAL',
    targetFile: 'src/routes/webhook.js',
    line: 5,
    astNode: 'CallExpression (webhookRouter.post)',
    description: 'POST /github webhook endpoint initiates state mutation without HMAC-SHA256 signature verification guard.',
    proofState: 'RED_FAILING',
    penalty: 0.35,
    hasPatch: true,
  },
  {
    id: 'INV-002',
    title: 'Missing Signature Verification Guard',
    type: 'SECURITY',
    severity: 'CRITICAL',
    targetFile: 'src/routes/webhook.js',
    line: 9,
    astNode: 'TryStatement (processGitHubEvent)',
    description: 'Unauthenticated ingress triggers asynchronous audit record insertion into PostgreSQL pool.',
    proofState: 'RED_FAILING',
    penalty: 0.40,
    hasPatch: true,
  },
  {
    id: 'INV-003',
    title: 'Unclosed Transaction Boundary',
    type: 'DATA_INTEGRITY',
    severity: 'CRITICAL',
    targetFile: 'src/db/pool.js',
    line: 15,
    astNode: 'MethodDefinition (beginTransaction)',
    description: 'Database pool calls BEGIN but exposes no transactional rollback guarantee or lease lock boundary.',
    proofState: 'RED_FAILING',
    penalty: 0.30,
    hasPatch: true,
  },
  {
    id: 'INV-004',
    title: 'State Mutation Without Token Scope',
    type: 'SECURITY',
    severity: 'HIGH',
    targetFile: 'src/routes/users.js',
    line: 11,
    astNode: 'ArrowFunctionExpression (createUser)',
    description: 'Route POST / accepts payloads and writes to storage without requireAuth bearer token middleware.',
    proofState: 'RED_FAILING',
    penalty: 0.20,
    hasPatch: false,
  },
  {
    id: 'DRIFT-PM-001',
    title: 'Documented Port Divergence',
    type: 'EPIGENETIC_DRIFT',
    severity: 'HIGH',
    targetFile: 'specs/README.md',
    line: 6,
    astNode: 'ProseClaim (Service Port: 3000)',
    description: 'README claims service port 3000, but AST server binds to port 8080.',
    proofState: 'RECONCILED',
    penalty: 0.25,
    hasPatch: true,
  }
];

export const AST_PIPELINE_PASSES = [
  {
    pass: 1,
    name: 'Pre-Flight Data Sanitizer',
    agent: 'SECURITY_SHIELD',
    status: 'COMPLETE',
    duration: '18ms',
    memoryDelta: '+2.1 MB',
    tokensAllocated: '4,280 tokens',
    detail: 'Sanitized 12 source files: 0 cloud secrets leaked, 2 database DSN passwords masked while preserving AST schema topology.'
  },
  {
    pass: 2,
    name: 'Morphologist AST Call-Graph Crawler',
    agent: 'SUBAGENT_ALPHA',
    status: 'COMPLETE',
    duration: '42ms',
    memoryDelta: '+8.4 MB',
    tokensAllocated: '18,400 tokens',
    detail: 'Extracted 14 route manifests, 37 async boundaries, and 89 state mutations. Built call-graph adjacency matrix.'
  },
  {
    pass: 3,
    name: 'Symbiote Living Spec and Drift Reconciler',
    agent: 'SUBAGENT_BETA',
    status: 'COMPLETE',
    duration: '31ms',
    memoryDelta: '+4.0 MB',
    tokensAllocated: '9,120 tokens',
    detail: 'Compared OpenAPI 3.0 and README.md against AST reality. Detected 1 port mismatch and 1 missing auth guard declaration.'
  },
  {
    pass: 4,
    name: 'CEGIS Adversarial Antigen Synthesizer',
    agent: 'SUBAGENT_GAMMA',
    status: 'COMPLETE',
    duration: '64ms',
    memoryDelta: '+12.6 MB',
    tokensAllocated: '14,800 tokens',
    detail: 'Synthesized failing counterexample tests reproducing unhandled webhook replay and unclosed transaction leaks.'
  },
  {
    pass: 5,
    name: 'Immune Core Minimal Patch Generator',
    agent: 'SUBAGENT_GAMMA',
    status: 'COMPLETE',
    duration: '39ms',
    memoryDelta: '+5.3 MB',
    tokensAllocated: '8,400 tokens',
    detail: 'Generated atomic unified diffs: AUTH_GUARD_INSERTION and TRANSACTION_ROLLBACK. Verified tests transition RED to GREEN.'
  }
];
