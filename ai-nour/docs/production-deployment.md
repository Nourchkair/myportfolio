# Nupa (formerly AI Nour) production deployment

Status: **Nupa v1.4 is deployed publicly. Legal v1.4 and consent `2026-11-27-v1.4` are live, no beta key is required, web research is removed, the simplified “Meet Nupa.” onboarding is live, and the approved $3.00 daily / $7.00 cumulative caps are enforced. Worker `00fb071e-77f7-4192-a46e-d09b9fd796fe`; Pages `d84f8883-dce2-4c6a-a55b-10815b6f6979`. External writes, Resend and the private admin remain restricted.**

## 1. Live endpoints

| Surface | URL |
| --- | --- |
| Portfolio | https://nourchkair.com |
| Public Nupa entry | https://nourchkair.com/ |
| Worker API | https://api.nourchkair.com |
| Health | https://api.nourchkair.com/api/health |
| Local admin | http://127.0.0.1:8791 |

Nupa is enabled by default on the public portfolio. No beta key or account is required; the 18+ consent gate remains mandatory. Legacy `?ainour=beta` links continue to work.

## 2. Public access

- Nupa is publicly available in beta to visitors aged 18 and older.
- No account or beta key is required.
- The simplified “Meet Nupa.” consent records 18+, Terms and Privacy acceptance before processing. “Explore with Nupa” then shows a separate microphone-consent panel and starts a live spoken experience on the main portfolio view; the chat panel is not opened. Nupa introduces itself, asks one natural question, then dynamically chooses what to present. No navigation, project opening or presentation action is applied until the visitor has spoken. The top-nav About button now returns to the home section instead of opening the About/Me panel. “Use text chat instead” opens chat.
- Legacy beta keys and tester records remain in D1 for historical/admin purposes only; they are no longer checked for access.
- Anonymous owner credentials are server-issued; per-visitor and global API/chat/Live/tool limits, concurrent voice leases, spending caps, tool allowlists and the admin bearer-token boundary remain in force.
- Cloudflare Free edge rate limiting is active: rule **Nupa API edge rate limit**, hostname `api.nourchkair.com`, path starts with `/api/`, excluding `/api/health`; **30 requests per 10 seconds per IP**, action **Block** for 10 seconds. Cloudflare Free provides one rate limiting rule; managed WAF rules are a paid-plan feature, so application validation and the free rule provide the edge layer.

## 3. Cloudflare resources

| Resource | Value |
| --- | --- |
| Worker | `ai-nour-production` |
| Worker version | `00fb071e-77f7-4192-a46e-d09b9fd796fe` (v1.4 public beta, $3 daily cap, voice-tour onboarding) |
| Custom domain | `api.nourchkair.com` |
| D1 database | `ai-nour-production` |
| D1 ID | `a1fa8975-2a79-4b56-b96e-ecf814eeaa02` |
| D1 region | ENAM |
| Pages project | `nourchkair` |
| Latest Pages deployment | `d84f8883-dce2-4c6a-a55b-10815b6f6979` / `https://d84f8883.nourchkair.pages.dev` (source `39b29ac`) |

Development and production are isolated: local D1, local Worker, and local admin remain separate from the production D1 and Worker.

### Worker secrets

Installed in Cloudflare Workers Secrets:

`ADMIN_TOKEN`, `BACKUP_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `GOOGLE_BACKUP_FOLDER_ID`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CRM_SPREADSHEET_ID`, `GOOGLE_KNOWLEDGE_FOLDER_ID`, `GOOGLE_REFRESH_TOKEN`.

No Resend key is installed. No permanent Google, Gemini or admin credential is sent to the browser. The anonymous owner bearer token is server-issued and stored in browser `localStorage` by design; D1 stores only its hash.

## 3b. Conversational V2

- Live voice: **Sadachbia** in the source configuration; the deployed production Worker still uses **Iapetus** until the approved deployment. `LIVE_VOICE` remains the single configuration switch; presentation architecture is unchanged.
- Persona: source defaults and the production `persona_instruction` both define Nupa. The production persona is 3,986 characters, has one identity paragraph, and preserves the existing character, grounding and conversation instructions.
- Live grounding: foundational portfolio context plus `searchPortfolio`, `getProjectDossier`, `getProjectStep`, `getJourneyChapter` and `getCurrentView`.
- Visitor profile: inferred per session and persisted in D1 session state.
- Presentation controls: start, step, pause, resume and end; manual navigation cancels the presentation.
- Dynamic page context: silent `[Context update]` messages while Live is active.
- Web research: **removed**. There is no `webResearch` tool, Google Search grounding, research endpoint, configuration flag, provider method, admin control or dependency. Neither text nor voice can initiate external search.
- Scope: the system prompt keeps Nupa portfolio-focused, allows relevant business/technical reasoning, and redirects unrelated requests naturally without inventing Nour facts.
- V2 evidence: `docs/ai-nour-v2-conversational.md` and `results/v2-*`.

