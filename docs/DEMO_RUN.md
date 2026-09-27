# MSE Canonical Demonstration Run Record

## 1. Demonstration Repository

* **Repository Fixture**: `fixtures/enterprise-payment-core/`
* **Repository Architecture**: Realistic small enterprise payment backend written in TypeScript (Express, PostgreSQL ledger, RSA authentication, Stripe webhook ingress).
* **Loaded Snapshot**: 9 files, 294 lines of code, 5 environment variables, 4 HTTP endpoints.

```
fixtures/enterprise-payment-core/
├── .env.example
├── README.md
├── package.json
├── expected-audit.json
├── src/
│   ├── config.ts
│   ├── server.ts
│   ├── security/auth.ts
│   ├── core/ledger.ts
│   └── api/webhooks.ts
└── tests/
    └── existing.test.ts
```

---

## 2. Reproduction Steps

To execute the identical analysis run via the command line or UI:

### CLI / Test Suite Execution
```bash
cd project-mse
npm test -- test/enterprise-fixture.test.js
```

### Studio UI Execution
1. Open the Project MSE Developer Studio in the browser (`http://localhost:5173`).
2. Click the **[ENTERPRISE CORE DEMO]** button in the header bar.
3. Observe the ephemeral repository snapshot load into the left file tree.
4. Click **[RUN MSE AUDIT]**.
5. Observe the 7 live telemetry stages:
   `INGESTING` → `ANALYZING` → `RECONCILING` → `SEARCHING` → `SYNTHESIZING` → `VERIFYING` → `COMPLETE`.
6. Inspect findings across the 7 center workspace modes:
   `OVERVIEW`, `SOURCE`, `DRIFT`, `COUNTEREXAMPLE`, `DIFF`, `VERIFICATION`, `REPORT`.

---

## 3. Actual Measured Results

All metrics below are measured from live execution against `fixtures/enterprise-payment-core/` (recorded in `fixtures/enterprise-payment-core/expected-audit.json`):

### Ingestion & Repository Statistics
* **Files Analyzed**: 9
* **Source Modules (TS/JS)**: 6 (5 in `src/`, 1 in `tests/`)
* **Total Lines**: 294
* **Discovered Routes**: 4
  - `POST /webhooks/stripe` (`src/api/webhooks.ts:17`)
  - `GET /health` (`src/server.ts:19`)
  - `GET /api/v1/ledger/balance/:id` (`src/server.ts:29`)
  - `POST /api/v1/ledger/transactions` (`src/server.ts:39`)
* **Environment Variables**: 5 (`PORT`, `DATABASE_URL`, `JWT_PUBLIC_KEY`, `STRIPE_WEBHOOK_SECRET`, `NODE_ENV`)
* **Measured Execution Duration**: **7 ms to 29 ms** (measured using `performance.now()`).

### Findings
Total Findings Detected: **10** (4 Critical, 6 High, 0 Medium, 0 Low)

1. `ALPHA-001` (CRITICAL): `Unguarded state-mutating route: POST /webhooks/stripe`
   - *Evidence*: `src/api/webhooks.ts:17`
2. `ALPHA-002` (HIGH): `Signature verification helper "verifyWebhookSignature" exists but is not used by webhooks.ts`
   - *Evidence*: `src/security/auth.ts:52`
3. `BETA-001` (HIGH): `Port mismatch: documentation says 3000, code uses 8080`
   - *Evidence*: `src/config.ts:16` vs `README.md:9`
4. `BETA-002` (HIGH): `Port mismatch: .env.example says 3000, code defaults to 8080`
   - *Evidence*: `src/config.ts:16` vs `.env.example:1`
5. `BETA-003` (HIGH): `Authentication scheme drift: Documentation specifies HMAC, code implements RS256/RSA`
   - *Evidence*: `src/security/auth.ts:8` vs `README.md:10`
6. `BETA-004` (CRITICAL): `Documentation requires HMAC auth for webhooks, but code does not verify signatures`
   - *Evidence*: `src/api/webhooks.ts:17` vs `README.md:11`

### Invariant Evaluations
* `INV-001` (Route authentication guard): **VIOLATED**
* `INV-002` (API port consistency): **VIOLATED**
* `INV-003` (Transaction boundary completeness): **SATISFIED**
* `INV-004` (Webhook signature verification): **VIOLATED**
* `INV-005` (Environment variable documentation): **SATISFIED**
* `INV-006` (Auth helper utilization): **VIOLATED**

### Gamma Counterexample Synthesis
* Counterexample `CX-003` generated for `INV-004`:
  - *Scenario*: An attacker sends a forged webhook POST request to `/webhooks/stripe` with a crafted payload but no valid `X-Hub-Signature-256` header.
  - *Root Cause*: `src/api/webhooks.ts:17 does not call any signature verification function before processing the request body.`
  - *Synthesized Test Antigen*: Complete executable Vitest unit test asserting signature validation.

### Candidate Patches Synthesized
* `PATCH-001` (`AUTH_GUARD_INSERTION`): Injects `requireAuth` middleware into unguarded route in `src/api/webhooks.ts`.
* `PATCH-002` (`DOC_PORT_RECONCILIATION`): Reconciles documented service port in `README.md` to `8080`.
* `PATCH-003` (`DOC_PORT_RECONCILIATION`): Reconciles default `PORT=3000` in `.env.example` to `PORT=8080`.
* `PATCH-004` (`WEBHOOK_SIGNATURE_GUARD`): Imports `verifyWebhookSignature` from `src/security/auth.ts` and injects HMAC header guard in `src/api/webhooks.ts`.

### Verification Prover Result
* **Verification Status**: **VERIFIED**
* **Checks Passed**: **7 / 7** (100%)
  1. Patch application: Passed (applied 4 patches to virtual in-memory clone)
  2. Post-patch Alpha analysis: Passed (re-analyzed 6 files)
  3. Post-patch Beta drift analysis: Passed
  4. Post-patch invariant evaluation: Passed (violated reduced, satisfied increased)
  5. Finding resolution: Passed (findings resolved without regressions)
  6. No new invariant violations: Passed
  7. Invariant improvement: Passed
