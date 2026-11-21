import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07070d',
          900: '#0b0b14',
          850: '#0f0f1b',
          800: '#14142a',
          700: '#1c1c33',
          600: '#262641',
        },
        brand: {
          50: '#f1edff',
          100: '#e4dcff',
          200: '#cbb9ff',
          300: '#ac8dff',
          400: '#8b5cf6',
          500: '#7c3aed',
          600: '#6d28d9',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#3b1580',
        },
        accent: {
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
        },
        success: { DEFAULT: '#34d399', dim: '#064e3b' },
        warning: { DEFAULT: '#fbbf24', dim: '#78350f' },
        danger: { DEFAULT: '#f87171', dim: '#7f1d1d' },
      },
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
  },
      boxShadow: {
        glow: '0 0 24px rgba(124, 58, 237, 0.35)',
        'glow-blue': '0 0 24px rgba(59, 130, 246, 0.3)',
        card: '0 8px 30px rgba(2, 2, 12, 0.6)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(59,130,246,0.12))',
        'hero-radial':
          'radial-gradient(1200px 600px at 20% -10%, rgba(124,58,237,0.25), transparent 60%), radial-gradient(900px 500px at 90% 10%, rgba(59,130,246,0.18), transparent 55%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulse_soft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
        'pulse-soft': 'pulse_soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