## 3c. Legal pages, consent and voice policy

- Production serves bilingual legal version 1.4 with paid Gemini processing, public beta, no beta-key requirement, and no retroactive paid-tier claim for earlier conversations.
- Nupa requires one combined **18+ eligibility and Terms/Privacy acceptance** before processing. There is no separate age checkbox, date-of-birth collection, identity check or age pop-up. The portfolio remains available to everyone without accepting the AI terms.
- Separate microphone consent is requested per tab. Contact and appointment workflows retain contextual consent checks.
- Existing sessions created under any prior consent version must acknowledge `2026-11-27-v1.4` before reading, chat, Live voice or tools. Enforcement applies in public mode, not only when a beta key is required.
- Live sessions default to **300 seconds** (5 minutes), with a **$0.125** reservation. The approved daily cap is **$3.00**; the cumulative cap is **$7.00**. Sadachbia is the configured source voice; production remains Iapetus until deployment. Admin can restore up to 600 seconds.
- Voice errors distinguish daily budget (local reset time), cumulative exhaustion, microphone permission, missing device, rate limit, disabled voice, provider failure, network failure and session expiry. No raw provider or financial details are shown.
- Data/retention audit: `docs/legal-data-audit.md`.

## 3d. Nupa identity release (deployed)

- Visitor-facing identity is **Nupa — Nour's Unique Portfolio Assistant**, an independent AI-powered portfolio guide operated by Nour Chkair. It is not Nour and never impersonates him.
- Live production: legal version **1.4** and consent **`2026-11-27-v1.4`**; existing sessions must re-accept.
- Public access is enabled: `BETA_ACCESS_REQUIRED=false`, `PUBLIC_ACCESS=true`; no beta key is requested.
- Worker `f5e81237-f8e1-41a1-9b7b-151225d05381` and Pages deployment `848ef7e8-13bf-4682-9c72-45abb73f2367` (source `b1de5b2`) are live.
- The live daily spending cap is **$3.00**; the cumulative cap is **$7.00**.
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

- Manage legacy beta keys (not required for public access).
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
- Live reservations, text spend reservations, and `live_unreported`/`text_unreported` settlements
- No paid observability service

## 7. Spending

Production ledger before the paid-tier verification calls:

- Cumulative: **$2.342721 USD** (read at report time)
- Today: **$1.445858 USD** (read at report time)
- Paid text test: **+$0.000717** internal estimate at the rates then configured
- Paid Live tests: **+$0.250000** from two reservations settled at the old full-reservation policy
- Current internal estimate: **$1.263273 USD today / $3.855994 cumulative** as of 2026-11-28T06:42Z (after the voice audit; includes conservative $0.125 Live reservation settlements). Cumulative remaining: **$3.144006**. Direct voice-audit API spend is outside this ledger (~$0.31 estimated).
- Held reservations: **$0** before the paid Live test
- Daily cap: **$3.00 USD** (live); cumulative cap **$7.00 USD**
- Cumulative cap: **$7.00 USD**
- Live default: **300 seconds / $0.125 reservation**; 600-second maximum remains available in admin
- Fixed monthly infrastructure: **$0**
- Gemini billing: **reportedly Paid Tier 1** under the funded Portfolio Nour project; real paid text and Live calls succeeded
- Funding reported by Nour: CA$14.05 eligible credits, CA$8.00 purchased credits, $10 USD/month Google AI Pro developer credits, automatic reload disabled

These are internal token-based estimates, not confirmed Google invoices. The Gemini API key cannot read the project, billing tier, credit balance or invoices, so those figures remain user-provided. Text requests hold a $0.02 atomic reservation while in flight. Live holds an atomic session reservation; each reported turn is charged at actual token-estimated usage, capped by the reservation remainder, and `/api/live/end` releases the hold. A session that ends with no reported usage is charged the reservation conservatively; an expired unreported reservation is settled to the unreserved remainder. The old Live code charged the full $0.125 reservation instead of reported token usage, so the ledger overstates the two paid Live tests; the token-level estimate for the first test is $0.006611, not $0.125. The ledger is intentionally left intact as a conservative audit record.

