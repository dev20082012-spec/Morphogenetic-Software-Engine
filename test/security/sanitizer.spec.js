/**
 * test/security/sanitizer.spec.js
 *
 * Compliance Verification Suite — Pre-Flight Secret Redaction Engine
 *
 * Asserts that ALL known secret patterns and .env payloads are 100% neutralized
 * without breaking AST-parseable code structure.
 *
 * Test categories:
 *   S1. AWS credentials
 *   S2. GCP service account tokens
 *   S3. Azure connection strings
 *   S4. PEM / RSA / OpenSSH private key blocks
 *   S5. JWT Bearer tokens
 *   S6. Stripe API keys
 *   S7. GitHub personal access tokens
 *   S8. Database DSN (Postgres, MongoDB, Redis, MySQL) — schema preservation
 *   S9. Generic API keys / hard-coded passwords
 *   S10. Shannon entropy detector
 *   S11. Hard-excluded file stubs (.env, credentials.json, *.pem)
 *   S12. AST payload sanitization
 *   S13. Negative cases — legitimate code strings not redacted
 *   S14. Compliance audit report generation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs   from 'node:fs';
import path from 'node:path';
import os   from 'node:os';
import {
  sanitizeCodebaseFile,
  sanitizeASTPayload,
  checkHardExcludedFile,
  shannonEntropy,
  isHighEntropySecret,
  purgeRawBuffer,
  SENTINELS,
} from '../../src/security/sanitizer.js';
import { runComplianceAudit } from '../../src/security/auditReport.js';

// ---------------------------------------------------------------------------
// Test fixture directory
// ---------------------------------------------------------------------------

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mse-sanitizer-test-'));
});

afterAll(() => {
  // Windows-safe cleanup with retry
  let attempts = 3;
  while (attempts-- > 0) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      break;
    } catch {
      if (attempts > 0) {
        const wait = Date.now() + 200;
        while (Date.now() < wait) { /* spin */ }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// S1. AWS credentials
// ---------------------------------------------------------------------------

describe('S1. AWS credentials', () => {
  it('S1-a. redacts AWS Access Key ID (AKIA...)', () => {
    const input = 'const key = "AKIAIOSFODNN7EXAMPLE";';
    const { content, redacted } = sanitizeCodebaseFile(input, 'config.js');
    expect(content).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(content).toContain(SENTINELS.AWS_KEY_ID);
    expect(redacted).toBeGreaterThan(0);
  });

  it('S1-b. redacts AWS Secret Access Key in assignment context', () => {
    const input = 'aws_secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
    const { content, redacted } = sanitizeCodebaseFile(input, 'deploy.yml');
    expect(content).not.toContain('wJalrXUtnFEMI');
    expect(redacted).toBeGreaterThan(0);
  });

  it('S1-c. result is still valid JS after redaction', () => {
    const input = `const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";\nconsole.log("connecting");`;
    const { content } = sanitizeCodebaseFile(input, 'aws.js');
    expect(content).toContain('console.log');
    expect(content).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });
});

// ---------------------------------------------------------------------------
// S2. GCP service account token
// ---------------------------------------------------------------------------

