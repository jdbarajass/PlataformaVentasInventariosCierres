export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

/**
 * Thin fetch wrapper: parses JSON and throws ApiError on non-2xx so callers
 * can use try/catch instead of checking `response.ok` by hand everywhere.
 */
export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ApiError(data.error || `Error en la solicitud (${response.status})`, response.status, data.details)
  }

  return data as T
}
