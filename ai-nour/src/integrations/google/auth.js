import { IntegrationError } from '../errors.js';

export function createGoogleAuth({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new IntegrationError('GOOGLE_NOT_CONFIGURED', 'Google OAuth credentials are incomplete');
  }
  let cache = null;

  async function refresh(force = false) {
    if (!force && cache && cache.expiresAt > Date.now() + 60_000) return cache;
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok || !json.access_token) {
      throw new IntegrationError('GOOGLE_TOKEN_REFRESH_FAILED', `Google token refresh failed with HTTP ${response.status}`, {
        status: response.status,
        details: { error: json.error || null }
      });
    }
    cache = {
      accessToken: json.access_token,
      expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
      scopes: String(json.scope || '').split(' ').filter(Boolean)
    };
    return cache;
  }

  async function request(url, options = {}, retry = true) {
    const token = await refresh();
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        ...(options.headers || {})
      }
    });
    if (response.status === 401 && retry) {
      await refresh(true);
      return request(url, options, false);
    }
    return response;
  }

  async function json(url, options = {}) {
    const response = await request(url, options);
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) {
      throw new IntegrationError('GOOGLE_API_ERROR', `Google API request failed with HTTP ${response.status}`, {
        status: response.status,
        details: { error: body.error?.status || body.error?.message || null }
      });
    }
    return body;
  }

  async function tokenInfo() {
    const token = await refresh();
    return {
      ok: true,
      expiresAt: token.expiresAt,
      scopes: token.scopes
    };
  }

  function clearCache() {
    cache = null;
  }

  return { refresh, request, json, tokenInfo, clearCache };
}
