/**
 * Centralized, validated access to environment configuration.
 * Every integration reports its configured state via `getIntegrationStatus()`
 * so the UI and `/api/system-status` can tell the operator exactly what is
 * missing instead of silently failing.
 */
import path from 'node:path';

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  get appUrl() {
    return str('NEXT_PUBLIC_APP_URL', 'http://localhost:3000').replace(/\/$/, '');
  },
  get jwtSecret() {
    return str('JWT_SECRET', 'dev-insecure-secret-change-me');
  },
  get databaseUrl() {
    return str('DATABASE_URL', 'postgres://postgres:postgres@127.0.0.1:5432/clipgenius');
  },
  get storageDriver() {
    return str('STORAGE_DRIVER', 'local') as 'local' | 's3';
  },
  get storageDir() {
    return path.resolve(str('STORAGE_DIR', './data/storage'));
  },
  get s3() {
    return {
      endpoint: str('S3_ENDPOINT'),
      region: str('S3_REGION', 'us-east-1'),
      bucket: str('S3_BUCKET'),
      accessKeyId: str('S3_ACCESS_KEY_ID'),
      secretAccessKey: str('S3_SECRET_ACCESS_KEY'),
      forcePathStyle: str('S3_FORCE_PATH_STYLE', 'false') === 'true',
    };
  },
  get geminiApiKey() {
    return str('GEMINI_API_KEY');
  },
  get geminiTranscribeModel() {
    return str('GEMINI_TRANSCRIBE_MODEL', 'gemini-2.5-flash');
  },
  get geminiHighlightModel() {
    return str('GEMINI_HIGHLIGHT_MODEL', 'gemini-2.5-flash');
  },
  get stripe() {
    return {
      secretKey: str('STRIPE_SECRET_KEY'),
      webhookSecret: str('STRIPE_WEBHOOK_SECRET'),
      prices: {
        creator: str('STRIPE_PRICE_CREATOR'),
        pro: str('STRIPE_PRICE_PRO'),
        agency: str('STRIPE_PRICE_AGENCY'),
      },
    };
  },
  get smtp() {
    return {
      host: str('SMTP_HOST'),
      port: int('SMTP_PORT', 587),
      user: str('SMTP_USER'),
      pass: str('SMTP_PASS'),
      from: str('SMTP_FROM', 'ClipGenius AI <no-reply@clipgenius.ai>'),
    };
  },
  get adminEmails(): string[] {
    return str('ADMIN_EMAILS')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get maxUploadMb() {
    return int('MAX_UPLOAD_MB', 2048);
  },
  get rateLimitRpm() {
    return int('RATE_LIMIT_RPM', 120);
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
};

export interface IntegrationStatus {
  id: string;
  name: string;
  configured: boolean;
  detail: string;
  setup?: string;
}

/** Live status of every optional integration — surfaced in the UI. */
export function getIntegrationStatus(): IntegrationStatus[] {
  const s3Configured =
    env.storageDriver === 's3' &&
    !!env.s3.bucket &&
    !!env.s3.accessKeyId &&
    !!env.s3.secretAccessKey;
  return [
    {
      id: 'database',
      name: 'PostgreSQL database',
      configured: !!process.env.DATABASE_URL,
      detail: process.env.DATABASE_URL
        ? 'DATABASE_URL is set.'
        : 'DATABASE_URL is not set — falling back to the local development database.',
      setup: 'Set DATABASE_URL to your Postgres connection string (Supabase → Project Settings → Database).',
    },
    {
      id: 'gemini',
      name: 'Gemini AI (transcription & highlight selection)',
      configured: !!env.geminiApiKey,
      detail: env.geminiApiKey
        ? `Configured (${env.geminiTranscribeModel}).`
        : 'GEMINI_API_KEY missing — the local analysis engine is used instead (no speech transcript).',
      setup: 'Create a key at https://aistudio.google.com/apikey and set GEMINI_API_KEY.',
    },
    {
      id: 'stripe',
      name: 'Stripe subscriptions',
      configured: !!env.stripe.secretKey && !!env.stripe.webhookSecret,
      detail: env.stripe.secretKey
        ? env.stripe.webhookSecret
          ? 'Configured.'
          : 'STRIPE_WEBHOOK_SECRET missing — checkout works but webhooks will not verify.'
        : 'STRIPE_SECRET_KEY missing — billing stays in Free-plan mode.',
      setup: 'Create products/prices in Stripe, set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the STRIPE_PRICE_* IDs.',
    },
    {
      id: 'smtp',
      name: 'Email (password recovery)',
      configured: !!env.smtp.host && !!env.smtp.user,
      detail: env.smtp.host
        ? 'Configured.'
        : 'SMTP not configured — reset links are logged and shown in the API response instead of emailed.',
      setup: 'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.',
    },
    {
      id: 'storage',
      name: env.storageDriver === 's3' ? 'S3 object storage' : 'Local file storage',
      configured: env.storageDriver === 'local' || s3Configured,
      detail:
        env.storageDriver === 'local'
          ? `Writing to ${env.storageDir}`
          : s3Configured
            ? `Bucket ${env.s3.bucket}`
            : 'STORAGE_DRIVER=s3 but S3 credentials are incomplete.',
      setup: 'Set STORAGE_DRIVER=s3 plus S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for R2/MinIO).',
    },
  ];
}
