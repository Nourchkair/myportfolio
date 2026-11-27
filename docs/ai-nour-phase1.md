# AI Nour — Phase 1 Foundation and Prototype Report

> Historical record: this phase was produced under the former working name **AI Nour**. The visitor-facing assistant is now **Nupa**; internal paths, browser keys, API routes and other technical identifiers remain unchanged.

**Date:** 26 November 2026  
**Branch:** `phase1/ai-nour-prototype`  
**Worktree:** `ai-nour-phase1/` (isolated from the main session)  
**Base:** `edaa58c` (Phase 0A commits on `planning/ai-nour`)  
**Status:** Working isolated prototype; **Conditional GO for Phase 2 design**, not production-ready.

---

## 1. Executive summary

Phase 1 delivered a modular Cloudflare Worker backend, a functional text and Live voice prototype, bilingual retrieval, shared conversation recovery, a local-only admin surface, and a validated Google integration layer.

| Area | Result |
| --- | --- |
| Unit tests | **35/35 passed** |
| Mock-provider API tests | **22/22 passed** |
| Endpoint security tests | **8/8 passed** |
| Bilingual retrieval | **85.45% top-1 / 100% top-3** over 55 queries, 105 chunks |
| Real Gemini text + Live smoke | **12/12 checks passed** |
| Real French text + Live smoke | **7/7 checks passed** |
| Application-managed recovery | **4/4 checks passed** (text context recalled in a new Live session) |
| Google synthetic writes | **4/4 groups passed** and cleaned up |
| UI visual QA | Gate and chat verified; no console errors; Worker log shows 200/201/200 |
| Fixed infrastructure cost | **$0/month** |
| Cumulative Gemini usage | **$0.034559 USD / ~$0.04914 CAD** (including Phase 0A carryover) |
| Phase 1 incremental usage | **$0.009346 USD / ~$0.01329 CAD** |
| Approved budget remaining | ~$9.95 CAD of the $10 CAD evaluation budget |

The prototype is deliberately local-only. The permanent Gemini key and Google refresh token never reach the browser; the UI receives one-use Live tokens. Google external writes remain disabled except for explicitly authorized synthetic tests.

Two product decisions still gate production: Cloudflare Access/private admin authentication, and Gmail’s draft-only send path. CRM headers, Google OAuth publishing, and the final visual interface also require approval.

---

## 2. What was implemented

### Backend foundation

- Modular Worker entry and router (`src/app.js`, `src/http/`).
- Config validation with provider, Google, cap, and rate-limit settings (`src/config.js`).
- D1 schema and migration (`migrations/0001_init.sql`): sessions, messages, idempotency ledger, rate limits, bookings, ops events, cost ledger, controls, admin audit, knowledge overrides.
- Provider adapters:
  - Gemini Flash-Lite text adapter over `generateContent` REST.
  - Gemini 3.8 Live ephemeral-token adapter over `v1alpha/auth_tokens` REST.
  - Mock text/live providers for deterministic tests.
- Google adapters:
  - OAuth refresh-token cache and authenticated request helper.
  - Sheets metadata/read/append/update and synthetic round-trip.
  - Calendar free/busy, no-attendee Meet event, reschedule, cancel.
  - Drive folder discovery, upload/download, AES-256-GCM encrypted backups.
  - Gmail draft create/read/delete only; no send method.
- Cost accounting and enforcement:
  - Per-model rates for text and Live audio.
  - Daily cap `$1.00 USD`; cumulative cap `$7.00 USD` (~$9.95 CAD).
  - Phase 0A carryover of `25,213` USD micros seeded into the ledger.
- Feature flags and emergency shutdown:
  - `assistant_enabled`, `text_enabled`, `live_enabled`, `prototype_enabled`, `google_writes_enabled`.
  - Persona instruction stored server-side and editable by admin.
- Server-side auth:
  - Prototype access key.
  - Owner-bound sessions by SHA-256 owner hash.
  - Admin bearer token; local admin proxy keeps it out of the browser.
  - Optional Google OAuth admin module with PKCE, email allowlist, and HMAC-signed HttpOnly session.
- Error handling:
  - JSON error envelope, request IDs, provider/integration errors, D1 logging, body limits, 404/405 handling.
- Scheduled cleanup:
  - Expired sessions, stale rate buckets, and old operational events.

### Conversation prototype

