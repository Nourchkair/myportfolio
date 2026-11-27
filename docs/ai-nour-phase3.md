# AI Nour — Phase 3 launch candidate and private-beta readiness

> Historical record: this phase was produced under the former working name **AI Nour**. The visitor-facing assistant is now **Nupa**; internal paths, browser keys, API routes and other technical identifiers remain unchanged.

**Date:** 26 November 2026  
**Branch:** `phase2/ai-nour-production`  
**Scope:** isolated AI Nour worktree; no merge, push, production deploy, DNS change, real email, OAuth publish, or paid service.  
**Status:** **local launch candidate complete; private-beta launch gated by visual approval, real-device testing, and external account approvals.**

**Phase 4 update:** Live sessions are now configurable to 600 seconds with a $0.25 reservation, and admin spending/voice limits and publishable knowledge overrides are implemented. See `docs/ai-nour-phase4.md`; the 120-second voice section below is the Phase 3 historical record.

---

## 1. Executive summary

Phase 3 completes the operational product around the accepted Phase 2 prototype without adding unnecessary architecture:

- Automated email is implemented around **Resend Free**, with templates, consent checks, internal notifications, reminders, retries, provider idempotency, delivery webhooks, and duplicate protection. **No real email was sent.**
- The proposed CRM is reduced to six focused tabs; unnecessary pipeline/owner/notes data was removed. **No Google Sheet headers were applied.**
- Production OAuth is prepared with separate operational and admin clients, exact redirects, scope justifications, verification steps, and a clear Google Workspace MCP policy risk. **Nothing was published or submitted.**
- The private admin dashboard now has server-side session expiry, logout, re-authentication, sign-out-all revocation, CSRF checks, and security headers. **15/15 admin-auth checks passed.**
- Live spending protection was tightened: a global 12-token/day cap, 15-minute reservation hold, and settlement of abandoned holds as `live_unreported`. A WebSocket proxy is **not** implemented because the current 120-second token lifetime keeps modeled exposure below the $1/day cap.
- The complete synthetic visitor lifecycle passes **28/28**, including a real no-attendee Google Calendar event with a unique Meet link, mock delivery, reminders, reschedule, cancellation, retries, and webhook tracking.
- The six-state visual approval package is captured for personal review. **Final production CSS is intentionally unchanged.**
- Real-device Chrome/Safari/iOS/Bluetooth/French testing remains **pending human execution** and is not claimed as passed.

**Cost:** **$0.360233 USD actual / ~$0.5122 CAD**; **$0.600233 USD committed including $0.24 held Live reservations / ~$0.8535 CAD**. Fixed infrastructure remains **$0/month**.

---

## 2. Launch candidate

Working locally:

```text
Portfolio:  http://127.0.0.1:8771
Worker:     http://127.0.0.1:8789
Mock:       http://127.0.0.1:8792
Admin:      http://127.0.0.1:8791
```

- Real integrated URL: `http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8789`
- No-cost mock URL: `http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8792` (key `phase2-test-key`)
- Admin uses Google OAuth and must be opened at `127.0.0.1:8791`, not `localhost`.

The companion remains feature-flagged. The default portfolio and reading view remain assistant-free.

---

## 3. Visual approval package

Six states plus the Thinking sub-state are documented in `ai-nour/docs/visual-prototypes.md`:

| State | Screenshot |
| --- | --- |
| Closed pill | `ai-nour/docs/screenshots/phase3-state-1-pill.png` |
| Standard text | `ai-nour/docs/screenshots/phase3-state-2-text.png` |
| Collapsed chat | `ai-nour/docs/screenshots/phase3-state-3-collapsed.png` |
| Expanded | `ai-nour/docs/screenshots/phase3-state-4-expanded.png` |
| Voice | `ai-nour/docs/screenshots/phase3-state-5-voice.png` |
| Mobile sheet | `ai-nour/docs/screenshots/phase3-state-6-mobile.png` |
| Thinking | `ai-nour/docs/screenshots/phase3-state-thinking.png` |

Verified:

- Pill is labelled “Ask Nour AI”, sits immediately right of the menu bar, and has a text/chat icon plus a mic.
- “Nour OS” was removed from the menu bar; the brand slot is now the home mark only.
- No yellow orb/circle remains in the pill or panel. The yellow decorative orbs, context dot, thinking dot, and voice orb were removed.
- Standard 390×680, collapsed 390×217 (latest AI reply + input line), expanded 760×740, mobile full-width sheet. Voice is controlled from the pill; the chat is transcript-only.
- Composer has only the send control inside the text bar; EN/New are enlarged at the top right of the Viewing row. There is no mic, orb, voice bar, or start/stop control inside the chat panel.
- The old “AI representation” disclosure text was removed, and message labels (“You”/“AI Nour”) are no longer rendered in bubbles.
- Thinking is hidden when idle; while generating it is a bare glowing line directly on the panel background, with no bubble, border, or background.
- 0 browser console errors; no real microphone started.

