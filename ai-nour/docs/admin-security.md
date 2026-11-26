# Private administrator dashboard — security and operations

Status: **local/private implementation validated; production hostname not approved.** No Cloudflare Access, paid authentication, or public admin exposure was introduced.

## Architecture

```text
Browser (127.0.0.1:8791)
  ├─ Google OAuth login (openid/email/profile, PKCE, state)
  ├─ Signed HttpOnly session cookie (8h, SameSite=Lax)
  └─ /api/admin/* proxy
        └─ Worker admin API (Bearer ADMIN_TOKEN, server-side)
              └─ D1 + Google Sheets/Calendar/Drive
```

- The permanent Worker admin token never reaches the browser.
- The admin server binds only to `127.0.0.1`.
- The admin OAuth client is separate from the operational Google data client.
- The Google account must be on the `ADMIN_EMAIL` allowlist and have a verified email.
- The admin page is not linked from the public portfolio.

## Authentication

- Google OAuth Authorization Code + PKCE + state.
- The state is single-use and expires after 10 minutes.
- The Google user must match `ADMIN_EMAIL` and have `email_verified=true`.
- Session token is HMAC-SHA256 signed with `PHASE1_ADMIN_SESSION_SECRET`.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=28800`; `Secure` when `ADMIN_COOKIE_SECURE=true`.
- Claims: email, issued time, expiry, session id, epoch.
- Expired, tampered, wrong-email, revoked, or wrong-epoch sessions are rejected.
- `ADMIN_SESSION_HOURS` controls the 8-hour default.
- `ADMIN_SESSION_EPOCH` can be set to a new integer for a durable revocation across restarts.
- `ADMIN_COOKIE_SECURE=true` when the admin is served over HTTPS; keep `false` for local HTTP.

## Authorization

- Every `/api/admin/*` route requires `requireAdmin` with the server-side bearer token.
- Missing/incorrect authorization returns 401 before any data access.
- The proxy only forwards `GET`, `HEAD`, `POST`, and `PATCH` to `/api/admin/*`.
- Mutating proxy requests require a same-origin `Origin` header; cross-origin mutations return 403.
- The Worker admin APIs remain inaccessible without the bearer token even if the admin page is bypassed.

## Logout, reauthentication, revocation

| Action | Behavior |
| --- | --- |
| Sign out | `POST /auth/logout` revokes the current session id and clears the cookie (`Max-Age=0`). |
| Sign out all | `POST /auth/revoke-all` increments the session epoch and clears the cookie; every existing cookie is rejected. |
| Reauthenticate | Redirect to `/auth/google/start?reauth=1` with `prompt=login`; the new session uses the current epoch. |
| Expiry | Signed expiry and cookie max-age both enforce the 8-hour limit. |
| Access revocation | Remove the administrator from the allowlist and/or rotate `PHASE1_ADMIN_SESSION_SECRET`; existing cookies stop verifying. The in-memory epoch also invalidates sessions on “sign out all.” |
| Restart | Stateless signed cookies remain valid across a restart only if the secret and epoch are unchanged. Rotate the secret for a durable emergency revocation. |

## Browser and transport protections

- `Content-Security-Policy`: self-only scripts/styles, no framing, no form exfiltration.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer`.
- `Cache-Control: no-store`.
- `Permissions-Policy` disables camera, microphone, and geolocation on the admin page.
- No inline scripts in the admin page.
- Admin data is not cached by the browser or proxy.

## Validation evidence

Automated local test: `results/admin-auth-tests.json` — **15/15 passed**:

1. Admin API rejects a missing session.
2. Unauthenticated page redirects to Google sign-in.
3. Valid signed session accepted.
4. Authorized proxy reaches the Worker.
5. Tampered cookie rejected.
6. Expired cookie rejected.
7. Non-allowlisted Google account rejected.
8. Cross-origin administrative mutation rejected.
9. Authorized page renders with security headers.
10. Logout clears and revokes the session.
11. Revoked session stops working.
12. Reauthentication starts a fresh Google login prompt.
13. Sign-out-all rotates the epoch.
14. Access revocation invalidates existing sessions.
15. A new session works after revocation.

Test mode: local admin server + mock Worker + a test-only signed session. The real Google OAuth browser round-trip was verified in Phase 2; it is not re-marked as passed here because no new browser login was performed in this run.

## Production hosting decision

| Option | Fixed cost | Status |
| --- | --- | --- |
| Keep admin local/private (VPN or approved tunnel) | $0 | Recommended for private beta |
| Private hostname + Cloudflare Access | $0 on Free, but introduces a service the user deferred | Not implemented; requires approval |
| Public admin hostname without Access | $0 but higher risk | Not recommended |
| Paid auth provider | >$0 | Not approved |

Do not expose `ADMIN_PORT` publicly. If remote administration is required, approve the private hostname and Access exception first.

## Runbook

1. Start Worker: `npm run dev`.
2. Start admin: `npm run admin`.
3. Open `http://127.0.0.1:8791` (not `localhost`, which can hit a stale IPv6 listener).
4. Sign in with the allowlisted Google account.
5. Use **Re-authenticate** before sensitive changes if the session is old.
6. Use **Sign out** on a shared machine.
7. Use **Sign out all** after a suspected compromise, then rotate `PHASE1_ADMIN_SESSION_SECRET` for durable revocation.
8. Review Audit and operational events after administrative changes.

## Remaining approvals

- Decide local/private vs approved private hostname.
- Provide production admin redirect URI if a hostname is approved.
- Approve the privacy/terms pages before linking them from the OAuth brand.
- Do not publish or expose the admin until that decision is recorded.
