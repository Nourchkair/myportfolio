# AI Nour — legal data audit

**Date:** 27 November 2026  
**Scope:** `nourchkair.com`, AI Nour production Worker, D1, local admin, Google integrations, optional Resend  
**Purpose:** verify every material statement in the Privacy Policy and Terms of Use against actual code and configuration before publication.

**Approval:** Nour approved the release on 27 November 2026 with amendments: AI Nour eligibility is 18+, eligibility is combined with Terms/Privacy acceptance, Live sessions are 5 minutes, and voice errors distinguish budget, microphone, network, provider, session and disabled states. The portfolio remains available to everyone.

This is an engineering/privacy audit, not a legal opinion. Canadian counsel should review the final texts, and French counsel should review the French version, before public launch.

## 1. Data inventory

| Data | Source | Stored where | Purpose | Actual retention | Deletion / access |
| --- | --- | --- | --- | --- | --- |
| Visual environment preference | Portfolio | Browser `localStorage` (`nour-os-scene`) | Remember scene | Until browser storage cleared | User clears storage |
| Beta key | Visitor entry | Browser `sessionStorage`; SHA-256 hash and prefix in D1 `beta_testers` | Restricted beta access | Browser tab; server record until revoked/deleted | Admin revoke; manual D1 deletion |
| Owner token | Generated in browser | Browser `localStorage`; SHA-256 hash in D1 session/CRM rows | Pseudonymous ownership | Browser until cleared; D1 depending on record | Clear browser; request deletion |
| Session ID / locale / consent version | Browser and D1 | `localStorage`; D1 `sessions` | Conversation continuity, language, consent record | Rolling 7 days after last activity; current consent version with session | Session cleanup; manual deletion |
| Text messages and replies | Visitor / Gemini | D1 `session_messages` | Conversation, recovery, quality | Deleted with expired session; explicit message delete added | Session cleanup; manual deletion |
| Voice transcripts | Gemini Live | D1 `session_messages` as conversation text | Transcript/continuity | Same as session | Same as session |
| Voice audio | Microphone | **Not stored by AI Nour**; streamed to Gemini | Real-time voice | Google's terms | Google account/API terms |
| Conversation summaries | Gemini | D1 `sessions.summary` | Recovery | Same as session | Session cleanup |
| Visitor profile | Inferred from conversation | D1 `sessions.state_json` | Tailoring | Same as session | Session cleanup |
| Page context / navigation actions | Browser | D1 message metadata and live request context | Page-aware answers | Same as session | Session cleanup |
| Contacts | Visitor | D1 `contacts`; optional Sheet mirror | Inquiry/contact | No automatic expiry; business need | Manual deletion / request |
| Inquiries | Visitor | D1 `inquiries`; optional Sheet mirror | Handle request | No automatic expiry; business need | Manual deletion / request |
| Consent records | Visitor action | D1 `consents`; Sheet mirror | Prove scoped permission | No automatic expiry | Manual deletion / request |
| Appointments | Visitor / Calendar | D1 `bookings`; Sheet mirror; Google Calendar event/Meet | Booking | No automatic expiry | Cancel/delete; request |
| Email jobs and bodies | CRM/email service | D1 `email_jobs` | Delivery/retry/diagnostics | Non-queued jobs deleted after 30 days; queued/sending until processed | Manual deletion/request |
| Email delivery events | Resend webhook | D1 `email_webhook_events` | Delivery status | 30 days | Cleanup |
| Operational/error events | Worker | D1 `ops_events` | Security/reliability | 30 days | Cleanup |
| Cost/usage ledger | Worker | D1 `cost_events` | Spending caps/accounting | No automatic expiry | Manual deletion/request; pseudonymous |
| Live reservation records | Worker | D1 `live_tokens` | Prepaid reservation/settlement | No automatic expiry | Manual deletion/request; pseudonymous |
| Idempotency records | Worker | D1 `action_ledger` | Duplicate prevention | No automatic expiry | Manual deletion/request |
| Admin audit | Admin actions | D1 `admin_audit` | Accountability/security | No automatic expiry | Manual deletion/request |
| Admin identity/session | Google OAuth | Google; local admin signed cookie | Admin login | Cookie up to 8h; Google account data by Google | Logout/revoke; Google account |
| Cloudflare technical logs | Cloudflare | Cloudflare | Hosting/security | Cloudflare terms | Cloudflare controls |
| Google Workspace data | Google APIs | Google Sheets/Calendar/Drive | CRM/booking/files | Google terms + Sheet/Calendar data until deleted | Google/Sheet/Calendar deletion |
| Resend data | Resend | Not active | Transactional email if enabled | Provider terms; local email jobs 30 days | Not active |

