'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

export function ThemeToggle() {
  const [theme, setTheme]   = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('theme') as Theme | null
    setTheme(stored || 'light')
  }, [])

  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
    localStorage.setItem('theme', theme)
  }, [theme, mounted])

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  /* SSR placeholder — same dimensions to avoid layout shift */
  if (!mounted) {
    return (
      <div
        aria-hidden
        className="h-8 w-[3.75rem] rounded-full bg-secondary/50 border border-border/40"
      />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className="relative h-8 w-[3.75rem] rounded-full border border-border/50 bg-secondary/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 shrink-0"
    >
      {/* ── Track icons (always visible, faint) ── */}
      <Sun  className="absolute left-[7px]  top-1/2 -translate-y-1/2 h-3 w-3 text-amber-400/50 pointer-events-none transition-opacity duration-300" />
      <Moon className="absolute right-[7px] top-1/2 -translate-y-1/2 h-3 w-3 text-primary/50  pointer-events-none transition-opacity duration-300" />

      {/* ── Sliding pill ── */}
      <span
        style={{ transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' }}
        className={[
          'absolute top-0.5 flex h-7 w-7 items-center justify-center rounded-full',
          'transition-all duration-300',
          isDark
            ? 'left-[calc(100%-1.875rem)] bg-[#171A21] border border-primary/50 shadow-glow-red-sm'
            : 'left-0.5 bg-white border border-border/60 shadow-[0_2px_8px_rgba(0,0,0,0.15)]',
        ].join(' ')}
      >
        {isDark
          ? <Moon className="h-3.5 w-3.5 text-primary" />
          : <Sun  className="h-3.5 w-3.5 text-amber-500" />
        }
      </span>
    </button>
  )
}
