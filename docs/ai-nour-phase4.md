# AI Nour — Phase 4 product acceptance and private-beta preparation

**Date:** 26 November 2026  
**Branch:** `phase2/ai-nour-production`  
**Status:** **production private beta deployed and restricted; conversational V2 is implemented and validated.** The production Worker, D1, custom domain, beta keys, admin, text/Live voice, portfolio navigation, Sheets sync, and Calendar/Meet were validated. Public access remains disabled. Personal acceptance and Google OAuth durability remain pending.

---

## 1. Launch for review

```text
Production portfolio: https://nourchkair.com
Private-beta entry:   https://nourchkair.com/?ainour=beta
Production API:       https://api.nourchkair.com
Local admin:          http://127.0.0.1:8791

Local portfolio:      http://127.0.0.1:8771
Local real API:       http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8789
Local mock API:       http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8792
```

- The production query parameter only reveals the companion; every API request requires an active, server-validated beta key.
- Your primary beta key is in `ai-nour/.private-beta-keys.json` (mode `600`, gitignored).
- Admin uses Google OAuth at `127.0.0.1:8791` and is connected to the production Worker.
- The default portfolio and reading view remain assistant-free.
- Production infrastructure is live; no billing or paid services are activated.

---

## 2. Prioritized decisions and manual actions

### Required from Nour

1. **Google OAuth durability.** Publish and verify the OAuth app out of Testing, then reauthorize for a durable refresh token. The current token expires in about **6.55 days**. This is the only urgent production action.
2. **Visual acceptance.** Review all six interface states at the beta entry and approve, or list changes.
3. **Real-device acceptance.** Run Chrome, Safari, iOS Safari, microphone, Bluetooth, interruption, recovery, French, and mobile checks. Automated tests cannot substitute.
4. **Beta access list.** Confirm the authorized testers; create or revoke their keys in **Admin → Private beta**.
5. **Resend.** Optional and disabled. Approve DNS/API key/webhook only when you want real email.
6. **Sheet update cadence.** Confirm whether the manual **Sync D1 → Google Sheet** action is sufficient, or approve scheduled sync.
7. **Google Workspace MCP.** Decide the post-1-February-2027 path if direct Workspace REST agent access is disallowed.
8. **Archived key.** Acknowledge that the third-party Unsplash Maps key remains in Git history without rewrite; do not use it.

### Prioritized technical order

1. OAuth publishing/verification and durable reauthorization.
2. Visual changes (if any).
3. Real-device microphone/Bluetooth/iOS failures.
4. Beta tester list and key distribution.
5. Resend only if real email is required.
6. Sheet sync cadence.
7. MCP migration decision.

---

## 3. Visual experience

Six-state package: `ai-nour/docs/visual-prototypes.md`.

| State | Evidence |
| --- | --- |
| Closed pill | `ai-nour/docs/screenshots/phase3-state-1-pill.png` |
| Standard text | `ai-nour/docs/screenshots/phase3-state-2-text.png` |
| Collapsed chat | `ai-nour/docs/screenshots/phase3-state-3-collapsed.png` |
| Expanded | `ai-nour/docs/screenshots/phase3-state-4-expanded.png` |
| Voice transcript | `ai-nour/docs/screenshots/phase3-state-5-voice.png` |
| Mobile sheet | `ai-nour/docs/screenshots/phase3-state-6-mobile.png` |
| Thinking | `ai-nour/docs/screenshots/phase3-state-thinking.png` |

Latest feedback implemented:

- “Ask Nour AI” pill beside the menu bar, with chat/mic icons; pill says “Listening” during voice.
- No yellow orbs/circles.
- No “AI representation” disclosure text.
- Removed “You” / “AI Nour” message labels.
- Thinking is a bare glowing line on the panel background, not a bubble.
- Chat is text/transcript only; no in-panel voice view, orb, bars, mic, or start/stop control. Voice is controlled by the pill.
- EN/New enlarged at the top right of the Viewing row.
- Send is inside the text bar; no mic in the composer.
- Collapsed chat is scrollable through the full transcript, while opening/collapsing lands on the latest reply. Verified: 390×268 panel, 108px thread, 867px scroll height, scrollTop 758.5 → 558.5 → 0 → 758.5. Evidence: `ai-nour/docs/screenshots/phase4-collapsed-scroll.png`.
- Existing portfolio navigation, landscapes, cards, typography and reading view are unchanged.