## 2. Retention verification

| Policy statement | Code evidence | Status |
| --- | --- | --- |
| Conversations retained 7 days after last activity | `SESSION_TTL_HOURS` defaults to 168; `appendTurn` refreshes `expires_at`; `cleanup` runs on the 10-minute cron; expired `session_messages` are explicitly deleted before sessions | Verified, with the qualification that cleanup requires the scheduled handler to run |
| Expired sessions/messages are deleted | `deleteExpiredSessions()` now deletes messages by session subquery, then sessions | Verified |
| Voice audio not stored by us | No audio file write; Live audio is sent to Gemini; transcripts stored as messages | Verified |
| Email bodies/metadata 30 days | `cleanup` deletes non-queued `email_jobs` older than 30 days; queued/sending remain until processed; webhook events 30 days | Verified with queued/sending qualification |
| Operational logs 30 days | `ops_events` older than 30 days deleted | Verified |
| CRM records kept as long as needed | No cleanup for contacts/inquiries/consents/bookings; manual deletion | Verified |
| Cost/security records kept longer | No cleanup for `cost_events`, `live_tokens`, `admin_audit`, `action_ledger` | Verified; policy says retained longer |
| No automated backup schedule | No scheduled backup job in code; only encrypted backup capability and synthetic round-trip test | Verified; policy states no active schedule |
| Beta keys individually revocable | D1 `beta_testers.status`/`revoked_at`; auth checks active hash | Verified |
| Beta key full value not stored server-side | Only SHA-256 hash and prefix stored | Verified |

## 3. Consent verification

| Consent | Implementation | Status |
| --- | --- | --- |
| 18+ eligibility and Terms/Privacy before AI use | One in-assistant acceptance checkbox; `CONSENT_VERSION=2026-11-27-v1.1`; accepted version/timestamp stored in `localStorage`, and server-normalized consent with `recordedAt` stored in D1 session state | Verified in browser and D1 |
| Server-side consent | When `BETA_ACCESS_REQUIRED=true`, `/api/session`, new `/api/chat` sessions and new Live sessions require a valid `age18`/terms/privacy consent object; test returned `CONSENT_REQUIRED` without it and `201` with it | Verified with temporary beta-gated Worker (12/12) |
| Existing sessions | `GET /api/session/:id`, chat, Live token/turn and tools reject stale or missing consent with `CONSENT_REQUIRED`; `POST /api/session/:id/consent` records the current version and timestamp without extending the session expiry | Verified with temporary beta-gated Worker |
| Microphone consent | Inline assistant consent strip before `getUserMedia`; consent stored in `sessionStorage` for the tab; no microphone request occurs if cancelled | Verified in browser (cancel, budget, permission and missing-device paths) |
| Contact information | `createInquiry` requires `store` and `contact` consent booleans and creates scoped consent rows | Verified server-side |
| Email | Visitor email jobs require active `email` consent; expired consents are excluded | Verified code |
| Calendar invitations | Guests are added only when active `email` consent exists | Verified code + synthetic production test |
| Appointment booking | `createAppointment` now requires active `store` and `contact` consent | Verified code; existing CRM/lifecycle tests pass |
| Consent withdrawal | Status/expiry checked; admin can revoke beta keys; user can clear local storage; manual deletion/withdrawal request process | Verified; self-service CRM consent withdrawal not exposed |

