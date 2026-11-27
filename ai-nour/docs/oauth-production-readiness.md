# Production OAuth — Phase 4 approval and configuration package

Status: **production Worker deployed with the existing development OAuth credentials. The legal pages are published. The current Testing-mode refresh token expires in about 6.5 days; publishing/verification and durable reauthorization remain the manual actions.**

## Production status

- Production Worker: `https://api.nourchkair.com`
- Google operations use the existing client ID/secret and refresh token, installed as Workers Secrets.
- Sheets and Calendar were validated in production with synthetic rows/events and cleaned up.
- The refresh token currently works, but Google reports `refresh_token_expires_in` of about **565,769 seconds (~6.55 days)** because the app is External/Testing.
- No production OAuth callback route is implemented. Reauthorization uses the local helper, then the new refresh token is installed as a Worker secret.
- A production redirect URI such as `https://api.nourchkair.com/oauth/google/callback` is **not configured** because the Worker does not implement that callback. Do not add it until the route exists.

**Next manual action:** publish and verify the OAuth app out of Testing, then reauthorize once for a durable refresh token.

## 1. Current state

- Google Cloud project: `ai-nour` (development).
- OAuth app: External, **Testing**.
- Development scopes: Sheets, Calendar events/read-only, Drive file, optional Gmail compose.
- Development redirects:
  - `http://127.0.0.1:8791/auth/google/callback` (admin login)
  - `http://localhost:8787/oauth/google/callback` (local operational helper)
- Operational refresh token is stored server-side in `.dev.vars`; it never reaches the browser.
- Admin login uses a separate OAuth flow with basic `openid`, `email`, `profile` scopes and a signed HttpOnly session cookie.
- Bilingual policies are published at `https://nourchkair.com/privacy/` and `https://nourchkair.com/terms/`. Version 1.2 (Nupa identity, effective 27 November 2026) is published and served. The portfolio and Nupa are both covered. Nupa eligibility is 18+.

## 2. Separate the two authorizations

| Authorization | Purpose | OAuth client | Scopes | Token storage | User consent |
| --- | --- | --- | --- | --- | --- |
| **Operational Google data** | Read/write the approved CRM Sheet, Calendar availability/events, app-created Drive files/backups | `AI Nour Operations` (production web client; internal OAuth client name retained) | `spreadsheets`, `calendar.events`, `calendar.readonly`, `drive.file` | Refresh token in Worker secret store | Nour authorizes once; no visitor Google login |
| **Administrator authentication** | Prove the administrator is Nour before opening the private dashboard | `AI Nour Admin` (production web client; internal OAuth client name retained) | `openid`, `email`, `profile` | Short-lived Google access token; signed admin session cookie | Nour signs in; email allowlist; 8-hour session |

Do not use the operational client for admin login, and do not give the admin client Sheets/Calendar/Drive scopes. Separate clients allow independent revocation and keep the public login surface minimal.

### Gmail

Do **not** request Gmail scopes for the production path. Resend handles automated transactional email. Keep `gmail.compose` only as an optional development/human-review fallback:

- `gmail.compose` is a **restricted** scope, triggering verification and a third-party security assessment.
- Google’s Gmail MCP server creates drafts; it does not provide an autonomous send tool.
- Google’s Workspace AI Tools Addendum requires Google MCP for AI-agent Workspace access from **1 February 2027** and human confirmation for sensitive actions such as sending email.

## 3. Production Google Cloud configuration

Use a **separate production project** from the development project, consistent with Google’s OAuth policy.

### Project and APIs

1. Create project `ai-nour-prod` (or an approved equivalent).
2. Enable:
   - Google Sheets API
   - Google Calendar API
   - Google Drive API
   - Google Identity / OpenID Connect (for admin login)
3. Do not enable Gmail API for the production path unless the fallback is separately approved.
4. Configure the OAuth brand:
   - App name: target `Nupa`; the current console still shows `AI Nour` until the OAuth brand is updated and re-verified. Do not rename the OAuth client IDs.
   - User support email: Nour’s support address
   - Developer contact: Nour’s address
   - Homepage: `https://nourchkair.com`
   - Privacy policy: `https://nourchkair.com/privacy/`
   - Terms of service: `https://nourchkair.com/terms/`
   - Authorized domain: `nourchkair.com`
   - Logo: approved portfolio mark, if required
