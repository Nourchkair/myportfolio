# AI Nour — Phase 0A Completion Report

> Historical record: this phase was produced under the former working name **AI Nour**. The visitor-facing assistant is now **Nupa**; internal paths, browser keys, API routes and other technical identifiers remain unchanged.

**Date:** 26 November 2026  
**Branch:** `planning/ai-nour`  
**Scope:** technical feasibility and implementation readiness only; no production AI Nour implementation, no merge, push, or production deployment.  
**Decision:** **Conditional GO for a Phase 1 prototype.** Not production-ready yet.

---

## 1. Executive summary

Phase 0A validated the core stack end to end:

- Google OAuth token refresh, Sheets, Calendar/Meet, Drive, Gmail drafts, and the official Workspace MCP catalog.
- Gemini 3.8 Live speech-to-speech in English and Canadian French, function calling, barge-in, shared text/voice context, session-resumption signalling, token usage, and ephemeral browser credentials.
- Cloudflare Pages, Workers, D1, rate limiting, owner-bound sessions, concurrent booking protection, duplicate prevention, emergency shutdown, spend caps, and remote cron execution.
- Structured JSON/Markdown retrieval over 91 chunks.
- Prompt-injection resistance, tool/resource allowlists, and a repository secret scan.

Fixed infrastructure cost remains **$0/month**. Measured Gemini usage is **$0.025213 USD / $0.035851 CAD**, with all-in validation still under **$0.05 CAD** against the approved **$10 CAD** budget.

Two constraints prevent an unconditional production go:

1. **Cloudflare Access is not activated.** The Free plan still requires a card on file and authorizes usage-based overage charges. That conflicts with the approved no-billing boundary, so activation was stopped for explicit approval.
2. **Google’s agent-access policy is changing.** From **1 February 2027**, AI agents must use Workspace MCP/CLI rather than direct Workspace REST APIs. The Gmail MCP server has no send tool. Production email should therefore be human-sent drafts unless Google confirms another compliant path.

The recommended production shape is therefore a **drafts-only, human-confirmed communications workflow**, with Access added only after the billing/identity decision is approved.

---

## 2. Google integration results

Full reproducibility: `tools/phase0a/google-suite.mjs`  
Evidence: `tools/phase0a/results/google-suite.json` — **30/30 passed**.

### 2.1 OAuth and scopes — passed

- Refresh-token exchange returned HTTP 200 and a fresh access token (`expires_in` 3599 s).
- Granted scopes:
  - `spreadsheets`
  - `calendar.events`
  - `calendar.readonly`
  - `drive.file`
  - `gmail.compose`
- Existing client ID, client secret, refresh token, and Gemini key were not rotated, revoked, or regenerated.

### 2.2 Google Sheets CRM — passed

- Spreadsheet title: **AI Nour CRM**.
- Tabs present and empty before testing: `Contacts`, `Inquiries`, `Pipeline`, `Appointments`, `Follow-ups`, `Consent`.
- Synthetic scratch tab created, headers written, record appended, duplicate check returned exactly one row, status updated, invalid-range write returned 400, retry write returned 200, scratch tab deleted.
- No production CRM records were written.
- Proposed headers are in `tools/phase0a/crm-schema.json`; `crm-setup.mjs` reports all six tabs as `empty_ready_for_approval`. **Headers have not been applied.**

### 2.3 Google Calendar and Meet — passed, with an application-lock requirement

- Calendar: **AI Nour - Appointments**, timezone `America/Toronto`.
- Free/busy query returned 200.
- Synthetic event created with a Google Meet link, no attendees, `sendUpdates=none`.
- Reschedule returned 200; cancellation returned 204.
- Two concurrent inserts into the same slot both returned 200 and created two events. **Google Calendar does not enforce booking exclusivity.** D1 must own the booking lock.
- Two concurrent Meet links were distinct.
- All synthetic events were deleted.

### 2.4 Google Drive — passed

- Dedicated folders exist:
  - `AI Nour Knowledge (Phase 0A)`
  - `AI Nour Backups (Phase 0A)`
- `drive.file` scope only exposes app-created/authorized resources; no unrelated personal files were accessed.
- Plain Markdown upload/download matched exactly.
- AES-256-GCM encrypted backup upload/download/decrypt matched exactly.
- Test files were deleted; folders retained.
- R2 is not enabled (`error 10042`), so Drive is the current encrypted-backup and file-storage fallback.

### 2.5 Gmail — draft path passed; sending deliberately not tested