## 4. Administrator access verification

- Production admin runs locally on `127.0.0.1:8791`.
- Google OAuth with allowlisted `ADMIN_EMAIL`, PKCE/state, signed HttpOnly session, 8-hour expiry, logout, reauthentication, sign-out-all/epoch revocation, CSRF origin checks, CSP/frame denial/no-store.
- Worker admin APIs require a server-side bearer token (`ADMIN_TOKEN`); the token is not sent to the browser.
- The administrator can read sessions and messages, CRM/inquiries/bookings, email job content/metadata, cost data, audit and ops events. The administrator cannot read plaintext beta keys (only prefix/hash).
- There is no second administrator account. Cloudflare/Google personnel may process data under their own terms.
- Admin actions such as flags/persona/beta keys are audited; ordinary page reads are not necessarily audited.
- No self-service CRM deletion UI; deletion is a manual operator action via D1/Sheet/Calendar.

## 5. Third-party processing verification

| Provider | Data | Status / qualification |
| --- | --- | --- |
| Cloudflare Pages/Workers/D1 | Static assets, API requests, D1 records, technical/security logs | Active. D1 production is ENAM; global edge/network processing. |
| Google Gemini API | Text prompts/replies, Live audio/transcripts, usage metadata | Active. Google's terms distinguish unpaid and paid quota. The policy discloses both and does not claim paid-tier protections. |
| Google Workspace APIs | CRM Sheet, Calendar events/free-busy, Drive files; Gmail drafts optional | Active operational credentials; Gmail send is not used. Limited Use statement included. |
| Resend | Transactional email recipient/body/metadata | **Disabled** (`EMAIL_SEND_ENABLED=false`); policy says currently disabled. |
| LinkedIn / GitHub | Outbound links only | No data sent until click; third-party policies apply. |
| Analytics/advertising | None | No analytics, ad, or cross-site tracking code found. |
| Payments | None | No payment processor or Cloud Billing activation. AI Studio project `Portfolio Nour` is Free tier (verified 27 November 2026). |

## 6. Gemini API / AI requirements

Google's Gemini API Additional Terms of Service effective **23 March 2026** were reviewed. Key requirements:

- Users of the API and API clients must be **18 or older**; API clients must not be directed towards, or likely to be accessed by, individuals under 18.
- The service is for **professional or business purposes**, not consumer use.
- On **unpaid quota**, Google uses prompts and responses to improve and develop its products and machine-learning technologies, and human reviewers may read, annotate, or process them. The terms prohibit submitting personal, sensitive, confidential, or third-party information to unpaid services.
- On **paid quota** linked to an active Cloud Billing account, Google processes prompts and responses under its Data Processing Addendum and states that it does not use them to improve its products, but logs them for prohibited-use detection and legal/regulatory disclosures.
- **Paid Services are required** when making an API client available to users in the EEA, Switzerland, or the UK.
- Google Search grounding is a paid service; the current key returns `429 RESOURCE_EXHAUSTED`, so web research remains disabled.

Current implementation:

- AI Nour discloses that it is AI, not Nour.
- The AI is instructed not to provide legal, financial, medical or other professional advice, not to make high-impact decisions, and not to invent Nour's experience or beliefs.
- Users are told not to submit personal, sensitive, financial, health, confidential or third-party information.
- The Terms include the exact 18+ eligibility clause and combine eligibility with Terms/Privacy acceptance. No date of birth or identity document is collected; no separate age-verification pop-up is used.
- The policy does **not** promise that Google will not use data to improve its services; it explains the unpaid/paid distinction and does not claim paid-tier protections.
- We do not sell data, use it for advertising, or train our own generalized models.
- Gmail send is not in the production path; Gmail drafts are optional and not enabled.

