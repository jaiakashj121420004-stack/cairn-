import type { Config } from 'tailwindcss'

/**
 * Web Tailwind config. Scans both the web-local screens AND the reused desktop features
 * so their utility classes are emitted (CLAUDE.md §3.1c — same UI, different transport).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../desktop/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: '#0b0e14',
        surface: 'rgba(255,255,255,0.04)',
        border: 'rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
