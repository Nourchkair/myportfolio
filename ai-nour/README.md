# Nupa (formerly AI Nour) — production private beta

Nupa is deployed in restricted private-beta mode: a Cloudflare Worker at `api.nourchkair.com`, an isolated production D1 database, Gemini Flash-Lite and Gemini 3.8 Live adapters, Google Workspace integrations, bilingual retrieval, a feature-flagged portfolio companion, and a local private admin dashboard.

The public portfolio is live at `https://nourchkair.com`. The AI companion mounts only through the private-beta entry, and every API request requires an individually revocable beta key. Unrestricted public access remains disabled.

## Quick start

```bash
cd ai-nour
npm install
npm run build
npm run db:migrate:local
npm run dev
```

Open <http://127.0.0.1:8789>, enter the `PROTOTYPE_ACCESS_KEY` from the local `.dev.vars`, and start chatting.

The Worker reads `ai-nour/.dev.vars`. In this worktree it points at the repository-root `.dev.vars`; keep it mode `600` and never commit it.

### Local companion

```text
http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8792
```

Mock Worker key: `phase2-test-key`. Real Worker: `ainour-api=http://127.0.0.1:8789` and the key from `.dev.vars`.

### Production private beta

```text
https://nourchkair.com/?ainour=beta
```

The query parameter only reveals the companion. The server accepts only an active beta key created in **Admin → Private beta**. Keys are hashed in D1 and revocable individually.

### Admin

```bash
# local admin connected to the production Worker
npm run admin:production

# local development admin
npm run admin
```

Open <http://127.0.0.1:8791> using the allowlisted Google account. The admin server binds to `127.0.0.1`; the Worker bearer token never reaches the browser. The production admin token and Worker URL live in `ai-nour/.dev.vars.production` (mode `600`, gitignored).

## Tests

```bash
npm test                 # unit: retrieval, cost, tools, auth, sessions, providers, Google adapters, email
npm run test:api         # mock-provider API Worker on a separate D1 state
npm run test:crm         # synthetic D1 inquiry/appointment workflow
npm run test:lifecycle   # full inquiry → consent → calendar → email → reminder → reschedule → cancel
npm run test:admin-auth  # admin session, logout, reauth, revocation, CSRF and security headers
npm run test:live-budget # prepaid Live reservation and cap bypass checks
npm run test:security    # prompt-injection/allowlist checks against the running Worker
npm run retrieval        # bilingual retrieval benchmark
npm run test:real        # real Gemini text + Live smoke test (costs a few cents)
npm run test:fr          # French text + Live smoke test
npm run test:recovery    # text → new Live session → shared context recovery
npm run test:crm:google  # authorized synthetic Google Calendar appointment and consenting attendee
npm run apply:crm-schema # idempotent live Sheet header apply
npm run test:crm:sheet-live  # live Sheet write/read round-trip with cleanup
npm run test:crm:sheet-sync  # live D1 → Sheet sync with cleanup
npm run test:live-budget    # reservation, duration, Iapetus and knowledge-tool config
npm run test:security      # prompt-injection, tool allowlist and secret-leak checks
node scripts/conversation-quality.mjs  # 13 multi-turn conversational scenarios
npm run google:synthetic # authorized synthetic Google write test
```

The lifecycle test uses mock email delivery plus a real synthetic Google Calendar event with a unique Meet link and one consenting `@example.invalid` attendee; it cancels the event. No real email is sent. Real-model scripts require the Worker at `http://127.0.0.1:8789` and credentials from `.dev.vars`.

## Required local keys

```text
PROTOTYPE_ACCESS_KEY
ADMIN_TOKEN
PHASE1_ADMIN_SESSION_SECRET
GEMINI_API_KEY
GEMINI_TEXT_MODEL
GEMINI_LIVE_MODEL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_CRM_SPREADSHEET_ID
GOOGLE_CALENDAR_ID
GOOGLE_KNOWLEDGE_FOLDER_ID
GOOGLE_BACKUP_FOLDER_ID
BACKUP_ENCRYPTION_KEY
```

Resend production secrets/configuration are not required until the domain/webhook is approved:

```text
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
EMAIL_SEND_ENABLED=true
EMAIL_INTERNAL_TO
```

## Architecture

```text
public/ prototype UI ──► Worker /api
                           ├─ auth: prototype key + owner token + admin token
                           ├─ sessions: D1 messages, summary, recovery
                           ├─ retrieval: 107 structured chunks, bilingual aliases
                           ├─ text: Gemini Flash-Lite
                           ├─ Live: one-use token, configurable 600s lifetime, prepaid reservation
                           ├─ tools: allowlisted NourOS navigation
                           ├─ Google: Sheets, Calendar, Drive, Gmail drafts
                           ├─ CRM: contacts, consent, inquiries, bookings, idempotency
                           ├─ email: D1 queue, Resend/mock/Gmail-draft, retries, webhooks
                           ├─ cost: daily + cumulative caps, Live settlement
                           └─ controls: flags, persona, emergency shutdown
admin/ private UI ──► scripts/admin-server.mjs ──► Worker /api/admin (bearer token)
```

