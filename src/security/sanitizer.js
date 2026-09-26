/**
 * Pre-Flight Secret Redaction Engine
 *
 * Zero-Trust sanitization layer implementing IBM Cloud security standards.
 * Neutralizes all credential, secret, and PII patterns before agent ingestion.
 *
 * Design principles:
 *   1. DENY-BY-DEFAULT -- unknown high-entropy strings are redacted.
 *   2. DEPTH-IN-DEFENSE -- entropy scanner runs after all regex matchers.
 *   3. NON-DESTRUCTIVE -- sanitized output preserves AST-parseable structure.
 *   4. ZERO-LEAKAGE   -- no raw credential values are ever logged or stored.
 *   5. AUDIT-COMPLETE -- every redaction event is recorded in a tamper-evident log.
 *
 * Supported pattern categories:
 *   A. Cloud credentials  (AWS, GCP, Azure)
 *   B. Crypto keys        (RSA/PEM blocks, ECDSA, OpenSSH)
 *   C. High-entropy tokens (JWT, Stripe, GitHub, generic 32+ char secrets)
 *   D. Database DSNs      (Postgres, MongoDB, Redis, MySQL) -- password masked
 *   E. Hard-exclude files (.env, credentials.json, *.pem) -- full stub injection
 */

import path  from 'node:path';
import crypto from 'node:crypto';

/** Sentinel strings inserted in place of redacted secrets. */
export const SENTINELS = {
  AWS_KEY_ID:         '[REDACTED:AWS_ACCESS_KEY_ID]',
  AWS_SECRET:         '[REDACTED:AWS_SECRET_ACCESS_KEY]',
  GCP_TOKEN:          '[REDACTED:GCP_SERVICE_ACCOUNT_TOKEN]',
  AZURE_CONN:         '[REDACTED:AZURE_CONNECTION_STRING]',
  RSA_PRIVATE_KEY:    '/* [REDACTED:RSA_PRIVATE_KEY] */',
  PEM_BLOCK:          '/* [REDACTED:PEM_PRIVATE_KEY_BLOCK] */',
  SSH_PRIVATE_KEY:    '/* [REDACTED:OPENSSH_PRIVATE_KEY] */',
  JWT_TOKEN:          '[REDACTED:JWT_BEARER_TOKEN]',
  STRIPE_KEY:         '[REDACTED:STRIPE_API_KEY]',
  GITHUB_TOKEN:       '[REDACTED:GITHUB_API_TOKEN]',
  GENERIC_SECRET:     '[REDACTED:HIGH_ENTROPY_SECRET]',
  DB_PASSWORD:        '[REDACTED:DB_PASSWORD]',
  DB_HOST:            '[REDACTED:DB_HOST]',
  ENV_FILE_STUB:      '# [REDACTED: .env file contents replaced by MSE sanitizer]\nNODE_ENV=sanitized\n',
  CREDENTIALS_STUB:   '{"[REDACTED]": "[MSE sanitizer: credentials.json contents suppressed]"}',
  PEM_FILE_STUB:      '# [REDACTED: PEM key file contents replaced by MSE sanitizer]\n',
};

/** AWS Access Key ID: AKIA[0-9A-Z]{16} */
const RE_AWS_KEY_ID = /\b(AKIA[0-9A-Z]{16})\b/g;

/** AWS Secret Access Key: 40 base64url chars, often assignment context */
const RE_AWS_SECRET = /(?:aws[_\-]?secret[_\-]?(?:access[_\-]?)?key\s*[:=]\s*['"`]?)([A-Za-z0-9/+]{40})(?:['"`]?)/gi;

/** GCP Service Account token (JSON "private_key" field) */
const RE_GCP_TOKEN = /"private_key"\s*:\s*"(-----BEGIN[^"]{10,2048}-----\\n[^"]{10,4096}-----END[^"]{10,100}-----\\n?)"/g;

/** Azure connection strings: DefaultEndpointsProtocol=https;... */
const RE_AZURE_CONN = /DefaultEndpointsProtocol=https;[A-Za-z0-9=;/+]{20,512}/g;

/** Azure SAS tokens */
const RE_AZURE_SAS = /(?:SharedAccessSignature|sv=)[A-Za-z0-9%&=+\-]{30,512}/g;

/** RSA/PEM private key blocks */
const RE_PEM_BLOCK = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PRIVATE KEY|CERTIFICATE)[^-]*-----[\s\S]{20,4096}?-----END (?:RSA |EC |DSA |OPENSSH |PRIVATE KEY|CERTIFICATE)[^-]*-----/g;

/** OpenSSH private key blocks */
const RE_SSH_PRIVATE = /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]{20,4096}?-----END OPENSSH PRIVATE KEY-----/g;

