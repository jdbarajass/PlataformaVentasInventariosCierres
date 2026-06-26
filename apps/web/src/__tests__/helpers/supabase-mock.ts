import { vi } from 'vitest'

type QueryResponse = { data: any; error: any }

/**
 * Builds a fake Supabase client for route-level integration tests.
 *
 * It doesn't model real Postgres filtering — `.eq()`/`.in()`/etc. are
 * recorded but don't affect the result. Each table gets one canned
 * response that's returned regardless of how many filters are chained,
 * which is enough to test application logic (does the route branch
 * correctly on success/error, does it recompute values from the data it
 * gets back) without re-implementing Postgres.
 *
 * `calls` records every method invocation per table/rpc so tests can
 * assert on what the route actually sent to the DB (e.g. the recomputed
 * order total, not whatever the client tried to send).
 */
export function createSupabaseMock(
  tableResponses: Record<string, QueryResponse> = {},
  rpcResponses: Record<string, QueryResponse> = {}
) {
  const calls: Record<string, any[][]> = {}

  function record(key: string, args: any[]) {
    if (!calls[key]) calls[key] = []
    calls[key].push(args)
  }

  function makeChain(table: string) {
    const response = tableResponses[table] ?? { data: null, error: null }
    const chain: any = {}
    const passthrough = (method: string) => (...args: any[]) => {
      record(`${table}.${method}`, args)
      return chain
    }
    chain.select = passthrough('select')
    chain.insert = passthrough('insert')
    chain.update = passthrough('update')
    chain.delete = passthrough('delete')
    chain.eq = passthrough('eq')
    chain.in = passthrough('in')
    chain.order = passthrough('order')
    chain.gte = passthrough('gte')
    chain.lte = passthrough('lte')
    chain.single = vi.fn(() => {
      record(`${table}.single`, [])
      return Promise.resolve(response)
    })
    // Allows `await serviceSupabase.from(x).insert(y)` without `.single()`
    chain.then = (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject)
    return chain
  }

  const client = {
    from: vi.fn((table: string) => makeChain(table)),
    rpc: vi.fn((fn: string, args: any) => {
      record(`rpc.${fn}`, [args])
      const response = rpcResponses[fn] ?? { data: null, error: null }
      return Promise.resolve(response)
    }),
  }

  return { client, calls }
}
