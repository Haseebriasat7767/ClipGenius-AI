-- ClipGenius AI — initial schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'creator', 'pro', 'agency')),
  stripe_customer_id TEXT,
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'processing', 'completed', 'failed')),
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'url')),
  source_url TEXT,
  source_path TEXT,
  source_filename TEXT,
  size_bytes BIGINT,
  duration_seconds DOUBLE PRECISION,
  width INTEGER,
  height INTEGER,
  fps DOUBLE PRECISION,
  video_codec TEXT,
  audio_codec TEXT,
  error TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage TEXT NOT NULL DEFAULT '',
  progress INTEGER NOT NULL DEFAULT 0,
  clips_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_time DOUBLE PRECISION NOT NULL,
  end_time DOUBLE PRECISION NOT NULL,
  duration_seconds DOUBLE PRECISION NOT NULL,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  transcript JSONB NOT NULL DEFAULT '{"segments": []}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'rendering', 'ready', 'failed')),
  error TEXT,
  video_path TEXT,
  thumbnail_path TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT,
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  overlays JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id, rank);
CREATE INDEX IF NOT EXISTS idx_clips_user ON clips(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('analyze', 'render')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON processing_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON processing_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON processing_jobs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error TEXT,
  video_path TEXT,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exports_clip ON exports(clip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'creator', 'pro', 'agency')),
  status TEXT NOT NULL DEFAULT 'active',
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  stripe_checkout_session_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  plan TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  clips_generated INTEGER NOT NULL DEFAULT 0,
  minutes_processed DOUBLE PRECISION NOT NULL DEFAULT 0,
  renders INTEGER NOT NULL DEFAULT 0,
  storage_bytes BIGINT NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

CREATE TABLE IF NOT EXISTS api_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id, created_at DESC);