**Pending:** Nour’s visual approval, then final production CSS/token pass.

---

## 4. Voice experience

### Session duration vs ephemeral token

- The ephemeral token has `expireTime` (messages can be sent until then) and `newSessionExpireTime` (time to start a session). These are provider-enforced.
- Gemini Live audio-only sessions have a provider limit around 15 minutes and a WebSocket connection limit around 10 minutes.
- Phase 4 sets the default token `expireTime` to **600 seconds** and mints it with the Live setup. The browser has no frontend countdown that ends the session.
- The duration is stored in D1 (`live_session_seconds`) and read when the next token is minted. Admin range: 60–600 seconds.
- `newSessionExpireTime` remains 60 seconds.

### Financial enforcement

- Reservation: `max($0.08, ceil(minutes × $0.025))`; at 600 seconds = **$0.25**.
- Modeled maximum 10-minute session cost: **~$0.2265** (audio input $0.045, output $0.180, text overhead ~$0.0015).
- Daily cap: **$1.00** (admin-lowerable), so four 10-minute sessions/day at the reservation.
- Cumulative cap: **$7.00 USD** (~$9.95 CAD), admin-lowerable.
- 15-minute hold; unreported holds settle as `live_unreported`.
- Global 12-token/day cap remains as a secondary ceiling.

### Admin control

The admin **Controls** tab now manages:

- Live session duration (60–600s).
- Daily spending cap (at or below the approved deployment maximum).
- Cumulative spending cap (at or below the approved deployment maximum).

Tests: `results/live-budget-tests.json` — **4/4**, including a 600-second token/`expireTime` assertion and the prepaid reservation block.

### Proxy decision

No server-side WebSocket proxy. Provider token expiry already enforces 10 minutes, and the $0.25 reservation covers the modeled maximum. A proxy would add a hop, reconnect/tool-call complexity and possible runtime cost without a demonstrated need for private beta. Revisit if sessions must exceed 10 minutes, the gate becomes public, abuse appears, or exact per-second metering is required.

---

## 5. Automated email

- Resend integration retained; provider is Resend.
- `EMAIL_SEND_ENABLED=false` by default. All jobs are recorded and processed as `dry_run`; no Resend key, domain, or webhook is required for private beta.
- Missing Resend configuration does **not** block testing.
- Templates, retries, dead-letter, Resend idempotency, webhook signature verification and delivery states are implemented.
- Google Calendar invitations are **enabled** and consent-gated: an attendee is added only when the contact has an active `email` consent. Create, reschedule, and cancel use `sendUpdates=all` only when a consenting attendee is present; otherwise `sendUpdates=none`.
- While Resend is disabled, Calendar is the only visitor notification channel. If Resend is enabled later, confirm whether both channels should send confirmations or whether one should be suppressed to avoid duplicates.

Exact remaining steps (full detail in `ai-nour/docs/email-recommendation.md`):

1. Approve and add `mail.nourchkair.com` in Resend Free.
2. Add the exact DKIM/SPF/Return-Path records from Resend’s Records tab; CNAMEs DNS-only; add DMARC.
3. Verify the domain.
4. Create a sending-only API key.
5. Create the webhook `https://api.nourchkair.com/api/webhooks/resend` with sent/delivered/bounced/complained/delayed/failed, and store the `whsec_…` secret.
6. Set `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_SEND_ENABLED=true`, `RESEND_FROM`, `EMAIL_INTERNAL_TO`.
7. Approve one controlled test send, then enable.

No DNS change or real email has occurred.

---

## 6. CRM schema and synchronization

Full field table: `ai-nour/docs/crm-schema.md`. **Approved and applied to the live Google Sheet on 27 November 2026.**