- Draft create/read/delete passed with HTTP 200/200/204.
- No email was sent.
- `gmail.compose` is a restricted scope described by Google as “Manage drafts and send emails,” so the API scope technically permits sending. Direct send was **not executed** because real-email sending is prohibited in this phase.
- Google’s official Gmail MCP server exposes **23 tools and no send/reply/forward tool**. Drafts are created for human review and sending.

**Policy conclusion:** direct Gmail API sending may work technically today, but Google’s November 2026 agent-access rules require MCP/CLI for AI agents from **1 February 2027**, and sensitive actions such as sending email require human confirmation. Recommended production path: **AI creates a draft; a human sends it.** Do not rely on automated direct Gmail sends.

### 2.6 Google Workspace MCP — passed

Official remote MCP catalogs reachable:

| Server | Tools |
| --- | ---: |
| Gmail | 23 |
| Calendar | 9 |
| Sheets | 6 |
| Drive | 9 |

Gmail tool names contain no `send`, `reply`, or `forward` tool. The MCP Gmail path is therefore drafts-and-labels, not autonomous sending.

### 2.7 Google OAuth risk — unresolved

- The OAuth app may still be in **Testing** mode. Google can expire refresh tokens after 7 days in that mode.
- Current refresh works, but production verification/publishing status is unconfirmed.
- `gmail.compose` is a restricted scope; a public app would need OAuth verification and potentially a security assessment.

---

## 3. Gemini Live results

Full reproducibility: `tools/phase0a/live-suite.mjs`, `live-barge.mjs`, `live-context.mjs`, `live-resume.mjs`  
Evidence: `tools/phase0a/results/live-*.json`

### 3.1 Speech-to-speech

| Test | Result | Transcript / behaviour |
| --- | --- | --- |
| English, synthetic speech | Passed | Grounded answer on Nour’s commercial/technology work and Safiy as a contextual knowledge assistant. |
| Canadian French, synthetic speech | Passed | Responded in French with grounded portfolio facts. |
| Function calling | Passed | Called `openProject({ projectId: "safiy" })`; tool response accepted. |
| Barge-in | Passed | `interrupted=true`; playback stopped; model handled the new topic. |
| Shared text + voice context | Passed | Text turn established Safiy; subsequent voice question answered “You mentioned the Safiy project.” |
| Session resumption | **Partial** | Handle emitted (`resumable=true`), but a resumed session did not restore the earlier text context. |
| Browser microphone / real device barge-in | **Not tested** | Isolated localhost harness provided; requires user microphone permission. |

**Personality consistency:** qualitative pass. Across English, French, tool-call, barge-in, and shared-context turns, the voice stayed concise, warm, first-person as AI Nour, and third-person about Nour’s experience. No formal scored rubric was used, so this is partial evidence rather than a quantitative result.

### 3.2 Latency

- Live setup: **238–285 ms**.
- First audio after end of synthetic speech: **~1.1–2.5 s**.
- Full turn completion: **~10.4–17.5 s** (including audio playback duration).
- Barge-in detection: first audio ~5.26 s; `interrupted=true` at ~6.05 s; turn complete ~6.20 s.

### 3.3 Token usage

| Session | Prompt tokens | Response tokens | Notes |
| --- | ---: | ---: | --- |
| English | 807 | 258 | 438 text + 342 audio input |
| French | 808 | 290 | 440 text + 341 audio input |
| Tool call | 798 | 166 | 458 text + 269 audio input |
| Barge turn 1 | 722 | 175 | 353 text + 342 audio input |
| Barge turn 2 | 877 | 140 | 369 text + 465 audio input |
| Shared context | 896 | 65 | 389 text + 456 audio input |

### 3.4 Ephemeral credentials

- Ephemeral Live token created successfully via `v1alpha`; token length 76, one use.
- Permanent Gemini key remains server-side.
- Localhost browser harness tested: `/health` 200, `/token` 200 with an ephemeral token, page 200.
- The harness is at `tools/phase0a/browser-live/`; run `node browser-live/server.mjs` and open `http://localhost:8790`.

### 3.5 Cost

List-price estimate for measured Live sessions:

| Item | USD | CAD |
| --- | ---: | ---: |
| English | 0.004450 | 0.006328 |
| French | 0.004833 | 0.006872 |
| Tool call | 0.003142 | 0.004468 |
| Barge turns | 0.006743 | 0.009587 |
| Shared context | 0.002440 | 0.003469 |
| Audio debug | 0.003605 | 0.005126 |
| **Known total** | **0.025213** | **0.035851** |

