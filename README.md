# ClipGenius AI

**Turn long videos into viral clips — automatically.**

ClipGenius AI is a production-ready SaaS platform that analyzes long videos and generates
multiple engaging short clips optimized for **TikTok, YouTube Shorts and Instagram Reels**:
face-tracked 9:16 crops, silence removal, animated captions, titles, hooks, hashtags and
thumbnails — rendered by real FFmpeg pipelines on a durable background job queue.

---

## Feature overview

| Area | What's implemented |
|---|---|
| **Dashboard** | Premium dark UI (purple/blue), responsive sidebar layout, stat cards, usage meters, recent projects, live processing progress |
| **Video input** | Drag-and-drop + file picker with real upload progress (XHR), streaming server-side ingestion, magic-byte validation (MP4/MOV/WEBM), size limits per plan, direct-URL ingestion with strict policy (see below), video preview |
| **AI engine** | Audio RMS energy analysis, silence detection, scene-cut detection, speech segmentation, highlight ranking & selection, 5–20 clips per video, 15/30/45/60-second target lengths, sentence-boundary snapping (never cuts sentences), Gemini-powered transcription & highlight refinement when configured |
| **Automatic editing** | 9:16 (also 4:5, 1:1, 16:9) conversion, OpenCV face detection + smoothed face-tracking crop, silence jump-cuts, optional filler-word removal, animated captions (pop/fade/karaoke, ASS burned via libass), fonts/colors/position, text overlays, thumbnails, titles/descriptions/hashtags, plan-based watermarking |
| **Video editor** | Source-preview with trim playback, visual timeline with drag trim handles + transcript ticks, caption text editing, font selection (6 families), 3 caption colors, size/position/animation controls, text overlay management, aspect & export settings, save/export/download |
| **Clip library** | Grid with real thumbnails, duration, rank, status, metadata badges, per-clip download (MP4 up to 1080×1920), edit & delete |
| **Accounts** | Signup, login, logout, password recovery (SMTP or dev-link), password change, profile editing, per-user project history, usage tracking (clips/minutes/renders/storage, 12-month history) |
| **Subscriptions** | Stripe Checkout + Customer Portal + signed webhooks; Free / Creator $19 / Pro $49 / Agency $99; limits (clips per month, projects per month, max source duration, max upload size, export resolution, watermark) enforced **server-side** in API and worker |
| **Admin** | Overview KPIs + activity charts (Recharts), users table (search, plan/role/ban/delete), job queue monitor (retry/cancel), payments ledger, API usage & 5xx error tracking |
| **Reliability** | Durable pg-boss job queue (Postgres-backed, retries with backoff), per-stage progress reporting, file validation, rate limiting, per-user data isolation on every route, storage limits, clear failure messages, integration status endpoint |

## Architecture

```
┌────────────────────┐     ┌───────────────────────────────┐
│  Next.js 14 (TS)   │     │  Worker (tsx, background)     │
│  App Router + API  │────▶│  pg-boss consumers            │
│  Tailwind UI       │     │  analyze → highlights → clips │
└─────────┬──────────┘     │  render  → FFmpeg / OpenCV    │
          │                └──────────────┬────────────────┘
          ▼                               ▼
┌────────────────────┐     ┌───────────────────────────────┐
│  PostgreSQL        │◀────│  Object storage               │
│  (Supabase or any) │     │  local disk (dev) or S3/R2    │
│  + pg-boss queues  │     └───────────────────────────────┘
└────────────────────┘
          ▲
          │ optional (server-side keys only)
┌─────────┴──────────┐
│ Gemini · Stripe    │
│ SMTP · S3          │
└────────────────────┘
```

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, lucide icons, Recharts.
- **Backend**: Next.js route handlers (zod-validated), scrypt/bcrypt password hashing,
  JWT sessions in HTTP-only cookies, sliding-window rate limiter, API usage accounting.
- **Database**: PostgreSQL — users, projects, clips, processing_jobs, exports, subscriptions,
  payments, usage_counters, api_usage (+ pg-boss durable queue schema). SQL migrations in
  `migrations/`, tracked in `schema_migrations`.