| Tab | Fields (required in bold) | Purpose |
| --- | --- | --- |
| Contacts | **contact_id**, **full_name**, email, phone, organization, role, locale, timezone, **source**, **created_at**, **updated_at** | One identity record; no duplicated contact data in other tabs. |
| Inquiries | **inquiry_id**, **contact_id**, **received_at**, channel, **inquiry_type**, **summary**, requested_service, budget_range, timeline, **status**, consent_id, source_url, client_request_id, **created_at**, **updated_at** | Visitor request and workflow state. |
| Consent | **consent_id**, **contact_id**, **scope**, **status**, **captured_at**, expires_at, **source**, evidence, **created_at**, **updated_at** | Scoped store/contact/email/followup permission. |
| Appointments | **appointment_id**, **inquiry_id**, **contact_id**, **start_utc**, **end_utc**, **timezone**, calendar_event_id, meet_link, **status**, status_detail, **idempotency_key**, **created_at**, **updated_at** | Booking, Calendar/Meet linkage, duplicate protection. |
| Email Log | **email_id**, contact_id, inquiry_id, appointment_id, **kind**, **recipient_email**, **status**, **provider**, provider_message_id, dedupe_key, **attempts**, next_attempt_at, last_event_at, **created_at**, **updated_at** | Delivery/retry tracking without storing bodies. |
| Follow-ups (optional) | **followup_id**, **inquiry_id**, **contact_id**, **due_at**, **channel**, **purpose**, **status**, completed_at, **created_at**, **updated_at** | Human follow-up only; not required for beta. |

Deliberately excluded: pipeline/opportunity tab, owner field, free-text notes, email bodies/transcripts, marketing segments, open/click tracking.

### D1 ↔ Google Sheets synchronization

- Headers were applied to **Contacts, Inquiries, Consent, Appointments, Email Log, and Follow-ups**; the legacy Pipeline tab remains empty and unmanaged.
- Field mapping and reconciliation live in `src/services/crm-sync.js`; unit coverage is in `tests/crm-sync.test.mjs`.
- Live Sheet round-trip: **6/6** tabs written, read back, matched, and synthetic rows deleted (`results/crm-sheet-live.json`).
- Manual D1 → Sheet sync: admin **CRM → Sync D1 → Google Sheet** calls `POST /api/admin/crm/sync`. It inserts missing keys, updates changed rows, leaves unchanged rows alone, and refuses tabs with unexpected headers.
- Live D1 → Sheet validation: **12/12** checks; first run inserted 8 rows, second run inserted 0 / updated 0 / left 8 unchanged; all synthetic rows were then removed (`results/crm-sheet-sync-live.json`).
- Calendar appointment rows carry the Calendar event id and Meet link; consent rows are exported only as scoped permission metadata.
- Automatic per-event sync is **not** wired. Manual sync is the private-beta path; confirm whether scheduled sync is required.
- The sync action exports all D1 rows, including local synthetic test records. Use a clean production D1 before the first beta sync.

---

## 7. Google OAuth production

Full details: `ai-nour/docs/oauth-production-readiness.md`.

- Separate **Operations** client: Sheets, Calendar, Drive.file; server-side refresh token.
- Separate **Admin** client: `openid`, `email`, `profile`; no operational scopes.
- Proposed operational redirect: `https://api.nourchkair.com/oauth/google/callback`.
- Admin production redirect only if a private admin host is approved: `https://admin.nourchkair.com/auth/google/callback`.
- Testing-mode External refresh tokens expire in 7 days; production publishing + verification resolves this.
- Brand verification then sensitive-scope verification; allow about 10 days; no restricted-scope assessment if Gmail is excluded.
- Gmail remains out of production; Resend handles transactional email. Gmail drafts remain an optional human-review fallback.
- Google Workspace MCP: agents must use Google MCP for Workspace access from **1 February 2027**. Direct REST is acceptable for the private-beta window; a post-February-2027 launch needs migration or a documented exception.
- Privacy/terms are final review copies at `ai-nour/oauth/privacy.html` and `ai-nour/oauth/terms.html`; not published.

Manual authorization steps are in the OAuth document: production project, redirects, brand verification, scope justification/demo, publish, reauthorize with offline access, store secrets. No publish or verification has been submitted.

---

## 8. Administration

Private/admin capabilities:

- **Knowledge:** search + publish/draft/delete overrides. Published overrides are appended to text retrieval immediately; the current override count and status are visible. (Live token prompts do not yet use overrides.)
- **Personality:** edit the server-side persona.
- **Integrations:** Google status, Sheets/Calendar/Drive/Gmail health, synthetic test (when enabled).
- **Conversations:** session list and transcript detail.
- **CRM:** inquiries, D1 appointments, Google CRM summary, and manual **Sync D1 → Google Sheet**.
- **Appointments:** cancel.
- **Features:** assistant/text/Live/prototype/Google-writes flags.
- **Spending/voice:** daily cap, cumulative cap, 10-minute-configurable Live duration.
- **Email:** queue, retry, reminders, dry-run/send status.
- **Audit/ops:** admin audit and operational events.

