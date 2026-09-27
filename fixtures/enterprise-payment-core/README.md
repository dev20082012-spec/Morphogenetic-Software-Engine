# Enterprise Payment Core Microservice

Mission-critical payment settlement and double-entry ledger backend service.

## Architecture & Configuration

- Service Port: 3000
- Auth Scheme: HMAC authentication required for all payment services and API callers
- Webhook Security: HMAC-SHA256 signature verification required for all webhook endpoints
- Database: PostgreSQL on port 5432 with atomic double-entry balance constraints

## Service Boundaries

The microservice consists of four core modular boundaries:
1. `src/server.ts` — Ingress orchestration, express route mounting, and HTTP lifecycle
2. `src/config.ts` — Centralized typed configuration loader
3. `src/security/auth.ts` — Authentication verification and cryptographic helpers
4. `src/core/ledger.ts` — ACID double-entry transaction engine
5. `src/api/webhooks.ts` — Partner payment event ingestor (Stripe, Adyen)

## Ingress Routes

- `GET /health` — Service readiness and health probe
- `POST /api/v1/ledger/transactions` — Record authenticated double-entry ledger movement (Requires Auth)
- `POST /webhooks/stripe` — Ingest external payment intent settlement notifications

## Intended Security Behavior

All mutating ledger operations must be protected by cryptographic identity verification.
Webhook ingress endpoints must strictly verify partner payload signatures against the configured shared secret before triggering downstream ledger mutations. Unverified payloads must be rejected immediately with HTTP 401 Unauthorized.

## Environment Variables

- `PORT` — HTTP service listening port (default: 3000)
- `DATABASE_URL` — Connection URI for PostgreSQL ledger database
- `JWT_PUBLIC_KEY` — Cryptographic public key certificate
- `STRIPE_WEBHOOK_SECRET` — Secret used for HMAC-SHA256 webhook signature verification
- `NODE_ENV` — Environment name (development/production)
