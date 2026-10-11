import { getApiBaseUrl } from '../config';

/** Normalized API error with status + machine-readable code. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Turns an incident ID into an authenticated photo endpoint URL.
 */
export function photoUrl(incidentId) {
  if (!incidentId) return null;
  const tokenParam = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
  return `${getApiBaseUrl()}/api/incidents/${incidentId}/photo${tokenParam}`;
}

let authToken = null;
let refreshTokenValue = null;
let onUnauthorized = null;

export const setAuthToken = (token) => {
  authToken = token;
};
export const getAuthToken = () => authToken;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};
export const setRefreshToken = (token) => {
  refreshTokenValue = token;
};
export const getRefreshToken = () => refreshTokenValue;

/**
 * Silent session renewal. Exchanges the stored refresh token for a fresh
 * access/refresh pair. Uses raw fetch (NOT api()) to avoid recursion.
 * Concurrent callers share one in-flight refresh promise.
 * Returns null when the refresh token is missing/expired/revoked.
 */
let refreshInFlight = null;
async function refreshSession() {
  if (!refreshTokenValue) return null;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refreshTokenValue }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json || !json.success || !json.data) return null;
        authToken = json.data.accessToken;
        refreshTokenValue = json.data.refreshToken;
        // Let AuthContext persist the rotated pair.
        onTokensRefreshed && onTokensRefreshed(json.data);
        return json.data.accessToken;
      } catch (e) {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

let onTokensRefreshed = null;
export const setTokensRefreshedHandler = (fn) => {
  onTokensRefreshed = fn;
};

/**
 * Thin fetch wrapper.
 * - injects the JWT from SecureStore-backed state
 * - unwraps the { success, data } envelope
 * - on TOKEN_EXPIRED: silently refreshes the session and retries ONCE
 * - converts failures into ApiError with friendly messages
 * - 15s timeout so the UI never hangs forever on a dead server
 */
export async function api(path, { method = 'GET', body, timeoutMs = 15000, _isRetry = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the SecureByte server. Check that the backend is running and your phone is on the same Wi-Fi network.'
    );
  }

  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // non-JSON response — fall through to error handling
  }
  clearTimeout(timer);

  if (!res.ok) {
    const err = (json && json.error) || {};

    // Expired session → try a silent refresh, then replay the request once.
    // Never attempt this for the auth endpoints themselves.
    if (
      res.status === 401 &&
      err.code === 'TOKEN_EXPIRED' &&
      !_isRetry &&
      refreshTokenValue &&
      !path.startsWith('/api/auth/login') &&
      !path.startsWith('/api/auth/refresh')
    ) {
      const newAccess = await refreshSession();
      if (newAccess) {
        return api(path, { method, body, timeoutMs, _isRetry: true });
      }
    }

    if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, err.code || 'ERROR', err.message || `Request failed (${res.status}).`, err.details);
  }

  return json ? json.data : null;
}

/**
 * Multipart file upload (photo evidence). file: { uri, name, type }.
 * Shares the same auth injection + error handling as api().
 */
export async function apiUpload(path, file, { timeoutMs = 30000 } = {}) {
  const form = new FormData();
  form.append('photo', file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        // NOTE: no explicit Content-Type — RN sets the multipart boundary.
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new ApiError(0, 'NETWORK_ERROR', 'Upload failed — cannot reach the SecureByte server.');
  }
  clearTimeout(timer);

  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // ignore non-JSON
  }

  if (!res.ok) {
    const err = (json && json.error) || {};
    throw new ApiError(res.status, err.code || 'ERROR', err.message || `Upload failed (${res.status}).`, err.details);
  }
  return json ? json.data : null;
}