- Text chat with grounded public-portfolio answers.
- Real-time Gemini Live voice with ephemeral tokens, 16 kHz microphone capture and 24 kHz playback.
- English and Canadian French.
- Shared text/voice context: both paths write to the same D1 conversation.
- Application-managed recovery: a new Live session receives the previous text context through the system brief, not Gemini’s resumption handle.
- Personality instruction and grounding rules.
- Portfolio retrieval over 105 structured chunks.
- Navigation through the existing NourOS action names: `navigateTo`, `openProject`, `openProjectFlow`, `openJourneyChapter`, `openContact`.
- Interruptions/barge-in: `interrupted=true` stops playback.
- Visible states: idle, connecting, listening, processing, speaking, error.
- Session restoration on reload and a “New session” reset.
- Navigation preview when standalone; when embedded in the portfolio, validated actions call `window.NourOS`.

### Admin foundation

Local-only surface at `http://127.0.0.1:8791`:

- Overview: environment, models, providers, corpus, budget, Google status, sessions.
- Feature controls and emergency shutdown.
- Personality/instruction editing.
- Usage and cost ledger.
- Session list and transcript inspection.
- Knowledge corpus list/search and draft override storage.
- Integration status for Google OAuth token, Sheets, Calendar, Drive, and Gmail.
- CRM summary and D1 appointments.
- Admin audit and operational events.

The admin server proxies to the Worker with the server-side admin token. It is bound to `127.0.0.1`. The Google OAuth module is implemented and unit-tested; live use requires adding the localhost redirect URI to the Google OAuth client.

---

## 3. Verification results

### 3.1 Unit tests — 35/35

`npm test` covers:

- Retrieval corpus, English/French queries, and benchmark thresholds.
- Cost calculations and budget blocking.
- Tool declarations, valid navigation, and rejected tools/projects/sections/nodes.
- Timing-safe auth, prototype/admin enforcement, owner tokens.
- Admin OAuth PKCE, exchange, userinfo, signed session, tamper/expiry.
- Locale detection, conversation brief, system prompt, history, turn persistence, summarization.
- Gemini text/Live request shapes and parsing; mock providers.
- Google auth refresh/retry, Sheets, Calendar, Gmail, Drive encryption, unconfigured status.

Evidence: `ai-nour/results/` and the test output from `npm test`.

### 3.2 Mock-provider API tests — 22/22

`npm run test:api` boots a separate local Worker (`8793`) with mock providers and a dedicated D1 state.

Passed:

- Health/D1, prototype-key rejection, meta/corpus.
- Session create, cross-owner denial.
- Text chat and duplicate `clientMessageId` rejection.
- Tool-call navigation action and server-side tool validation.
- Unknown project rejection.
- Session recovery messages.
- Mock Live token and shared-context Live turn.
- Duplicate Live turn rejection.
- Admin auth and status.
- Emergency shutdown and re-enable.
- Synthetic Google writes disabled by default.
- Prototype UI served.
- Live rate limit returns 429.
- Cumulative budget cap blocks further text calls (402).

Evidence: `ai-nour/results/api-tests.json`.

### 3.3 Endpoint security — 8/8

`npm run test:security` against the real text model:

- System-prompt extraction refused; no key leakage.
- Credential extraction refused.
- Disallowed `sendEmail` refused.
- Retrieved-content/path-traversal override refused.
- Negative tool calls rejected: `sendEmail`, traversal project, unknown section.
- Positive navigation control returned `openProject('safiy')`.

No action outside the allowlist was returned. Evidence: `ai-nour/results/security-api.json`.

### 3.4 Bilingual retrieval — 85.45% top-1 / 100% top-3

- 105 structured chunks generated from projects, journey, profile, and site data.
- 55 English/French/paraphrase queries.
- Top-1: **85.45%**; top-3: **100%**; MRR: **0.9273**.
- Up from Phase 0A’s 77.1% top-1 / 85.7% top-3 on 35 queries.
- Query time remains effectively local/instant.

Evidence: `ai-nour/results/retrieval-benchmark.json`, `ai-nour/tests/fixtures/retrieval-queries.json`.

### 3.5 Real text + Live smoke — 12/12

`npm run test:real` against Gemini Flash-Lite and Gemini 3.8 Live:

- Text answer grounded in Safiy.
- Tool navigation to `/projects/safiy`.
- Live token with constrained tool config.
- Live setup, audio, tool call, tool response, output transcript.
- Live turn persisted into shared context.
- Session recovery returned at least four messages.

Measured Live turn: 1,323 prompt tokens (884 text + 194 audio), 75 response audio tokens; 133,920 audio bytes.

Evidence: `ai-nour/results/real-smoke.json`.

### 3.6 French text + Live — 7/7

- French text reply about Safiy.
- French Live token and setup.
- French audio and transcript.
- French Live turn persisted.
- Shared French context available.

Measured Live turn: 1,250 prompt tokens (831 text + 194 audio), 234 response audio tokens; 437,762 audio bytes.

Evidence: `ai-nour/results/real-french.json`.

### 3.7 Application-managed recovery — 4/4

