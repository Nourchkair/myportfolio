import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAuthUrl,
  buildSessionCookie,
  clearSessionCookie,
  createPkcePair,
  exchangeCode,
  fetchUserInfo,
  parseCookies,
  signSession,
  verifySession
} from '../src/admin/google-oauth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.resolve(here, '../admin');
const port = Number(process.env.ADMIN_PORT || 8791);
const workerUrl = new URL(process.env.PHASE1_WORKER_URL || 'http://127.0.0.1:8789');

function loadEnv() {
  const envPath = path.resolve(here, '../.dev.vars');
  const text = fs.readFileSync(envPath, 'utf8');
  return Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

const env = loadEnv();
const adminToken = env.ADMIN_TOKEN;
if (!adminToken) throw new Error('ADMIN_TOKEN is required');
const googleAuth = env.ADMIN_GOOGLE_AUTH === 'true';
const adminEmail = String(env.ADMIN_EMAIL || '').toLowerCase();
const sessionSecret = env.PHASE1_ADMIN_SESSION_SECRET || '';
const redirectUri = env.ADMIN_GOOGLE_REDIRECT_URI || `http://127.0.0.1:${port}/auth/google/callback`;
const sessionTtlMs = Math.max(1, Number(env.ADMIN_SESSION_HOURS || 8)) * 3_600_000;
const secureCookies = String(env.ADMIN_COOKIE_SECURE || '').toLowerCase() === 'true';
const pending = new Map();
const revokedSessions = new Set();
let sessionEpoch = Number(env.ADMIN_SESSION_EPOCH || 0) || 0;

if (googleAuth && (!adminEmail || !sessionSecret || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)) {
  throw new Error('ADMIN_GOOGLE_AUTH requires ADMIN_EMAIL, PHASE1_ADMIN_SESSION_SECRET, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET');
}

function securityHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ...extra
  };
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { ...securityHeaders(), 'content-type': contentType, ...extra });
  res.end(body);
}

function safeFile(name) {
  if (!['index.html', 'admin.js', 'styles.css', 'favicon.svg'].includes(name)) return null;
  const file = path.join(adminDir, name);
  return fs.existsSync(file) ? file : null;
}

function requestOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

async function sessionFromRequest(req) {
  if (!googleAuth) return { mode: 'local-token', email: null, expiresAt: null };
  const cookies = parseCookies(req.headers.cookie || '');
  const session = await verifySession(cookies.ainour_admin, sessionSecret);
  if (!session || session.email !== adminEmail) return null;
  if (session.epoch !== sessionEpoch || revokedSessions.has(session.sid)) return null;
  return session;
}