5. Add the production redirect URIs to the **Operations** client:
   - `https://api.nourchkair.com/oauth/google/callback`
6. Add the production redirect URI to the **Admin** client only if a production admin hostname is approved:
   - `https://admin.nourchkair.com/auth/google/callback`
   - If the admin remains local/private, keep only `http://127.0.0.1:8791/auth/google/callback` in the development client and do not create a production admin callback.
7. Keep localhost redirects out of the production clients.

### Publishing and verification

1. Complete brand verification first. It is usually automated; compliant results are valid for 7 days.
2. Publish the brand before requesting data-access verification.
3. Submit sensitive-scope verification for:
   - Sheets: approved CRM spreadsheet only.
   - Calendar: free/busy, booking, reschedule, cancel, unique Meet.
   - Drive: app-created knowledge files and encrypted backups only.
4. Provide a short demo if requested. It should show the consent screen, the exact scopes, the CRM/calendar/Drive use, and the fact that no Gmail send is performed.
5. Sensitive-scope review can take up to about 10 days; allow more time for questions.
6. No restricted-scope security assessment is required if Gmail remains out of scope.
7. Only after approval, publish the app out of Testing and reauthorize the operational account once with `access_type=offline` and `prompt=consent` to obtain a durable refresh token.
8. Store the refresh token and client secret as Worker secrets. Never put them in the browser, repository, or CRM sheet.

### Testing-mode refresh-token issue

Google issues a **7-day refresh token** to an External app in Testing, unless the only scopes are basic identity scopes. This is why the current operational token needs weekly reauthorization.

Resolution for production:

- Publish the app and complete sensitive-scope verification, **or**
- Keep the prototype in Testing and accept weekly reauthorization (not acceptable for private beta operations), **or**
- Use an Internal app only if Nour operates through a Google Workspace organization that can own the app (not the current assumption).

Admin login uses only basic identity scopes and no refresh token, so its 7-day operational-token issue does not apply; it still needs a production-quality sign-in host and published brand for user trust.

## 4. Exact redirect URIs

| Purpose | Environment | URI | Status |
| --- | --- | --- | --- |
| Operational Google consent | Local | `http://localhost:8787/oauth/google/callback` | Existing helper; development only |
| Operational Google consent | Production | `https://api.nourchkair.com/oauth/google/callback` | Proposed; requires Worker custom domain |
| Admin login | Local | `http://127.0.0.1:8791/auth/google/callback` | Existing and verified |
| Admin login | Production | `https://admin.nourchkair.com/auth/google/callback` | Conditional on approved private admin hostname |

A static Cloudflare Pages site cannot receive an OAuth code or hold a client secret. The production operational callback must be served by the Worker or a dedicated serverless endpoint. The admin callback is served by the private admin server.

## 5. Admin authentication and private hosting

Current private admin implementation:

- Binds only to `127.0.0.1`.
- Google OAuth with PKCE and state; email allowlist.
- Signed HttpOnly, SameSite=Lax session cookie with an 8-hour lifetime.
- Separate `ADMIN_TOKEN` bearer secret for Worker admin APIs; never sent to the browser.
- Logout revokes the session; “sign out all” rotates the in-memory session epoch.
- Reauthentication starts a fresh Google login with `prompt=login`.
- Cross-origin administrative mutations are rejected.
- CSP, frame denial, no-store, and referrer restrictions are set.
- Worker admin APIs require the bearer token server-side; missing authorization returns 401.

Production options, in order of preference:

1. **Keep admin local/private** behind a VPN or an approved private tunnel; no public admin hostname. This introduces no paid service.
2. If remote administration is required, use a private hostname with Cloudflare Access **only if** the user approves the exception to the no-Cloudflare-Access constraint. This is not currently implemented.
3. Do not expose the admin port publicly.

## 6. Google Workspace MCP policy

Current facts, checked 26 November 2026:

- Google Workspace MCP servers (Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat, People) are generally available.
- OAuth clients calling Workspace MCP servers must be marked **“Use this client for an AI-powered agent”**.
- Sensitive actions use MCP form elicitation for human confirmation.
- Google’s Workspace AI Tools Addendum states that AI agents/harnesses must use Google MCP for Workspace access from **1 February 2027**.
- Google’s Gmail MCP server supports drafts, search/read, and labels; it does not expose an autonomous send tool.

