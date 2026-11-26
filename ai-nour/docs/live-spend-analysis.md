# Live voice spending and exposure analysis — Phase 3

Status: **analysis complete; no WebSocket proxy implemented.** The existing direct-to-Gemini Live architecture remains for private beta, with tighter server-side issuance and settlement.

## Current controls

| Control | Current setting | Effect |
| --- | --- | --- |
| Live model | `gemini-3.8-live` | Retained. |
| Ephemeral token lifetime (`expireTime`) | **120 seconds** | The browser cannot send Live messages after two minutes. |
| New-session window | **60 seconds** | A token must be used promptly to start one session. |
| Uses per token | 1 | One token cannot start multiple sessions. |
| Prepaid reservation | **$0.08 USD** per token | Held against the daily and cumulative caps before minting. |
| Reservation hold | **15 minutes** | Abandoned tokens are settled as `live_unreported` after the hold. |
| Daily minted-token cap | **12 tokens/day** (global D1 counter) | Hard ceiling on sessions regardless of usage reporting. |
| Rate limit | 12 Live token requests per 10 minutes per client | Burst control. |
| Daily cap | **$1.00 USD** | Token issuance and text usage are blocked at the cap. |
| Cumulative cap | **$7.00 USD** (~$9.95 CAD) | Evaluation budget under the $10 CAD approval. |

## Provider-side limits (verified 26 November 2026)

- Audio-only Live sessions are limited to about **15 minutes** without context-window compression; audio+video to about 2 minutes.
- A Live WebSocket connection is limited to about **10 minutes**.
- Ephemeral token `expireTime` controls how long messages can be sent on the connection; `newSessionExpireTime` controls how long the token can start a new session.
- Audio is tokenized at a fixed **25 tokens/second** for Live input. The same order of magnitude applies to output audio; the cost model below uses the published rates and 25 TPS.
- The provider’s concurrent-session quota is project-wide; the application’s 12-token daily cap is tighter for this private beta.

## Per-session maximum cost

Using the configured rates and a 120-second hard token lifetime:

| Component | Maximum tokens | Rate per million | Maximum cost |
| --- | ---: | ---: | ---: |
| Audio input | 25 × 120 = 3,000 | $3.00 | $0.0090 |
| Audio output | 25 × 120 = 3,000 | $12.00 | $0.0360 |
| Text/system/input overhead | ~2,000 | $0.75 | ~$0.0015 |
| **Total per 2-minute session** | | | **~$0.0465** |

The **$0.08 reservation is therefore larger than the maximum modeled 2-minute session cost**, with about 1.7× headroom. If the token lifetime or model/audio rates change, this conclusion must be recalculated before launch.

At 12 sessions/day, the modeled worst case is **~$0.56/day** (12 × $0.0465), below the $1/day cap. The actual ledger charges the reservation when usage is unreported, so the internal budget is conservative.

## Abandoned and unreported connections

The previous behavior held a reservation for one hour and then stopped counting it if the browser never reported usage. That could free budget without recording a cost. Phase 3 changes this:

1. A minted token creates a held reservation for 15 minutes.
2. If the browser reports a Live turn, the server charges `max(actual, reservation)` and reconciles the hold.
3. If the hold expires without a report, the scheduled cleanup records the reservation as `live_unreported` and marks the token expired.
4. The daily minted-token cap (12) independently blocks repeated minting even if settlement were delayed.

Residual risk: the reservation is an **internal accounting control**, not a provider-side spending cap. A party that obtains a valid token can consume up to the token lifetime of Gemini usage before the server sees a report. The 120-second lifetime and $0.08 reservation are what keep that exposure below the daily cap; do not increase either without redoing this analysis.

## Concurrent sessions

- The application prevents more than one session per token (`uses=1`).
- The global daily cap is 12 tokens, regardless of owner, IP, or browser.
- The 12-per-10-minute rate limit prevents a single client from draining the daily quota in one burst.
- A determined user with multiple clients could still consume the daily 12-session budget; that is the intended global ceiling for private beta.

## Server-side WebSocket proxy comparison

| Dimension | Direct ephemeral token (current) | Worker WebSocket proxy |
| --- | --- | --- |
| Permanent Gemini key exposure | Never in browser; token is one-use and short-lived | Never in browser; key stays server-side |
| Exact metering | Depends on browser reporting; reservation floor + settlement | Full server-side byte/token metering possible |
| Immediate cutoff | Provider enforces token/session limits; server cannot cut an open socket | Server can terminate immediately |
| Abandoned connection control | Reservation settlement + 120s token lifetime | Stronger; socket closes when server decides |
| Reliability | Fewer hops; lowest latency | Extra hop, Worker connection limits, reconnect complexity |
| Cost | $0 fixed; Gemini usage only | Worker/WebSocket runtime may introduce CPU/duration limits; Durable Objects can add cost |
| Complexity | Existing, tested | New protocol bridge, auth, reconnect, bilingual/tool-call handling |
| Bilingual/interruption/recovery | Already working | Must be reimplemented and retested |

**Recommendation:** do not implement a proxy for private beta. The 120-second token lifetime, one-use tokens, $0.08 reservation, 15-minute settlement, global 12-token daily cap, and $1/day cap materially bound exposure without adding a paid or operationally complex hop.

Revisit a proxy if any of these becomes true:

- Live sessions must exceed roughly two minutes.
- The prototype becomes publicly accessible without an access gate.
- Abuse or unreported usage is observed.
- Exact per-second billing/metering is required for compliance.
- Cloudflare offers a zero-fixed-cost WebSocket path that preserves tool calls, interruptions, bilingual transcription, and session recovery without a Durable Object charge.

## Required operational checks

- Keep `LIVE_TOKEN_TTL_SECONDS=120` and `LIVE_TOKEN_HOLD_SECONDS=900` until this analysis is revisited.
- Keep `MAX_LIVE_TOKENS_PER_DAY=12` and the $1/day cap.
- Monitor `live_unreported` cost events and the daily token count.
- Do not raise the reservation below the modeled 2-minute maximum.
- Recalculate if Gemini pricing, audio tokenization, or the Live model changes.