**Pending:** Nour’s visual approval, then final production CSS/token pass.

---

## 4. Automated email — prepared, not enabled

Provider: **Resend Free**, verified 26 November 2026.

| Limit | Value |
| --- | --- |
| Price | $0/month |
| Volume | 3,000/month |
| Daily | 100/day (UTC), sent + received combined |
| Domains | 3 |
| Webhooks | 1 endpoint |
| Overage | Not available; hard stop |

Proposed identity: `AI Nour <appointments@mail.nourchkair.com>`.

Implemented:

- Inquiry acknowledgement, internal inquiry notification, appointment confirmation, reschedule, cancellation, 24-hour reminder, 1-hour reminder, internal appointment notification.
- Visitor email only with active `email` consent.
- D1 queue with `dedupe_key`, attempts, max attempts, next attempt, provider message id, delivery timestamps.
- Resend `Idempotency-Key` uses the same dedupe key; 24-hour provider window.
- Exponential backoff; 5 attempts; dead-letter; admin requeue; stale-sending reset.
- Svix webhook verification over the raw body, 5-minute replay window, `svix-id` dedupe.
- Delivery statuses: sent, delivered, bounced, complained, delayed, failed.
- Reschedule/cancel cancels queued reminders for the old slot.
- `EMAIL_SEND_ENABLED=false` means dry-run; no network call.

Exact account/DNS/credential instructions: `ai-nour/docs/email-recommendation.md`.

Required from Nour (not yet supplied):

1. Resend account on Free.
2. Domain `mail.nourchkair.com` added and verified.
3. DNS records copied from Resend: DKIM TXT, Return-Path/SPF TXT+MX or CNAMEs, DMARC; Cloudflare CNAMEs DNS-only.
4. API key with sending access.
5. Webhook signing secret.
6. Internal notification address.
7. Approval for one controlled test send before enabling.

No DNS was changed and no real email was sent.

---

## 5. CRM schema — proposed, not applied

The full table with purpose, type, and required flags is in `ai-nour/docs/crm-schema.md`.

Proposed tabs:

1. **Contacts** — identity, locale/timezone, source; no duplicate consent or notes.
2. **Inquiries** — type, summary, requested service, visitor-provided budget/timeline, status, consent link, source URL, idempotency.
3. **Consent** — scoped store/contact/email/followup permissions with short evidence references.
4. **Appointments** — D1/Calendar linkage, unique Meet, status, timezone, idempotency.
5. **Email Log** — delivery metadata only; no email bodies or raw webhook payloads.
6. **Follow-ups** — optional, small, not required for private beta.

Deferred: pipeline/opportunity tab, owner field, free-text notes, full email bodies, marketing segments, open/click tracking. Rationale: excessive personal data or unvalidated workflow.

Local D1 is implemented; no live Google Sheet headers or records were written.

---

## 6. Production OAuth — prepared, not submitted

Full instructions: `ai-nour/docs/oauth-production-readiness.md`.

- **Operational client** `AI Nour Operations`: `spreadsheets`, `calendar.events`, `calendar.readonly`, `drive.file`; refresh token server-side.
- **Admin client** `AI Nour Admin`: `openid`, `email`, `profile`; no operational scopes.
- Production operational redirect: `https://api.nourchkair.com/oauth/google/callback`.
- Production admin redirect: `https://admin.nourchkair.com/auth/google/callback` **only if** a private admin host is approved; otherwise keep local.
- Testing-mode External refresh tokens expire after 7 days. Resolution: publish and complete sensitive-scope verification, or accept weekly reauthorization (not recommended).
- Sensitive scopes require brand verification + data-access review; allow about 10 days. No restricted-scope assessment if Gmail is excluded.
- Gmail is excluded from production; Resend handles transactional email. Gmail drafts remain an optional human-review fallback with `gmail.compose` (restricted).
- Privacy/terms review copies updated and linked only to proposed URLs.
- **Google Workspace MCP policy:** agents must use Google MCP for Workspace access from **1 February 2027**; direct REST access is acceptable for the private-beta window but is a post-February-2027 launch blocker unless migrated or approved.

No app publish, verification submission, redirect change, or production reauthorization was performed.

---

## 7. Administration

Full details: `ai-nour/docs/admin-security.md`.

- Google OAuth with PKCE/state, verified email, allowlist.
- Signed HttpOnly cookie, 8-hour expiry, SameSite=Lax, optional Secure.
- Session id + epoch; logout revokes; sign-out-all rotates the epoch; reauthentication uses `prompt=login`.
- Cross-origin mutations rejected; CSP, frame denial, no-store, referrer policy.
- Worker admin APIs require the bearer token; browser never receives it.
- Private binding to `127.0.0.1`; no Cloudflare Access introduced.

