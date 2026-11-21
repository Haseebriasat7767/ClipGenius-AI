import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClipGenius AI — Turn long videos into viral clips',
  description:
    'ClipGenius AI analyzes your videos and automatically generates engaging short clips for TikTok, YouTube Shorts and Instagram Reels — with face-tracked vertical crops, animated captions and smart editing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
