# AI Nour — Phase 0A harnesses

Reproducible validation tools for the AI Nour feasibility phase. Everything here is development-only: no production deployment, no real email sends, no attendees, no billing activation.

## Safety invariants

- The permanent Gemini key and Google refresh token live only in the repository root `.dev.vars` (ignored, mode `600`).
- The browser harness mints one-use ephemeral Live tokens; the permanent key never reaches the browser.
- Google tests create only synthetic records, use `sendUpdates=none`, invite no attendees, and delete every test object.
- Gmail tests create, read, and delete a draft. No send call is made.
- Cloudflare resources are dev-only: `ai-nour-phase0a-dev`, D1 `ai-nour-phase0a`.
- Do not run `crm-setup.mjs --apply` until the CRM schema is approved.
- Do not run `oauth-server.mjs` unless explicitly authorized to replace the refresh token.

## Setup

Requirements: Node 20+, npm, and macOS `say` + `ffmpeg` for synthetic audio.

```bash
# from the repository root
test -f .dev.vars && chmod 600 .dev.vars
cd tools/phase0a
npm install
./prepare-audio.sh
```

Expected `.dev.vars` keys (values are never printed by these tools):

```text
GOOGLE_CLOUD_PROJECT_ID
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_REDIRECT_URI
GOOGLE_CRM_SPREADSHEET_ID
GOOGLE_CALENDAR_ID
GOOGLE_KNOWLEDGE_FOLDER_ID
GOOGLE_BACKUP_FOLDER_ID
GEMINI_API_KEY
GEMINI_LIVE_MODEL
GEMINI_TEXT_MODEL
BACKUP_ENCRYPTION_KEY
PHASE0A_ADMIN_TOKEN
```

## Harnesses

| Command | What it does | Cost / side effects |
| --- | --- | --- |
| `node google-suite.mjs` | Token refresh, Sheets synthetic CRUD, Calendar free/busy + Meet + reschedule/cancel + overlap, Drive text and encrypted backup round-trip, Gmail draft lifecycle, Workspace MCP tool catalog. | Free; all synthetic objects deleted. |
| `node crm-setup.mjs` | Checks the six CRM tabs against `crm-schema.json`. Read-only unless `--apply`. | Free; no writes by default. |
| `node crm-setup.mjs --apply` | Writes headers only to empty approved tabs. | Requires approval. |
| `node live-suite.mjs` | English/French Live speech-to-speech, function calling, token usage, ephemeral token. | Paid Gemini usage; synthetic audio. |
| `node live-barge.mjs` | Synthetic interruption/barge-in and `interrupted=true`. | Paid Gemini usage. |
| `node live-context.mjs` | Shared text + voice context. | Paid Gemini usage. |
| `node live-resume.mjs` | Session-resumption handle and restoration attempt. | Paid Gemini usage. |
| `node security-checks.mjs` | Tool allowlist, prompt injection, secret scan, Flash-Lite canary tests. | Very small text-model cost. |
| `node worker-tests.mjs` | Remote Worker: health, D1, owner sessions, concurrent booking, cancel ownership, idempotency, rate limit, shutdown, spend cap. | Free Worker/D1 requests. |
| `node browser-live/server.mjs` | Localhost microphone UI at `http://localhost:8790` with ephemeral Live tokens. | Paid only when a session is started. |
| `node configure-admin.mjs` | Creates `PHASE0A_ADMIN_TOKEN` if absent and uploads it to the dev Worker as a secret. | Dev-only. |
| `node retrieval-eval2.mjs` | Structured retrieval benchmark over the portfolio data. | Free, local. |

Deploy the dev Worker only:

```bash
npx wrangler deploy --config wrangler.full.toml
```

The config includes the `*/5 * * * *` cron. Cloudflare may take up to 15 minutes to propagate a new schedule.

## Browser microphone test

```bash
node browser-live/server.mjs
```

Open `http://localhost:8790`, click **Start microphone session**, and allow microphone access. The page imports the Gemini SDK from `esm.sh`; it needs network access. The server binds to `127.0.0.1` only and never logs the token.

Suggested script:

1. “Hi, tell me briefly about Nour’s work and Safiy.”
2. “Bonjour, parle-moi du projet Safiy.”
3. Interrupt with “Wait, tell me about Dispatch instead.”
4. “Which project did I mention?”

## Evidence

Results are in `results/`:

- `google-suite.json` — 30/30 Google checks passed.
- `worker-tests.json` — 22/22 remote Worker checks passed.
- `security-checks.json` — 5/5 allowlist, 6/6 prompt injection, secret scan clean.
- `retrieval-results-final.json`, `retrieval-results-repo.json` — 91 chunks; 35 queries; 77.1% top-1 / 85.7% top-3.
- `semantic-results.json` — local multilingual MiniLM baseline: 62.5% top-1 / 80% top-3 over 40 queries.
- `live-suite.json`, `live-barge.json`, `live-context.json`, `live-resume.json` — Live measurements.
- `cron-evidence.json` — two observed remote ticks.
- `access-blocker.json` — Cloudflare Access status and approval gate.
- `cost-summary.json` — measured Gemini usage and list-price estimate.
- `crm-schema-check.json` — CRM header readiness.

## Known blockers

- Cloudflare Access Free requires a card on file and overage authorization even at `$0`; activation needs explicit approval. See `access-setup.md`.
- Google Workspace now requires AI agents to use MCP/CLI for Workspace data from 1 Feb 2027. The Gmail MCP server has no send tool, so production email should be human-sent drafts unless Google confirms another path.
- Google OAuth may still be in Testing mode; refresh tokens can expire after 7 days. Publishing/verification is unresolved.
- Browser microphone and real barge-in need the local harness above; synthetic speech does not prove device UX.
- D1 is in Eastern North America (ENAM/ORD), not Canada. Accepted provisionally.