- **Processing worker** (`npm run worker`): consumes `project-analyze` and `clip-render` jobs.
  FFmpeg (bundled static build) does all media work; OpenCV Haar cascades (Python helper)
  provide real face detection for smart cropping. Jobs serialize in-process (CPU-bound),
  retry with backoff, and write progress to the DB for live UI updates.
- **Storage**: pluggable `local` (default, fully functional) or `s3` (AWS S3 / Cloudflare R2 /
  MinIO). Media streaming supports HTTP Range for smooth video seeking.

## Quick start (local development)

Requirements: Node.js ≥ 20. Everything else (FFmpeg, ffprobe, PostgreSQL binaries) is
installed via npm — no system packages needed.

```bash
npm install

# face-tracking support (OpenCV helper — recommended, falls back to center crop)
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt

# 1. Start the bundled development Postgres (leave it running)
npm run db:start          # writes DATABASE_URL to .env.local

# 2. In another terminal: migrate + seed admin account
npm run setup

# 3. Run the web app
npm run dev               # http://localhost:3000

# 4. In a third terminal: run the render worker
npm run worker
```

Sign in with the admin credentials printed by `npm run setup`
(or create a normal account at `/signup`).

> **Production**: point `DATABASE_URL` at a managed Postgres (e.g. Supabase — see below) and
> run `npm run migrate && npm run seed`. Run `npm run build && npm run start` for the web app
> and `npm run worker` on your worker machine(s). Never expose `.env.local`.

### Testing the complete workflow

```bash
npm run e2e
```

This runs a **real** end-to-end test: it generates a genuine 3-scene test video with FFmpeg,
then exercises signup → streaming upload → copyright URL policy → analysis (energy,
silences, scene cuts) → highlight selection → rendering (face-tracked 9:16, silence removal)
→ thumbnails → download (verifies the output is a valid 720×1280 MP4 with ffprobe) → editor
edits & re-export → password recovery → plan-limit enforcement → admin statistics.

## Configuration

Copy `.env.example` to `.env.local` and fill in what you need. Every integration is optional
at boot — the app runs with honest fallbacks and `/api/system-status` (plus **Billing →
Integration status**) shows exactly what is configured and how to set up what isn't.

| Variable | Purpose | Fallback when missing |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | local dev DB (`npm run db:start`) |
| `JWT_SECRET` | Session signing secret | dev-only secret (set in production!) |
| `STORAGE_DRIVER`, `STORAGE_DIR` | `local` storage settings | — |
| `S3_*` | S3/R2/MinIO object storage | local disk storage |
| `GEMINI_API_KEY` | Google Gemini — speech transcription, AI highlight selection, creative metadata | local acoustic analysis engine (clips still generated from real energy/scene/silence measurements; captions require a transcript) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Subscriptions | billing stays Free-plan; UI shows setup instructions |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Password-recovery email | reset link logged + shown in the response (dev mode) |
| `ADMIN_EMAILS` | Comma-separated admins | seeded admin account |
| `MAX_UPLOAD_MB`, `RATE_LIMIT_RPM` | Hard limits | 2048 MB / 120 rpm |

### Google Gemini (transcription & highlight intelligence)

1. Create a key at <https://aistudio.google.com/apikey>.
2. Set `GEMINI_API_KEY` (and optionally `GEMINI_TRANSCRIBE_MODEL`, `GEMINI_HIGHLIGHT_MODEL`).
3. Restart the worker.

With a key configured the pipeline adds: word/segment-timed transcripts, sentence-aware
highlight selection refined by Gemini, and creative titles/hooks/descriptions/hashtags — all
labeled with the provider (`metadata_provider: gemini | local`) so nothing is presented as AI
output when it isn't.

### Stripe (subscriptions)

1. Create Products with recurring prices — **Creator $19**, **Pro $49**, **Agency $99** — at
   <https://dashboard.stripe.com/products>.
