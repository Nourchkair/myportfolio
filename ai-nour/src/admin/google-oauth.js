const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export function createPkcePair() {
  const verifier = randomToken(48);
  const challenge = base64url(new Uint8Array(0));
  return crypto.subtle.digest('SHA-256', encoder.encode(verifier)).then((digest) => ({
    verifier,
    challenge: base64url(new Uint8Array(digest))
  }));
}

export function buildAuthUrl({ clientId, redirectUri, state, challenge, scopes = ['openid', 'email', 'profile'] }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeCode({ clientId, clientSecret, code, redirectUri, verifier, fetchImpl = fetch }) {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const json = await response.json();
  if (!response.ok || !json.access_token) throw new Error(`Google OAuth exchange failed with HTTP ${response.status}`);
  return json;
}

export async function fetchUserInfo({ accessToken, fetchImpl = fetch }) {
  const response = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const json = await response.json();
  if (!response.ok || !json.email) throw new Error(`Google userinfo failed with HTTP ${response.status}`);
  return { email: String(json.email).toLowerCase(), name: json.name || '', emailVerified: Boolean(json.email_verified) };
}

export async function signSession({ email, expiresAt, secret }) {
  if (!secret) throw new Error('Admin session secret is required');
  const payload = base64url(encoder.encode(JSON.stringify({ email: String(email).toLowerCase(), expiresAt })));
  const signature = base64url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifySession(token, secret) {
  if (!token || !secret) return null;
  const [payload, signature] = String(token).split('.');
  if (!payload || !signature) return null;
  const expected = base64url(await hmac(secret, payload));
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(decoder.decode(fromBase64url(payload)));
    if (!data.email || data.expiresAt < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildSessionCookie(token, { maxAgeSeconds = 8 * 3600 } = {}) {
  return `ainour_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

export { randomToken };
