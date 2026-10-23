export async function request(path, options = {}) {
  const method = String(options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers ?? {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (methodAllowsCsrf(method)) {
    const existingToken = readCsrfToken();
    if (existingToken) {
      headers.set('x-csrf-token', existingToken);
    } else {
      await ensureCsrfToken();
      const refreshedToken = readCsrfToken();
      if (refreshedToken) {
        headers.set('x-csrf-token', refreshedToken);
      }
    }
  }

  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get('content-type') ?? '';
  const body = response.status === 204 || !contentType.includes('application/json')
    ? null
    : await response.json();
  if (!response.ok) {
    const error = new Error(body?.error ?? `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function readCsrfToken() {
  const csrfCookie = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('blackjack_csrf='));
  return csrfCookie ? decodeURIComponent(csrfCookie.slice('blackjack_csrf='.length)) : null;
}

async function ensureCsrfToken() {
  const response = await fetch('/api/csrf-token', { method: 'GET', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Could not initialize a secure session token.');
  }
}

function methodAllowsCsrf(method = 'GET') {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}