### Voice audit (investigation only, no production change)

- Report: `results/nupa-voice-audit.md`
- Sample index: `results/audio-samples/index.html`
- Prompt proposal: `results/nupa-voice-prompt-proposal.md`
- Main finding: the flat/robotic impression came primarily from the voice choice and the long scripted opening, with 3.8 Live itself less micro-expressive than 2.5 Native. Playback preserves the raw Gemini prosody.
- Implemented in source, pending approval/deploy: `Sadachbia`, a short natural opening, a structured Live prompt and the audio pipeline changes. Production still uses `Iapetus` until deployment.
- Refinement validation: `results/nupa-voice-refinement.md` / `results/audio-samples/refinement.html`.
- Direct refinement API spend is separate (~$0.10 estimated); the app ledger is unchanged at the last snapshot.

**Deployment timing:** the latest internal ledger snapshot is $1.263273 today / $3.855994 cumulative, with $3.144006 cumulative remaining; AI is available.

### Voice refinement implementation (source only, pending approval)

- Configured voice: `Sadachbia` through `LIVE_VOICE`; production remains `Iapetus` until deployment.
- Opening: removed the live/interactive/personalized capability recital; natural one-sentence intro plus one genuine question.
- Live prompt: structured into core identity/policies, conversational personality, voice delivery, portfolio knowledge, visitor context, presentation/tool use and pronunciation. Compact live grounding (~8.5k chars) with retrieval tools for details.
- Audio: AudioWorklet microphone resampler with a windowed-sinc anti-alias filter; filtered ScriptProcessor fallback; provider-rate parsing; adaptive playback lead; gain fades; AudioContext resume and device-change handling.
- Validation: `results/nupa-voice-refinement.md`, `results/nupa-voice-refinement.json`, `results/audio-samples/refinement.html`.
- No deployment, no model switch, no budget change.

**Rate review (27 November 2026):** `gemini-3.8-live` matches Google's published paid rates: $0.75 text input, $3.00 audio input, $12.00 audio output per 1M tokens. The `gemini-flash-lite-latest` alias is not documented on Google's pricing page. Google publishes $0.10/$0.40 for 2.5 Flash-Lite, $0.25/$1.50 for 3.1 Flash-Lite and $0.30/$2.50 for 3.5 Flash-Lite. The application now uses the highest current Flash-Lite rates ($0.30 input/$2.50 output) as a conservative ceiling, so the internal ledger may overstate text cost if the alias resolves to an older generation. Review these rates whenever the alias changes or a pinned model is adopted.

**Hard-limit limitation:** the application enforces reservations and caps before and during requests, but it cannot guarantee Google's final billed amount. Provider-side pricing changes, rounding, failed/abandoned requests, retries, model routing, and billing lag can produce a difference between the internal ledger and the Google invoice. The caps are a best-effort application control, not a provider-enforced hard budget.

## 8. Emergency shutdown

1. Admin → Controls → set `assistant_enabled=false`.
2. Verify https://api.nourchkair.com/api/meta reports `assistant_enabled:false`.
3. New sessions return 503 until restored.
4. Restore `assistant_enabled=true`.

This was tested in production, including recovery.

## 9. Rollback

