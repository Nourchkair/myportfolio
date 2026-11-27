# Live voice spending and exposure analysis — Phase 4

Status: **5-minute sessions are the current public deployment default (27 November 2026); 10 minutes remains the admin-configurable maximum. No WebSocket proxy.** The provider-issued ephemeral token expiry and the prepaid reservation are the enforcement points, not a frontend timer.

## Current controls

| Control | Default | Effect |
| --- | --- | --- |
| Live model | `gemini-3.8-live` | Retained. |
| Live session duration | **300 seconds** | Configurable 60–600s from the admin dashboard; 300s default. |
| Ephemeral token expiry (`expireTime`) | **session duration** | Gemini rejects messages after this time; provider-enforced. |
| New-session window | 60 seconds | Token must be used promptly to start one session. |
| Uses per token | 1 | One token cannot start multiple sessions. |
| Reservation | **$0.125** at 300s | `max($0.08 floor, ceil(minutes × $0.025))`; $0.25 at the 600s maximum. |
| Reservation hold | 15 minutes | Covers the 10-minute token plus a 5-minute reconciliation grace period. |
| Daily minted-token cap | 12 | Secondary ceiling; the $1 daily budget is the binding ceiling at $0.125/token for 300s sessions. |
| Rate limit | 12 token requests/10 minutes per client | Burst control. |
| Daily cap | $3.00 USD for acceptance testing (admin-lowerable; originally $1.00) | Blocks token issuance and text usage when reached. |
| Cumulative cap | $7.00 USD (~$9.95 CAD; admin-lowerable) | Evaluation budget under the $10 CAD approval. |

## Production validation

- Production `/api/live/token` is configured for `sessionSeconds=300` and an `expiresAt` 300 seconds ahead. The 600-second maximum remains available in admin.
- A real production Live session connected, produced audio and a transcript, executed portfolio navigation, and persisted the turn (12/12).
- The reservation at 300 seconds is **$0.125**; the 600-second maximum remains **$0.25**.
- Emergency shutdown blocked new sessions and restored cleanly (10/10).
- Production budget after V2 validation: **$1.687531 USD / ~$2.3994 CAD** cumulative, **$0.790668 USD** daily, no held reservations.
- Production voice: **Iapetus**.

## Provider-side vs application-side duration

- Gemini Live audio-only sessions have a provider limit of about **15 minutes**; the WebSocket connection is limited to about **10 minutes**.
- An ephemeral token’s `expireTime` limits how long messages can be sent on that connection. The server sets it to the selected session duration (default 300s; 600s maximum), so the cap is enforced by Gemini, not by a browser timer.
- The browser does have no countdown that ends the session; it only cleans up when the provider closes or the user stops voice.
- `newSessionExpireTime` remains 60s, so a token cannot be minted and held indefinitely before connecting.
- The server does not use a frontend timer as the duration enforcement mechanism.

## Per-session maximum cost at 10 minutes (admin maximum)

Using the configured rates and 25 input-audio tokens/second:

| Component | Maximum tokens | Rate per million | Maximum cost |
| --- | ---: | ---: | ---: |
| Audio input | 25 × 600 = 15,000 | $3.00 | $0.0450 |
| Audio output | 25 × 600 = 15,000 | $12.00 | $0.1800 |
| Text/system/input overhead | ~2,000 | $0.75 | ~$0.0015 |
| **Total per 10-minute session** | | | **~$0.2265** |

The **$0.25 reservation is larger than the modeled 10-minute maximum**. Under the original $1.00 daily cap, four sessions/day were possible; the current $3.00 testing cap and the 12-token/day limit govern exposure. The reservation remains conservative if the session is shorter or the model uses less output.

## Abandoned and unreported connections

1. Minting creates a held reservation for 15 minutes.
2. Reported usage charges `max(actual, reservation)` and reconciles the hold.
3. If the hold expires unreported, scheduled cleanup marks it `live_unreported` and records the reservation as spent.
4. The global daily minted-token count remains a secondary cap.

Residual risk: the reservation is an **internal accounting control**, not a provider-side billing cap. A party holding a valid token can consume up to the token lifetime of Gemini usage before the server sees a report. At 300s, the reservation is $0.125; at the 600s maximum, the modeled maximum ($0.2265) remains below the $0.25 reservation. Do not increase the session duration or lower the per-minute reservation without recalculating.

## Admin configuration

The admin **Controls** tab exposes:

- Live session duration (60–600 seconds; default 300).
- Daily spending cap (at or below the approved deployment maximum).
- Cumulative spending cap (at or below the approved deployment maximum).

Changing the session duration affects the next token: the server reads `live_session_seconds`, calculates `reservation = max($0.08, ceil(minutes × $0.025))`, and mints the token with that `expireTime`. Existing tokens keep their issued expiry.

The deployed maxima remain environment-configured (`DAILY_SPEND_CAP_USD_MICROS`, `CUMULATIVE_SPEND_CAP_USD_MICROS`) and cannot be exceeded from the dashboard.

## WebSocket proxy decision

A server-side WebSocket proxy is **not implemented**.

| Dimension | Direct ephemeral token (current) | Worker WebSocket proxy |
| --- | --- | --- |
| Permanent key exposure | Never in browser; one-use token | Never in browser |
| Exact metering | Browser-reported usage; provider expiry + reservation | Full server-side metering possible |
| Hard cutoff | Provider-enforced `expireTime` | Server can terminate immediately |
| Abandoned connections | 15-minute hold + settlement | Stronger immediate close |
| Reliability | Fewer hops; lowest latency | Extra hop, reconnect/tool-call complexity |
| Cost | $0 fixed; Gemini usage only | Worker/WebSocket runtime can add CPU/duration or Durable Object cost |
| Bilingual/interruption/recovery | Already working | Must be reimplemented and retested |

With a 10-minute token expiry and a reservation above the modeled maximum, the direct architecture is adequate for the current deployment. Revisit a proxy if sessions need to exceed 10 minutes, abuse appears, exact per-second metering is required, or a zero-fixed-cost WebSocket path can preserve tool calls, interruptions, bilingual transcription, and recovery.
