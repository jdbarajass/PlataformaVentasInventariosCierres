import { NextRequest, NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store (resets on server restart — suitable for serverless with reasonable window)
const store = new Map<string, RateLimitEntry>()

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetTime) {
      store.delete(key)
    }
  }
}, 60_000) // Clean every minute

interface RateLimitOptions {
  /** Max requests per window */
  limit: number
  /** Window in seconds */
  windowSeconds: number
}

/**
 * Simple rate limiter for API routes
 *
 * Usage:
 * ```ts
 * const rateLimitResult = checkRateLimit(request, { limit: 10, windowSeconds: 60 })
 * if (rateLimitResult) return rateLimitResult
 * ```
 */
export function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions
): NextResponse | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'

  const key = `${ip}:${request.nextUrl.pathname}`
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetTime) {
    store.set(key, {
      count: 1,
      resetTime: now + options.windowSeconds * 1000,
    })
    return null
  }

  entry.count++

  if (entry.count > options.limit) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo mas tarde.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(options.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
        },
      }
    )
  }

  return null
}