FX used: 1.4219 CAD/USD. One session-resume test and six text-only Flash-Lite checks were not individually metered; all-in validation remains **under $0.05 CAD** against the **$10 CAD** approval. Fixed infrastructure cost: **$0**.

---

## 4. Cloudflare results

### 4.1 Pages — passed

- `https://ai-nour-phase0a-site.pages.dev` returns HTTP 200.
- No production DNS changes.

### 4.2 D1 — passed

- Database `ai-nour-phase0a`, region **ENAM / ORD** (Eastern North America).
- Seven tables: `action_ledger`, `sessions`, `rate_limits`, `bookings`, `ops_events`, `cost_events`, `controls`.
- Owner-bound sessions, unique active booking slots, idempotency keys, rate buckets, cost events, and control flags are enforced in D1.
- Canadian residency preference is not met; accepted provisionally.

### 4.3 Worker — passed

- `https://ai-nour-phase0a-dev.phase0a.workers.dev`
- Remote suite: **22/22 passed** (`tools/phase0a/results/worker-tests.json`).
- Health and D1 connectivity: 200.
- Session create/read: 201/200.
- Cross-owner session read: 404.
- Concurrent same-slot booking: one 201, one 409.
- Wrong-owner cancellation: 404; owner cancellation: 200; slot rebookable afterwards.
- Duplicate idempotency key: one row.
- Rate limit: 200, 200, 200, 429.
- Invalid JSON: 400. Unknown route: 404.
- Emergency shutdown: session creation returns 503; re-enable returns 201.
- Spend cap: actual validation cost recorded under cap; synthetic over-cap usage returns 402.

### 4.4 Cron — passed

- Schedule `*/5 * * * *` registered at **17:47:19 UTC**.
- Observed ticks: **17:55:38 UTC**, **18:00:37 UTC**, and **18:05:37 UTC**.
- Scheduled handler deleted expired sessions and stale rate buckets, then logged `scheduled.tick` to D1.
- First tick appeared about 8 minutes after registration, within Cloudflare’s documented 15-minute propagation window.
- Evidence: `tools/phase0a/results/cron-evidence.json`.

### 4.5 Cloudflare Access — blocked by billing boundary

- Account: **Nourchkair@gmail.com's Account** (`29b4018a66ed4f192f2324f95704eb71`).
- Zero Trust has **never been activated**; Access API returns `403 access.api.error.not_enabled`.
- No Access applications and no Google identity provider exist.
- The live wizard offers **Zero Trust Free at $0/seat/month (50 seats)**, but checkout requires:
  - a payment card on file,
  - acceptance of terms,
  - authorization to charge usage-based overages each month.
- Setup was stopped at checkout. No subscription, organization, or Access app was created; the account is unchanged.
- The Worker has a separate 32-byte admin bearer token for `/control` and `/spend`, stored in `.dev.vars` and as the Worker secret `ADMIN_TOKEN`. This is a temporary Phase 0A control, **not a production admin authentication design**. Those endpoints are still publicly reachable and must be protected by Access or removed before production.

Full runbook and approval gate: `tools/phase0a/access-setup.md` and `tools/phase0a/results/access-blocker.json`.

---

## 5. Retrieval results

Structured JSON/Markdown retrieval, not a dedicated vector database.

- Corpus: **91 chunks** from projects, journey, profile, and site data.
- Benchmark: **35 queries**.
- Top-1: **77.1%**.
- Top-3: **85.7%**.
- MRR: **0.814**.
- Average query time: **~1.04 ms** (local lexical/entity scoring).
- Core 25-query subset earlier measured 92% top-1 / 100% top-3.
- A local multilingual MiniLM embedding baseline scored **62.5% top-1 / 80% top-3** over 40 queries, below the lexical/entity retriever. This supports the decision not to add a dedicated vector database in Phase 0A. Evidence: `results/semantic-results.json`.

The full-set misses are concentrated in broad, ambiguous questions. Retrieval is fast enough for D1/Worker use; a reranker or curated aliases can close the gap before production.

Evidence: `tools/phase0a/results/retrieval-results-final.json`, `retrieval-results-repo.json`.

---

## 6. Security and cost controls

### 6.1 Passed