Security: Google OAuth, allowlisted email, HttpOnly signed session, 8h expiry, logout, re-authentication, sign-out-all/epoch revocation, CSRF origin checks, CSP/frame denial/no-store, server-side bearer token. Admin binds to `127.0.0.1`; no paid auth or Cloudflare Access introduced.

Validation: `results/admin-auth-tests.json` — **16/16**.

Production admin access options: keep local/private (recommended) or approve a private hostname with Access. No public admin endpoint.

---

## 9. Product acceptance checklist

Personal acceptance is still required. Check each item during the review.

### Conversation intelligence and naturalness
- [ ] Answers sound natural, concise and grounded.
- [ ] AI does not invent projects, roles or results.
- [ ] Follow-up questions resolve pronouns and portfolio context.
- [ ] It declines unknown or private information.

### Personality and positioning
- [ ] Voice reflects the approved professional positioning.
- [ ] First-person AI representation is clear without the removed disclosure text.
- [ ] Tone is warm, commercial and not overly verbose.

### Portfolio knowledge
- [ ] Projects, journey, education, contact and positioning are accurate.
- [ ] Section-aware context is correct.
- [ ] Knowledge overrides publish and appear in retrieval.

### English and French
- [ ] English answers are accurate.
- [ ] French questions are detected and answered in French.
- [ ] French pronunciation is understandable.
- [ ] Language switching does not lose context.

### Text-to-voice and interruption
- [ ] Text → Live shares the same transcript/context.
- [ ] Barge-in stops playback promptly.
- [ ] Closing the panel keeps voice running; reopening shows the continuing transcript.
- [ ] Pill stops voice; chat stays text-only.

### Guided projects
- [ ] “Open the Safiy project” opens the correct overlay.
- [ ] Guided flow/node actions land correctly.
- [ ] Manual navigation is not blocked or re-opened.

### Inquiry and appointment
- [ ] Inquiry validates consent and creates contact/CRM records.
- [ ] Duplicate submission does not duplicate email jobs.
- [ ] Availability and booking work with conflict protection.
- [ ] Calendar confirms with a unique Meet link.
- [ ] Confirmation/reminder/reschedule/cancel jobs queue.
- [ ] Consent-gated Calendar invitations arrive for create/reschedule/cancel.
- [ ] Internal Sheet sync shows the same inquiry, consent, appointment, and email-log records.
- [ ] Email failures retry and dead-letter correctly.

### Desktop/mobile usability
- [ ] All six visual states.
- [ ] Drag, collapse, expand, close/reopen.
- [ ] Collapsed thread scrolls through history.
- [ ] Mobile sheet, keyboard and safe areas.
- [ ] Reading view remains assistant-free.

### Security/privacy/financial
- [ ] Unauthenticated admin API blocked.
- [ ] No secret in browser or repository.
- [ ] Consent and data-minimization behavior.
- [ ] Daily/cumulative caps visible and enforced.
- [ ] 10-minute Live duration works and is provider-enforced.

---

## 10. Private-beta preparation

### Restricted access
- Shared high-entropy prototype access key, not a public link.
- Owner-token session isolation.
- Rate limits on chat/Live/CRM.
- Admin private on `127.0.0.1` or an approved private hostname.
- Feature flags can disable assistant/text/Live/prototype.

### Production-compatible infrastructure
- Static portfolio remains on Cloudflare Pages.
- Worker on a Worker custom domain (proposed `api.nourchkair.com`).
- D1 unchanged; R2 disabled.
- No paid auth, database, vector store, or email plan.
- Confirm D1 residency (currently ENAM/ORD).

### Secret management
- `.dev.vars` ignored and mode `600`.
- Production secrets via `wrangler secret put` or the Cloudflare dashboard; never Git.
- Required: `PROTOTYPE_ACCESS_KEY`, `ADMIN_TOKEN`, session secret, Gemini key, Google client secret/refresh token, Resend key, webhook secret.
- Rotate only through an approved procedure; do not rotate existing credentials now.