Validation: **15/15** (`results/admin-auth-tests.json`), including missing/tampered/expired/wrong-email sessions, CSRF, logout, reauthentication, sign-out-all, revocation, and a new session after revocation.

Phase 2 verified the real Google OAuth browser round-trip. Phase 3 did not repeat that browser login, so it is not re-marked as passed here.

---

## 8. Voice and spending protection

Full analysis: `ai-nour/docs/live-spend-analysis.md`.

Verified:

- Gemini 3.8 Live audio-only sessions have provider limits (about 15 minutes; ~10-minute connection).
- Current ephemeral token `expireTime` is **120 seconds**, so the effective session cap is about two minutes.
- Modeled maximum cost per two-minute session: **~$0.0465**.
- Reservation: **$0.08**, above the modeled maximum.
- Global **12 tokens/day** cap; daily **$1** and cumulative **$7** caps.
- Reservation hold **15 minutes**; expired holds are settled as `live_unreported`, so budget is not silently freed.
- Rate limit: 12 token requests/10 minutes.
- Three outstanding holds are included in the committed cost; they will settle after their windows.

**Proxy decision:** not implemented. It would add a Worker/WebSocket hop, reconnect/tool-call complexity, and possible paid/runtime limits without materially improving exposure at the current 120-second cap. Revisit if sessions must exceed two minutes, the prototype becomes public, abuse appears, or exact metering is required.

Conversation recovery, shared text/voice context, interruption, and bilingual support are preserved.

---

## 9. Complete lifecycle

`npm run test:lifecycle` — **28/28**.

Validated with synthetic data:

- Inquiry → contact → consent → inquiry ack + internal notification.
- Duplicate inquiry idempotency; no duplicate email.
- Availability; appointment creation with a **real no-attendee Google Calendar event** and unique Meet link.
- Appointment confirmation + internal notification.
- 24-hour reminder queue, dedupe, delivery.
- Reschedule, reschedule email, cancellation, cancellation email.
- Duplicate cancellation idempotency.
- Webhook delivery update; duplicate webhook replay; invalid signature rejection.
- Mock delivery failure → retry attempts 1/2/3 → dead-letter → admin requeue.
- Scheduled maintenance runs without a runtime error.
- Admin email API rejects unauthorized requests.

No real email was sent. The synthetic calendar event was cancelled.

Earlier Phase 2 checks remain valid: real Google CRM 10/10, real text + Live 12/12, French 7/7, recovery 4/4.

---

## 10. Validation summary

| Test | Result | Evidence |
| --- | --- | --- |
| Unit | **45/45** | `results/unit-tests.txt` |
| Mock API | **23/23** | `results/api-tests.json` |
| CRM workflow | **14/14** | `results/crm-tests.json` |
| Full lifecycle | **28/28** | `results/lifecycle-tests.json` |
| Admin auth/security | **15/15** | `results/admin-auth-tests.json` |
| Live budget | **3/3** | `results/live-budget-tests.json` |
| Endpoint security | **8/8** | `results/security-api.json` |
| Retrieval | **87.27% top-1 / 100% top-3** | `results/retrieval-benchmark.json` |
| Portfolio regression | **261 checks** | root `npm test` |
| Companion visual QA | **6 states, 0 console errors** | `results/phase3-visual-qa.json` |
| Secret scan | **383 files, 0 hits** | `results/secret-scan.txt` |

The secret scan covers tracked and untracked non-ignored files, current secret values, and common key patterns. It does not scan Git history.

### Archived Google Maps key

- Historical key appears in `assets/unsplash-desk-room.html` from the initial commit.
- It was moved with the archive in `4c61dd0` and redacted in `edaa58c`.
- It is a **third-party Unsplash page key**, not a key in Nour’s current `.dev.vars` or current tree.
- No key rotation, credential modification, or history rewrite was performed.
- Do not use the archived key. If the repository is or becomes public, treat it as a third-party exposure and do not rely on it.

---

## 11. Actual costs

| Item | USD micros | USD | CAD at 1.4219 |
| --- | ---: | ---: | ---: |
| Phase 0A + Phase 1 carryover | 34,559 | $0.034559 | $0.0491 |
| Actual Phase 2/3 usage | 325,674 | $0.325674 | $0.4631 |
| **Actual spent** | **360,233** | **$0.360233** | **~$0.5122** |
| Held Live reservations (3 × $0.08) | 240,000 | $0.240000 | $0.3413 |
| **Committed** | **600,233** | **$0.600233** | **~$0.8535** |