- Server-side authorization and owner-bound sessions.
- Tool/resource allowlists: valid `openProject('safiy')` passes; unknown tool, unknown project, path traversal, and prototype-key inputs are rejected.
- Prompt-injection tests: **6/6 passed**; no canary or key-pattern leakage; no invalid tool calls.
- Session isolation: cross-owner read returns 404.
- Booking ownership: wrong-owner cancellation returns 404.
- Concurrent action protection: one winner for the same D1 slot.
- Duplicate prevention: idempotency ledger returns one row.
- Rate limiting: 3 requests/minute then 429.
- Emergency shutdown: reversible control flag blocks session creation.
- Spend cap: daily ledger; over-cap usage returns 402.
- Secret scan: **274 files scanned, 0 hits** after remediation.
- No permanent Gemini key in frontend code or the browser harness.

### 6.2 Findings and residual risks

1. **Pre-existing third-party Google Maps key** was found in the tracked archive file `archive/assets/unsplash-desk-room.html` (39-character `AIza…` value). The value was redacted in the working tree, but it remains in git history at commit `4c61dd0`. The branch has not been pushed. Do not publish that history without cleaning it or confirming the key was revoked by its owner.
2. **Admin endpoints are bearer-token protected but public.** Access is required before production, or the endpoints must be removed/private.
3. **Google OAuth Testing mode** may invalidate refresh tokens after 7 days. Production verification is unresolved.
4. **Workspace agent policy** requires MCP/CLI for AI agents from 1 February 2027; Gmail MCP has no send tool.
5. **D1 residency** is ENAM/ORD, not Canada.
6. **Browser microphone, device barge-in, Safari/iOS behaviour, and full session recovery** are not validated. The localhost harness is provided.
7. **Live grounding** depends on the prompt. An earlier ungrounded barge-in test hallucinated a “Safe AI” project; grounded prompts fixed it. Retrieval/grounding must be mandatory in production.
8. **No automated prompt-injection defence for retrieved documents** beyond instruction hierarchy and allowlists; add input screening/Model Armor or equivalent before ingesting third-party content.

---

## 7. Passed / failed / partial

| Capability | Status |
| --- | --- |
| OAuth refresh and scopes | Passed |
| Sheets synthetic CRUD and recovery | Passed |
| Calendar availability, Meet, reschedule, cancel | Passed |
| Calendar concurrency exclusivity | Failed by design; D1 lock required and passed |
| Drive file round-trip | Passed |
| AES-GCM encrypted backup round-trip | Passed |
| Gmail draft lifecycle | Passed |
| Gmail automated send | Not tested / policy-unresolved; drafts recommended |
| Workspace MCP catalog | Passed |
| Gemini Live English | Passed |
| Gemini Live Canadian French | Passed |
| Conversational reasoning | Partial (grounded multi-part answers; no broad suite) |
| Personality consistency | Partial (qualitative) |
| Live function calling | Passed |
| Live barge-in (synthetic) | Passed |
| Live shared text/voice context | Passed |
| Live session resumption | Partial |
| Browser microphone / real barge-in | Not tested; harness ready |
| Ephemeral Live token | Passed |
| Pages | Passed |
| Worker HTTP/D1/error handling | Passed |
| Owner sessions / cross-owner denial | Passed |
| Concurrent booking lock | Passed |
| Idempotency / duplicate prevention | Passed |
| Rate limiting | Passed |
| Emergency shutdown | Passed |
| Spend cap | Passed |
| Remote cron | Passed |
| Prompt injection / allowlists | Passed |
| Secret scan | Passed after redaction |
| Cloudflare Access | Blocked by card/billing requirement |
| Google OAuth production status | Unresolved |
| CRM schema | Proposed, not applied |
| D1 Canadian residency | Not met; accepted provisionally |

---

## 8. Genuine blockers and manual actions

### Requires the account owner

1. **Cloudflare Access:** approve a card on file and the Free-plan overage authorization, or formally defer Access and keep admin endpoints private. If approved, follow `tools/phase0a/access-setup.md`.
2. **CRM schema:** review and approve `tools/phase0a/crm-schema.json`; then run `node crm-setup.mjs --apply`.
3. **Gmail send path:** choose drafts-only (recommended), or pursue a compliant Google Workspace MCP/CLI confirmation flow. Resend Free remains unconfigured because no account/API key was supplied.
4. **Google OAuth publishing:** complete verification or accept reauthorization every 7 days in Testing mode.
5. **Git history:** decide whether to clean the third-party Google Maps key from history before any push, or confirm it has been revoked.
6. **Browser test:** run `node browser-live/server.mjs`, open `http://localhost:8790`, grant microphone access, and test English/French/barge-in on the target devices.

### Engineering follow-ups before production