- Current Worker version: `f5e81237-f8e1-41a1-9b7b-151225d05381` (live public access, $3 daily cap)
- Previous Nupa Worker: `78ea8cea-d0b3-4a6e-a523-29d0f386806c` (v1.4 first public release, $1 daily cap)
- Previous Nupa Worker: `07a45644-d9e4-4157-a9b4-b80439a51c6a` (v1.4 first deploy, same static release)
- Previous Nupa Worker: `f5e81237-f8e1-41a1-9b7b-151225d05381` (public access, $3 daily cap)
- Previous Nupa Worker: `28bcef6b-4260-495e-94bc-4fc7e90d203a` (private-beta mode, $3 daily cap)
- Previous Nupa Worker: `bffabd0f-d1ca-4663-a897-b42ea9e7b08c` (Nupa V3, $1 daily cap)
- Previous production Worker: `5821d4e0-ebc1-496e-b853-6d0d58dd1cc5` (Iapetus voice release)
- Previous legal/voice release: `6df5e7b6-e447-49f9-804c-5ba6ab114719`
- Previous V2 Worker: `6dfcd430-e175-4f70-842a-076516c921bb`
- Previous pre-V2 Worker: `5596ba7b-c4a9-4256-8eea-aa46dd9f4735`
- Static/legal rollback: Pages deployment `848ef7e8-13bf-4682-9c72-45abb73f2367` (source `b1de5b2`) is the last v1.3 public build. The current v1.4 Pages deployment is `d84f8883-dce2-4c6a-a55b-10815b6f6979` (source `39b29ac`); the prior dynamic-tour deployment is `ba62a481-ca9b-40c4-8e2f-20536a844c8f` (source `93b7c3b`), and the first v1.4 deployment is `b1e253eb-2490-4c14-90f6-b14dfb07fa7f` (source `c7406a7`).
- Persona rollback: the pre-release persona (3,606 chars, SHA-256 `40070f3c6118bee8b67e0a3e05c3300083da05ce150d7d0008c023066fcae160`) is saved in `ai-nour/.wrangler/nupa-release-rollback-20261127/persona-before.txt`; restore it with `PATCH /api/admin/persona`.
- D1 `0006_nupa_persona.sql` is data-only and was a no-op against the custom persona; no reverse schema migration is required.
- Daily cap: the release uses `DAILY_SPEND_CAP_USD_MICROS = "3000000"`. After deployment, PATCH `/api/admin/limits` with `dailyCapUsdMicros: 3000000` if a lower stored control exists. Cumulative cap remains $7.00.
- Safe notes: rolling back the Worker does not revert the production `persona_instruction` control; restore it separately if a full conversational rollback is intended. Full details are in `ai-nour/.wrangler/nupa-release-rollback-20261127/ROLLBACK.md`.
- Do **not** roll back to `f2841548-3f7f-46f9-8d5a-d784ef9b2f6b`; that temporary version enabled CRM writes.

```bash
cd ai-nour
npx wrangler rollback 5596ba7b-c4a9-4256-8eea-aa46dd9f4735 --config wrangler.production.toml
```

For the static site, redeploy the prior commit with `npm run deploy` from the repository root. D1 migrations are additive; do not delete production records during a rollback.

## 9b. v1.4 backward compatibility and rollback

**Backward compatibility**

- Migrations `0007` and `0008` are additive; they create `spend_reservations` and `live_session_leases` without changing or deleting existing rows.
- The previous Worker ignores the new tables, so a Worker-only rollback is schema-safe.
- Pre-existing browser-generated owner tokens remain accepted; `POST /api/owner` is the new server-issued path.
- The deployed client already sends `reservationId` on Live turns. Older clients that do not call `/api/live/end` still work; their leases expire with the Gemini token.
- Consent v1.4 requires re-acceptance. Do not roll the Worker back to v1.3 while serving the v1.4 client: the mismatch causes a consent loop. Roll back Worker and Pages together.
- Daily cap: the effective cap is `min(config, stored control)`, so the $1 config takes effect even if D1 still stores $3. A stored $3 control does not raise the cap.

**Rollback**

1. Record the new Worker version and Pages deployment ID.
2. Deploy the previous Pages build (`848ef7e8-13bf-4682-9c72-45abb73f2367`, source `b1de5b2`) or redeploy the prior static commit.
3. Roll back the Worker to `f5e81237-f8e1-41a1-9b7b-151225d05381` with `npx wrangler rollback`.
4. Keep D1 migrations `0007`/`0008`; do not drop the new tables. The old Worker ignores them.
5. Restore legal/consent v1.3 only as part of the same Worker+Pages rollback.
6. Re-run production preflight against the rolled-back release; expect the prior daily cap and v1.3 consent.

## 10. Deployment commands

```bash
# 1. D1 first (additive; 0007 adds text spend reservations, 0008 adds active voice-session leases)
cd ai-nour
npx wrangler d1 migrations apply ai-nour-production --remote --config wrangler.production.toml

# 2. Worker (requires the new tables)
npx wrangler deploy --config wrangler.production.toml

# 3. Optional persona audit (portfolio scope rules are enforced in code and do not require a stored-persona migration)
node scripts/migrate-persona-nupa.mjs

# 4. Static portfolio (legal v1.4 + consent UI)
cd ..
npm run deploy
```