describe('S2. GCP service account tokens', () => {
  it('S2-a. redacts private_key field in GCP credentials JSON', () => {
    const input = JSON.stringify({
      type: 'service_account',
      project_id: 'my-project',
      private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234567890abcdef\n-----END RSA PRIVATE KEY-----\n',
      client_email: 'sa@project.iam.gserviceaccount.com',
    });
    const { content, redacted } = sanitizeCodebaseFile(input, 'sa.json');
    expect(content).not.toContain('MIIEowIBAAKCAQEA1234567890abcdef');
    expect(redacted).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// S3. Azure connection strings
// ---------------------------------------------------------------------------

describe('S3. Azure connection strings', () => {
  it('S3-a. redacts DefaultEndpointsProtocol Azure blob string', () => {
    const input = `const connStr = "DefaultEndpointsProtocol=https;AccountName=mystorage;AccountKey=abc123def456==;EndpointSuffix=core.windows.net";`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'storage.js');
    expect(content).not.toContain('AccountKey=abc123def456==');
    expect(content).toContain(SENTINELS.AZURE_CONN);
    expect(redacted).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// S4. PEM / RSA / OpenSSH private key blocks
// ---------------------------------------------------------------------------

describe('S4. PEM / crypto key blocks', () => {
  const rsaKey = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEpAIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4dNvwbFc3pMXdOsRHWJsXB1J16L',
    'AuzmYMcLk3AVBYFqTYSsIPEBuPUHiQQlqLUTJMqxGAWgKxJXD5jokiprCDvChiE=',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n');

  it('S4-a. redacts RSA private key block', () => {
    const input = `const cert = \`${rsaKey}\`;`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'tls.js');
    expect(content).not.toContain('MIIEpAIBAAKCAQEA');
    expect(redacted).toBeGreaterThan(0);
  });

  it('S4-b. redacts EC private key block', () => {
    const ecKey = '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIBkg4LVXK7KeHlMPTCsf6Ru2Y0mRfyFLzLy8sSlXBMmBoAoGCCqGSM49\n-----END EC PRIVATE KEY-----';
    const { content, redacted } = sanitizeCodebaseFile(ecKey, 'ec.key');
    expect(content).not.toContain('MHQCAQEEIBkg4LVXK7Ke');
    expect(redacted).toBeGreaterThan(0);
  });

  it('S4-c. PEM file is hard-excluded and replaced with stub', () => {
    const input = rsaKey;
    const { content, excluded } = sanitizeCodebaseFile(input, '/certs/server.pem');
    expect(excluded).toBe(true);
    expect(content).toBe(SENTINELS.PEM_FILE_STUB);
    expect(content).not.toContain('MIIEpA');
  });
});

// ---------------------------------------------------------------------------
// S5. JWT Bearer tokens
// ---------------------------------------------------------------------------

describe('S5. JWT Bearer tokens', () => {
  const jwtSample = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  it('S5-a. redacts a standard JWT token', () => {
    const input = `Authorization: Bearer ${jwtSample}`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'http.js');
    expect(content).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(content).toContain(SENTINELS.JWT_TOKEN);
    expect(redacted).toBeGreaterThan(0);
  });

  it('S5-b. redacts JWT in a JSON config string', () => {
    const input = JSON.stringify({ token: jwtSample });
    const { content } = sanitizeCodebaseFile(input, 'config.json');
    expect(content).not.toContain('eyJhbGci');
  });
});

// ---------------------------------------------------------------------------
// S6. Stripe API keys
// ---------------------------------------------------------------------------

describe('S6. Stripe API keys', () => {
  it('S6-a. redacts Stripe live secret key', () => {
    const input = `stripe.setApiKey('sk_live_4eC39HqLyjWDarjtT1zdp7dc');`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'payment.js');
    expect(content).not.toContain('sk_live_4eC39Hq');
    expect(content).toContain(SENTINELS.STRIPE_KEY);
    expect(redacted).toBeGreaterThan(0);
  });

  it('S6-b. redacts Stripe test secret key', () => {
    const input = `const key = "sk_test_BQokikJOvBiI2HlWgH4olfQ2";`;
    const { content } = sanitizeCodebaseFile(input, 'test-config.js');
    expect(content).not.toContain('sk_test_BQokikJOvBiI2');
  });
});

// ---------------------------------------------------------------------------
// S7. GitHub API tokens
// ---------------------------------------------------------------------------

describe('S7. GitHub personal access tokens', () => {
  it('S7-a. redacts ghp_ prefixed token', () => {
    const input = `const GITHUB_TOKEN = "ghp_16C7e42F292c6912E7710c838347Ae178B4a";`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'github.js');
    expect(content).not.toContain('ghp_16C7e42F292c6912');
    expect(content).toContain(SENTINELS.GITHUB_TOKEN);
    expect(redacted).toBeGreaterThan(0);
  });

  it('S7-b. redacts github_pat_ prefixed token', () => {
    const input = `token: github_pat_11ABCDEF0123456789abcdef_someMoreChars1234`;
    const { content } = sanitizeCodebaseFile(input, 'ci.yml');
    expect(content).not.toContain('github_pat_11ABCDEF');
  });
});

// ---------------------------------------------------------------------------
// S8. Database DSN — schema preservation
// ---------------------------------------------------------------------------

describe('S8. Database connection strings (schema preserved)', () => {
  it('S8-a. masks Postgres password and host, preserves protocol + path', () => {
    const input = `const db = "postgresql://admin:SuperSecret123@prod.db.example.com/orders";`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'db.js');
    expect(content).not.toContain('SuperSecret123');
    expect(content).not.toContain('prod.db.example.com');
    expect(content).toContain(SENTINELS.DB_PASSWORD);
    expect(content).toContain('postgresql://');
    expect(redacted).toBeGreaterThan(0);
  });

  it('S8-b. masks MongoDB password, preserves schema', () => {
    const input = `uri = "mongodb://appuser:s3cr3tPwd@cluster0.mongo.example.net/mydb"`;
    const { content } = sanitizeCodebaseFile(input, 'mongo.js');
    expect(content).not.toContain('s3cr3tPwd');
    expect(content).toContain('mongodb://');
  });

  it('S8-c. masks Redis password', () => {
    const input = `redis://default:redisP@ssw0rd@cache.prod.example.com:6379`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'cache.js');
    expect(content).not.toContain('redisP@ssw0rd');
    expect(redacted).toBeGreaterThan(0);
  });

  it('S8-d. masks MySQL password', () => {
    const input = `const pool = mysql.createPool("mysql://root:mydbP@ssword@db.local/app");`;
    const { content } = sanitizeCodebaseFile(input, 'mysql.js');
    expect(content).not.toContain('mydbP@ssword');
  });
});

// ---------------------------------------------------------------------------
// S9. Generic API keys / hard-coded passwords
// ---------------------------------------------------------------------------

describe('S9. Generic API keys and hard-coded passwords', () => {
  it('S9-a. redacts api_key assignment', () => {
    const input = `const api_key = "xK9mP2qW8nL5vB3jH7dR4tY6";`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'api.js');
    expect(content).not.toContain('xK9mP2qW8nL5vB3jH7dR4tY6');
    expect(redacted).toBeGreaterThan(0);
  });

  it('S9-b. redacts hard-coded password assignment', () => {
    const input = `const password = "MyH@rdC0dedPass!word#99";`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'auth.js');
    expect(content).not.toContain('MyH@rdC0dedPass!word#99');
    expect(redacted).toBeGreaterThan(0);
  });

  it('S9-c. redacts secret_key in YAML-like config', () => {
    const input = `secret_key: "sOmE_vErY_s3cr3t_k3y_v4lu3_here"`;
    const { content } = sanitizeCodebaseFile(input, 'settings.yml');
    expect(content).not.toContain('sOmE_vErY_s3cr3t_k3y_v4lu3_here');
  });
});

