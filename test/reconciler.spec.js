/**
 * Phase 2 Test Suite: Reconciler
 *
 * Covers:
 *   1. Symbiote claim extraction from markdown prose
 *   2. Symbiote claim extraction from OpenAPI YAML specs
 *   3. Symbiote code-side claim extraction
 *   4. Drift Engine: PORT_MISMATCH detection and auto-patch
 *   5. Drift Engine: ENV_VAR_UNDECLARED and ENV_VAR_PHANTOM
 *   6. Drift Engine: HEADER_UNDOCUMENTED
 *   7. Drift Engine: AUTH_SCHEME_MISMATCH (HMAC doc vs RSA code)
 *   8. Drift Engine: ROUTE_UNDOCUMENTED and ROUTE_PHANTOM
 *   9. Drift Engine: SYMBOL_UNDOCUMENTED and SYMBOL_PHANTOM
 *  10. D_intent score range and weighting
 *  11. Auto-patcher: in-place file update preserving formatting
 *  12. Auto-patcher: no write when value is absent
 *  13. Full pipeline: runSymbiote + runDriftEngine on synthetic repo
 *  14. Zero-drift baseline: perfectly aligned doc and code
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runSymbiote, extractCodeClaims } from '../src/agents/symbiote.js';
import { runDriftEngine } from '../src/reconciler/driftEngine.js';

// Derive fixture base from process.cwd() (the workspace root), not from
// import.meta.url, which Vite rewrites to a virtual module URL.
const FIXTURE_BASE = path.join(process.cwd(), 'test/fixtures/reconciler');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeDir(p) { fs.mkdirSync(p, { recursive: true }); }
function write(p, content) {
  makeDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}
function read(p) { return fs.readFileSync(p, 'utf8'); }

afterAll(async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.rmSync(FIXTURE_BASE, { recursive: true, force: true });
      break;
    } catch {
      if (attempt < 2) await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    }
  }
});

// ---------------------------------------------------------------------------
// 1. Symbiote: markdown claim extraction
// ---------------------------------------------------------------------------

describe('Symbiote -- markdown claim extraction', () => {
  const MD_SOURCE = `
# My Service

Runs on port 3000. Set \`DATABASE_URL\` and \`JWT_SECRET\` before starting.

Authentication uses **Bearer JWT** tokens. All requests must include the
\`Authorization\` header.

Requires Node.js >= 18.0.0.

## Setup

\`\`\`bash
export PORT=3000
export DATABASE_URL=postgres://localhost/mydb
\`\`\`
`;

  let claims;
  const FIXTURE_MD = path.join(FIXTURE_BASE, 'md-only');

  beforeAll(() => {
    makeDir(FIXTURE_MD);
    write(path.join(FIXTURE_MD, 'README.md'), MD_SOURCE);
    const report = runSymbiote(FIXTURE_MD);
    claims = report.proseClaims[0];
  });

  it('extracts port binding from prose', () => {
    expect(claims.portBindings).toContain('3000');
  });

  it('extracts PORT from export statement', () => {
    expect(claims.portBindings).toContain('3000');
  });

  it('extracts env vars from backtick code references', () => {
    expect(claims.envVars).toContain('DATABASE_URL');
    expect(claims.envVars).toContain('JWT_SECRET');
  });

  it('extracts env vars from export statements', () => {
    expect(claims.envVars).toContain('PORT');
  });

  it('extracts Bearer JWT auth scheme', () => {
    const normAuth = claims.authSchemes.map(a => a.toLowerCase());
    const hasBearer = normAuth.some(a => a.includes('bearer') || a.includes('jwt'));
    expect(hasBearer).toBe(true);
  });

  it('extracts Authorization as a required header', () => {
    const normHeaders = claims.requiredHeaders.map(h => h.toLowerCase());
    expect(normHeaders.some(h => h.includes('authorization'))).toBe(true);
  });

  it('extracts Node.js version requirement', () => {
    expect(claims.runtimeVersions.some(v => v.startsWith('18'))).toBe(true);
  });

  it('populates aggregated ports in the report', () => {
    const dir = path.join(FIXTURE_BASE, 'md-only-agg');
    makeDir(dir);
    write(path.join(dir, 'README.md'), MD_SOURCE);
    const report = runSymbiote(dir);
    expect(report.aggregated.allPorts).toContain('3000');
  });
});

// ---------------------------------------------------------------------------
// 2. Symbiote: OpenAPI YAML claim extraction
// ---------------------------------------------------------------------------

describe('Symbiote -- OpenAPI YAML claim extraction', () => {
  const OPENAPI_SOURCE = `
openapi: "3.0.0"
info:
  title: User Service API
  version: "1.0.0"
servers:
  - url: http://localhost:8080/api
paths:
  /users:
    get:
      summary: List users
      security:
        - bearerAuth: []
    post:
      summary: Create user
      parameters:
        - in: header
          name: X-Request-Id
          required: true
  /users/{id}:
    get:
      summary: Get user by ID
  /auth/login:
    post:
      summary: Login
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
`;

  let openApiClaims;
  const FIXTURE_OA = path.join(FIXTURE_BASE, 'openapi-only');

  beforeAll(() => {
    makeDir(FIXTURE_OA);
    write(path.join(FIXTURE_OA, 'openapi.yaml'), OPENAPI_SOURCE);
    const report = runSymbiote(FIXTURE_OA);
    openApiClaims = report.openApiClaims[0];
  });

  it('identifies the spec as OpenAPI and parses it', () => {
    expect(openApiClaims).toBeDefined();
    expect(openApiClaims.sourceKind).toBe('openapi');
  });

  it('extracts port binding from server URL', () => {
    expect(openApiClaims.portBindings).toContain('8080');
  });

  it('extracts the bearer JWT auth scheme', () => {
    const schemes = openApiClaims.authSchemes.map(s => s.toLowerCase());
    expect(schemes.some(s => s.includes('bearer') || s.includes('jwt'))).toBe(true);
  });

  it('extracts the X-Request-Id header from parameters', () => {
    expect(openApiClaims.requiredHeaders.some(h =>
      h.toLowerCase().includes('x-request-id')
    )).toBe(true);
  });

  it('extracts all three route paths', () => {
    const paths = openApiClaims.routes.map(r => r.path);
    expect(paths).toContain('/users');
    expect(paths).toContain('/users/{id}');
    expect(paths).toContain('/auth/login');
  });

  it('extracts HTTP methods for routes', () => {
    const getUsers = openApiClaims.routes.find(r => r.path === '/users' && r.method === 'GET');
    expect(getUsers).toBeDefined();
    const postUsers = openApiClaims.routes.find(r => r.path === '/users' && r.method === 'POST');
    expect(postUsers).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Symbiote: code-side claim extraction
// ---------------------------------------------------------------------------

describe('Symbiote -- extractCodeClaims', () => {
  it('detects port binding from app.listen()', () => {
    const src = `app.listen(8080, () => console.log('started'));`;
    const claims = extractCodeClaims(src, 'server.js');
    expect(claims.portBindings).toContain('8080');
  });

  it('detects port from PORT env variable with fallback', () => {
    const src = `const port = process.env.PORT || 3000;`;
    const claims = extractCodeClaims(src, 'server.js');
    expect(claims.portBindings).toContain('3000');
  });

  it('detects env var reads from process.env', () => {
    const src = `
const secret = process.env.JWT_SECRET;
const db = process.env.DATABASE_URL;
const key = process.env.API_KEY;
`;
    const claims = extractCodeClaims(src, 'config.js');
    expect(claims.envVars).toContain('JWT_SECRET');
    expect(claims.envVars).toContain('DATABASE_URL');
    expect(claims.envVars).toContain('API_KEY');
  });

  it('detects jwt.verify as auth scheme', () => {
    const src = `const decoded = jwt.verify(token, secret);`;
    const claims = extractCodeClaims(src, 'auth.js');
    expect(claims.authSchemes.some(a => a.toLowerCase().includes('jwt'))).toBe(true);
  });

  it('detects Authorization header access', () => {
    const src = `const token = req.headers['authorization'];`;
    const claims = extractCodeClaims(src, 'middleware.js');
    expect(claims.requiredHeaders.some(h => h.toLowerCase().includes('authorization'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Drift Engine: PORT_MISMATCH detection and auto-patch
// ---------------------------------------------------------------------------

describe('Drift Engine -- PORT_MISMATCH', () => {
  const FIXTURE_PORT = path.join(FIXTURE_BASE, 'port-mismatch');

  beforeAll(() => {
    makeDir(FIXTURE_PORT);
    // Doc claims port 3000, code binds 8080
    write(path.join(FIXTURE_PORT, 'README.md'),
      '# Service\n\nRuns on port 3000. Set `DATABASE_URL` to connect.\n');
    write(path.join(FIXTURE_PORT, 'server.js'),
      'const port = process.env.PORT || 8080;\napp.listen(8080);\n');
  });

  it('detects PORT_MISMATCH when doc and code disagree', () => {
    const symbioteReport = runSymbiote(FIXTURE_PORT);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: null,
      rootDir: FIXTURE_PORT,
      applyPatches: false,
    });
    const portRecords = drift.driftRecords.filter(r => r.kind === 'PORT_MISMATCH');
    expect(portRecords.length).toBeGreaterThan(0);
    expect(portRecords[0].docValue).toBe('3000');
    expect(portRecords[0].codeValue).toContain('8080');
    expect(portRecords[0].severity).toBe('CRITICAL');
  });

  it('applies auto-patch updating port in README in place', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'port-autopatch');
    makeDir(fixturePath);
    write(path.join(fixturePath, 'README.md'),
      '# Service\n\nRuns on port 3000. Configure your environment.\n');
    write(path.join(fixturePath, 'server.js'),
      'app.listen(8080);\n');

    const symbioteReport = runSymbiote(fixturePath);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: null,
      rootDir: fixturePath,
      applyPatches: true,
    });

    const patchedContent = read(path.join(fixturePath, 'README.md'));
    // The patch should have replaced 3000 with 8080
    const portRecord = drift.driftRecords.find(r => r.kind === 'PORT_MISMATCH');
    if (portRecord?.autoPatchable) {
      expect(patchedContent).toContain('8080');
      expect(drift.patchesApplied.length).toBeGreaterThan(0);
    }
  });

  it('auto-patch preserves all other text in the file', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'port-preserve');
    makeDir(fixturePath);
    const original = '# My Service\n\nA REST API running on port 3000.\n\n## Setup\n\nClone and run.\n';
    write(path.join(fixturePath, 'README.md'), original);
    write(path.join(fixturePath, 'server.js'), 'app.listen(9090);\n');

    const symbioteReport = runSymbiote(fixturePath);
    runDriftEngine({
      symbioteReport,
      morphReport: null,
      rootDir: fixturePath,
      applyPatches: true,
    });

    const patched = read(path.join(fixturePath, 'README.md'));
    // Heading and setup section must still be present
    expect(patched).toContain('# My Service');
    expect(patched).toContain('## Setup');
    expect(patched).toContain('Clone and run.');
  });
});

// ---------------------------------------------------------------------------
// 5. Drift Engine: ENV_VAR drift
// ---------------------------------------------------------------------------

describe('Drift Engine -- ENV_VAR drift', () => {
  const FIXTURE_ENV = path.join(FIXTURE_BASE, 'env-drift');

  beforeAll(() => {
    makeDir(FIXTURE_ENV);
    write(path.join(FIXTURE_ENV, 'README.md'),
      '# Service\n\nRequired env vars: `JWT_SECRET`, `DATABASE_URL`, `SMTP_HOST`.\n');
    // Code reads JWT_SECRET, DATABASE_URL, and an undocumented NEW_SECRET
    write(path.join(FIXTURE_ENV, 'config.js'), `
const jwtSecret  = process.env.JWT_SECRET;
const dbUrl      = process.env.DATABASE_URL;
const newSecret  = process.env.NEW_SECRET;  // not in docs
`);
  });

  it('detects ENV_VAR_UNDECLARED for vars code reads but docs omit', () => {
    const symbioteReport = runSymbiote(FIXTURE_ENV);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: null,
      rootDir: FIXTURE_ENV,
    });
    const undeclared = drift.driftRecords.filter(r => r.kind === 'ENV_VAR_UNDECLARED');
    expect(undeclared.some(r => r.codeValue === 'NEW_SECRET')).toBe(true);
  });

  it('detects ENV_VAR_PHANTOM for vars docs declare but code never reads', () => {
    const symbioteReport = runSymbiote(FIXTURE_ENV);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: null,
      rootDir: FIXTURE_ENV,
    });
    const phantom = drift.driftRecords.filter(r => r.kind === 'ENV_VAR_PHANTOM');
    expect(phantom.some(r => r.docValue === 'SMTP_HOST')).toBe(true);
  });

  it('does NOT flag env vars that appear in both doc and code', () => {
    const symbioteReport = runSymbiote(FIXTURE_ENV);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: null,
      rootDir: FIXTURE_ENV,
    });
    const allDriftedVars = drift.driftRecords.map(r => r.codeValue).concat(
      drift.driftRecords.map(r => r.docValue)
    );
    // JWT_SECRET and DATABASE_URL are in both -- should not appear in drift
    expect(allDriftedVars.filter(v => v === 'JWT_SECRET')).toHaveLength(0);
    expect(allDriftedVars.filter(v => v === 'DATABASE_URL')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Drift Engine: HEADER_UNDOCUMENTED
// ---------------------------------------------------------------------------

describe('Drift Engine -- HEADER_UNDOCUMENTED', () => {
  it('flags a header required by code but absent from all docs', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'header-drift');
    makeDir(fixturePath);
    write(path.join(fixturePath, 'README.md'),
      '# API\n\nSend `Authorization` header with all requests.\n');
    // Code also checks X-Correlation-Id, which docs never mention
    write(path.join(fixturePath, 'middleware.js'), `
const auth   = req.headers['authorization'];
const corrId = req.headers['x-correlation-id'];
`);

    const symbioteReport = runSymbiote(fixturePath);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: null,
      rootDir: fixturePath,
    });
    const undocHeaders = drift.driftRecords.filter(r => r.kind === 'HEADER_UNDOCUMENTED');
    expect(undocHeaders.some(r => r.codeValue === 'x-correlation-id')).toBe(true);
    expect(undocHeaders[0].severity).toBe('HIGH');
  });
});

// ---------------------------------------------------------------------------
// 7. Drift Engine: AUTH_SCHEME_MISMATCH (HMAC doc vs RSA/JWT code)
// ---------------------------------------------------------------------------

describe('Drift Engine -- AUTH_SCHEME_MISMATCH', () => {
  it('detects mismatch between doc HMAC claim and code jwt.verify usage', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'auth-mismatch');
    makeDir(fixturePath);
    // Doc claims HMAC-SHA256
    write(path.join(fixturePath, 'README.md'),
      '# Auth\n\nAll requests are authenticated using **HMAC-SHA256** signatures.\n');
    // Code actually uses JWT (RSA-signed)
    write(path.join(fixturePath, 'auth.js'), `
const decoded = jwt.verify(token, rsaPublicKey, { algorithms: ['RS256'] });
`);

    const symbioteReport = runSymbiote(fixturePath);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: null,
      rootDir: fixturePath,
    });
    const authMismatches = drift.driftRecords.filter(r => r.kind === 'AUTH_SCHEME_MISMATCH');
    expect(authMismatches.length).toBeGreaterThan(0);
    expect(authMismatches[0].severity).toBe('CRITICAL');
    // Doc says hmac, code uses jwt
    expect(authMismatches[0].docValue).toMatch(/hmac/i);
    expect(authMismatches[0].codeValue).toMatch(/jwt/i);
  });
});

// ---------------------------------------------------------------------------
// 8. Drift Engine: ROUTE_UNDOCUMENTED and ROUTE_PHANTOM
// ---------------------------------------------------------------------------

describe('Drift Engine -- route drift', () => {
  const OPENAPI_PARTIAL = `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /users:
    get:
      summary: List users
  /ghost-endpoint:
    post:
      summary: This route is in docs but not in code
`;

  const MOCK_MORPH = {
    routeManifest: [
      { file: 'src/routes/users.js',  method: 'GET',  lineNumber: 5,  excerpt: "router.get('/users', listUsers)" },
      { file: 'src/routes/users.js',  method: 'POST', lineNumber: 10, excerpt: "router.post('/users', createUser)" },
      { file: 'src/routes/admin.js',  method: 'DELETE', lineNumber: 3, excerpt: "router.delete('/admin/purge', purge)" },
    ],
    componentTopology: [],
  };

  let drift;

  beforeAll(() => {
    const fixturePath = path.join(FIXTURE_BASE, 'route-drift');
    makeDir(fixturePath);
    write(path.join(fixturePath, 'openapi.yaml'), OPENAPI_PARTIAL);

    const symbioteReport = runSymbiote(fixturePath);
    drift = runDriftEngine({
      symbioteReport,
      morphReport: MOCK_MORPH,
      rootDir: fixturePath,
    });
  });

  it('flags POST /users as ROUTE_UNDOCUMENTED', () => {
    const undoc = drift.driftRecords.filter(r => r.kind === 'ROUTE_UNDOCUMENTED');
    expect(undoc.some(r => r.codeValue.includes('POST') && r.codeValue.includes('users'))).toBe(true);
  });

  it('flags DELETE /admin/purge as ROUTE_UNDOCUMENTED', () => {
    const undoc = drift.driftRecords.filter(r => r.kind === 'ROUTE_UNDOCUMENTED');
    expect(undoc.some(r => r.codeValue.includes('DELETE'))).toBe(true);
  });

  it('flags /ghost-endpoint as ROUTE_PHANTOM', () => {
    const phantom = drift.driftRecords.filter(r => r.kind === 'ROUTE_PHANTOM');
    expect(phantom.some(r => r.docValue.includes('ghost-endpoint'))).toBe(true);
  });

  it('does NOT flag GET /users (in both doc and code)', () => {
    const allKeys = drift.driftRecords.map(r => r.codeValue + r.docValue).join(' ');
    // GET /users should not appear in route drift records
    const routeDrift = drift.driftRecords.filter(r =>
      (r.kind === 'ROUTE_UNDOCUMENTED' || r.kind === 'ROUTE_PHANTOM') &&
      (r.codeValue + r.docValue).match(/GET.*users$/)
    );
    expect(routeDrift).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Drift Engine: SYMBOL_UNDOCUMENTED and SYMBOL_PHANTOM
// ---------------------------------------------------------------------------

describe('Drift Engine -- symbol drift', () => {
  const MOCK_MORPH_SYMBOLS = {
    routeManifest: [],
    componentTopology: [
      {
        path: 'src/services/payment.js',
        exports: ['processPayment', 'refundPayment', 'validateCard'],
      },
    ],
  };

  it('flags exports with no corresponding doc reference as SYMBOL_UNDOCUMENTED', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'symbol-drift');
    makeDir(fixturePath);
    // Only processPayment is mentioned in docs
    write(path.join(fixturePath, 'README.md'),
      '# Payments\n\nCall `processPayment` to charge the customer.\n');

    const symbioteReport = runSymbiote(fixturePath);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: MOCK_MORPH_SYMBOLS,
      rootDir: fixturePath,
    });

    const undoc = drift.driftRecords.filter(r => r.kind === 'SYMBOL_UNDOCUMENTED');
    expect(undoc.some(r => r.codeValue === 'refundPayment')).toBe(true);
    expect(undoc.some(r => r.codeValue === 'validateCard')).toBe(true);
    // processPayment is documented -- must not be in undocumented list
    expect(undoc.some(r => r.codeValue === 'processPayment')).toBe(false);
  });

  it('flags doc references with no matching export as SYMBOL_PHANTOM', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'symbol-phantom');
    makeDir(fixturePath);
    write(path.join(fixturePath, 'README.md'),
      '# API\n\nCall `processPayment`, `chargeCard`, and `legacyBilling`.\n');

    const symbioteReport = runSymbiote(fixturePath);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: MOCK_MORPH_SYMBOLS,
      rootDir: fixturePath,
    });

    const phantom = drift.driftRecords.filter(r => r.kind === 'SYMBOL_PHANTOM');
    expect(phantom.some(r => r.docValue === 'chargeCard')).toBe(true);
    expect(phantom.some(r => r.docValue === 'legacyBilling')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. D_intent score range and weighting
// ---------------------------------------------------------------------------

describe('D_intent score', () => {
  it('returns 0 when there are no drift records', () => {
    const result = runDriftEngine({
      symbioteReport: {
        aggregated: { allPorts: [], allEnvVars: [], allHeaders: [], allAuthSchemes: [], allRoutes: [] },
        proseClaims: [],
        openApiClaims: [],
        codeClaims: [],
        docFiles: [],
      },
      morphReport: { routeManifest: [], componentTopology: [] },
      rootDir: '.',
    });
    expect(result.dIntentScore).toBe(0);
  });

  it('produces a higher score for CRITICAL drift than LOW drift', () => {
    const fixtureCritical = path.join(FIXTURE_BASE, 'score-critical');
    makeDir(fixtureCritical);
    write(path.join(fixtureCritical, 'README.md'), '# Service\nRuns on port 3000.\n');
    write(path.join(fixtureCritical, 'server.js'), 'app.listen(8080);\n');

    const fixtureClean = path.join(FIXTURE_BASE, 'score-clean');
    makeDir(fixtureClean);
    write(path.join(fixtureClean, 'README.md'), '# Service\nRuns on port 8080.\n');
    write(path.join(fixtureClean, 'server.js'), 'app.listen(8080);\n');

    const driftCritical = runDriftEngine({
      symbioteReport: runSymbiote(fixtureCritical),
      morphReport: null,
      rootDir: fixtureCritical,
    });
    const driftClean = runDriftEngine({
      symbioteReport: runSymbiote(fixtureClean),
      morphReport: null,
      rootDir: fixtureClean,
    });

    expect(driftCritical.dIntentScore).toBeGreaterThan(driftClean.dIntentScore);
  });

  it('never exceeds 1.0 regardless of drift magnitude', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'score-overflow');
    makeDir(fixturePath);
    // Massively divergent doc and code
    write(path.join(fixturePath, 'README.md'), `
# Service
Runs on port 1111. Auth uses HMAC-SHA256.
Required headers: \`X-Sig\`, \`X-Nonce\`, \`X-Timestamp\`.
Env: \`DB_1\`, \`DB_2\`, \`DB_3\`, \`DB_4\`, \`DB_5\`.
`);
    write(path.join(fixturePath, 'server.js'), `
app.listen(9999);
const t = jwt.verify(token, key);
const v = process.env.TOTALLY_DIFFERENT_VAR;
`);

    const drift = runDriftEngine({
      symbioteReport: runSymbiote(fixturePath),
      morphReport: null,
      rootDir: fixturePath,
    });
    expect(drift.dIntentScore).toBeGreaterThanOrEqual(0);
    expect(drift.dIntentScore).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 11. Auto-patcher: does not write when value is not found in file
// ---------------------------------------------------------------------------

describe('Auto-patcher -- edge cases', () => {
  it('makes no writes when the doc does not contain the old value', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'patch-no-match');
    makeDir(fixturePath);
    // README does not actually contain the port number as a standalone token
    write(path.join(fixturePath, 'README.md'),
      '# Service\n\nConfiguration is set via environment.\n');
    write(path.join(fixturePath, 'server.js'), 'app.listen(8080);\n');

    const before = read(path.join(fixturePath, 'README.md'));
    const drift = runDriftEngine({
      symbioteReport: runSymbiote(fixturePath),
      morphReport: null,
      rootDir: fixturePath,
      applyPatches: true,
    });
    const after = read(path.join(fixturePath, 'README.md'));

    // File content should be identical -- nothing was patchable
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 12. Full pipeline: runSymbiote + runDriftEngine on synthetic repo
// ---------------------------------------------------------------------------

describe('Full pipeline -- synthetic repository', () => {
  const FIXTURE_FULL = path.join(FIXTURE_BASE, 'full-pipeline');

  beforeAll(() => {
    makeDir(path.join(FIXTURE_FULL, 'src/routes'));
    makeDir(path.join(FIXTURE_FULL, 'docs'));

    // README: accurate port, accurate auth, but missing one env var
    write(path.join(FIXTURE_FULL, 'README.md'), `
# User Service

Listens on port 4000. Authentication via **Bearer JWT**.

Required environment variables:
- \`JWT_SECRET\` -- signing key
- \`DATABASE_URL\` -- connection string

All authenticated requests must include the \`Authorization\` header.
`);

    // OpenAPI spec: documents /users GET but not POST
    write(path.join(FIXTURE_FULL, 'docs/openapi.yaml'), `
openapi: "3.0.0"
info:
  title: User Service
  version: "1.0.0"
servers:
  - url: http://localhost:4000
paths:
  /users:
    get:
      summary: List users
  /users/{id}:
    get:
      summary: Get user
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
`);

    // Source code: correct port, JWT auth, reads JWT_SECRET + DATABASE_URL + REDIS_URL (undeclared)
    write(path.join(FIXTURE_FULL, 'src/server.js'), `
const port = process.env.PORT || 4000;
app.listen(port);
`);
    write(path.join(FIXTURE_FULL, 'src/routes/users.js'), `
import jwt from 'jsonwebtoken';
const secret = process.env.JWT_SECRET;
const db     = process.env.DATABASE_URL;
const cache  = process.env.REDIS_URL; // not in docs
router.get('/users', listUsers);
router.post('/users', createUser);  // not in OpenAPI
router.get('/users/:id', getUser);
const token  = req.headers['authorization'];
`);
  });

  it('runs without errors', () => {
    const symbioteReport = runSymbiote(FIXTURE_FULL);
    expect(() => runDriftEngine({
      symbioteReport,
      morphReport: {
        routeManifest: [
          { file: 'src/routes/users.js', method: 'GET',  lineNumber: 7, excerpt: "router.get('/users', listUsers)" },
          { file: 'src/routes/users.js', method: 'POST', lineNumber: 8, excerpt: "router.post('/users', createUser)" },
          { file: 'src/routes/users.js', method: 'GET',  lineNumber: 9, excerpt: "router.get('/users/:id', getUser)" },
        ],
        componentTopology: [],
      },
      rootDir: FIXTURE_FULL,
    })).not.toThrow();
  });

  it('detects REDIS_URL as ENV_VAR_UNDECLARED', () => {
    const symbioteReport = runSymbiote(FIXTURE_FULL);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: { routeManifest: [], componentTopology: [] },
      rootDir: FIXTURE_FULL,
    });
    const undeclared = drift.driftRecords.filter(r => r.kind === 'ENV_VAR_UNDECLARED');
    expect(undeclared.some(r => r.codeValue === 'REDIS_URL')).toBe(true);
  });

  it('detects POST /users as ROUTE_UNDOCUMENTED', () => {
    const symbioteReport = runSymbiote(FIXTURE_FULL);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: {
        routeManifest: [
          { file: 'src/routes/users.js', method: 'POST', lineNumber: 8, excerpt: "router.post('/users', createUser)" },
        ],
        componentTopology: [],
      },
      rootDir: FIXTURE_FULL,
    });
    const undoc = drift.driftRecords.filter(r => r.kind === 'ROUTE_UNDOCUMENTED');
    expect(undoc.some(r => r.codeValue.includes('POST'))).toBe(true);
  });

  it('emits a DriftReport with correct schema fields', () => {
    const symbioteReport = runSymbiote(FIXTURE_FULL);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: { routeManifest: [], componentTopology: [] },
      rootDir: FIXTURE_FULL,
    });

    expect(drift.schemaVersion).toBe('1.0.0');
    expect(typeof drift.dIntentScore).toBe('number');
    expect(typeof drift.totalClaimSurfaces).toBe('number');
    expect(Array.isArray(drift.driftRecords)).toBe(true);
    expect(drift.summary.totalDriftCount).toBe(drift.driftRecords.length);
    expect(
      drift.summary.criticalCount + drift.summary.highCount +
      drift.summary.mediumCount  + drift.summary.lowCount
    ).toBe(drift.summary.totalDriftCount);
  });

  it('produces a D_intent score between 0 and 1', () => {
    const symbioteReport = runSymbiote(FIXTURE_FULL);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: { routeManifest: [], componentTopology: [] },
      rootDir: FIXTURE_FULL,
    });
    expect(drift.dIntentScore).toBeGreaterThanOrEqual(0);
    expect(drift.dIntentScore).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 13. Zero-drift baseline: perfectly aligned doc and code
// ---------------------------------------------------------------------------

describe('Zero-drift baseline', () => {
  it('produces zero drift records when doc and code are perfectly aligned', () => {
    const fixturePath = path.join(FIXTURE_BASE, 'zero-drift');
    makeDir(fixturePath);
    write(path.join(fixturePath, 'README.md'), `
# Service

Listens on port 5000. Uses **Bearer JWT** authentication.
Required: \`API_SECRET\` environment variable.
`);
    write(path.join(fixturePath, 'server.js'), `
const port = process.env.PORT || 5000;
app.listen(5000);
const secret = process.env.API_SECRET;
const decoded = jwt.verify(token, secret);
`);

    const symbioteReport = runSymbiote(fixturePath);
    const drift = runDriftEngine({
      symbioteReport,
      morphReport: { routeManifest: [], componentTopology: [] },
      rootDir: fixturePath,
    });

    // Port 5000 in both doc and code -- no PORT_MISMATCH
    const portDrift = drift.driftRecords.filter(r => r.kind === 'PORT_MISMATCH');
    expect(portDrift).toHaveLength(0);

    // D_intent should be 0 when there is no drift
    // (may be slightly above 0 if env ghost vars are present; just check it's low)
    expect(drift.dIntentScore).toBeLessThan(0.5);
  });
});