**Billing status (verified 27 November 2026):** AI Studio shows the production Gemini key (`Gemini API Voice`, suffix `X1xA`) on project **Portfolio Nour** (`gen-lang-client-0216290216`). The project is **Free tier**, with **Set up billing** shown; no Cloud Billing account is active. The separate `GOOGLE_CLOUD_PROJECT_ID=ai-nour` value is used for Google Workspace OAuth, not the Gemini key project. Because the Gemini project is on unpaid quota, Google's unpaid-service data terms apply: prompts/responses may be used to improve Google products and may be reviewed by humans; personal, sensitive, confidential, and third-party information must not be submitted. Public AI access remains disabled.

## 6b. UI and route verification

- Portfolio footer legal links: `/privacy` and `/terms`; verified in the local browser.
- Contact panel: legal links visible when the Contact panel opens.
- Reading view: legal links in the contact section and footer.
- AI Nour: one combined 18+/Terms/Privacy acceptance, separate per-tab microphone consent, input disclaimer, consent-gate links, and microphone-consent links; verified in the local browser and temporary server.
- No legal pop-up or consent modal appears when the portfolio opens; the assistant gate appears only after the visitor opens AI Nour.
- No console errors in the consent/microphone checks.
- Local `/privacy` and `/terms` resolve through directory redirects to `/privacy/` and `/terms/` (200). Cloudflare Pages may apply its own directory redirect; the final page is publicly readable. After deployment, verify the exact OAuth-console URLs and follow redirects.
- The daily-budget path shows the local reset time, the cumulative path explains the private-beta allowance, and microphone permission/missing-device paths are distinct. The budget path makes **zero** microphone calls. No “Mic error” label remains.

## 7. Claim-by-claim policy audit

| Policy claim | Result | Note |
| --- | --- | --- |
| Portfolio usable without AI/account | Verified | Default portfolio mounts no AI; reading view assistant-free. |
| No advertising/analytics/tracking | Verified | No analytics/ad code found; only local preferences, AI session storage, admin cookie. |
| No sale of personal information | Verified | No sale path, no ad/CRM resale. |
| Age 18+ for AI Nour | Verified in Terms, one-checkbox UI + server enforcement | Existing sessions must acknowledge the current `2026-11-27-v1.1` consent before reading, chat, Live voice or tools. The portfolio remains open to everyone. |
| Microphone consent before processing | Verified | Inline assistant strip; browser permission follows separately. |
| Contact/appointment consent | Verified | API consent scopes + appointment guard; public inquiry/booking UI is currently restricted/disabled. |
| Conversation retention 7 days | Verified | Rolling expiry + cleanup; cleanup depends on cron running. |
| Audio not stored by us | Verified | No audio file persistence; Gemini processing disclosed. |
| Email retention 30 days | Verified with qualification | Non-queued jobs; queued/sending until processed. Resend disabled. |
| CRM retained until business need/deletion | Verified | No automatic TTL; manual deletion. |
| Admin local/private access | Verified | 127.0.0.1, Google OAuth allowlist, signed session, bearer token. |
| No automated backups | Verified | No scheduled backup; policy states this. |
| Google Limited Use | Supported | Statement included; Google's own processing remains governed by Google. |
| External writes disabled | Verified | `google_writes_enabled=false`, `ENABLE_CRM_WRITES=false`; beta key active. |
| Public access disabled | Verified | `BETA_ACCESS_REQUIRED=true`; one active beta tester. |
| Five-minute Live sessions | Verified | Production default `LIVE_SESSION_SECONDS=300`; reservation `$0.125`; admin can restore up to 600 seconds. |
| Voice error distinction | Verified | Daily budget, cumulative budget, microphone permission, missing device, rate limit, disabled, provider, network and expiry paths mapped; no raw provider/financial details shown. |

## 8. Gaps and qualifications before publication