- Text turn establishes “my favourite project is Safiy.”
- A **new** Live token/session asks which project was mentioned.
- Live answer: “You mentioned that Safiy is your favourite project.”
- A subsequent text turn still sees the shared context.

This directly addresses the Phase 0A resumption limitation: recovery is based on the D1 brief, not the Gemini resumption handle.

Evidence: `ai-nour/results/recovery-test.json`.

### 3.8 Google synthetic writes — 4/4 groups

`npm run google:synthetic` against a Worker started with `ALLOW_SYNTHETIC_WRITES=true`:

- Sheets: scratch tab, headers, row, read-back, cleanup.
- Calendar: no-attendee Meet event, unique link, cancel.
- Drive: encrypted backup upload, download, exact decrypt, cleanup.
- Gmail: draft create/read/delete; no send.

All cleaned up. CRM counts remain zero. Evidence: `ai-nour/results/google-synthetic-tests.json`.

### 3.9 UI visual QA

- Gate accepted the test key and opened the prototype.
- Text message sent and assistant reply rendered.
- Conversation state displayed `ready`.
- Budget/token counters updated.
- Console buffer was verified live and contained **zero errors**.
- Worker log shows `meta 200`, `session 201`, `chat 200`, UI bundle 200; only `favicon.ico` 404.
- Screenshot: `ai-nour/docs/screenshots/phase1-prototype.png`.
- Admin screenshot: `ai-nour/docs/screenshots/phase1-admin.png`.

The QA server was a short-lived local process; it was stopped after capture. The UI source and build instructions remain in the repo.

---

## 4. Actual costs

Rates used are list prices configured in the Worker; no invoice has been issued.

| Item | USD micros | USD | CAD at 1.4219 |
| --- | ---: | ---: | ---: |
| Phase 0A carryover | 25,213 | $0.025213 | $0.03585 |
| Phase 1 incremental | 9,346 | $0.009346 | $0.01329 |
| **Cumulative** | **34,559** | **$0.034559** | **~$0.04914** |

- Fixed infrastructure: **$0/month**.
- Approved Gemini evaluation budget: **$10 CAD**.
- Remaining cumulative cap: about **$6.965 USD / $9.90 CAD**.
- Daily cap: **$1.00 USD**; cumulative cap: **$7.00 USD**.
- No billing, subscriptions, R2, or paid upgrades were activated.

The cumulative total remains just under **$0.05 CAD**. Further real-model tests should be treated as budgeted experiments.

---

## 5. Security and privacy

### Controls implemented

- Permanent Gemini key server-side only; browser receives one-use Live tokens.
- Google refresh token server-side only.
- Prototype access key required for every non-health API route.
- Owner-bound sessions; cross-owner reads return 404.
- Admin API requires a bearer token; the local admin proxy injects it and binds to loopback.
- Tool allowlist and generated resource IDs; path traversal and unknown IDs rejected.
- Prompt-injection tests passed; no secret patterns or disallowed actions.
- External Google writes off by default; synthetic tests require admin token + `ALLOW_SYNTHETIC_WRITES=true`.
- Gmail adapter has no send method.
- Cost caps and emergency shutdown enforced server-side.
- Request body limits, request IDs, cache-control/no-store, and no secret logging.

### Residual findings

1. **Admin API is publicly routable if the Worker is deployed.** It is bearer-token protected, but Access/private networking is required before production. Keep the Worker local or private until then.
2. **Cloudflare Access is deferred.** The Free plan checkout requires a card and overage authorization; no subscription was created.
3. **Google OAuth may still be in Testing mode.** Refresh tokens may expire after 7 days; production verification is unresolved.
4. **Google Workspace agent policy.** From 1 February 2027, AI agents must use Workspace MCP/CLI; Gmail MCP has no send tool. Drafts + human send remain the compliant path.
5. **Third-party Google Maps key in archived HTML.** The current tree is redacted, but the value remains in git history at `4c61dd0` from the original portfolio commit. It should be removed from history or confirmed revoked before publishing that history. Do not revise history without approval.
6. **D1 residency is ENAM/ORD**, not Canada. Accepted provisionally.
7. **Real device microphone/Safari/iOS behaviour** is not validated; the local harness is ready for a human test.
8. **Conversation summaries** are unit-tested but not exercised in a long real conversation with the production model.
9. **Knowledge overrides** are stored as drafts but are not yet applied to retrieval; this is a Phase 2 feature.

---

## 6. Upstream integration review

`origin/main` advanced from `4c61dd0` to `8a08769`:

- `8ac9cb9` — portfolio positioning, readability, intro experience.
- `8a08769` — Cloudflare Pages deployment at `nourchkair.com`.

Reviewed without merging:

- `src/app/commands.js` and `src/data/projects.js` are unchanged; the NourOS action contract is stable.
- `src/data/journey.js`, `profile.js`, and `site.js` copy changed.
- A corpus rebuilt from `origin/main` still scores **83.64% top-1 / 98.18% top-3** over the same 55 queries, with one miss.
- Root `package.json` adds a production deploy script; the Phase 1 `ai-nour/package.json` is separate and unaffected.
- Root `.gitignore` adds `.wrangler/`; merge conflict risk is trivial.

Post-merge work: regenerate `corpus.json` from the updated data, add the new `PROFESSIONAL_TAGLINE`, `PROFILE_POSITIONING`, `PROFILE_INTERSECTION`, and `PROFILE_PROOF` exports to the corpus builder, and rerun the retrieval benchmark. No merge or push was performed.

---

## 7. Remaining blockers and decisions

### Requires product/account-owner approval

1. **Admin authentication path.** Approve Cloudflare Access (card on file + overage authorization) or keep the admin surface local/private and use the Google OAuth local flow after adding the redirect URI.
2. **Gmail send path.** Continue with drafts + human send, or pursue a compliant Workspace MCP/CLI confirmation flow. Resend Free remains unconfigured.
3. **CRM schema.** Review and apply `tools/phase0a/crm-schema.json` via `crm-setup.mjs --apply`; Phase 1 still has no production CRM headers.
4. **Google OAuth publishing.** Complete verification or accept the 7-day Testing-mode refresh-token risk.
5. **Visual direction.** Approve one of the three directions in `ai-nour/docs/visual-prototypes.md` before production UI work.
6. **Third-party key history.** Clean history or confirm the archived Google Maps key was revoked.
7. **D1 residency.** Accept ENAM/ORD for Phase 2 or change providers.

### Engineering follow-ups

- Add the new upstream profile/journey fields to the corpus.
- Add real-device microphone and Safari/iOS QA.
- Add a long-conversation summary test with real model usage.
- Add retrieval-override application and admin editing if approved.
- Add production observability/log export if free-tier limits allow.
- Add Access/private admin routing before any public deployment.
- Add a dedicated `live-turn` budget pre-check or a hard client-side token budget if Live over-cap usage becomes a concern.

---

## 8. Files and resources

### Phase 1 files

```text
ai-nour/
  README.md
  package.json
  wrangler.toml
  migrations/0001_init.sql
  src/...
  public/...
  admin/...
  scripts/...
  tests/...
  docs/architecture.md
  docs/visual-prototypes.md
  docs/screenshots/phase1-prototype.png
  docs/screenshots/phase1-admin.png
  results/*.json
```

### Root files

- `docs/ai-nour-phase1.md` — this report.
- Phase 0A files remain in `tools/phase0a/` and `docs/ai-nour-phase0a.md`.

### Cloudflare/Google resources

- Local D1: `ai-nour-phase1-dev` (local state; no remote deployment).
- No new production Cloudflare resources.
- Google resources remain the Phase 0A CRM spreadsheet, calendar, Drive folders, and Gmail account.
- No R2; no Access organization.

### Git

- Phase 0A commits: `e4a9efa`, `edaa58c` on `planning/ai-nour`.
- Phase 1 branch: `phase1/ai-nour-prototype` in the isolated worktree.
- No push, merge, or production deployment.
- `main` was not modified.

---

## 9. Proposed visual interfaces

See `ai-nour/docs/visual-prototypes.md` and the two screenshots.

- **Direction A — Quiet portfolio companion (recommended):** a small glass capsule and expandable panel inside the existing portfolio; voice-first but text fallback; collapses after navigation.
- **Direction B — Conversation workspace:** a deeper desktop workspace with retrieved-context and navigation history rails.
- **Direction C — Mobile voice sheet:** a bottom sheet with a large push-to-talk/listening control for phones.

The current UI is a temporary QA surface, not a production design. No portfolio CSS was changed.

---

## 10. Phase 2 readiness

**Conditional GO for Phase 2 design and hardening.** The backend and conversation prototype are functional and validated at $0 fixed infrastructure cost. Production readiness depends on the decisions in section 7.

Recommended Phase 2 scope:

1. Approve the visual direction and implement it as a feature-flagged portfolio surface.
2. Choose and implement the private admin authentication path.
3. Apply the CRM schema and wire approved CRM/appointment flows.
4. Keep Gmail drafts + human send; add confirmation UX.
5. Publish/verify Google OAuth and add real-device voice QA.
6. Add retrieval overlay/admin knowledge editing.
7. Add observability and long-conversation recovery tests.
8. Keep the $0 fixed-cost and cumulative CAD caps.

Exit criteria for a production launch: private admin authentication, approved visual design, published OAuth, validated real-device voice, approved CRM/email policy, and a clean security review.