Implication for Nupa:

- The current private beta uses direct Workspace REST APIs for Sheets, Calendar, and Drive. That is acceptable for the private-beta window before **1 February 2027**.
- A production launch that continues after that date needs either:
  1. A Google Workspace MCP migration for agent access, with an agentic OAuth client and human confirmation for sensitive actions; or
  2. A documented Google-approved architecture that is not classified as an agent accessing Workspace data.
- Resend avoids the Gmail send policy entirely. Do not add Gmail send to the autonomous path.
- This is a **post-February 2027 launch blocker**, not a blocker for the current private beta.

## 7. Published privacy and terms

Approved and published on 27 November 2026:

- `https://nourchkair.com/privacy/`
- `https://nourchkair.com/terms/`

Version 1.2 is published, English and French, effective 27 November 2026. It updates the assistant identity to Nupa without changing data practices, retention, eligibility or third-party processing. The policies cover the portfolio and Nupa. Nupa is 18+; eligibility is combined with one Terms/Privacy acceptance. There is no separate age checkbox, date-of-birth collection, identity check or age pop-up. The portfolio remains available to everyone.

Operational facts reflected in the policies:

- Conversations: rolling 7 days; operational/error logs and non-queued email records 30 days; CRM until business need/deletion; cost/audit/idempotency records retained longer; no active automated backup schedule.
- Resend is disabled.
- Google API Services User Data Policy / Limited Use statement included.
- The production Gemini project is on the **Free tier** with no active Cloud Billing. Google's unpaid-service terms apply; do not submit personal, sensitive, confidential or third-party information. Public AI access remains disabled.
- External CRM/Calendar/email writes remain disabled except for separately approved synthetic tests.

## 7b. Current Google Console state (verified read-only, 27 November 2026)

- Project: `ai-nour`.
- App name: `AI Nour` in the current console; target visitor-facing brand is `Nupa`. The OAuth app name is an external Google configuration, not a code identifier; changing it requires a console edit and re-verification.
- Homepage: `https://nourchkair.com`.
- Authorized domain: `nourchkair.com`.
- Privacy policy URL: `https://nourchkair.com/privacy/` — set 27 November 2026.
- Terms of service URL: `https://nourchkair.com/terms/` — set 27 November 2026.
- Publishing status: **Testing**; user type **External**; one test user (`nourchkair@gmail.com`), 100-user testing cap.
- OAuth client: `AI Nour - Development`; authorized redirect URIs are local only:
  - `http://localhost:8787/oauth/google/callback`
  - `http://127.0.0.1:8791/auth/google/callback`
- No production redirect URI is configured because the Worker has no OAuth callback route.

Data Access currently lists unused scopes that would complicate verification:

- Sensitive: `gmail.send`, `documents.readonly` (not used by the production path).
- Restricted: `gmail.compose` (optional draft fallback only; not enabled; triggers a third-party security assessment).
- Keep: `spreadsheets`, `calendar.events`, `calendar.calendarlist.readonly`, `calendar.events.freebusy`, `drive.file`.

**Next manual action:** remove `gmail.send`, `gmail.compose`, and `documents.readonly` from Data Access, then save. Do not publish yet. After that, the remaining flow is verification (Calendar/Sheets/Drive), publishing out of Testing, and one reauthorization with the reduced scopes.

## 8. Remaining Google Console actions requiring the user

1. Confirm whether to keep the existing `ai-nour` OAuth project or create a separate production project/client.
2. Add the production redirect URIs.
3. Complete/publish brand verification.
4. Submit sensitive-scope verification with the scope justifications and demo.
5. Provide the production client ID/secret and operational refresh token through the secret store.
6. Decide whether the admin remains local/private or gets an approved private hostname.
7. Approve publishing the app out of Testing.

No publish, verification submission, redirect change, or reauthorization has been performed. **Next manual action:** in Google Cloud Console → Google Auth Platform → Data Access, remove the unused `gmail.send`, `gmail.compose`, and `documents.readonly` scopes; keep Sheets, Calendar, and Drive. Save, but do not publish yet.