## API surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | public | Worker/D1 health |
| `GET /api/meta` | prototype key | models, corpus, tools, public flags |
| `POST /api/session` | prototype + owner | create a session |
| `GET /api/session/:id` | prototype + owner | restore messages/summary |
| `POST /api/chat` | prototype + owner | text conversation and tool loop |
| `POST /api/live/token` | prototype + owner | one-use Live token + reservation |
| `POST /api/live/turn` | prototype + owner | persist transcript/usage |
| `POST /api/tools/execute` | prototype + owner | validate/execute navigation |
| `POST /api/crm/inquiries` | prototype + owner | inquiry + consent |
| `POST /api/crm/availability` | prototype + owner | D1 + Calendar free/busy |
| `POST /api/crm/appointments` | prototype + owner | idempotent booking |
| `POST /api/crm/appointments/:id/reschedule` | prototype + owner | reschedule |
| `POST /api/crm/appointments/:id/cancel` | prototype + owner | cancel |
| `POST /api/crm/appointments/:id/reconcile` | prototype + owner | recover calendar failure |
| `POST /api/webhooks/resend` | Svix signature | delivery/bounce/complaint events |
| `GET /api/admin/*` | admin bearer | status, flags, cost, CRM, email, audit |
| `POST /api/admin/crm/sync` | admin bearer | idempotent D1 → Google Sheet sync |
| `POST /api/admin/email/:id/retry` | admin bearer | requeue failed email |
| `POST /api/admin/email/reminders` | admin bearer | queue due reminders |

## Safety and cost

- Permanent Gemini key, Google refresh token, admin token, and Resend key stay server-side.
- Production beta keys are SHA-256 hashed in D1; the full key is shown once at creation and can be revoked immediately.
- The public portfolio does not mount Nupa; the beta entry and server-side key check are both required.
- Live tokens are one-use, use a configurable provider-enforced expiry (default 300 seconds; 600-second maximum), use the **Iapetus** voice, carry a duration-scaled prepaid reservation (default $0.125 at 300s; $0.25 at 600s), and are capped at 12/day. Expired holds are charged as `live_unreported`.
- Daily cap: `$1.00 USD`; cumulative cap: `$7.00 USD` (~$9.95 CAD), measured from D1 cost events plus held reservations.
- Google writes are off by default and require an admin flag. With writes enabled, Calendar invitations are consent-gated; synthetic tests use one `@example.invalid` attendee and no real visitor.
- Gmail adapter has no send method; it creates drafts only.
- Resend is prepared but `EMAIL_SEND_ENABLED=false` by default; local processing is dry-run.
- No R2, paid auth, or paid database is activated. Production deployment is restricted to the private beta.
- CRM headers are applied to the live Sheet. Production D1→Sheet sync is manual and idempotent; automatic per-event sync is not enabled.

## Documentation

- `docs/visual-prototypes.md` — six-state visual approval package.
- `docs/real-device-testing.md` — Chrome/Safari/iOS/Bluetooth/French human checklist.
- `docs/crm-schema.md` — proposed CRM tables, field purposes, required flags.
- `docs/email-recommendation.md` — verified Resend limits, DNS, credentials, retry/delivery design.
- `docs/oauth-production-readiness.md` — production OAuth clients, scopes, redirects, verification, MCP policy.
- `docs/admin-security.md` — admin authentication, authorization, logout/revocation, tests.
- `docs/live-spend-analysis.md` — Live exposure, abandoned connections, proxy comparison.
- `docs/architecture.md` — module map and data flows.
- `docs/production-deployment.md` — production URLs, resources, admin, shutdown, rollback, and validation.
- `../docs/ai-nour-v2-conversational.md` — Nupa V2 personality, grounding, visitor intelligence, presentations and quality results.
- `../docs/ai-nour-v3-presentation.md` — Nupa V3 target registry, highlights, cursor, workflow tracing, presentation orchestration, tests and limitations.
- `../privacy/index.html` and `../terms/index.html` — bilingual legal pages (version 1.2, 18+ for Nupa; published 27 November 2026).
- `../docs/legal-data-audit.md` — data, retention, deletion, admin, third-party and Gemini claim audit.
- `../docs/ai-nour-phase4.md` — private-beta acceptance, launch checklist, and decisions.

## Stored persona migration

Source defaults now define Nupa, but the production D1 `persona_instruction` override still holds the former AI Nour identity. The migration is deliberately separate from the Worker deploy:

```bash
node scripts/migrate-persona-nupa.mjs --self-test  # migration logic only
node scripts/migrate-persona-nupa.mjs              # dry run against production
node scripts/migrate-persona-nupa.mjs --apply      # only after explicit approval
```

The script replaces only the legacy identity paragraph and related identity phrases, preserves unrelated custom instructions, and is safe to re-run. Technical identifiers such as the `ai-nour/` directory, `ainour:*` browser keys, `/api/*` routes, Worker/D1 names, environment variables, OAuth clients, Drive folders and the beta-key prefix are intentionally unchanged.

## Known limitations

- Visual approval and real-device microphone/Bluetooth/iOS testing remain pending.
- OAuth production publishing/verification is pending; the current Testing-mode refresh token expires in about 6.5 days. No production OAuth callback route is implemented; reauthorization uses the local helper.
- Resend DNS/DKIM/DMARC and a real test send are not configured.
- Google Workspace MCP migration is a post-1-February-2027 requirement if direct REST agent access is disallowed.
- CRM Sheet sync is manual; scheduled per-event sync is not enabled.
- Cloudflare Access is not introduced; production admin remains local on `127.0.0.1:8791`.
- Production D1 is ENAM; the historical third-party key remains in Git history without rewriting.