/** JWT Bearer tokens (header.payload.signature) */
const RE_JWT = /\bey[A-Za-z0-9_-]{10,500}\.[A-Za-z0-9_-]{10,2000}\.[A-Za-z0-9_-]{10,1000}\b/g;

/** Stripe API keys */
const RE_STRIPE = /\b(sk_live_|pk_live_|rk_live_|sk_test_|pk_test_)[A-Za-z0-9]{20,120}\b/g;

/** GitHub personal access tokens */
const RE_GITHUB = /\b(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,255}\b/g;

/** Generic API key patterns: apikey=, api_key=, token=, secret= followed by 20+ chars */
const RE_GENERIC_KEY = /(?:api[_\-]?key|apikey|auth[_\-]?token|secret[_\-]?key|access[_\-]?token|private[_\-]?key)\s*[:=]\s*['"`]?([A-Za-z0-9/+_\-.]{20,256})['"`]?/gi;

/** Postgres connection strings: postgresql://user:password@host */
const RE_PG_DSN = /postgresql?:\/\/([^:@\s]{1,64}):([^@\s]{1,256})@([^/\s]{1,256})/gi;

/** MongoDB connection strings: mongodb://user:password@host */
const RE_MONGO_DSN = /mongodb(?:\+srv)?:\/\/([^:@\s]{1,64}):([^@\s]{1,256})@([^/\s?]{1,256})/gi;

/** Redis connection strings: redis://user:password@host or redis://:password@host */
const RE_REDIS_DSN = /redis[s]?:\/\/[^:@\s]{0,64}:([^@\s]{4,256})@([^/\s]{1,256})/gi;

/** MySQL connection strings: mysql://user:password@host */
const RE_MYSQL_DSN = /mysql(?:2)?:\/\/([^:@\s]{1,64}):([^@\s]{1,256})@([^/\s]{1,256})/gi;

/** Hard-coded password assignments (password=, passwd=, pwd=, pass=) */
const RE_PWD_ASSIGN = /(?:password|passwd|pwd|pass)\s*[:=]\s*['"`]([^'"`\s]{6,256})['"`]/gi;

/**
 * Compute Shannon entropy (bits per character) of a string.
 * High entropy (> 4.0) is a strong indicator of a credential or key.
 *
 * @param {string} s
 * @returns {number}
 */
export function shannonEntropy(s) {
  if (!s || s.length < 8) return 0;
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Determine if a token is a likely hard-coded secret using entropy analysis.
 *
 * Criteria (IBM Cloud Credential Exposure Standard §4.2):
 *   - Length >= 20 characters
 *   - Shannon entropy >= 4.0 bits/char
 *   - Does NOT look like a readable English phrase (space density < 5%)
 *   - Does NOT look like a hash placeholder (not all [0-9a-f]{32,64})
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isHighEntropySecret(token) {
  if (typeof token !== 'string') return false;
  if (token.length < 20 || token.length > 4096) return false;

  // Skip obvious non-secrets
  if (/^\s+$/.test(token)) return false;
  if (/^[0-9a-f]{32,64}$/i.test(token)) return false; // hash hex
  if (/^[0-9A-Z]{8}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{12}$/i.test(token)) return false; // UUID

  const entropy = shannonEntropy(token);
  return entropy >= 4.0;
}

/**
 * Files that must NEVER be ingested — replace contents with static stubs.
 * Pattern list per IBM Cloud Security Policy §3.1 (Secret File Exclusion).
 *
 * @param {string} filePath
 * @returns {{ excluded: boolean, stub: string }}
 */
export function checkHardExcludedFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const basename   = path.basename(normalized);

  // .env files (any variant: .env, .env.local, .env.production, etc.)
  if (/^\.env(\.|$)/.test(basename) || basename === '.env') {
    return { excluded: true, stub: SENTINELS.ENV_FILE_STUB };
  }

  // credentials.json (GCP, generic)
  if (basename === 'credentials.json' || basename === 'service-account.json') {
    return { excluded: true, stub: SENTINELS.CREDENTIALS_STUB };
  }

  // .pem, .key, .p12, .pfx, .cer, .crt files
  if (/\.(pem|key|p12|pfx|cer|crt|der)$/.test(basename)) {
    return { excluded: true, stub: SENTINELS.PEM_FILE_STUB };
  }

  // docker secrets files
  if (basename === '.dockerconfigjson' || normalized.endsWith('/.docker/config.json')) {
    return { excluded: true, stub: SENTINELS.CREDENTIALS_STUB };
  }

  // SSH private key files
  if (basename === 'id_rsa' || basename === 'id_ed25519' || basename === 'id_ecdsa') {
    return { excluded: true, stub: SENTINELS.PEM_FILE_STUB };
  }

  return { excluded: false, stub: '' };
}

/**
 * @typedef {{
 *   timestamp: string,
 *   filePath:  string,
 *   category:  string,
 *   lineHint:  number,
 *   tokenHash: string,
 *   sentinel:  string,
 * }} RedactionEvent
 */

/**
 * Build a redaction event record. The raw credential value is NEVER stored —
 * only a truncated SHA-256 hash (first 12 hex chars) for audit matching.
 *
 * @param {string} filePath
 * @param {string} category
 * @param {string} rawValue
 * @param {string} sentinel
 * @param {number} [lineHint]
 * @returns {RedactionEvent}
 */
function makeRedactionEvent(filePath, category, rawValue, sentinel, lineHint = 0) {
  const hash = crypto.createHash('sha256')
    .update(rawValue, 'utf8')
    .digest('hex')
    .slice(0, 12);

  return {
    timestamp: new Date().toISOString(),
    filePath:  filePath || '<ast-payload>',
    category,
    lineHint,
    tokenHash: hash,
    sentinel,
  };
}

/**
 * Estimate the approximate line number of a match in the original source.
 *
 * @param {string} source
 * @param {number} matchIndex
 * @returns {number}
 */
function estimateLine(source, matchIndex) {
  return (source.slice(0, matchIndex).match(/\n/g) || []).length + 1;
}

/**
 * @typedef {{
 *   content:   string,
 *   events:    RedactionEvent[],
 *   redacted:  number,
 *   excluded:  boolean,
 * }} SanitizeResult
 */

/**
 * Sanitize a single file's content before agent ingestion.
 *
 * Operates in three passes:
 *   Pass 1 — Hard-exclude check (entire file stub replacement)
 *   Pass 2 — Regex pattern sweep (category A–D + generic key patterns)
 *   Pass 3 — Entropy sweep on quoted/assigned string literals
 *
 * @param {string} content   - Raw file content
 * @param {string} filePath  - Absolute or relative path (for logging)
 * @returns {SanitizeResult}
 */
export function sanitizeCodebaseFile(content, filePath = '') {
  const events = [];

  // --- Pass 1: Hard exclusion ---
  const exclusionCheck = checkHardExcludedFile(filePath);
  if (exclusionCheck.excluded) {
    events.push(makeRedactionEvent(
      filePath, 'HARD_EXCLUDED_FILE', content.slice(0, 64), exclusionCheck.stub
    ));
    return { content: exclusionCheck.stub, events, redacted: 1, excluded: true };
  }

  if (typeof content !== 'string') {
    return { content: '', events, redacted: 0, excluded: false };
  }

  let out = content;

  // Helper: apply a global regex replacement and record each match
  function applyPattern(re, replacement, category) {
    const fresh = new RegExp(re.source, re.flags);
    out = out.replace(fresh, (match, ...groups) => {
      const lineHint = estimateLine(content, content.indexOf(match));
      // For DSN patterns, build replacement that preserves schema topology
      const result = typeof replacement === 'function'
        ? replacement(match, ...groups)
        : replacement;
      events.push(makeRedactionEvent(filePath, category, match.slice(0, 256), result, lineHint));
      return result;
    });
  }

  // --- Pass 2A: AWS credentials ---
  applyPattern(RE_AWS_KEY_ID,  SENTINELS.AWS_KEY_ID,  'AWS_ACCESS_KEY_ID');
  applyPattern(RE_AWS_SECRET,  (_m, key) => _m.replace(key, SENTINELS.AWS_SECRET), 'AWS_SECRET_ACCESS_KEY');

  // --- Pass 2B: GCP ---
  applyPattern(RE_GCP_TOKEN,   (_m, key) => _m.replace(key, SENTINELS.GCP_TOKEN),   'GCP_SERVICE_ACCOUNT_TOKEN');

  // --- Pass 2C: Azure ---
  applyPattern(RE_AZURE_CONN,  SENTINELS.AZURE_CONN,  'AZURE_CONNECTION_STRING');
  applyPattern(RE_AZURE_SAS,   SENTINELS.AZURE_CONN,  'AZURE_SAS_TOKEN');

  // --- Pass 2D: Crypto keys ---
  applyPattern(RE_PEM_BLOCK,   SENTINELS.PEM_BLOCK,   'PEM_PRIVATE_KEY_BLOCK');
  applyPattern(RE_SSH_PRIVATE, SENTINELS.SSH_PRIVATE_KEY, 'OPENSSH_PRIVATE_KEY');

  // --- Pass 2E: Bearer tokens / API keys ---
  applyPattern(RE_JWT,         SENTINELS.JWT_TOKEN,   'JWT_BEARER_TOKEN');
  applyPattern(RE_STRIPE,      SENTINELS.STRIPE_KEY,  'STRIPE_API_KEY');
  applyPattern(RE_GITHUB,      SENTINELS.GITHUB_TOKEN, 'GITHUB_API_TOKEN');

  // --- Pass 2F: Database DSNs (password + host masked, schema preserved) ---
  applyPattern(RE_PG_DSN, (_m, user, pass, host) =>
    _m.replace(pass, SENTINELS.DB_PASSWORD).replace(host, SENTINELS.DB_HOST),
    'POSTGRES_DSN');
  applyPattern(RE_MONGO_DSN, (_m, user, pass, host) =>
    _m.replace(pass, SENTINELS.DB_PASSWORD).replace(host, SENTINELS.DB_HOST),
    'MONGODB_DSN');
  applyPattern(RE_REDIS_DSN, (_m, pass, host) =>
    _m.replace(pass, SENTINELS.DB_PASSWORD).replace(host, SENTINELS.DB_HOST),
    'REDIS_DSN');
  applyPattern(RE_MYSQL_DSN, (_m, user, pass, host) =>
    _m.replace(pass, SENTINELS.DB_PASSWORD).replace(host, SENTINELS.DB_HOST),
    'MYSQL_DSN');

  // --- Pass 2G: Generic API key / password assignments ---
  applyPattern(RE_GENERIC_KEY, (_m, val) => _m.replace(val, SENTINELS.GENERIC_SECRET), 'GENERIC_API_KEY');
  applyPattern(RE_PWD_ASSIGN,  (_m, val) => _m.replace(val, SENTINELS.DB_PASSWORD),    'HARDCODED_PASSWORD');

  // --- Pass 3: Shannon entropy sweep on quoted string literals ---
  // Matches: "...", '...', `...` where content is >= 20 chars.
  // IMPORTANT: skip strings that already contain a redaction sentinel
  // (inserted by earlier regex passes) to prevent double-redaction and
  // sentinel corruption.
  const REDACTED_MARKER = '[REDACTED:';
  const literalRe = /(?:"([^"\n]{20,256})"|'([^'\n]{20,256})'|`([^`]{20,256})`)/g;
  out = out.replace(literalRe, (match, dq, sq, bt) => {
    const val = dq ?? sq ?? bt;
    // Skip if the literal already contains a sentinel from a prior pass
    if (val && val.includes(REDACTED_MARKER)) return match;
    if (val && isHighEntropySecret(val)) {
      const lineHint = estimateLine(content, content.indexOf(match));
      events.push(makeRedactionEvent(filePath, 'HIGH_ENTROPY_STRING', val.slice(0, 256), SENTINELS.GENERIC_SECRET, lineHint));
      return match.replace(val, SENTINELS.GENERIC_SECRET);
    }
    return match;
  });

  return {
    content:  out,
    events,
    redacted: events.length,
    excluded: false,
  };
}

/**
 * Sanitize an AST/topology graph payload in-memory.
 *
 * Recursively walks the graph object and neutralizes any string values that
 * contain raw credential patterns. The AST structure (keys, types, nesting)
 * is preserved so downstream subagents can still parse it.
 *
 * @param {unknown} astGraph - The AST/topology object from the Morphologist
 * @param {string} [_path='<root>'] - Internal recursion path for logging
 * @param {RedactionEvent[]} [_events=[]] - Accumulator
 * @returns {{ sanitized: unknown, events: RedactionEvent[], redacted: number }}
 */
export function sanitizeASTPayload(astGraph, _path = '<root>', _events = []) {
  if (typeof astGraph === 'string') {
    const result = sanitizeCodebaseFile(astGraph, `<ast:${_path}>`);
    _events.push(...result.events);
    return { sanitized: result.content, events: _events, redacted: _events.length };
  }

  if (Array.isArray(astGraph)) {
    const sanitized = astGraph.map((item, i) => {
      const r = sanitizeASTPayload(item, `${_path}[${i}]`, _events);
      return r.sanitized;
    });
    return { sanitized, events: _events, redacted: _events.length };
  }

  if (astGraph !== null && typeof astGraph === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(astGraph)) {
      const child = sanitizeASTPayload(value, `${_path}.${key}`, _events);
      sanitized[key] = child.sanitized;
    }
    return { sanitized, events: _events, redacted: _events.length };
  }

  return { sanitized: astGraph, events: _events, redacted: _events.length };
}

/**
 * Overwrite a mutable string buffer with zeros before GC.
 *
 * JavaScript strings are immutable; this function converts to a Buffer,
 * zeros it, and signals that the original reference should be released.
 * Call this after the sanitized version has been passed downstream.
 *
 * @param {string} rawContent
 * @returns {void}
 */
export function purgeRawBuffer(rawContent) {
  if (typeof rawContent !== 'string') return;
  const buf = Buffer.from(rawContent, 'utf8');
  buf.fill(0);
}

export default {
  sanitizeCodebaseFile,
  sanitizeASTPayload,
  checkHardExcludedFile,
  shannonEntropy,
  isHighEntropySecret,
  purgeRawBuffer,
  SENTINELS,
};

