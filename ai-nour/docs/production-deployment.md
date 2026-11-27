# Nupa (formerly AI Nour) production private beta

Status: **Nupa V3 is deployed to the production private beta. Legal version 1.2 is published, consent `2026-11-27-v1.2` is enforced, the production persona is Nupa, and the daily testing cap is $3.00. Public/unrestricted AI access remains disabled.**

## 1. Live endpoints

| Surface | URL |
| --- | --- |
| Portfolio | https://nourchkair.com |
| Private-beta entry | https://nourchkair.com/?ainour=beta |
| Worker API | https://api.nourchkair.com |
| Health | https://api.nourchkair.com/api/health |
| Local admin | http://127.0.0.1:8791 |

The query parameter only reveals the companion UI. It is **not** authentication. Every API request must present a valid, active beta key that is checked against a SHA-256 hash in D1.

## 2. Beta access

- Each tester gets a unique key created in **Admin → Private beta**.
- Only the key hash and a short prefix are stored in production D1.
- The full key is shown once at creation.
- Revocation is immediate and does not affect other testers.
- Your primary acceptance key is stored locally in `ai-nour/.private-beta-keys.json` (mode `600`, gitignored). Do not commit or paste it publicly.
- The admin can create and revoke keys without opening Cloudflare.

Production currently has one active tester (Nour) and two revoked validation keys.

## 3. Cloudflare resources

| Resource | Value |
| --- | --- |
| Worker | `ai-nour-production` |
| Worker version | `28bcef6b-4260-495e-94bc-4fc7e90d203a` (Nupa V3, $3 daily testing cap) |
| Custom domain | `api.nourchkair.com` |
| D1 database | `ai-nour-production` |
| D1 ID | `a1fa8975-2a79-4b56-b96e-ecf814eeaa02` |
| D1 region | ENAM |
| Pages project | `nourchkair` |
| Latest Pages deployment | `https://b17bc76a.nourchkair.pages.dev` |

Development and production are isolated: local D1, local Worker, and local admin remain separate from the production D1 and Worker.

### Worker secrets

Installed in Cloudflare Workers Secrets:

`ADMIN_TOKEN`, `BACKUP_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `GOOGLE_BACKUP_FOLDER_ID`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CRM_SPREADSHEET_ID`, `GOOGLE_KNOWLEDGE_FOLDER_ID`, `GOOGLE_REFRESH_TOKEN`.

No Resend key is installed. No permanent Google, Gemini, owner, or admin credential is sent to the browser.

## 3b. Conversational V2

- Live voice: **Iapetus** (production Worker updated and verified in `/api/meta`).
- Persona: source defaults and the production `persona_instruction` both define Nupa. The production persona is 3,986 characters, has one identity paragraph, and preserves the existing character, grounding and conversation instructions.
- Live grounding: foundational portfolio context plus `searchPortfolio`, `getProjectDossier`, `getProjectStep`, `getJourneyChapter` and `getCurrentView`.
- Visitor profile: inferred per session and persisted in D1 session state.
- Presentation controls: start, step, pause, resume and end; manual navigation cancels the presentation.
- Dynamic page context: silent `[Context update]` messages while Live is active.
- Web research: implemented with Gemini Google Search grounding, but **disabled** (`WEB_RESEARCH_ENABLED=false`) because the current free key returns 429 for that capability.
- V2 evidence: `docs/ai-nour-v2-conversational.md` and `results/v2-*`.

## 3c. Legal pages, consent and voice policy

- Production serves bilingual Privacy Policy and Terms of Use version 1.2 at `https://nourchkair.com/privacy/` and `https://nourchkair.com/terms/`.
- Nupa requires one combined **18+ eligibility and Terms/Privacy acceptance** before processing. There is no separate age checkbox, date-of-birth collection, identity check or age pop-up. The portfolio remains available to everyone without accepting the AI terms.
- Separate microphone consent is requested per tab. Contact and appointment workflows retain contextual consent checks.
- Existing sessions created under the prior consent version must acknowledge `2026-11-27-v1.2` before reading, chat, Live voice or tools.
- Live sessions default to **300 seconds** (5 minutes), with a **$0.125** reservation. The $1 daily and $7 cumulative caps are unchanged. Iapetus is the voice. Admin can restore up to 600 seconds.
- Voice errors distinguish daily budget (local reset time), cumulative exhaustion, microphone permission, missing device, rate limit, disabled voice, provider failure, network failure and session expiry. No raw provider or financial details are shown.
- Data/retention audit: `docs/legal-data-audit.md`.

## 3d. Nupa identity release (deployed)

