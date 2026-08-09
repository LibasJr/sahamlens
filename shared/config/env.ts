import { z } from 'zod';

/**
 * Central inventory for server-side environment groups.
 *
 * Not every feature is mandatory in every deployment (for example Telegram and SMTP
 * can be disabled), so importing the database client must not suddenly require all
 * optional integrations. `getNodeEnv()` therefore preserves the existing hard
 * requirement for DATABASE_URL, while `assertFeatureEnv()` gives feature entry points
 * a single fail-fast validator instead of ad-hoc process.env checks.
 */
const nodeEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diset'),
});

export const FEATURE_ENV_KEYS = {
  auth: ['JWT_SECRET_KEY'] as const,
  admin: ['ADMIN_SECRET_KEY'] as const,
  internalApi: ['INTERNAL_API_SECRET'] as const,
  cron: ['CRON_SECRET'] as const,
  redis: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const,
  qstashReceiver: ['QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY'] as const,
  qstashPublisher: ['QSTASH_TOKEN'] as const,
  smtp: ['SMTP_EMAIL', 'SMTP_PASSWORD'] as const,
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] as const,
} as const;

export type FeatureEnvName = keyof typeof FEATURE_ENV_KEYS;

let cached: z.infer<typeof nodeEnvSchema> | null = null;

export function getNodeEnv() {
  if (!cached) {
    cached = nodeEnvSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
    });
  }
  return cached;
}

export function getMissingFeatureEnv(feature: FeatureEnvName): string[] {
  return FEATURE_ENV_KEYS[feature].filter((key) => {
    const value = process.env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

/**
 * Fail fast for an integration that is explicitly being used.
 * Optional integrations remain optional until their own code path invokes this helper.
 */
export function assertFeatureEnv(feature: FeatureEnvName): void {
  const missing = getMissingFeatureEnv(feature);
  if (missing.length > 0) {
    throw new Error(`Konfigurasi ${feature} belum lengkap: ${missing.join(', ')}`);
  }
}