1. **Legal review:** The text is not legal advice. Canadian counsel should review; EU/UK counsel should review if offered there. Quebec Law 25, GDPR representative/DPO requirements and consumer-law wording were not formally assessed.
2. **No automated backup:** The policy accurately states that no automated backup schedule is active. If backups are enabled, update the retention table and test restore/deletion.
3. **Manual CRM deletion:** There is no self-service deletion UI. Requests require operator action in D1, Google Sheets, and Calendar. Keep a deletion log.
4. **Cost/audit retention:** `cost_events`, `live_tokens`, `admin_audit`, and `action_ledger` are not auto-expired. The policy says they may be retained longer for accounting/security. Consider documented maximum periods.
5. **Google processing:** The policy cannot guarantee Google's retention or model-improvement behaviour. Do not add a "never used for training" claim about Google. If a paid Gemini tier with stronger data-processing terms is adopted, update the policy.
6. **Microphone consent record:** Consent is stored in browser `sessionStorage`; it is not written to the server as a separate audit record. The policy only says the interface asks for microphone consent. If a server-side consent record is required, add one.
7. **Age/consent enforcement:** New and existing production sessions are enforced when `BETA_ACCESS_REQUIRED=true`. Existing local consent and session consent from version `2026-11-27` are rejected until the visitor accepts `2026-11-27-v1.1`.
8. **Data residency:** D1 is ENAM; Google/Cloudflare may process globally. The policy discloses this and does not promise Canadian-only processing.
9. **CRM Sheet deletion:** Removing a D1 row does not automatically remove the Sheet row. The operator must delete the mirror row. Document this in the deletion runbook.
10. **OAuth token:** The current Testing refresh token expires in about 6.5 days. This is operational, not a privacy statement, but it must be resolved for a durable beta.
11. **French review:** The French text should be reviewed by a native/legal reviewer for terminology and enforceability.
12. **Billing status:** The production Gemini project is confirmed Free tier with no active Cloud Billing account. The paid-service DPA does not apply. Keep public AI disabled; do not submit personal/confidential information. Activating paid billing requires explicit approval, a payment method, and a prepaid balance (minimum $5 at the time of review).
13. **EEA/UK:** Google requires Paid Services for API clients available in the EEA, Switzerland, or the UK. The private beta is restricted and public AI access is disabled; do not enable public access in those regions on unpaid quota.
14. **Publication:** `/privacy/` and `/terms/` are published (version 1.1). Both returned 200 with English and French sections; the portfolio footer, Contact panel, reading view and AI Nour links use the trailing-slash URLs.

## 9. Approval record

Approved by Nour on **27 November 2026** with these amendments:

- [x] Controller identity and privacy contact (`nourchkair@gmail.com`, Ottawa, Ontario, Canada).
- [x] AI Nour eligibility set to **18+**, with the exact professional-use clause; portfolio remains open to everyone.
- [x] One combined eligibility/Terms/Privacy acceptance; no separate age checkbox, date of birth, identity document or age pop-up.
- [x] Retention table, including no active automated backup.
- [x] Deletion request process and manual CRM/Sheet/Calendar deletion procedure.
- [x] Google/Gemini/Cloudflare/Resend wording and the no-sale/no-own-model-training statements.
- [x] Ontario/Canada governing law and consumer-rights carve-out.
- [x] English and French texts.
- [x] Five-minute Live sessions with the $1 daily and $7 cumulative caps unchanged; Iapetus selected; admin can restore up to 10 minutes.
- [x] Voice error distinction and local-time daily reset message.
- [x] Publish `/privacy/` and `/terms/`, verify both URLs, language sections and links.
- [ ] Add the published URLs to the Google OAuth Console and complete verification/publishing; this remains the next manual action.
- [x] Confirm current AI Studio billing tier: Free tier, no active Cloud Billing.
- [ ] Decide whether to activate paid Gemini billing; do not enable public AI before that decision.
