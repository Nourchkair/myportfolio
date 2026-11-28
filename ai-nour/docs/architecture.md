# Nupa (formerly AI Nour) — Phase 4 architecture

> The visitor-facing assistant is Nupa, an independent AI-powered portfolio guide. Internal directory, route, binding and storage identifiers retain their historical names to avoid a destructive migration.

## Principles

1. **$0 fixed infrastructure** — Cloudflare Free, D1, Google consumer services, Resend Free, no R2, no paid auth/database/vector store.
2. **Server-side authority** — the browser never holds the permanent Gemini key, Google refresh token, admin token, or Resend key.
3. **Provider adapters** — text, Live, Google, and email are narrow interfaces.
4. **Grounded, structured knowledge** — deterministic lexical/entity retrieval over the public portfolio corpus; no vector database.
5. **Human confirmation for external writes** — Google writes are off by default; synthetic tests use a reserved `@example.invalid` attendee only when consent is granted; Gmail exposes drafts only.
6. **Recoverable conversations** — D1 owns the conversation; Live session reuse is not the recovery mechanism.
7. **Bounded spending** — atomic text/Live reservations, a global daily token cap, daily/cumulative caps, active voice-session leases, and settlement of abandoned holds.

## Module map

```text
src/
  index.js                 Worker entry
  app.js                   config, services, router, errors, assets, cron
  config.js                env parsing, models, caps, email/Live limits
  http/                    router, JSON/body limits, errors
  auth/secure.js           timing-safe auth, server-issued owner tokens, owner hashing
  db/index.js              D1 repositories
  providers/               text/Live Gemini + mock adapters
  knowledge/               corpus (107 chunks), retrieval, context
  sessions/manager.js      history, brief, prompts, summaries
  tools/registry.js        allowlisted NourOS actions
  services/conversation.js chat loop, Live token/turn, reservation checks
  services/crm.js          inquiry/consent/booking/reschedule/cancel/reconcile
  services/crm-sheets.js   idempotent D1 → Google Sheet sync
  knowledge/grounding.js   shared verified text/Live foundation and project dossiers
  sessions/visitor.js      inferred visitor profile and prompt-safety filtering
  tools/registry.js        navigation, knowledge and presentation tools
  integrations/email/      templates, queue, Resend/mock/Gmail-draft, webhooks
  integrations/google/     auth, Sheets, Calendar, Drive, Gmail drafts
  cost/service.js          text/Live cost, caps, expired-hold settlement
  controls/flags.js        feature flags, persona, shutdown
  admin/google-oauth.js    PKCE, session signing, cookie helpers
  routes/                  health, session, CRM, email webhook, admin
public/                    prototype UI
admin/                     private admin UI
scripts/                   builds, admin server, lifecycle/security/model tests, Nupa persona migration
tests/                     unit and retrieval suites
migrations/                0001–0006 D1 schema and data updates
```

## Text flow

1. `POST /api/owner` issues a server-generated anonymous owner credential. `POST /api/chat` verifies the owner token, flags, per-visitor/global rate limits, and reserves text budget atomically.
2. Loads or creates the D1 session; owner hash must match.
3. Claims `clientMessageId` in `action_ledger`.
4. Retrieves top chunks from the public corpus.
5. Calls Gemini Flash-Lite with allowlisted tool declarations.
6. Validates tool calls; allows up to three model rounds.
7. Stores the turn, records cost, updates the summary when needed.
8. Returns the reply and validated actions for `window.NourOS`.

## Live flow

1. `POST /api/live/token` checks flags, per-visitor/global rate limits, the global daily token count, the atomic held-reservation budget, and the active voice-session leases.
2. Creates a held reservation (default `$0.125` for a 300-second session; the 600-second maximum remains configurable) for 15 minutes.
3. Mints a one-use Gemini token with a configurable `expireTime` (default **300 seconds**), 60-second new-session window, **Iapetus** voice, shared portfolio grounding, transcripts, and navigation/knowledge/presentation tools.
4. The browser connects directly to Gemini; no permanent key is exposed.
5. Tool calls go to `/api/tools/execute`; transcripts/usage go to `/api/live/turn`.
6. The server charges `max(actual, reservation)` when usage is reported and reconciles the hold.
7. If the hold expires unreported, scheduled cleanup records the reservation as `live_unreported` and marks the token expired.
8. Daily 12-token cap, the approved $3.00 daily cap, $7.00 cumulative cap, global 2 / per-visitor 1 active voice sessions, text atomic $0.02 reservations and Live atomic session reservations bound exposure. `POST /api/live/end` releases a lease.
9. Session duration is configurable (default 300 seconds, maximum 600); the D1 transcript allows a new session to continue with context.

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
- Calendar invitations are consent-gated; synthetic tests use one reserved `@example.invalid` attendee.
- The approved Google Sheets CRM schema is applied; D1→Sheet sync is manual and idempotent.

## D1 schema

| Table | Purpose |
| --- | --- |
| `sessions`, `session_messages` | conversation, summaries, locale, recovery |
| `action_ledger` | chat/Live/tool idempotency |
| `rate_limits` | per-bucket counters |
| `spend_reservations` | atomic text budget guards |
| `live_session_leases` | active voice-session concurrency |
| `contacts`, `consents` | visitor identity and scoped consent |
| `inquiries` | inquiry workflow + browser idempotency |
| `bookings` | appointments, slot locks, Calendar/Meet linkage, booking idempotency |
| `email_jobs` | queue, attempts, dedupe, provider id, delivery timestamps |
| `email_webhook_events` | replay/dedupe of Resend events |
| `live_tokens` | prepaid holds, reconciliation, expiry |
| `cost_events` | provider/model/token/cost ledger |
| `controls` | flags, persona, model controls |
| `ops_events`, `admin_audit` | operational and administrative audit |
| `knowledge_overrides` | draft/published admin overrides; published entries are appended to text retrieval |

Migrations: `0001_init.sql`, `0002_phase2.sql`, `0003_crm_idempotency.sql`, `0004_phase3.sql`, `0005_beta_access.sql`, `0006_nupa_persona.sql`.

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
- `budget()` includes spent cost events + held text reservations + held Live reservations.
- Text requests atomically insert a `spend_reservations` hold; Live token issuance atomically inserts a `live_tokens` hold with cap/concurrency predicates.
- Reported Live turns are charged at actual token-estimated usage, capped by the reservation remainder. `POST /api/live/end` releases the hold; a no-usage end or an expired unreported hold settles conservatively.
- Defaults: $1/day, $7 cumulative (~$9.95 CAD), 300-second sessions, $0.125 reservation at 300s, 600-second maximum, 12 Live tokens/day.

## Phase 4 follow-ups

- Final visual approval and production CSS.
- Real-device Chrome/Safari/iOS/Bluetooth/French results.
- OAuth production verification/publishing.
- Resend DNS/webhook/test-send approval.
- Sheet sync cadence decision (manual now; scheduled optional).
- Google Workspace MCP migration before 1 February 2027 if direct REST agent access is disallowed.
- Observability/export within free-tier limits.
- D1 residency decision (ENAM/ORD).
