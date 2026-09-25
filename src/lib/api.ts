import type { ApiErrorBody } from '../../shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error;
    if (body.details) this.details = body.details;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  csrfToken?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (csrfToken && options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
    headers.set('x-csrf-token', csrfToken);
  }

  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('trenyrovka:auth-expired'));
    }
    let body: ApiErrorBody;
    try {
      body = await response.json() as ApiErrorBody;
    } catch {
      body = { error: 'network_error', message: `Ошибка сервера (${response.status})` };
    }
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}
