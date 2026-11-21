import Link from 'next/link';
import {
  Zap,
  Scissors,
  Captions,
  Video,
  Shield,
  Sparkles,
  ArrowRight,
  Play,
  TrendingUp,
  Clock,
  Check,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Sparkles,
    title: 'AI highlight detection',
    body: 'Gemini-powered analysis finds the most engaging moments in your long videos — hooks, stories and punchlines — and ranks them automatically.',
  },
  {
    icon: Scissors,
    title: 'Smart vertical reframing',
    body: 'Face-tracking keeps speakers perfectly framed in 9:16. Silences and filler words are cut automatically for punchy pacing.',
  },
  {
    icon: Captions,
    title: 'Animated captions',
    body: 'Word-timed subtitles with pop, fade and karaoke animations. Pick fonts, colors and positions that match your brand.',
  },
  {
    icon: TrendingUp,
    title: 'Platform-ready exports',
    body: '1080×1920 MP4s optimized for TikTok, YouTube Shorts and Instagram Reels — with titles, descriptions, hashtags and thumbnails.',
  },
  {
    icon: Clock,
    title: 'Batch processing',
    body: 'Durable background rendering generates 5–20 clips per video in 15, 30, 45 or 60-second lengths while you keep working.',
  },
  {
    icon: Shield,
    title: 'Your content, your data',
    body: 'Secure per-user isolation, encrypted credentials, and strict copyright policy — we never bypass platform protections.',
  },
];

const STEPS = [
  { n: '01', title: 'Upload or paste a link', body: 'Drop an MP4, MOV or WEBM — or paste a direct video URL.' },
  { n: '02', title: 'AI finds the gold', body: 'Speech, scenes and energy are analyzed to select the strongest segments.' },
  { n: '03', title: 'Edit & export', body: 'Fine-tune captions and crops in the editor, then export vertical clips in one click.' },
];