- Fixed infrastructure: **$0/month**.
- Approved evaluation budget: **$10 CAD**.
- Daily cap: **$1.00 USD**; cumulative cap: **$7.00 USD** (~$9.95 CAD).
- Remaining committed cap: ~**$9.10 CAD**.
- Actual-spend headroom under $10 CAD: ~**$9.49 CAD**.
- The actual total includes three reconciled Live turns ($0.24) and one unreported hold settled at $0.08; three further holds ($0.24) are in the committed total.
- No billing, subscription, R2, paid auth, paid database, or paid email service was activated.

---

## 12. Real-device testing — pending

Plan: `ai-nour/docs/real-device-testing.md`.

Not yet executed by a human. Required:

- Desktop Chrome and Safari.
- iOS Safari at 390×844 and 430×932.
- Microphone permission grant/denial.
- Bluetooth routing and disconnect behavior.
- Interruption by talking over the assistant.
- French pronunciation.
- Conversation recovery after reload and new Live session.
- Mobile sheet and software keyboard.
- Portfolio navigation while the assistant is open.

The configured Live limit (Phase 4 default: 10 minutes) should be included in the test.

**No human device result is marked passed.**

---

## 13. Private beta readiness

### Ready

- Local launch candidate and six-state visual package.
- D1 conversation, CRM, consent, booking, idempotency, email queue, cost ledger.
- Admin auth/session/revocation and server-side admin APIs.
- Live spending caps and abandoned-hold settlement.
- Synthetic end-to-end lifecycle and regression suite.
- Resend/OAuth/CRM/admin approval packages.

### Conditional on Nour

1. Visual approval or change list.
2. Real-device test results.
3. Resend account, DNS, API key, webhook secret, and test-send approval.
4. Production OAuth publish/verification and production redirect/host decisions.
5. CRM schema approval before Sheet application.
6. Decision to keep admin local/private or approve a private hostname.
7. Post-1-February-2027 Google Workspace MCP decision.

### Not ready for

- Public anonymous launch.
- Production deployment or custom domains.
- Real transactional email without approval.
- Google Sheet CRM writes.
- OAuth verification submission.
- Any claim that human audio/Bluetooth/iOS quality is validated.

**Assessment:** private beta is conditionally ready for a local/private review with Nour and a small controlled group once visual approval and real-device checks are complete. Production launch is not ready until the external account gates and post-February-2027 MCP question are resolved.

---

## 14. Remaining launch blockers

1. Visual approval and final production CSS.
2. Real-device testing (Chrome, Safari, iOS, microphone, Bluetooth, French).
3. Resend domain/DNS/webhook/test send.
4. OAuth production project, redirects, verification, and durable refresh token.
5. Google Sheets CRM schema approval.
6. Production admin hosting/private access decision.
7. Google Workspace MCP migration or documented exception before 1 February 2027.
8. D1 residency (ENAM/ORD) acceptance.
9. Archived third-party key exposure acknowledgement (no rewrite).

---

## 15. Files changed in Phase 3

```text
src/ai-nour/companion.js + companion.css      voice limit hint; Phase 3 UI
src/config.js                                 email, webhook, Live hold/day caps
src/db/index.js                               email lifecycle, reminders, webhook events, Live settlement
src/cost/service.js                           expired Live hold settlement
src/services/conversation.js                  daily Live token cap, hold window
src/services/crm.js                           templates, consent-gated email, internal notices, reminder cancellation
src/integrations/email/index.js               Resend/mock/Gmail-draft, retries, webhooks, reminders
src/integrations/email/templates.js           7 transactional template functions, 8 message kinds
src/routes/email.js                           signed Resend webhook
src/routes/admin.js                           email retry/reminders, email status
src/app.js                                    email/cron/settlement orchestration
src/admin/google-oauth.js                     session id/epoch/issuedAt/secure cookie
scripts/admin-server.mjs                      logout, reauth, revoke-all, CSRF/CSP
admin/*                                       session header, email tracking/retry UI
migrations/0004_phase3.sql                    email/Live/webhook fields
scripts/test-lifecycle.mjs                    full synthetic lifecycle
scripts/test-admin-auth.mjs                   admin session/security validation
tests/email.test.mjs                          template/Resend/webhook tests
docs/ai-nour-phase3.md                        this report
ai-nour/docs/visual-prototypes.md             six-state approval package
ai-nour/docs/email-recommendation.md          Resend configuration
ai-nour/docs/crm-schema.md                    CRM approval package
ai-nour/docs/oauth-production-readiness.md    production OAuth + MCP policy
ai-nour/docs/admin-security.md                admin security/runbook
ai-nour/docs/live-spend-analysis.md           Live exposure/proxy comparison
ai-nour/docs/real-device-testing.md           human checklist
ai-nour/docs/screenshots/phase3-*.png         visual evidence
```
