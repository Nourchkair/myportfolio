import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual, requireAdmin, requirePrototypeKey, ownerTokenFrom } from '../src/auth/secure.js';
import {
  buildAuthUrl as buildAdminAuthUrl,
  buildSessionCookie as buildAdminCookie,
  clearSessionCookie,
  createPkcePair as createAdminPkce,
  exchangeCode as exchangeAdminCode,
  fetchUserInfo as fetchAdminUser,
  parseCookies as parseAdminCookies,
  signSession as signAdminSession,
  verifySession as verifyAdminSession
} from '../src/admin/google-oauth.js';

test('timingSafeEqual compares strings without early exit', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('', ''), true);
});

test('prototype and admin auth are enforced server-side', () => {
  const config = { prototypeAccessKey: 'prototype-key', adminToken: 'admin-key', adminEnabled: true };
  const okay = new Request('http://local/api', { headers: { 'x-prototype-key': 'prototype-key', authorization: 'Bearer admin-key' } });
  assert.doesNotThrow(() => requirePrototypeKey(okay, config));
  assert.doesNotThrow(() => requireAdmin(okay, config));
  const bad = new Request('http://local/api', { headers: { 'x-prototype-key': 'nope', authorization: 'Bearer nope' } });
  assert.throws(() => requirePrototypeKey(bad, config), /prototype access key/);
  assert.throws(() => requireAdmin(bad, config), /Admin authentication/);
});

test('owner token must be present and reasonably sized', () => {
  assert.equal(ownerTokenFrom(new Request('http://local', { headers: { 'x-owner-token': 'short' } })), null);
  const token = 'a'.repeat(32);
  assert.equal(ownerTokenFrom(new Request('http://local', { headers: { 'x-owner-token': token } })), token);
});

test('admin OAuth PKCE and auth URL include the required fields', async () => {
  const pkce = await createAdminPkce();
  assert.ok(pkce.verifier.length > 30);
  assert.ok(pkce.challenge.length > 30);
  const url = new URL(buildAdminAuthUrl({
    clientId: 'client',
    redirectUri: 'http://127.0.0.1:8791/auth/google/callback',
    state: 'state',
    challenge: pkce.challenge
  }));
  assert.equal(url.searchParams.get('client_id'), 'client');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'state');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:8791/auth/google/callback');
});

test('admin OAuth exchange and userinfo use mocked Google responses', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'access', expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify({ email: 'Admin@Example.com', email_verified: true, name: 'Admin' }), { status: 200 });
  };
  const tokens = await exchangeAdminCode({
    clientId: 'client', clientSecret: 'secret', code: 'code', redirectUri: 'http://127.0.0.1/cb', verifier: 'verifier', fetchImpl
  });
  assert.equal(tokens.access_token, 'access');
  const user = await fetchAdminUser({ accessToken: tokens.access_token, fetchImpl });
  assert.equal(user.email, 'admin@example.com');
  assert.equal(user.emailVerified, true);
});

test('signed admin session round-trips, rejects tampering and expiry', async () => {
  const secret = 'test-secret';
  const token = await signAdminSession({ email: 'admin@example.com', expiresAt: Date.now() + 60_000, secret, epoch: 3 });
  const verified = await verifyAdminSession(token, secret);
  assert.equal(verified.email, 'admin@example.com');
  assert.equal(verified.epoch, 3);
  assert.ok(verified.sid);
  assert.ok(verified.issuedAt);
  assert.equal(await verifyAdminSession(token + 'x', secret), null);
  assert.equal(await verifyAdminSession(token, 'wrong-secret'), null);
  const expired = await signAdminSession({ email: 'admin@example.com', expiresAt: Date.now() - 1, secret });
  assert.equal(await verifyAdminSession(expired, secret), null);
  assert.match(buildAdminCookie(token), /HttpOnly/);
  assert.match(buildAdminCookie(token, { secure: true }), /Secure/);
  assert.match(clearSessionCookie(), /Max-Age=0/);
  assert.equal(parseAdminCookies('a=1; ainour_admin=abc').ainour_admin, 'abc');
});
