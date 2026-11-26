# Phase 1 architecture

## Principles

1. **$0 fixed infrastructure** — Cloudflare Free, Google consumer services, D1, no R2, no paid auth/database/vector store.
2. **Server-side authority** — the browser never holds the permanent Gemini key, Google refresh token, or admin token.
3. **Provider adapters** — text and Live providers share narrow interfaces so another model provider can replace Gemini without changing session, retrieval, tool, cost, or UI logic.
4. **Grounded, structured knowledge** — retrieval is deterministic JSON/Markdown lexical/entity scoring; no vector database in Phase 1.
5. **Human confirmation for external writes** — Google writes are off by default; Gmail exposes drafts only.
6. **Recoverable conversations** — D1 owns the conversation; Live session resumption is not the recovery mechanism.

## Module map

```text
src/
  index.js                 Worker entry; creates the app per request
  app.js                   config, services, router, error handling, assets, cron
  config.js                env parsing and provider/Google/cap configuration
  http/
    router.js              tiny method + path router
    json.js                JSON responses, body limits, request/client keys
    errors.js              AppError factories
  auth/secure.js           timing-safe prototype/admin auth, owner hashing
  db/index.js              D1 repositories (sessions, messages, controls, cost, rate, audit, bookings)
  providers/
    index.js               text/live provider selection
    text/gemini.js         Gemini generateContent REST adapter
    text/mock.js           deterministic test provider
    live/gemini.js         Gemini auth_tokens REST adapter
    live/mock.js           deterministic test token
    errors.js              ProviderError
  knowledge/
    corpus.json            generated structured corpus (105 chunks)
    entities.json          generated project/chapter/section allowlists
    retrieval.js           BM25 + bilingual aliases + entity/intent boosts
  sessions/manager.js      session creation, history, brief, prompts, summarization
  tools/registry.js        allowlisted NourOS navigation tools and validators
  services/conversation.js chat/tool loop, Live token, Live turn persistence
  cost/service.js          per-model rates, daily/cumulative caps, ledger
  controls/flags.js        feature flags, persona, emergency shutdown
  integrations/google/
    auth.js                refresh-token cache and authenticated request
    sheets.js              metadata, values, append/update, synthetic round-trip
    calendar.js            free/busy, Meet event, reschedule, cancel
    drive.js               folders, upload/download, AES-GCM backups
    gmail.js               draft create/read/delete only
    index.js               configured status + synthetic test orchestration
  admin/google-oauth.js    PKCE, code exchange, userinfo, signed session cookie
  routes/
    health.js
    session.js             meta, session, chat, live token/turn, tools, knowledge
    admin.js               status, flags, persona, cost, sessions, knowledge, integrations, CRM, audit
public/                    temporary prototype UI (esbuild bundle in public/dist)
admin/                     local-only admin UI
scripts/                   knowledge/UI builds, API tests, real smoke, admin server
tests/                     node:test suites and retrieval fixtures
migrations/                D1 schema + Phase 0A cost carryover
```

## Text conversation flow

1. `POST /api/chat` checks prototype key, owner token, feature flags, rate limit, and budget.
2. Session is loaded or created; owner hash must match.
3. User message is not persisted until the model response succeeds; duplicate `clientMessageId` is claimed in `action_ledger`.
4. Retrieval returns top 4 chunks from the structured corpus.
5. System prompt combines persona, rules, conversation brief, and retrieved context.
6. Gemini Flash-Lite is called with the allowlisted tool declarations.
7. If the model returns function calls, the server validates them, records actions, sends function responses back, and allows up to three model rounds.
8. The final assistant reply and validated actions are returned.
9. User + assistant messages are stored; cost is recorded; summary is refreshed when the conversation exceeds the trigger.
10. The browser executes validated NourOS actions through `window.NourOS` when embedded, or previews the route otherwise.

## Live voice flow

1. `POST /api/live/token` checks prototype key, owner, Live flag, rate limit, and budget.
2. The server builds a Live system instruction from persona + D1 conversation brief (summary + recent turns).
3. It mints a one-use ephemeral token via Gemini `v1alpha/auth_tokens`, locking the model, voice, system instruction, transcriptions, and navigation tools into `bidiGenerateContentSetup`.
4. The browser connects with the token; the permanent key remains server-side.
5. Microphone PCM is captured at 16 kHz; playback is 24 kHz.
6. `interrupted=true` stops playback immediately.
7. Tool calls go to `POST /api/tools/execute` for server-side validation; the browser returns tool responses to Live and applies the validated action.
8. On `turnComplete`, the browser posts transcripts and usage deltas to `/api/live/turn`.
9. The server appends both turns to the same D1 conversation, records cost, and returns the updated budget.
10. A later text or Live session reads the same brief, so context survives beyond the Live socket.
11. The token carries a prepaid reservation that counts toward the spend caps until a Live turn is reported and reconciled.