async function requireSession(req, res) {
  const session = await sessionFromRequest(req);
  if (session) return session;
  if (req.url.startsWith('/api/')) {
    send(res, 401, JSON.stringify({ error: 'admin_login_required' }), 'application/json');
  } else {
    send(res, 302, '', 'text/plain', { Location: '/auth/google/start' });
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (url.pathname === '/auth/session') {
    const session = await sessionFromRequest(req);
    if (!session) return send(res, 401, JSON.stringify({ authenticated: false }), 'application/json');
    return send(res, 200, JSON.stringify({
      authenticated: true,
      mode: session.mode || 'google',
      email: session.email || null,
      expiresAt: session.expiresAt || null,
      issuedAt: session.issuedAt || null
    }), 'application/json');
  }

  if (url.pathname === '/auth/logout') {
    if (req.method !== 'POST') return send(res, 405, 'Method not allowed', 'text/plain', { Allow: 'POST' });
    if (!requestOriginAllowed(req)) return send(res, 403, 'Origin not allowed');
    const session = await sessionFromRequest(req);
    if (session?.sid) revokedSessions.add(session.sid);
    return send(res, 204, '', 'text/plain', { 'Set-Cookie': clearSessionCookie({ secure: secureCookies }) });
  }

  if (url.pathname === '/auth/revoke-all') {
    if (req.method !== 'POST') return send(res, 405, 'Method not allowed', 'text/plain', { Allow: 'POST' });
    if (!requestOriginAllowed(req)) return send(res, 403, 'Origin not allowed');
    if (!(await requireSession(req, res))) return;
    sessionEpoch += 1;
    return send(res, 200, JSON.stringify({ ok: true, epoch: sessionEpoch }), 'application/json', {
      'Set-Cookie': clearSessionCookie({ secure: secureCookies })
    });
  }

  if (url.pathname === '/auth/google/start') {
    if (!googleAuth) return send(res, 404, 'Google admin auth is disabled');
    const { verifier, challenge } = await createPkcePair();
    const state = cryptoRandom();
    pending.set(state, { verifier, expiresAt: Date.now() + 10 * 60_000 });
    const authUrl = buildAuthUrl({
      clientId: env.GOOGLE_CLIENT_ID,
      redirectUri,
      state,
      challenge,
      prompt: url.searchParams.get('reauth') === '1' ? 'login' : 'select_account',
      scopes: ['openid', 'email', 'profile']
    });
    return send(res, 302, '', 'text/plain', { Location: authUrl });
  }

  if (url.pathname === '/auth/google/callback') {
    if (!googleAuth) return send(res, 404, 'Google admin auth is disabled');
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const item = pending.get(state);
    pending.delete(state);
    if (!item || item.expiresAt < Date.now() || !code) return send(res, 400, 'Invalid or expired OAuth state');
    try {
      const tokens = await exchangeCode({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        code,
        redirectUri,
        verifier: item.verifier
      });
      const user = await fetchUserInfo({ accessToken: tokens.access_token });
      if (!user.emailVerified || user.email !== adminEmail) {
        return send(res, 403, 'This Google account is not the authorized administrator');
      }
      const now = Date.now();
      const token = await signSession({
        email: user.email,
        expiresAt: now + sessionTtlMs,
        issuedAt: now,
        epoch: sessionEpoch,
        secret: sessionSecret
      });
      return send(res, 302, '', 'text/plain', {
        Location: '/',
        'Set-Cookie': buildSessionCookie(token, { maxAgeSeconds: Math.floor(sessionTtlMs / 1000), secure: secureCookies })
      });
    } catch (error) {
      console.error('admin_oauth_error', String(error?.message || error).slice(0, 200));
      return send(res, 502, 'Google authentication failed');
    }
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (!(await requireSession(req, res))) return;
    if (!['GET', 'HEAD', 'POST', 'PATCH'].includes(req.method)) return send(res, 405, 'Method not allowed');
    if (req.method !== 'GET' && req.method !== 'HEAD' && !requestOriginAllowed(req)) return send(res, 403, 'Origin not allowed');
    try {
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      const target = new URL(url.pathname + url.search, workerUrl);
      const response = await fetch(target, {
        method: req.method,
        headers: {
          authorization: `Bearer ${adminToken}`,
          ...(body ? { 'content-type': req.headers['content-type'] || 'application/json' } : {})
        },
        body
      });
      const payload = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, securityHeaders({
        'content-type': response.headers.get('content-type') || 'application/json'
      }));
      res.end(payload);
    } catch (error) {
      send(res, 502, JSON.stringify({ error: 'worker_unreachable', detail: String(error?.message || error).slice(0, 200) }), 'application/json');
    }
    return;
  }

  if (!(await requireSession(req, res))) return;
  const file = safeFile(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (!file) return send(res, 404, 'Not found');
  const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
  return send(res, 200, fs.readFileSync(file), type);
});

function cryptoRandom() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [state, item] of pending) if (item.expiresAt < now) pending.delete(state);
}, 60_000).unref();

server.listen(port, '127.0.0.1', () => {
  console.log(`AI Nour local admin: http://127.0.0.1:${port}`);
  console.log(`Worker: ${workerUrl.origin}`);
  console.log(`Admin Google OAuth: ${googleAuth ? 'enabled' : 'disabled (local-only token proxy)'}`);
});
