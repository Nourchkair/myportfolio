# AI Nour production private beta

Status: **production backend deployed and restricted to individually revocable beta keys. Legal pages are published with the 27 November 2026 release. Public/unrestricted AI access remains disabled.**

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
| Worker version | `6df5e7b6-e447-49f9-804c-5ba6ab114719` (27 November 2026 legal/voice release) |
| Custom domain | `api.nourchkair.com` |
| D1 database | `ai-nour-production` |
| D1 ID | `a1fa8975-2a79-4b56-b96e-ecf814eeaa02` |
| D1 region | ENAM |
| Pages project | `nourchkair` |
| Latest Pages deployment | `https://d3dd93bb.nourchkair.pages.dev` |

Development and production are isolated: local D1, local Worker, and local admin remain separate from the production D1 and Worker.

### Worker secrets

Installed in Cloudflare Workers Secrets:

`ADMIN_TOKEN`, `BACKUP_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `GOOGLE_BACKUP_FOLDER_ID`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CRM_SPREADSHEET_ID`, `GOOGLE_KNOWLEDGE_FOLDER_ID`, `GOOGLE_REFRESH_TOKEN`.

No Resend key is installed. No permanent Google, Gemini, owner, or admin credential is sent to the browser.

## 3b. Conversational V2

- Live voice: **Schedar** (production Worker and control updated).
- Persona: production `persona_instruction` updated to the V2 character/grounding prompt.
- Live grounding: foundational portfolio context plus `searchPortfolio`, `getProjectDossier`, `getProjectStep`, `getJourneyChapter` and `getCurrentView`.
- Visitor profile: inferred per session and persisted in D1 session state.
- Presentation controls: start, step, pause, resume and end; manual navigation cancels the presentation.
- Dynamic page context: silent `[Context update]` messages while Live is active.
- Web research: implemented with Gemini Google Search grounding, but **disabled** (`WEB_RESEARCH_ENABLED=false`) because the current free key returns 429 for that capability.
- V2 evidence: `docs/ai-nour-v2-conversational.md` and `results/v2-*`.

## 3c. Legal pages, consent and voice policy

- Bilingual Privacy Policy and Terms of Use are published at `https://nourchkair.com/privacy/` and `https://nourchkair.com/terms/` (version 1.1, effective 27 November 2026).
- AI Nour requires one combined **18+ eligibility and Terms/Privacy acceptance** before processing. There is no separate age checkbox, date-of-birth collection, identity check or age pop-up. The portfolio remains available to everyone without accepting the AI terms.
- Separate microphone consent is requested per tab. Contact and appointment workflows retain contextual consent checks.
- Existing sessions created under the prior consent version must acknowledge `2026-11-27-v1.1` before reading, chat, Live voice or tools.
- Live sessions default to **300 seconds** (5 minutes), with a **$0.125** reservation. The $1 daily and $7 cumulative caps are unchanged. Schedar remains the voice. Admin can restore up to 600 seconds.
- Voice errors distinguish daily budget (local reset time), cumulative exhaustion, microphone permission, missing device, rate limit, disabled voice, provider failure, network failure and session expiry. No raw provider or financial details are shown.
- Data/retention audit: `docs/legal-data-audit.md`.

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

- Cumulative: **$1.690215 USD / ~$2.4032 CAD**
- Today: **$0.793352 USD**
- Held reservations: **$0**
- Daily cap: **$1.00 USD**
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

- Current Worker version: `6df5e7b6-e447-49f9-804c-5ba6ab114719` (legal/voice release)
- Previous V2 Worker: `6dfcd430-e175-4f70-842a-076516c921bb`
- Previous pre-V2 Worker: `5596ba7b-c4a9-4256-8eea-aa46dd9f4735`
- Safe notes: rolling back the Worker to pre-V2 does not revert the production `persona_instruction` control; restore it separately if a full conversational rollback is intended.
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
| Legal validator | 46/46 | `npm run validate:legal` |
| Consent integration | 12/12 | `results/consent-tests.json` |
| Live budget at 5 minutes | 9/9 | `results/live-budget-tests.json` |
| Secret scan | 437 files, 0 hits | `results/secret-scan.txt` |

Live browser check: `?ainour=beta` pill, gate, grounded reply, zero console errors; plain `https://nourchkair.com` showed no AI pill or panel.

## 12. Remaining manual action

**Google OAuth durability.** The current refresh token works, but Google reports `refresh_token_expires_in` of about **565,769 seconds (~6.55 days)** because the OAuth app is still External/Testing. Publish and verify the app out of Testing, then reauthorize once for a durable refresh token. Until then, the production Google integrations will stop when that token expires. The published legal URLs are now set in the OAuth branding page: `https://nourchkair.com/privacy/` and `https://nourchkair.com/terms/`. Next manual action: remove unused `gmail.send`, `gmail.compose`, and `documents.readonly` scopes from Data Access before publishing/verification.

A production OAuth callback route is not implemented. Reauthorization uses the local helper and then updates the Worker secret; routine AI Nour administration does not require Cloudflare access.

**Do not enable unrestricted public access until Nour completes product acceptance and explicitly approves the public launch. The Gemini project is on the free tier; do not submit personal/confidential information and do not enable public AI until the paid-tier/DPA decision is approved.**