## D1 schema

| Table | Purpose |
| --- | --- |
| `sessions` | owner hash, locale, summary, state, turn count, expiry |
| `session_messages` | user/assistant/tool messages, locale, usage, metadata |
| `action_ledger` | idempotency for chat messages, Live turns, actions |
| `rate_limits` | per-bucket counters and window start |
| `bookings` | reserved slots with unique active-slot index |
| `ops_events` | operational events and errors (30-day cleanup) |
| `cost_events` | provider, model, capability, tokens, USD micros |
| `controls` | feature flags and persona |
| `admin_audit` | admin changes and synthetic test runs |
| `knowledge_overrides` | draft admin overrides (not yet applied to retrieval) |

Migration: `migrations/0001_init.sql`. Phase 0A carryover of `25,213` USD micros is seeded into `cost_events`.

## Live token reservations

A Live token is minted only after the Worker verifies the remaining budget. The Worker then creates a `live_tokens` row with a prepaid reservation (default `$0.08 USD` for a 120-second token). Held reservations count toward both daily and cumulative caps, so a browser that connects directly and never reports usage cannot mint unlimited tokens. When a Live turn is reported, the server charges `max(actual usage, reservation)` and reconciles the reservation; if no usage is reported, the reservation stays held until the release window. This is a conservative server-side bound, not a full audio proxy: actual usage within a token is still reported by the client, so a malicious client cannot exceed the per-token reservation’s economic coverage. A server-side WebSocket proxy would be the Phase 3 option if exact per-token metering becomes necessary.

## CRM, appointments and email

The CRM workflow is implemented in D1: contacts, consents, inquiries, appointments (`bookings`), idempotency keys, ownership checks, overlap checks, reschedule/cancel, and a reconciliation endpoint for calendar failures. Google Calendar writes are gated by `google_writes_enabled`; synthetic validation created and cancelled a real no-attendee event with a unique Meet link. The Google Sheet schema remains a proposal; no production headers were written. Email jobs are queued in `email_jobs` and processed by an admin action. `EMAIL_SEND_ENABLED=false` makes processing a dry run; Resend and Gmail-draft adapters are prepared but not active.

## Cost model

- Text: input/output per-million USD rates from env.
- Live: text input, audio input, audio output per-million USD rates.
- Costs are rounded up to USD micros and recorded with a stable request id.
- `cost.budget()` returns daily and cumulative totals; `assertBudget()` blocks text and Live token issuance when either cap is reached.
- Live usage is reported after the turn because the browser owns the socket; over-cap usage can be recorded once, then subsequent calls are blocked.
- Defaults: `$1.00 USD` daily, `$7.00 USD` cumulative.

## Auth and security boundaries

- `x-prototype-key`: shared access key for the isolated prototype.
- `x-owner-token`: high-entropy browser token; only its SHA-256 hash is stored.
- `Authorization: Bearer <ADMIN_TOKEN>`: machine admin API; never sent to the browser by the local admin proxy.
- Admin UI binds to `127.0.0.1`; optional Google OAuth adds PKCE, email allowlist, and an HMAC-signed HttpOnly cookie.
- Tools are validated against generated project/chapter/section allowlists; unknown tools/IDs are rejected server-side.
- Retrieved context is treated as untrusted data in the system prompt.
- Gmail adapter exposes no send method.
- Google writes require both the admin token and `ALLOW_SYNTHETIC_WRITES=true`.

## Upstream integration notes

`origin/main` advanced to `8a08769` with production Pages deployment and revised journey/profile/site copy. `src/app/commands.js` and `src/data/projects.js` are unchanged, so the NourOS action contract is stable. A corpus rebuilt from `origin/main` still scores 83.6% top-1 / 98.2% top-3 over the 55-query benchmark. After merge, regenerate `corpus.json` and add the new `PROFESSIONAL_TAGLINE`, `PROFILE_POSITIONING`, `PROFILE_INTERSECTION`, and `PROFILE_PROOF` exports to the corpus builder.

## Phase 2 extension points

- Replace `knowledge_overrides` drafts with an approved retrieval overlay.
- Add production Google OAuth app verification and a dedicated admin identity.
- Add real browser/device voice QA and an audio regression fixture.
- Add a durable job queue or Durable Object only if session summarization/cost workflows outgrow request-bound execution.
- Add observability export (Workers Logs / Analytics Engine) if free-tier limits allow.
