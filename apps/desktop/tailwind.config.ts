import animate from 'tailwindcss-animate'
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: 'hsl(var(--surface))',
        'surface-elevated': 'hsl(var(--surface-elevated))',
        border: {
          DEFAULT: 'hsl(var(--border))',
          strong: 'hsl(var(--border-strong))',
        },
        text: {
          primary: 'hsl(var(--text-primary))',
          secondary: 'hsl(var(--text-secondary))',
          muted: 'hsl(var(--text-muted))',
        },
        'accent-a': 'hsl(var(--accent-a))',
        'accent-b': 'hsl(var(--accent-b))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        info: 'hsl(var(--info))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        DEFAULT: '12px',
        sm: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        badge: '6px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.28), 0 1px 3px rgba(0,0,0,0.22)',
        md: '0 4px 8px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.22)',
        lg: '0 12px 24px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.28)',
        xl: '0 24px 48px rgba(0,0,0,0.5), 0 8px 16px rgba(0,0,0,0.34)',
        glass: 'var(--glass-shadow)',
        focus: '0 0 0 2px hsl(var(--info) / 0.35)',
        'glow-cyan': '0 0 20px hsl(var(--info) / 0.35)',
        'glow-green': '0 0 20px hsl(var(--accent-a) / 0.35)',
        'glow-rose': '0 0 20px hsl(var(--danger) / 0.35)',
        'glow-amber': '0 0 20px hsl(var(--warning) / 0.35)',
        'btn-primary': 'var(--btn-primary-shadow)',
        'btn-secondary': 'var(--btn-secondary-shadow)',
        'btn-destructive': 'var(--btn-destructive-shadow)',
      },
      fontSize: {
        'display-xl': ['56px', { lineHeight: '64px', letterSpacing: '-0.02em' }],
        'display-lg': ['40px', { lineHeight: '48px', letterSpacing: '-0.02em' }],
        display: ['32px', { lineHeight: '40px', letterSpacing: '-0.01em' }],
        h1: ['24px', { lineHeight: '32px', letterSpacing: '-0.01em' }],
        h2: ['20px', { lineHeight: '28px' }],
        h3: ['17px', { lineHeight: '24px' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        body: ['14px', { lineHeight: '20px' }],
        'body-sm': ['13px', { lineHeight: '18px' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        micro: ['11px', { lineHeight: '14px', letterSpacing: '0.03em' }],
      },
      animation: {
        shimmer: 'shimmer 4s linear infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'dot-pulse': 'dot-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.50' },
          '50%': { opacity: '1.00' },
        },
        'dot-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(0.85)' },
        },
      },
    },
  },
  plugins: [animate],
}

export default config