### Visitor feedback
- Add a feedback link or form after beta user completes a conversation.
- Store only voluntary feedback; no covert tracking.
- Review weekly and tag against acceptance criteria.
- Do not add paid analytics.

### Error/usage monitoring
- `/api/health` and admin status.
- D1 `ops_events` (30 days) and `cost_events`.
- Email job statuses and webhook events.
- CRM Sheet sync results (`crm.sheets.sync` ops events).
- Live reservations/settlement.
- No paid observability service.

### Emergency shutdown
- Admin → Controls → `assistant_enabled=false` (blocks chat and Live).
- Optionally disable `text_enabled`, `live_enabled`, or `prototype_enabled`.
- If the admin is unavailable, set the Worker feature controls in D1 or roll back with the approved deployment process.
- Revoke admin sessions with sign-out-all; rotate the session secret for durable revocation.

### Rollback
- Keep the previous Worker/Pages deployment available.
- Revert to the prior commit if a regression is found.
- Feature-flag off first; rollback code second.
- D1 migrations are additive; do not rewrite or delete records during rollback.
- Encrypted Google Drive backups remain the recovery path.

### Launch checklist
1. Nour approves visual states.
2. Real-device checklist passes.
3. Private beta access key issued.
4. Admin hostname/private access decision recorded.
5. Secrets present in production.
6. D1 migrations applied.
7. Worker health/status verified.
8. Spend caps and Live duration verified.
9. CRM → Sheet sync verified and synthetic rows absent.
10. Emergency shutdown tested.
11. Rollback deployment identified.
12. Feedback channel ready.
13. Beta users briefed: AI representation, no sensitive data, two-week review.

---

## 11. Automated vs personal acceptance

| Area | Automated evidence | Personal acceptance |
| --- | --- | --- |
| Unit/API/CRM/Lifecycle/Admin/Live | 54/54, 23/23, 14/14, 28/28, 16/16, 4/4 | not a substitute |
| Retrieval | 87.27% top-1 / 100% top-3 | still requires judgement |
| Secret scan | 395 files, 0 value/pattern hits | review only |
| Visual states | six states, 0 console errors | **pending** |
| Microphone/Bluetooth/iOS | not run | **pending** |
| French pronunciation | text benchmark only | **pending** |
| Email delivery | mock/dry-run only | **pending after DNS** |
| OAuth Google round-trip | Phase 2 local verification | production **pending** |
| CRM Google Sheet | headers applied; round-trip 6/6; D1 sync 12/12 | **personal review pending** |
| Calendar invitations | 10/10 local; **13/13 production** | **pending real visitor approval** |
| Production preflight | **16/16** | `ai-nour/results/production-preflight.json` |
| Production text/Live/navigation | **12/12** | `ai-nour/results/production-smoke.json` |
| Production Sheet sync | **11/11** | `ai-nour/results/production-crm-sheet-sync.json` |
| Production Calendar/Meet | **13/13** | `ai-nour/results/production-crm-google.json` |
| Production admin/shutdown/limits | **9/9 + 10/10** | `ai-nour/results/production-admin-connectivity.json`, `production-safety.json` |

No real-device or human-quality check is marked passed.

---

## 12. Costs and constraints

Production ledger after V2: **$1.687531 USD actual / ~$2.3994 CAD** cumulative; **$0.790668 USD** today; **$0** held Live reservations. Fixed infrastructure remains **$0/month**. The $10 CAD evaluation budget remains intact. No billing, paid service, or R2 activation occurred.

The production ledger includes prior evaluation carryover plus the production text/Live/Calendar validation. Live reservations are charged at the reservation floor when unreported; see `results/production-summary.json` and the admin cost view.

---

## 13. Remaining blockers

1. Google OAuth publishing/verification and durable reauthorization before the Testing token expires (~6.55 days).
2. Visual approval and final CSS.
3. Real-device acceptance.
4. Private-beta access key distribution and tester list.
5. Resend DNS/API key/webhook/test send (optional, not blocking).
6. Sheet sync cadence decision (manual now; scheduled optional).
7. Google Workspace MCP decision before 1 February 2027.
8. Archived third-party key acknowledgement.
9. Nour’s personal acceptance of interface, conversation, personality, voice quality, French, navigation, and mobile.
10. Explicit public-launch approval.