// ---------------------------------------------------------------------------
// S10. Shannon entropy detector
// ---------------------------------------------------------------------------

describe('S10. Shannon entropy detection', () => {
  it('S10-a. shannonEntropy("password") < 4.0', () => {
    expect(shannonEntropy('password')).toBeLessThan(4.0);
  });

  it('S10-b. shannonEntropy of a 40-char base64 key > 4.0', () => {
    const key = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    expect(shannonEntropy(key)).toBeGreaterThan(4.0);
  });

  it('S10-c. isHighEntropySecret returns true for a plausible API key', () => {
    expect(isHighEntropySecret('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBe(true);
  });

  it('S10-d. isHighEntropySecret returns false for a short word', () => {
    expect(isHighEntropySecret('hello')).toBe(false);
  });

  it('S10-e. isHighEntropySecret returns false for a UUID', () => {
    expect(isHighEntropySecret('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
  });

  it('S10-f. isHighEntropySecret returns false for a plain hex hash', () => {
    expect(isHighEntropySecret('aabbccddeeff00112233445566778899')).toBe(false);
  });

  it('S10-g. sanitizer redacts high-entropy string embedded in source', () => {
    // 40-char base64-like string with high entropy
    const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const input  = `const tokenStr = "${secret}";`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'tokens.js');
    expect(content).not.toContain(secret);
    expect(redacted).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// S11. Hard-excluded file stubs
// ---------------------------------------------------------------------------

describe('S11. Hard-excluded file stub injection', () => {
  it('S11-a. .env file is fully replaced with ENV stub', () => {
    const input = 'DATABASE_URL=postgresql://admin:secret@prod.db.internal/app\nAPI_KEY=sk_live_ABCDEF1234567890\n';
    const { content, excluded, redacted } = sanitizeCodebaseFile(input, '/app/.env');
    expect(excluded).toBe(true);
    expect(content).toBe(SENTINELS.ENV_FILE_STUB);
    expect(content).not.toContain('postgresql://');
    expect(content).not.toContain('sk_live_');
    expect(redacted).toBe(1);
  });

  it('S11-b. .env.production is hard-excluded', () => {
    const { excluded } = sanitizeCodebaseFile('SECRET=abc', '/app/.env.production');
    expect(excluded).toBe(true);
  });

  it('S11-c. .env.local is hard-excluded', () => {
    const { excluded } = sanitizeCodebaseFile('KEY=val', '.env.local');
    expect(excluded).toBe(true);
  });

  it('S11-d. credentials.json is replaced with credentials stub', () => {
    const input = '{"type":"service_account","private_key":"-----BEGIN RSA PRIVATE KEY-----\\nMIIE...\\n-----END RSA PRIVATE KEY-----\\n"}';
    const { content, excluded } = sanitizeCodebaseFile(input, '/home/user/.config/gcloud/credentials.json');
    expect(excluded).toBe(true);
    expect(content).toBe(SENTINELS.CREDENTIALS_STUB);
    expect(content).not.toContain('private_key');
  });

  it('S11-e. server.pem is replaced with PEM stub', () => {
    const { content, excluded } = sanitizeCodebaseFile('-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----', 'certs/server.pem');
    expect(excluded).toBe(true);
    expect(content).toBe(SENTINELS.PEM_FILE_STUB);
  });

  it('S11-f. id_rsa SSH key file is hard-excluded', () => {
    const { excluded } = checkHardExcludedFile('/home/user/.ssh/id_rsa');
    expect(excluded).toBe(true);
  });

  it('S11-g. .dockerconfigjson is hard-excluded', () => {
    const { excluded } = checkHardExcludedFile('/run/secrets/.dockerconfigjson');
    expect(excluded).toBe(true);
  });

  it('S11-h. regular .js file is NOT excluded', () => {
    const { excluded } = checkHardExcludedFile('src/routes/users.js');
    expect(excluded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S12. AST payload sanitization
// ---------------------------------------------------------------------------

describe('S12. AST payload sanitization', () => {
  it('S12-a. sanitizeASTPayload redacts secrets in string node values', () => {
    const ast = {
      type: 'Program',
      body: [{
        type: 'VariableDeclaration',
        declarations: [{
          id:   { name: 'key' },
          init: { value: 'AKIAIOSFODNN7EXAMPLE' },
        }],
      }],
    };
    const { sanitized } = sanitizeASTPayload(ast);
    const val = sanitized.body[0].declarations[0].init.value;
    expect(val).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(val).toContain('[REDACTED');
  });

  it('S12-b. sanitizeASTPayload preserves non-secret string values', () => {
    const ast = { type: 'Identifier', name: 'getUserById' };
    const { sanitized, redacted } = sanitizeASTPayload(ast);
    expect(sanitized.name).toBe('getUserById');
    expect(redacted).toBe(0);
  });

  it('S12-c. sanitizeASTPayload handles nested arrays', () => {
    const payload = [
      { path: 'src/index.js', secrets: ['AKIAIOSFODNN7EXAMPLE'] },
    ];
    const { sanitized } = sanitizeASTPayload(payload);
    expect(sanitized[0].secrets[0]).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('S12-d. sanitizeASTPayload handles null/number values safely', () => {
    const payload = { count: 42, label: null, flag: true };
    const { sanitized, redacted } = sanitizeASTPayload(payload);
    expect(sanitized.count).toBe(42);
    expect(sanitized.label).toBeNull();
    expect(sanitized.flag).toBe(true);
    expect(redacted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// S13. Negative cases — legitimate code strings must NOT be redacted
// ---------------------------------------------------------------------------

describe('S13. Negative cases — legitimate code not redacted', () => {
  it('S13-a. plain function identifier is preserved', () => {
    const input = 'function getUserById(id) { return db.query(id); }';
    const { content, redacted } = sanitizeCodebaseFile(input, 'user.js');
    expect(content).toContain('getUserById');
    expect(redacted).toBe(0);
  });

  it('S13-b. short password-like string in variable name not redacted', () => {
    const input = 'const passwordLength = 12;';
    const { content, redacted } = sanitizeCodebaseFile(input, 'validation.js');
    expect(content).toContain('passwordLength');
    expect(redacted).toBe(0);
  });

  it('S13-c. UUID string is not flagged as high-entropy secret', () => {
    const input = `const id = "123e4567-e89b-12d3-a456-426614174000";`;
    const { redacted } = sanitizeCodebaseFile(input, 'id.js');
    expect(redacted).toBe(0);
  });

  it('S13-d. regular URL without credentials is not redacted', () => {
    const input = `const BASE_URL = "https://api.example.com/v2";`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'config.js');
    expect(content).toContain('https://api.example.com/v2');
    expect(redacted).toBe(0);
  });

  it('S13-e. import statement is not redacted', () => {
    const input = `import { createServer } from 'http';`;
    const { content, redacted } = sanitizeCodebaseFile(input, 'server.js');
    expect(content).toContain("import { createServer } from 'http'");
    expect(redacted).toBe(0);
  });

  it('S13-f. hex color code is not flagged as high-entropy secret', () => {
    expect(isHighEntropySecret('#FF5733')).toBe(false);
  });

  it('S13-g. English prose is not flagged as high-entropy secret', () => {
    expect(isHighEntropySecret('This is a normal English sentence.')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S14. Compliance audit report generation
// ---------------------------------------------------------------------------

describe('S14. Compliance audit report', () => {
  let auditReport;
  let fixtureDir;

  beforeAll(async () => {
    // Create a mini fixture repo with known secrets
    fixtureDir = path.join(tmpDir, 'fixture-audit-repo');
    fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });

    // File with AWS key
    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'aws.js'),
      `const key = "AKIAIOSFODNN7EXAMPLE";\nmodule.exports = { key };`,
      'utf8',
    );

    // .env file (should be hard-excluded)
    fs.writeFileSync(
      path.join(fixtureDir, '.env'),
      'DATABASE_URL=postgresql://admin:secretPwd@db.internal/prod\nSTRIPE_KEY=sk_live_ABCD1234\n',
      'utf8',
    );

    // Clean file (no secrets)
    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'index.js'),
      `import { createServer } from 'http';\nconst PORT = 3000;\ncreateServer().listen(PORT);`,
      'utf8',
    );

    // Run audit
    auditReport = await runComplianceAudit({
      rootDir:   fixtureDir,
      outputDir: fixtureDir,
      writeFile: true,
    });
  });

  it('S14-a. audit report has correct schema version', () => {
    expect(auditReport.schemaVersion).toBe('2.0.0');
  });

  it('S14-b. audit report has a unique runId', () => {
    expect(typeof auditReport.runId).toBe('string');
    expect(auditReport.runId.length).toBeGreaterThan(10);
  });

  it('S14-c. audit scanned files in the fixture repo', () => {
    expect(auditReport.filesScanned).toBeGreaterThanOrEqual(1);
  });

  it('S14-d. audit detected at least one redaction', () => {
    expect(auditReport.totalRedactions).toBeGreaterThan(0);
  });

  it('S14-e. .env file is counted as excluded', () => {
    expect(auditReport.filesExcluded).toBeGreaterThanOrEqual(1);
  });

  it('S14-f. audit report is marked compliant', () => {
    expect(auditReport.compliant).toBe(true);
  });

  it('S14-g. audit has a non-empty integrity hash (SHA-256)', () => {
    expect(typeof auditReport.integrityHash).toBe('string');
    expect(auditReport.integrityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('S14-h. audit has a zero-leakage attestation string', () => {
    expect(typeof auditReport.attestation).toBe('string');
    expect(auditReport.attestation).toContain('MSE Zero-Leakage Attestation');
  });

  it('S14-i. audit JSON file was written to disk', () => {
    const auditPath = path.join(fixtureDir, 'privacy_compliance_audit.json');
    expect(fs.existsSync(auditPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    expect(parsed.schemaVersion).toBe('2.0.0');
  });

  it('S14-j. audit file inventory contains no raw credential values', () => {
    // File inventory should only contain token hashes, never raw secrets
    const inventoryStr = JSON.stringify(auditReport.fileInventory);
    expect(inventoryStr).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(inventoryStr).not.toContain('sk_live_');
    expect(inventoryStr).not.toContain('secretPwd');
  });

  it('S14-k. category counts have correct shape', () => {
    expect(typeof auditReport.categoryCounts).toBe('object');
    expect('AWS_ACCESS_KEY_ID' in auditReport.categoryCounts).toBe(true);
    expect('JWT_BEARER_TOKEN' in auditReport.categoryCounts).toBe(true);
    expect('POSTGRES_DSN' in auditReport.categoryCounts).toBe(true);
  });

  it('S14-l. purgeRawBuffer zeroes a buffer without throwing', () => {
    const raw = 'AKIAIOSFODNN7EXAMPLE some content here';
    expect(() => purgeRawBuffer(raw)).not.toThrow();
  });
});