2. Set `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint `https://<your-domain>/api/billing/webhook` with events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
   `invoice.payment_failed`; set `STRIPE_WEBHOOK_SECRET` to its signing secret.
4. Put the price IDs in `STRIPE_PRICE_CREATOR`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`.
5. For local webhook testing: `stripe listen --forward-to localhost:3000/api/billing/webhook`.

Plan limits (enforced server-side in API + worker):

| | Free | Creator $19 | Pro $49 | Agency $99 |
|---|---|---|---|---|
| Clips / month | 5 | 50 | 200 | 1,000 |
| Projects / month | 3 | 30 | 120 | 500 |
| Max source length | 10 min | 30 min | 2 h | 4 h |
| Max upload | 500 MB | 2 GB | 4 GB | 8 GB |
| Export resolution | 720×1280 | 1080×1920 | 1080×1920 | 1080×1920 |
| Watermark | yes | no | no | no |
| Priority queue | – | – | yes | yes (highest) |

### Supabase (production Postgres)

1. In Supabase create a project (or use an existing one).
2. Project → Settings → Database → copy the connection string (use the pooler URL for
   serverless), set it as `DATABASE_URL`.
3. `npm run migrate` applies the schema (`migrations/001_init.sql`).
4. Optionally restrict network access with Supabase's connection allow-list.

### Email (password recovery)

Any SMTP relay works (Resend/Postmark/SES/Gmail app-password):
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
Without SMTP, reset links are logged server-side and returned in the API response so the
flow remains fully functional in development.

## Copyright & platform policy

ClipGenius **never bypasses streaming-platform protections**. URL ingestion accepts only
direct video file links (MP4/MOV/WEBM with validated content-type + magic bytes). Watch-page
URLs (YouTube, TikTok, Instagram, Facebook, X, Twitch, Vimeo, …) are rejected with a clear
message directing users to upload the file directly when they hold the rights to it.

## Security

- Passwords hashed with bcrypt (cost 12); reset tokens stored as SHA-256 hashes, single-use, 60-min expiry.
- Sessions: signed JWT in HTTP-only, Same-Site cookies (Secure under HTTPS).
- Every media/API route enforces per-user ownership (`users/{userId}/...` storage keys) — admin can read all.
- API keys (Gemini, Stripe, SMTP, S3) exist only in server-side environment variables.
- Sliding-window rate limiting per IP/route + per-plan quotas + upload size caps + magic-byte file validation.
- Stripe webhooks signature-verified; DB writes for billing driven only by verified events.

## API surface (summary)

```
POST /api/auth/register|login|logout|forgot-password|reset-password|change-password
GET  /api/auth/me            PATCH /api/auth/me
GET  /api/system-status      GET /api/usage
POST /api/uploads            (streaming raw-body upload)
GET|POST /api/projects       GET|PATCH|DELETE /api/projects/:id
POST /api/projects/:id/process
GET  /api/clips              GET|PATCH|DELETE /api/clips/:id
POST /api/clips/:id/export   GET /api/clips/:id/download
GET  /api/media/*            (range-aware media streaming, per-user isolated)
POST /api/billing/checkout|portal   POST /api/billing/webhook
GET  /api/admin/stats|users|jobs|payments|usage
PATCH|DELETE /api/admin/users/:id   POST /api/admin/jobs (retry/cancel)
```

## Repository layout

```
migrations/            SQL schema migrations
scripts/               db manager, migrate, seed, setup, e2e, face_detect.py
src/app/               landing, auth pages, dashboard app (route group), API routes
src/components/        UI design system + app shell
src/lib/               env, db, auth, plans, storage, queue, mail, rate-limit,
                       download policy, ai/gemini + metadata, video/* pipeline
worker/                background worker + processing pipeline
public/fonts              bundled OFL fonts for captions assets/fonts · public/fonts   bundled OFL fonts for captions & UI UI
```

## License notes

Bundled fonts (Inter, Poppins, Montserrat, Oswald, Bebas Neue) are SIL Open Font License.
FFmpeg static builds are LGPL/GPL — see johnvansickle.com/ffmpeg for license details.
