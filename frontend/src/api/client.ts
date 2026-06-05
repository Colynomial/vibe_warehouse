const BASE_URL = 'http://localhost:8000'

interface RequestOptions {
  token?: string | null
  tenantSlug?: string | null
}

async function request(method: string, path: string, body?: unknown, options?: RequestOptions) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`
  }
  if (options?.tenantSlug) {
    headers['X-Tenant-Slug'] = options.tenantSlug
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || error.non_field_errors?.[0] || 'Request failed')
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path: string, token?: string | null, tenantSlug?: string | null) =>
    request('GET', path, undefined, { token, tenantSlug }),
  post: (path: string, body: unknown, token?: string | null, tenantSlug?: string | null) =>
    request('POST', path, body, { token, tenantSlug }),
  patch: (path: string, body: unknown, token?: string | null, tenantSlug?: string | null) =>
    request('PATCH', path, body, { token, tenantSlug }),
  delete: (path: string, token?: string | null, tenantSlug?: string | null) =>
    request('DELETE', path, undefined, { token, tenantSlug }),
}
