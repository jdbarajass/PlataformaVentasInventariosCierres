import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Racing color palette
        racing: {
          red:    '#E10600',
          amber:  '#FF6B00',
          dark:   '#0F1115',
          card:   '#171A21',
          muted:  '#1F232B',
          border: '#2A2F3A',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        racing: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        motorsport: '0.08em',
        wide2: '0.12em',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'glow-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(225,6,0,0.4), 0 0 40px rgba(225,6,0,0.15)'
          },
          '50%': {
            boxShadow: '0 0 30px rgba(225,6,0,0.6), 0 0 60px rgba(225,6,0,0.25)'
          },
        },
        'slide-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'shimmer': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(20px)', opacity: '0' },
          to:   { transform: 'translateX(0)', opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.95)', opacity: '0' },
          to:   { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'accordion-down':   'accordion-down 0.2s ease-out',
        'accordion-up':     'accordion-up 0.2s ease-out',
        'glow-pulse':       'glow-pulse 2s ease-in-out infinite',
        'slide-up':         'slide-up 0.3s ease-out',
        'fade-in':          'fade-in 0.25s ease-out',
        'shimmer':          'shimmer 1.5s ease-in-out infinite',
        'float':            'float 3s ease-in-out infinite',
        'slide-in-right':   'slide-in-right 0.3s ease-out',
        'scale-in':         'scale-in 0.2s ease-out',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':  'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'racing-glow':     'linear-gradient(135deg, rgba(225,6,0,0.12) 0%, rgba(255,107,0,0.06) 100%)',
        'hero-dark':       'linear-gradient(to bottom right, #0F1115 0%, #171A21 60%, rgba(225,6,0,0.08) 100%)',
      },
      boxShadow: {
        'glow-red':    '0 0 20px rgba(225,6,0,0.35), 0 0 40px rgba(225,6,0,0.15)',
        'glow-red-sm': '0 0 12px rgba(225,6,0,0.35)',
        'card-dark':   '0 8px 32px rgba(0,0,0,0.4)',
        'card-hover':  '0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(225,6,0,0.12)',
        'deep':        '0 25px 50px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
