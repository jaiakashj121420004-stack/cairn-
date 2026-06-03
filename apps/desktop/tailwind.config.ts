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
        DEFAULT: '14px',
        sm: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '24px',
        badge: '6px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,20,25,0.04), 0 1px 3px rgba(15,20,25,0.06)',
        md: '0 4px 8px rgba(15,20,25,0.04), 0 2px 4px rgba(15,20,25,0.06)',
        lg: '0 12px 24px rgba(15,20,25,0.08), 0 4px 8px rgba(15,20,25,0.06)',
        xl: '0 24px 48px rgba(15,20,25,0.12), 0 8px 16px rgba(15,20,25,0.08)',
        glass: 'var(--glass-shadow)',
        focus: '0 0 0 2px hsl(var(--accent-a) / 0.14)',
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
