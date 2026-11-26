# AI Nour — Phase 3 architecture

## Principles

1. **$0 fixed infrastructure** — Cloudflare Free, D1, Google consumer services, Resend Free, no R2, no paid auth/database/vector store.
2. **Server-side authority** — the browser never holds the permanent Gemini key, Google refresh token, admin token, or Resend key.
3. **Provider adapters** — text, Live, Google, and email are narrow interfaces.
4. **Grounded, structured knowledge** — deterministic lexical/entity retrieval over the public portfolio corpus; no vector database.
5. **Human confirmation for external writes** — Google CRM writes are off by default; appointments are synthetic/no-attendee in tests; Gmail exposes drafts only.
6. **Recoverable conversations** — D1 owns the conversation; Live session reuse is not the recovery mechanism.
7. **Bounded spending** — per-token prepaid Live reservations, a global daily token cap, daily/cumulative caps, and settlement of abandoned holds.

## Module map

```text
src/
  index.js                 Worker entry
  app.js                   config, services, router, errors, assets, cron
  config.js                env parsing, models, caps, email/Live limits
  http/                    router, JSON/body limits, errors
  auth/secure.js           timing-safe auth, owner hashing
  db/index.js              D1 repositories
  providers/               text/Live Gemini + mock adapters
  knowledge/               corpus (107 chunks), retrieval, context
  sessions/manager.js      history, brief, prompts, summaries
  tools/registry.js        allowlisted NourOS actions
  services/conversation.js chat loop, Live token/turn, reservation checks
  services/crm.js          inquiry/consent/booking/reschedule/cancel/reconcile
  integrations/email/      templates, queue, Resend/mock/Gmail-draft, webhooks
  integrations/google/     auth, Sheets, Calendar, Drive, Gmail drafts
  cost/service.js          text/Live cost, caps, expired-hold settlement
  controls/flags.js        feature flags, persona, shutdown
  admin/google-oauth.js    PKCE, session signing, cookie helpers
  routes/                  health, session, CRM, email webhook, admin
public/                    prototype UI
admin/                     private admin UI
scripts/                   builds, admin server, lifecycle/security/model tests
tests/                     unit and retrieval suites
migrations/                0001–0004 D1 schema
```

## Text flow

1. `POST /api/chat` verifies prototype key, owner token, flags, rate limit, and budget.
2. Loads or creates the D1 session; owner hash must match.
3. Claims `clientMessageId` in `action_ledger`.
4. Retrieves top chunks from the public corpus.
5. Calls Gemini Flash-Lite with allowlisted tool declarations.
6. Validates tool calls; allows up to three model rounds.
7. Stores the turn, records cost, updates the summary when needed.
8. Returns the reply and validated actions for `window.NourOS`.

## Live flow

1. `POST /api/live/token` checks flags, rate limit, the global daily token count, and held-reservation budget.
2. Creates a held reservation (`$0.08` default) for 15 minutes.
3. Mints a one-use Gemini token with a **120-second** `expireTime`, 60-second new-session window, voice, system instruction, transcripts, and tools.
4. The browser connects directly to Gemini; no permanent key is exposed.
5. Tool calls go to `/api/tools/execute`; transcripts/usage go to `/api/live/turn`.
6. The server charges `max(actual, reservation)` when usage is reported and reconciles the hold.
7. If the hold expires unreported, scheduled cleanup records the reservation as `live_unreported` and marks the token expired.
8. Daily 12-token cap, $1 daily cap, and $7 cumulative cap bound exposure.
9. A 2-minute session is intentionally short; the D1 transcript allows a new session to continue with context.

## Email flow

1. CRM actions enqueue `email_jobs` with a unique `dedupe_key`: inquiry acknowledgement, internal inquiry notice, confirmation, reschedule, cancellation, reminders.
2. Visitor email requires an active `email` consent scope.
3. `processQueued` claims due jobs, sends through Resend/mock/Gmail-draft, records attempts, and applies exponential backoff.
4. Resend receives `Idempotency-Key` equal to the local dedupe key.
5. Failed jobs retry up to `EMAIL_MAX_ATTEMPTS`, then become `dead_letter`; admin can requeue.
6. `scheduled` queues 24-hour/1-hour reminders for confirmed bookings and processes due jobs.
7. Resend webhooks are Svix-verified over the raw body, replay-limited, and deduped by `svix-id`; statuses include sent/delivered/bounced/complained.
8. Rescheduling/cancellation cancels queued reminders for the old slot.
9. `EMAIL_SEND_ENABLED=false` yields `dry_run` and no network send.

## CRM flow

`inquiry → consent → contact → inquiry → availability → booking → calendar event/Meet → confirmation email → reminders → reschedule/cancel`

- D1 is authoritative for ownership, overlap, idempotency, and status.
- Google Calendar free/busy is advisory; D1 slot locking is authoritative.
- Calendar failures are recoverable via `/reconcile`; confirmation is sent only after the event is confirmed/reconciled.
- No attendees are added in synthetic tests.
- The Google Sheets CRM schema remains proposed; local D1 is implemented.

## D1 schema

| Table | Purpose |
| --- | --- |
| `sessions`, `session_messages` | conversation, summaries, locale, recovery |
| `action_ledger` | chat/Live/tool idempotency |
| `rate_limits` | per-bucket counters |
| `contacts`, `consents` | visitor identity and scoped consent |
| `inquiries` | inquiry workflow + browser idempotency |
| `bookings` | appointments, slot locks, Calendar/Meet linkage, booking idempotency |
| `email_jobs` | queue, attempts, dedupe, provider id, delivery timestamps |
| `email_webhook_events` | replay/dedupe of Resend events |
| `live_tokens` | prepaid holds, reconciliation, expiry |
| `cost_events` | provider/model/token/cost ledger |
| `controls` | flags, persona, model controls |
| `ops_events`, `admin_audit` | operational and administrative audit |
| `knowledge_overrides` | draft admin overrides (not applied) |

Migrations: `0001_init.sql`, `0002_phase2.sql`, `0003_crm_idempotency.sql`, `0004_phase3.sql`.

## Admin security

- Private admin server binds to `127.0.0.1`.
- Google OAuth with PKCE/state, verified email, `ADMIN_EMAIL` allowlist.
- HMAC-signed HttpOnly session (8h, SameSite=Lax; Secure when configured).
- Session id + epoch; logout revokes, sign-out-all rotates the epoch.
- Reauthentication uses `prompt=login`.
- Cross-origin mutations rejected; CSP, frame denial, no-store, referrer policy.
- Worker admin API requires the server-side bearer token; the proxy injects it.

## Cost model

- Text and Live rates are env-configured per million tokens.
- Costs are rounded up to USD micros and recorded with stable request ids.
- `budget()` includes spent cost events + unexpired held Live reservations.
- Text and Live token issuance call `assertBudget()`.
- Live holds settle at the reservation amount if unreported.
- Defaults: $1/day, $7 cumulative (~$9.95 CAD), $0.08 reservation, 12 Live tokens/day.

## Phase 3 follow-ups

- Final visual approval and production CSS.
- Real-device Chrome/Safari/iOS/Bluetooth/French results.
- OAuth production verification/publishing.
- Resend DNS/webhook/test-send approval.
- Google Sheets CRM schema application.
- Google Workspace MCP migration before 1 February 2027 if direct REST agent access is disallowed.
- Observability/export within free-tier limits.
- D1 residency decision (ENAM/ORD).
