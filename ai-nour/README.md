# AI Nour — Phase 2

Isolated Phase 2 production-hardening prototype for AI Nour: a modular Cloudflare Worker, Gemini text and Live adapters, Google integrations, D1 sessions and cost controls, bilingual retrieval, a local prototype UI, and a local-only admin surface.

This is **not** the production AI Nour integration. It runs locally by default, requires an explicit prototype access key, and does not deploy or change production. The portfolio companion is feature-flagged; the default portfolio and reading view remain unchanged.

## Quick start

```bash
cd ai-nour
npm install
npm run build
npm run db:migrate:local
npm run dev
```

Open <http://127.0.0.1:8789>, enter the `PROTOTYPE_ACCESS_KEY` from the local `.dev.vars`, and start chatting.

The Worker reads `ai-nour/.dev.vars`. In the Phase 1 worktree this is a symlink to the repository-root `.dev.vars`. For a fresh checkout, create `ai-nour/.dev.vars` with mode `600` and the required keys.

### Local admin

```bash
# separate terminal, with the Worker running
npm run admin
```

Open <http://127.0.0.1:8791>. The admin server binds to `127.0.0.1` only and injects the server-side `ADMIN_TOKEN`; the token never reaches the browser. The Worker admin API also requires that token.

### Tests

```bash
npm test                 # unit tests: retrieval, cost, tools, auth, sessions, providers, Google adapters
npm run test:api         # boots a mock-provider Worker on a separate local D1 state
npm run test:crm         # synthetic D1 inquiry/appointment workflow
npm run test:crm:google  # authorized synthetic Google Calendar appointment; requires a worker with ENABLE_CRM_WRITES=true
npm run test:live-budget # verifies prepaid Live-token reservations block unreported usage
npm run test:security    # prompt-injection and allowlist checks against the running worker
npm run test:real        # real Gemini text + Live smoke test (costs a few cents)
npm run test:fr          # French text + Live smoke test
npm run test:recovery    # text → new Live session → shared context recovery
npm run retrieval        # bilingual retrieval benchmark
npm run google:synthetic # authorized synthetic Google write test; requires a worker started with ALLOW_SYNTHETIC_WRITES=true
```

The real-model scripts assume the dev Worker is running at `http://127.0.0.1:8789`. Set `PHASE1_WORKER_URL` to point elsewhere. They read credentials from `.dev.vars` and never print secrets.

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

Cloudflare bindings (`DB`, `ASSETS`) are declared in `wrangler.toml`. The local D1 database is `ai-nour-phase1-dev`.

## Architecture

```text
public/ prototype UI ──► Worker /api
                           ├─ auth: prototype key + owner token + admin token
                           ├─ sessions: D1 messages, summary, recovery
                           ├─ retrieval: 105 structured chunks, bilingual aliases
                           ├─ text provider: Gemini Flash-Lite REST adapter
                           ├─ Live provider: one-use ephemeral token, constrained config
                           ├─ tools: allowlisted NourOS navigation
                           ├─ Google adapters: Sheets, Calendar, Drive, Gmail
                           ├─ cost: per-model rates, daily + cumulative caps
                           └─ controls: feature flags and emergency shutdown
admin/ local UI ──► scripts/admin-server.mjs ──► Worker /api/admin (bearer token)
```

See `docs/architecture.md` for module boundaries and flows, `docs/visual-prototypes.md` for the integrated companion screenshots, `docs/crm-schema.md` for the proposed CRM schema, `docs/oauth-production-readiness.md` for the OAuth plan, and `docs/email-recommendation.md` for the Resend/Gmail recommendation.

## API surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | public | Worker/D1 health |
| `GET /api/meta` | prototype key | models, corpus, tool list, public flags |
| `POST /api/session` | prototype + owner | create a session |
| `GET /api/session/:id` | prototype + owner | restore messages and summary |
| `POST /api/chat` | prototype + owner | text conversation and tool loop |
| `POST /api/live/token` | prototype + owner | mint a one-use Live token and constrained config |
| `POST /api/live/turn` | prototype + owner | persist Live transcript/usage into shared context |
| `POST /api/tools/execute` | prototype + owner | validate and execute an allowlisted navigation tool |
| `GET /api/knowledge/search` | prototype key | inspect retrieval results |
| `GET /api/admin/*` | admin bearer | status, flags, persona, cost, sessions, knowledge, integrations, CRM, audit |

## Safety and cost

- Permanent Gemini key and Google refresh token stay server-side.
- The browser receives only one-use Live tokens.
- Proposed Google writes are off by default (`google_writes_enabled=false`); synthetic tests require both the admin token and `ALLOW_SYNTHETIC_WRITES=true`.
- Gmail adapter has no send method; it creates drafts only.
- Daily cap: `$1.00 USD`; cumulative cap: `$7.00 USD` (about `$9.95 CAD`), enforced from D1 cost events.
- Phase 0A carryover is seeded into the cumulative ledger.
- No billing, paid services, R2, or production deployment is activated.

## Google admin OAuth evaluation

`src/admin/google-oauth.js` implements state + PKCE, code exchange, userinfo email verification, and HMAC-signed HttpOnly sessions. The local admin server can use it when all of the following are set:

```text
ADMIN_GOOGLE_AUTH=true
ADMIN_EMAIL=<authorized admin email>
ADMIN_GOOGLE_REDIRECT_URI=http://127.0.0.1:8791/auth/google/callback
PHASE1_ADMIN_SESSION_SECRET=<32-byte hex>
```

The localhost redirect URI has been added to the existing AI Nour Development client and the local admin Google login was verified end to end. The OAuth app remains in Testing; no publish or verification was submitted. See `docs/oauth-production-readiness.md`.

## Portfolio companion

The companion is enabled only with `?ainour=dev` or `?ainour=1` on the portfolio:

```text
http://localhost:8771/?ainour=dev&ainour-api=http://127.0.0.1:8792
```

It mounts a native-looking toolbar presence, compact/expanded conversation, voice sheet, portfolio-context awareness, and server-validated navigation through `window.NourOS`. Manual navigation always takes priority. The full code is in `src/ai-nour/` and is copied into the static build only when the portfolio is built; it is not active by default.

## Known limitations

- Cloudflare Access is deferred; the Worker admin API is token-protected but still publicly routable if deployed. The local admin is protected by Google OAuth + a signed HttpOnly session cookie.
- The admin model configuration is read-only in Phase 2; model changes remain environment-managed.
- Gmail automated sending is intentionally unimplemented; draft + human send is the current policy path.
- Google OAuth may still be in Testing mode; refresh tokens can expire after 7 days.
- CRM headers remain unapplied pending approval.
- Real device microphone behaviour and Safari/iOS audio are not validated by the automated tests.
- The visual interface is a temporary QA surface, not a production design. See `docs/visual-prototypes.md`.
- D1 is ENAM/ORD, not Canada.