- Visitor-facing identity is **Nupa — Nour's Unique Portfolio Assistant**, an independent AI-powered portfolio guide operated by Nour Chkair. It is not Nour and never impersonates him.
- Legal version **1.2** and consent **`2026-11-27-v1.2`** are live. Existing v1.1 sessions must re-accept before reading, chat, Live voice or tools.
- Worker `28bcef6b-4260-495e-94bc-4fc7e90d203a` and Pages deployment `b17bc76a-8b7e-4860-9534-8e0d94d3f678` (source `2a835a3`) are live.
- The daily spending cap was raised to **$3.00** for production acceptance testing; the cumulative cap remains **$7.00**.
- D1 `0006_nupa_persona.sql` was applied; it was a no-op against the custom persona. The reviewed persona migration set the production instruction to 3,986 characters.
- Internal identifiers are intentionally unchanged: `ai-nour/`, `ainour:*`, `/api/*`, Worker/D1 names, environment variables, secrets, OAuth clients, Drive folder names and the `ainour_beta_` key prefix.

## 4. Administration

The production-connected admin is local-only:

```bash
cd ai-nour
npm run admin:production
```

Open `http://127.0.0.1:8791` and sign in with the allowlisted Google account. The server binds to `127.0.0.1`, uses a signed HttpOnly session, and proxies to `https://api.nourchkair.com` with the production admin bearer token held in `ai-nour/.dev.vars.production` (mode `600`, gitignored).

Routine operations available without Cloudflare:

- Create/revoke beta keys.
- Enable/disable assistant, text, Live, prototype, and Google writes.
- Lower daily/cumulative caps and change Live duration.
- Edit personality and publish knowledge overrides.
- Inspect conversations, CRM, email queue, audit, cost, and ops events.
- Run the idempotent D1 → Google Sheet sync.

## 5. External writes and email

- `google_writes_enabled=false`
- `ENABLE_CRM_WRITES=false`
- `EMAIL_SEND_ENABLED=false`
- `CALENDAR_INVITES_ENABLED=true` (only takes effect if Google writes and CRM writes are enabled)
- Resend remains disabled and is not required for beta.

CRM inquiry/appointment creation currently returns **403** by design. Calendar/Meet and consent-gated invitations were validated with synthetic data while writes were temporarily enabled, then external writes were restored to off.

## 6. Monitoring

- `GET https://api.nourchkair.com/api/health`
- Admin **Overview**, **Usage & cost**, **CRM**, **Audit**
- D1 `ops_events`, `cost_events`, `admin_audit`
- Live reservations and `live_unreported` settlements
- No paid observability service

## 7. Spending

Production ledger at the final V2 check:

- Cumulative: **$2.089523 USD**
- Today: **$1.192660 USD**
- Held reservations: **$0**
- Daily cap: **$3.00 USD** (production acceptance testing; cumulative cap unchanged)
- Cumulative cap: **$7.00 USD (~$9.95 CAD)**
- Live default: **300 seconds / $0.125 reservation**; 600-second maximum remains available in admin
- Fixed monthly infrastructure: **$0**
- Gemini billing: **Free tier, no active Cloud Billing** (verified 27 November 2026); public AI remains disabled

The production ledger includes prior evaluation carryover. The $10 CAD budget remains intact.

## 8. Emergency shutdown

1. Admin → Controls → set `assistant_enabled=false`.
2. Verify https://api.nourchkair.com/api/meta reports `assistant_enabled:false`.
3. New sessions return 503 until restored.
4. Restore `assistant_enabled=true`.

This was tested in production, including recovery.

## 9. Rollback

- Current Worker version: `28bcef6b-4260-495e-94bc-4fc7e90d203a` (Nupa V3, $3 daily cap)
- Previous Nupa Worker: `bffabd0f-d1ca-4663-a897-b42ea9e7b08c` (Nupa V3, $1 daily cap)
- Previous production Worker: `5821d4e0-ebc1-496e-b853-6d0d58dd1cc5` (Iapetus voice release)
- Previous legal/voice release: `6df5e7b6-e447-49f9-804c-5ba6ab114719`
- Previous V2 Worker: `6dfcd430-e175-4f70-842a-076516c921bb`
- Previous pre-V2 Worker: `5596ba7b-c4a9-4256-8eea-aa46dd9f4735`
- Static/legal rollback: Pages deployment `d3dd93bb-2bf5-4c60-a6ff-87792958a27c` (source `868b606`) or redeploy that commit.
- Persona rollback: the pre-release persona (3,606 chars, SHA-256 `40070f3c6118bee8b67e0a3e05c3300083da05ce150d7d0008c023066fcae160`) is saved in `ai-nour/.wrangler/nupa-release-rollback-20261127/persona-before.txt`; restore it with `PATCH /api/admin/persona`.
- D1 `0006_nupa_persona.sql` is data-only and was a no-op against the custom persona; no reverse schema migration is required.
- Daily cap rollback: restore `DAILY_SPEND_CAP_USD_MICROS = "1000000"` in `wrangler.production.toml`, redeploy the Worker, and PATCH `/api/admin/limits` with `dailyCapUsdMicros: 1000000` if a stored control exists. Cumulative cap remains $7.00.
- Safe notes: rolling back the Worker does not revert the production `persona_instruction` control; restore it separately if a full conversational rollback is intended. Full details are in `ai-nour/.wrangler/nupa-release-rollback-20261127/ROLLBACK.md`.
- Do **not** roll back to `f2841548-3f7f-46f9-8d5a-d784ef9b2f6b`; that temporary version enabled CRM writes.