const PRICING = [
  { name: 'Free', price: '$0', tag: 'Try it out', features: ['5 clips / month', '10-min videos', '720p exports', 'Auto captions'] },
  { name: 'Creator', price: '$19', tag: 'Most popular', features: ['50 clips / month', '30-min videos', '1080×1920 exports', 'No watermark'], featured: true },
  { name: 'Pro', price: '$49', tag: 'For serious creators', features: ['200 clips / month', '2-hour videos', 'Priority queue', 'Filler removal'] },
  { name: 'Agency', price: '$99', tag: 'Teams & studios', features: ['1,000 clips / month', '4-hour videos', 'Highest priority', 'Priority support'] },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-950 bg-hero-radial">
      {/* Header */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-glow">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <p className="font-display text-lg font-bold text-white">
            ClipGenius <span className="gradient-text">AI</span>
          </p>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-gray-400 md:flex">
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#how" className="transition hover:text-white">How it works</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-gray-300 transition hover:text-white">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary py-2 text-xs">
            Get started free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-4 py-1.5 text-xs font-semibold text-brand-200">
          <Sparkles className="h-3.5 w-3.5" />
          AI-powered video clipping for TikTok, Shorts & Reels
        </div>
        <h1 className="mx-auto max-w-4xl font-display text-5xl font-bold leading-[1.08] text-white md:text-7xl">
          Turn long videos into{' '}
          <span className="gradient-text">viral clips</span> in minutes
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
          ClipGenius AI watches your videos the way an editor would — finding the hooks, cutting the
          silences, reframing for vertical and captioning every word. You just hit export.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link href="/signup" className="btn-primary px-8 py-4 text-base">
            Start clipping for free <ArrowRight className="h-5 w-5" />
          </Link>
          <a href="#how" className="btn-secondary px-8 py-4 text-base">
            <Play className="h-4 w-4" /> See how it works
          </a>
        </div>

        {/* Phone mockups */}
        <div className="relative mx-auto mt-16 flex max-w-3xl items-end justify-center gap-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`relative aspect-[9/16] w-44 overflow-hidden rounded-[28px] border border-white/10 shadow-card md:w-52 ${
                i === 1 ? '-mb-4 scale-105 shadow-glow' : 'opacity-80'
              }`}
              style={{
                background: `linear-gradient(${160 + i * 30}deg, rgba(124,58,237,${0.35 - i * 0.06}), rgba(59,130,246,${0.25 - i * 0.05})), #14142a`,
              }}
            >
              <div className="absolute inset-x-4 top-6 h-28 rounded-2xl bg-white/[0.07]" />
              <div className="absolute inset-x-4 bottom-24 space-y-2">
                <div className="h-2.5 w-3/4 rounded-full bg-white/25" />
                <div className="h-2.5 w-1/2 rounded-full bg-white/15" />
              </div>
              <div className="absolute inset-x-6 bottom-8 rounded-xl bg-white/95 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-ink-900">
                {['This changed everything', 'Nobody talks about this', 'The #1 mistake'][i]}
              </div>
              {i === 1 && (
                <div className="absolute right-3 top-3 rounded-full bg-danger px-2.5 py-1 text-[9px] font-bold text-white">
                  ● REC
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Stats bar */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="card grid grid-cols-2 gap-6 p-8 md:grid-cols-4">
          {[
            ['10×', 'faster editing'],
            ['9:16', 'auto-reframed'],
            ['4K', 'source support'],
            ['24/7', 'render workers'],
          ].map(([stat, label]) => (
            <div key={label} className="text-center">
              <p className="font-display text-3xl font-bold text-white">{stat}</p>
              <p className="mt-1 text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-brand-300">Features</p>
          <h2 className="mt-3 font-display text-4xl font-bold text-white md:text-5xl">
            Everything you need to go viral
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            A complete AI editing pipeline — from raw footage to scroll-stopping shorts.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover p-7">
              <div className="mb-5 inline-flex rounded-2xl bg-brand-gradient-soft p-3.5">
                <f.icon className="h-6 w-6 text-brand-300" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">{f.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-gray-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-white/[0.06] bg-ink-900/40 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-brand-300">How it works</p>
            <h2 className="mt-3 font-display text-4xl font-bold text-white md:text-5xl">
              Three steps. Zero timeline stress.
            </h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative card p-8">
                <p className="font-display text-5xl font-bold text-white/10">{s.n}</p>
                <h3 className="mt-4 font-display text-xl font-bold text-white">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-gray-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-brand-300">Pricing</p>
          <h2 className="mt-3 font-display text-4xl font-bold text-white md:text-5xl">
            Simple plans that scale with you
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PRICING.map((p) => (
            <div
              key={p.name}
              className={`card relative flex flex-col p-7 ${p.featured ? 'border-brand-400/50 shadow-glow' : ''}`}
            >
              {p.featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-gradient px-4 py-1 text-[11px] font-bold text-white">
                  {p.tag}
                </div>
              )}
              <h3 className="font-display text-lg font-bold text-white">{p.name}</h3>
              <p className="mt-3">
                <span className="font-display text-4xl font-bold text-white">{p.price}</span>
                <span className="text-sm text-gray-500"> /month</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-8 w-full ${p.featured ? 'btn-primary' : 'btn-secondary'}`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="card relative overflow-hidden bg-brand-gradient-soft p-12 text-center md:p-16">
          <div className="absolute inset-0 bg-hero-radial opacity-60" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold text-white md:text-5xl">
              Your next viral clip is already in your footage
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-gray-300">
              Upload a video and let ClipGenius AI do the heavy editing. Free plan available — no credit card required.
            </p>
            <Link href="/signup" className="btn-primary mt-8 inline-flex px-9 py-4 text-base">
              Create your first clips <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-gray-500 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <p>© {new Date().getFullYear()} ClipGenius AI. All rights reserved.</p>
          </div>
          <p className="flex items-center gap-1.5">
            <Video className="h-4 w-4 text-gray-600" /> Built for creators who ship daily
          </p>
        </div>
      </footer>
    </div>
  );
}
