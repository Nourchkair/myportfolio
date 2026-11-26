# AI Nour — Phase 3 visual approval package

Status: **integrated development candidate; final visual approval pending Nour’s personal review.** Direction A remains the proposed direction. No production CSS or final visual tokens have been changed while approval is pending.

## Review URL

No-cost review (mock Worker):

```text
http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8792
```

Access key: `phase2-test-key`.

Real Worker (costs Gemini usage):

```text
http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8789
```

Access key: `PROTOTYPE_ACCESS_KEY` from `.dev.vars`.

Use `127.0.0.1:8791` for the private admin; `localhost:8791` can hit a stale IPv6 listener.

## The six interface states

| # | State | Screenshot | What to judge |
| --- | --- | --- | --- |
| 1 | **Closed pill** | `screenshots/phase3-state-1-pill.png` | Pill is top-right, outside the menu bar, always visible, not a chatbot bubble. |
| 2 | **Standard text panel** | `screenshots/phase3-state-2-text.png` | 390px transparent glass, thread legibility, context line, disclosure, composer balance. |
| 3 | **Mini panel** | `screenshots/phase3-state-3-mini.png` | 304px compact panel still usable; does not cover the portfolio’s primary content. |
| 4 | **Expanded panel** | `screenshots/phase3-state-4-expanded.png` | 760px workspace; wider thread without taking over the viewport. |
| 5 | **Voice mode** | `screenshots/phase3-state-5-voice.png` | Orb/state treatment; transcript lives in the chat thread; Stop voice is explicit. |
| 6 | **Mobile bottom sheet** | `screenshots/phase3-state-6-mobile.png` | Full-width sheet at 390×844, safe-area awareness, pill remains reachable, composer usable. |

### Thinking sub-state

`thinking(true)` shows the glowing **Thinking** chip while a text answer is generating, then hides it:

`screenshots/phase3-state-thinking.png`

The chip is a state indicator, not a separate message, and respects reduced motion.

## Verified geometry

- Pill: **156×42** at x **1265.8–1422**, y **82–124** on 1440×900.
- Menu banner: x **403–1037**, y **18–78**. No rect overlap, no DOM containment, no “AI Nour” text in the banner; `elementFromPoint` at the pill centre returns the pill in every desktop state.
- Standard panel: **390×667** at (1039.8, 152).
- Mini panel: **304×319.7**, same top-left.
- Expanded panel: **760×605.3** at (672, 152).
- Voice panel: **640×740** in expanded mode.
- Mobile sheet: **390×564.6** anchored to the bottom at 390×844; pill **141×40** at y 62–102.

## Interaction rules

1. AI Nour never blocks portfolio navigation.
2. Manual navigation takes priority; the panel does not re-open over a manual route change.
3. Closing the panel hides the UI only. It never ends a text or voice session; only Stop voice or New ends voice.
4. Voice states are visible in the panel and the pill; listening/speaking are not ambiguous.
5. Text is always available as a fallback.
6. AI Nour identifies itself as AI, not Nour.
7. No automated email, booking, or external write is presented as completed without the relevant confirmation.
8. The permanent Gemini key never reaches the browser; Live uses one-use ephemeral tokens.

## Real-device checklist for the visual pass

Use `docs/real-device-testing.md`. Minimum for this review:

- [ ] Open all six states on desktop Chrome.
- [ ] Repeat the six states on desktop Safari.
- [ ] Open the text sheet on iOS Safari at 390×844.
- [ ] Drag the panel, minimize, expand, close, and reopen; confirm position and thread persistence.
- [ ] Start a real voice session, close the panel while speaking, confirm the session continues, reopen Voice.
- [ ] Test interruption by talking over the assistant.
- [ ] Test French pronunciation.
- [ ] Confirm the two-minute Live limit is understandable and recovery works.
- [ ] Confirm the pill never appears to be part of the menu bar.

Human-device results remain **pending** until Nour runs this checklist. Automated mock tests are not a substitute.

## Approval questions

1. Is Direction A approved as the production direction?
2. Is the top-right pill the right persistent presence?
3. Is the standard panel transparency correct, or should it be more/less transparent?
4. Are the mini and expanded sizes useful?
5. Is the Thinking treatment clear without being distracting?
6. Is the in-chat voice transcript the right treatment?
7. Is closing without stopping the session the desired behavior?
8. Is the mobile bottom sheet acceptable?
9. Any changes to the disclosure, typography, motion, or control placement?

## Production directions

### Direction A — Quiet portfolio companion (implemented, recommended)

Persistent top-right pill plus a movable, resizable text/voice panel. Preserves the portfolio as the primary product.

### Direction B — Conversation workspace (optional)

A larger desktop workspace with a context/navigation rail and deeper transcript. Could be an expansion of Direction A, not the default.

### Direction C — Voice-first mobile (optional)

A voice-dominant mobile sheet with a larger push-to-talk/listening control. The current bottom sheet is the base.

## Gate

Only after visual approval:

1. Replace the temporary visual tokens with final production CSS.
2. Make the pill available by default (or behind the approved setting).
3. Re-run the visual and real-device checks.
4. Remove or keep the feature flag according to the approved rollout.

The implementation remains reversible: removing the feature flag removes the companion entirely without changing the portfolio.
