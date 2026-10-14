/**
 * Low-level HTTP helpers shared by all API modules.
 *
 * Responsibilities:
 *  - Build the API base URL (env override, otherwise same-origin / dev server port).
 *  - Attach the auth token to every request.
 *  - Apply sensible timeout defaults.
 *  - Normalize error responses into a typed `ApiError`.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof __SERVER_PORT__ !== 'undefined'
    ? `http://localhost:${__SERVER_PORT__}/api`
    : '/api');

const TOKEN_STORAGE_KEY = 'auth_token';

export interface ApiError extends Error {
  status?: number;
  details?: unknown;
  data?: unknown;
}

function createApiError(message: string, extra: Partial<ApiError> = {}): ApiError {
  const error = new Error(message) as ApiError;
  Object.assign(error, extra);
  return error;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

const REFRESH_TOKEN_STORAGE_KEY = 'auth_refresh_token';

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function setTokens(token: string, refreshToken?: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

// Single-flight refresh: concurrent 401s share one refresh request.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      clearTokens();
      return null;
    }
    const data = await response.json();
    setTokens(data.token, data.refreshToken);
    return data.token as string;
  } catch {
    return null;
  }
}

export async function fetchAPI<T = any>(
  endpoint: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const doFetch = (overrideToken?: string) => {
    const token = overrideToken ?? getAuthToken();
    return fetch(`${API_BASE_URL}${endpoint}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  const { timeoutMs = 10_000, headers, ...rest } = options;
  let response = await doFetch();

  // Expired access token → refresh once (single-flight) and retry.
  if (response.status === 401 && getRefreshToken() && !endpoint.startsWith('/auth/')) {
    refreshPromise =
      refreshPromise ??
      (refreshAccessToken().finally(() => {
        refreshPromise = null;
      }));
    const newToken = await refreshPromise;
    if (newToken) response = await doFetch(newToken);
  }

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = {};
    }
    throw createApiError(
      errorData.error || errorData.message || `HTTP error! status: ${response.status}`,
      { status: response.status, details: errorData.details, data: errorData },
    );
  }

  return response.json();
}

/** Convenience wrapper for JSON POST/PUT requests. */
export function postJSON<T = any>(
  endpoint: string,
  body: unknown,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
): Promise<T> {
  return fetchAPI<T>(endpoint, { method, body: JSON.stringify(body) });
}

/** Build `/path?query` from a filter object, skipping empty values. */
export function withQuery(path: string, params: Record<string, unknown> = {}): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, String(value));
    }
  });
  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}