```bash
cd ai-nour
npx wrangler rollback 5596ba7b-c4a9-4256-8eea-aa46dd9f4735 --config wrangler.production.toml
```

For the static site, redeploy the prior commit with `npm run deploy` from the repository root. D1 migrations are additive; do not delete production records during a rollback.

## 10. Deployment commands

```bash
# Worker
cd ai-nour
npx wrangler deploy --config wrangler.production.toml

# D1 (additive; 0006 clears only the untouched legacy persona seed)
npx wrangler d1 migrations apply ai-nour-production --remote --config wrangler.production.toml

# Stored persona override (dry run, then --apply after confirming the diff)
node scripts/migrate-persona-nupa.mjs
node scripts/migrate-persona-nupa.mjs --apply

# Static portfolio
cd ..
npm run deploy
```

## 11. Validation evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Production health/D1 | 16/16 preflight | `results/production-preflight.json` |
| Text + Live voice + navigation | 12/12 | `results/production-smoke.json` |
| Beta key revocation | 4/4 | `results/production-revocation.json` |
| Local admin → production Worker | 9/9 | `results/production-admin-connectivity.json` |
| Emergency shutdown + Live limits | 10/10 | `results/production-safety.json` |
| Production D1 → Google Sheet | 11/11 | `results/production-crm-sheet-sync.json` |
| Production Calendar/Meet | 13/13 | `results/production-crm-google.json` |
| Final restricted state | 8/8 | `results/production-final-state.json` |
| Legal validator (v1.1 production release) | 46/46 | `npm run validate:legal` |
| Nupa legal validator | 64/64 | `npm run validate:legal` |
| Nupa opening browser (local mock) | 17/17 | `results/nupa-v3-opening-browser.json` |
| Nupa presentation browser (local mock) | 22/22 | `results/nupa-v3-presentation-browser.json` |
| Nupa identity in text, EN/FR (local mock) | 2/2 | `results/nupa-v3-chat.json` |
| Production Nupa static/legal | 6/6 | `results/nupa-production-static.json` |
| Production opening cards and centered consent modal | 10/10 | `results/nupa-production-intro.json` |
| Production Nupa API/identity | 21/21 | `results/nupa-production-api.json` |
| Production Nupa browser | 16/17 | `results/nupa-production-browser.json` |
| Production Nupa visual layer | 6/6 | `results/nupa-production-visual.json` |
| Production admin startup | 1/1 | `results/nupa-production-admin.json` |
| Production Live voice identity/authority | 6/6 | `results/nupa-production-live-verification.json` |
| Production Live voice presentation tools | passed | `results/nupa-production-live.json` |
| Consolidated production evidence | see record | `results/nupa-production-validation.json` |
| Consent integration | 12/12 | `results/consent-tests.json` |
| Live budget at 5 minutes | 9/9 | `results/live-budget-tests.json` |
| Secret scan (current tree) | 7 credential patterns, 0 hits | `results/nupa-validation.json` |

Production Nupa checks were run against `https://nourchkair.com` and `https://api.nourchkair.com` with the primary beta key. The browser run passed 16/17; the one failed assertion expected a highlight/cursor within a fixed observation window of a non-deterministic real-model presentation turn. The separate production visual test verified highlighting, cursor, spotlight, workflow tracing and cleanup at 6/6. Real production Live sessions with Iapetus verified English and French identity, opinion/authority disclosures, audio generation and presentation tool calls. Real-device microphone, Bluetooth and iOS testing remain manual.

## 12. Remaining manual action

**Google OAuth durability.** The current refresh token works, but Google reports `refresh_token_expires_in` of about **565,769 seconds (~6.55 days)** because the OAuth app is still External/Testing. Publish and verify the app out of Testing, then reauthorize once for a durable refresh token. Until then, the production Google integrations will stop when that token expires. The published legal URLs are now set in the OAuth branding page: `https://nourchkair.com/privacy/` and `https://nourchkair.com/terms/`. Next manual action: remove unused `gmail.send`, `gmail.compose`, and `documents.readonly` scopes from Data Access before publishing/verification.

A production OAuth callback route is not implemented. Reauthorization uses the local helper and then updates the Worker secret; routine Nupa administration does not require Cloudflare access.

**Do not enable unrestricted public access until Nour completes product acceptance and explicitly approves the public launch. The Gemini project is on the free tier; do not submit personal/confidential information and do not enable public AI until the paid-tier/DPA decision is approved.**
