/**
 * Centralized Enterprise Configuration Loader
 * Reads process.env and enforces application defaults.
 */

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtPublicKey: string;
  stripeWebhookSecret: string;
  nodeEnv: string;
}

export const config: AppConfig = {
  // Source default binds to 8080 (Drift: README and .env.example specify 3000)
  port: Number(process.env.PORT) || 8080,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/payment_core',
  jwtPublicKey: process.env.JWT_PUBLIC_KEY || 'dev-rsa-public-key',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_default_secret',
  nodeEnv: process.env.NODE_ENV || 'development',
};