## 11. Validation evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Production health/D1 | 16/16 preflight | `results/production-preflight.json` |
| Text + Live voice + navigation | 12/12 | `results/production-smoke.json` |
| Local admin → production Worker | 9/9 | `results/production-admin-connectivity.json` |
| Emergency shutdown + Live limits | updated test prepared | `results/production-safety.json` (rerun after deployment) |
| Production D1 → Google Sheet | 11/11 | `results/production-crm-sheet-sync.json` |
| Production Calendar/Meet | 13/13 | `results/production-crm-google.json` |
| Final restricted state | 8/8 | `results/production-final-state.json` |
| Legal validator (v1.1 production release) | 46/46 | `npm run validate:legal` |
| Nupa legal validator (v1.4 paid/public) | 79/79 | `npm run validate:legal` |
| Portfolio validator | 270/270 | `npm run validate` |
| Nupa unit tests | 76/76 | `ai-nour && npm test` |
| Voice refinement local Live e2e | passed | `results/nupa-voice-local-e2e.json` |
| Voice refinement interruption | passed | `results/nupa-voice-local-interruption.json` |
| Public-beta controls (local public Worker) | 23/23 | `results/public-controls-tests.json` |
| Paid-tier production text | passed | `results/paid-tier-text.json` (if retained) |
| Paid-tier production Live voice | passed | `results/paid-tier-live.json` |
| Gemini-enforced Live token reuse/expiry | 4/4 | `results/live-token-restrictions.json` |
| Cloudflare Free edge rate limit | active | `Nupa API edge rate limit`, 30 req/10s/IP, Block 10s |
| Nupa opening browser (local mock) | 22/22 | `results/nupa-v3-opening-browser.json` |
| Nupa presentation browser (local mock) | 22/22 | `results/nupa-v3-presentation-browser.json` |
| Nupa identity in text, EN/FR (local mock) | 2/2 | `results/nupa-v3-chat.json` |
| Production Nupa static/legal | 6/6 | `results/nupa-production-static.json` |
| Production public API/no-key access, $3 cap, paid text | 7/7 | `results/nupa-production-public-api.json` |
| Production AI-unavailable portfolio browsing | 4/4 | `results/nupa-production-ai-unavailable.json` |
| Cloudflare Free edge rate limit | 30x200 then 10x429 | `results/cloudflare-edge-rate-limit.json` |
| Production public preflight | 17/17 | `results/nupa-production-public-preflight.json` |
| Production opening cards and consent (previous flow) | 12/12 | `results/nupa-production-intro.json` |
| Production opening + voice-tour panel | 5/5 | `results/nupa-production-opening.json` |
| Production dynamic voice tour entry | 5/5 | `results/nupa-production-dynamic-tour.json` |
| Production Explore-from-project → home + About nav | 6/6 | `results/nupa-production-home-about.json` |
| Production model chooses dynamic direction after visitor intent | passed | `results/nupa-dynamic-tour-intent.json` |
| Public default entry and no-key conversation | 4/4 | `results/nupa-production-public-default.json` |
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

Production Nupa checks were run against `https://nourchkair.com/` and `https://api.nourchkair.com` in public mode. The browser run passed 16/17; the one failed assertion expected a highlight/cursor within a fixed observation window of a non-deterministic real-model presentation turn. The separate production visual test verified highlighting, cursor, spotlight, workflow tracing and cleanup at 6/6. Real production Live sessions with Iapetus verified English and French identity, opinion/authority disclosures, audio generation and presentation tool calls. Real-device microphone, Bluetooth and iOS testing remain manual.

## 12. Remaining manual action

**Google OAuth durability.** The current refresh token works, but Google reports `refresh_token_expires_in` of about **565,769 seconds (~6.55 days)** because the OAuth app is still External/Testing. Publishing/verification requires separate approval and OAuth-console changes; it is not part of this release.

**Graceful degradation is in place:** Nupa text, Live voice, portfolio, consent, anonymous ownership, rate limits and spending controls do **not** use the Google OAuth token. If authorization expires, only CRM/Calendar/Drive/Gmail integration endpoints fail closed with an `IntegrationError`; external writes and Resend are already disabled. No AI request, portfolio route or spending control depends on Google authorization. The admin status reports the OAuth mode and this limitation. Reauthorize with the local helper when durability is addressed; no automatic retry queue or destructive fallback is used.

The published legal URLs are set in the OAuth branding page: `https://nourchkair.com/privacy/` and `https://nourchkair.com/terms/`. Next manual action: remove unused `gmail.send`, `gmail.compose`, and `documents.readonly` scopes from Data Access before publishing/verification.

A production OAuth callback route is not implemented. Reauthorization uses the local helper and then updates the Worker secret; routine Nupa administration does not require Cloudflare access.

**Public access is enabled with server-issued anonymous ownership, per-visitor and global rate limits, concurrent voice limits, atomic spending reservations and a $1 daily / $7 cumulative approved cap. Gemini is on the reported Paid Tier 1; real text and Live calls succeeded. Actual invoices and remaining credits are not available through the API key. Nupa remains an experimental AI service: do not submit personal, sensitive, confidential or third-party information.**
