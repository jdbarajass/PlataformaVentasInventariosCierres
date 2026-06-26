import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'src/__tests__/**',
        'src/types/**',
        'src/emails/**',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
      ],
      thresholds: {
        // Global floor: most of the app (pages, admin UI) has no tests yet.
        // This is a tripwire against wholesale test deletion, not a real
        // quality bar — raise it incrementally as coverage grows.
        statements: 0.5,
        branches: 0.3,
        functions: 0.5,
        lines: 0.5,
        // Payment-critical path: order creation, both payment webhooks, and
        // the stock/idempotency helpers they rely on. These already have
        // integration tests (see src/__tests__/api/orders.test.ts and
        // payment-webhooks.test.ts) — this threshold is a regression guard
        // so that path can't silently lose coverage again.
        'src/app/api/orders/route.ts': { statements: 40, branches: 30, functions: 40, lines: 40 },
        'src/app/api/payments/webhook/route.ts': { statements: 40, branches: 30, functions: 40, lines: 40 },
        'src/app/api/payments/mercadopago/webhook/route.ts': { statements: 40, branches: 30, functions: 40, lines: 40 },
        'src/lib/webhook-idempotency.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'src/lib/inventory.ts': { statements: 90, branches: 70, functions: 90, lines: 90 },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
