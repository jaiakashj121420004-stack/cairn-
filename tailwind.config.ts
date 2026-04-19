import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  // Dark mode via data-theme attribute — applied by the no-flicker script in index.html
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // @fontsource-variable/inter ships as "Inter Variable"
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        // @fontsource-variable/jetbrains-mono ships as "JetBrains Mono Variable"
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Semantic tokens — values come from CSS vars in globals.css
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
        // shadcn/ui compatibility layer
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
        // Design system: 10px compact, 14px default, 20px hero, 6px badge
        DEFAULT: '14px',
        sm: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '24px',
        badge: '6px',
        full: '9999px',
      },
      boxShadow: {
        // §4.5 — used in light mode; dark mode uses border + color steps
        sm: '0 1px 2px rgba(15,20,25,0.04), 0 1px 3px rgba(15,20,25,0.06)',
        md: '0 4px 8px rgba(15,20,25,0.04), 0 2px 4px rgba(15,20,25,0.06)',
        lg: '0 12px 24px rgba(15,20,25,0.08), 0 4px 8px rgba(15,20,25,0.06)',
        xl: '0 24px 48px rgba(15,20,25,0.12), 0 8px 16px rgba(15,20,25,0.08)',
        // Focus ring with accent-a
        focus: '0 0 0 2px hsl(var(--accent-a) / 0.12)',
      },
      fontSize: {
        // §4.3 typography scale
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
    },
  },
  plugins: [animate],
}

export default config