- Integrate the D1 booking lock into the actual booking flow (the test proves the constraint, not the full UI flow).
- Replace the temporary admin token with Access or a private admin surface.
- Add retrieval input screening and a grounded-prompt contract.
- Add structured logs/metrics for Live sessions and tool calls.
- Add a real session-recovery strategy (replay summary + handle, not handle alone).
- Configure production secrets through Wrangler, not `.dev.vars`.
- Decide whether a custom domain is needed for Access; `workers.dev` hostnames and paths are supported, so DNS changes are not required for Phase 0A.

---

## 9. Files and resources

### Repository files created

```text
tools/phase0a/
  README.md
  package.json
  env.mjs
  prepare-audio.sh
  google-suite.mjs
  crm-schema.json
  crm-setup.mjs
  live-suite.mjs
  live-barge.mjs
  live-context.mjs
  live-resume.mjs
  security-checks.mjs
  worker-tests.mjs
  worker-full.mjs
  wrangler.full.toml
  schema.sql
  test.sql
  retrieval-eval2.mjs
  configure-admin.mjs
  oauth-server.mjs
  google-check.mjs
  access-setup.md
  browser-live/server.mjs
  browser-live/index.html
  results/*.json
docs/ai-nour-phase0a.md
```

### Repository files modified

- `.gitignore` — ignores `tools/phase0a/audio/`.
- `archive/assets/unsplash-desk-room.html` — redacted a pre-existing third-party Google Maps key.
- `.dev.vars` — local only, ignored, mode `600`; added `BACKUP_ENCRYPTION_KEY`, `GOOGLE_KNOWLEDGE_FOLDER_ID`, `GOOGLE_BACKUP_FOLDER_ID`, `PHASE0A_ADMIN_TOKEN`.

### Cloudflare / Google resources

- Pages: `ai-nour-phase0a-site`
- Worker: `ai-nour-phase0a-dev`
- D1: `ai-nour-phase0a` (ENAM/ORD)
- Cron: `*/5 * * * *`
- No R2 bucket.
- No Access app or Zero Trust organization.
- Drive: `AI Nour Knowledge (Phase 0A)`, `AI Nour Backups (Phase 0A)`.
- Sheets: `AI Nour CRM` (six empty tabs).
- Calendar: `AI Nour - Appointments` (`America/Toronto`).

No commit, push, merge, production deployment, DNS change, credential rotation, real email, or real attendee invite occurred.

---

## 10. Recommended architecture

```text
Visitor browser
  ├─ Cloudflare Pages static portfolio + AI Nour UI
  ├─ Ephemeral Gemini Live token (never the permanent key)
  └─ HTTPS to Cloudflare Worker
        ├─ D1: sessions, bookings, idempotency, rate limits, controls, cost ledger
        ├─ Structured retrieval: JSON/Markdown + lexical/entity scoring
        ├─ Gemini 3.8 Live (voice) / Gemini Flash-Lite (text)
        ├─ Google Sheets CRM
        ├─ Google Calendar + unique Meet link
        ├─ Google Drive encrypted backups (AES-256-GCM)
        └─ Gmail drafts → human review/send
Admin surface
  └─ Cloudflare Access Free + Google IdP (pending approval)
```

Explicit non-choices: no n8n, no Supabase, no paid auth, no paid database, no dedicated vector database, no R2 dependency, no automated email sending in Phase 0A.

---

## 11. Readiness decision and next phase

**Conditional GO for a Phase 1 prototype.**

The stack is technically viable at $0 fixed cost, and the critical failure modes have been exercised: overlapping calendar events are handled by D1, duplicate actions are idempotent, sessions are owner-bound, prompt injection was resisted in testing, and cron/D1/Worker behaviour is observable.

Conditions before calling it production-ready:

1. Access or an equivalent private admin surface is approved and validated.
2. CRM headers are approved and applied.
3. Gmail remains drafts-only, with human confirmation.
4. Google OAuth is published or the 7-day Testing-mode risk is formally accepted.
5. Real browser/microphone and session-recovery tests pass.
6. The third-party key history is cleaned or confirmed revoked.
7. D1 ENAM residency is accepted in the privacy review.

**Recommended next phase:** a time-boxed Phase 1 prototype with a feature flag:

- Public read-only AI Nour chat/voice over the existing portfolio knowledge.
- Sheets CRM draft records and Calendar booking behind explicit human confirmation.
- D1 booking lock and idempotency in the real flow.
- No automated email sends; drafts only.
- Admin surface private from day one.
- Weekly cost and latency review against the $10 CAD cap.

Do not begin full production implementation until the conditions above are accepted.
