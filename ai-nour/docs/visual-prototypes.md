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
| 1 | **Closed pill** | `screenshots/phase3-state-1-pill.png` | Pill says “Ask Nour AI”, sits immediately right of the menu bar, and has a text/chat icon plus a mic. |
| 2 | **Standard text panel** | `screenshots/phase3-state-2-text.png` | 390px transparent glass, thread legibility, Viewing/EN/New row, inline composer. |
| 3 | **Collapsed chat** | `screenshots/phase3-state-3-collapsed.png` | Only the latest AI reply plus the single-line composer; the panel no longer covers most of the portfolio. |
| 4 | **Expanded panel** | `screenshots/phase3-state-4-expanded.png` | 760px workspace; wider thread without taking over the viewport. |
| 5 | **Voice transcript** | `screenshots/phase3-state-5-voice.png` | Pill changes to “Listening” and is the only voice control; the chat is transcript-only, with no orb, mic, bars, or start/stop controls. |
| 6 | **Mobile bottom sheet** | `screenshots/phase3-state-6-mobile.png` | Full-width sheet at 390×844, safe-area awareness, pill remains reachable, composer usable. |

### Thinking sub-state

`thinking(true)` shows the glowing **Thinking** label while a text answer is generating, then hides it:

`screenshots/phase3-state-thinking.png`

The label is a state indicator, not a separate message, and respects reduced motion.

## Verified geometry

- Pill: **163.4×42** at (1020, 27) on 1440×900, **10.4px right of the menu bar**, vertically centred; the menu bar is 579.1×60 at (430.4, 18).
- Menu bar no longer contains “Nour OS”; the brand slot is the home mark only.
- Standard text panel: **390×680** at (1039.8, 152) after content; **390×599.1** empty.
- Collapsed chat: **390×217** at (1040, 152); only the latest assistant reply and the 44px composer bar.
- Expanded panel: **760×740** at (672, 152).
- Voice transcript state: the chat panel at **760×740**; the pill is the only voice control.
- Composer: bar **364×44**; a single **32×32** Send button inset 6px from the bar’s right edge. No mic in the chat bar.
- EN **32.6×28**, New **38.9×28**, aligned with the Viewing row; New’s right edge is flush with the composer bar.
- Mobile sheet: **390×497** at (0, 347) at 390×844; pill **149×40** at (229, 70).

## Interaction rules

1. AI Nour never blocks portfolio navigation.
2. Manual navigation takes priority; the panel does not re-open over a manual route change.
3. Closing the panel hides the UI only. It never ends a text or voice session; only the pill mic or New ends voice.
4. Voice states are visible in the panel and the pill; the pill changes from “Ask Nour AI” to “Listening”.
5. Text is always available as a fallback.
6. The pill and panel use the “AI Nour” identity; the old representation disclosure text was removed at Nour’s request.
7. No automated email, booking, or external write is presented as completed without the relevant confirmation.
8. The permanent Gemini key never reaches the browser; Live uses one-use ephemeral tokens.

## Real-device checklist for the visual pass

Use `docs/real-device-testing.md`. Minimum for this review:

- [ ] Open all six states on desktop Chrome.
- [ ] Repeat the six states on desktop Safari.
- [ ] Open the text sheet on iOS Safari at 390×844; confirm the chat bar is text-only.
- [ ] Drag the panel, collapse, expand, close, and reopen; confirm position and thread persistence.
- [ ] Start a real voice session from the pill, close the panel while speaking, confirm the session continues, reopen the chat; stop it from the pill.
- [ ] Test interruption by talking over the assistant.
- [ ] Test French pronunciation.
- [ ] Confirm the two-minute Live limit is understandable and recovery works.
- [ ] Confirm the pill sits immediately to the right of the menu bar and remains reachable.

Human-device results remain **pending** until Nour runs this checklist. Automated mock tests are not a substitute.

## Approval questions

1. Is Direction A approved as the production direction?
2. Is the “Ask Nour AI” pill, beside the menu bar, the right persistent presence?
3. Is the standard panel transparency correct, or should it be more/less transparent?
4. Is the collapsed state (latest AI reply + input line) the right behavior?
5. Is the Thinking treatment clear without being distracting?
6. Is the in-chat voice transcript the right treatment?
7. Is closing without stopping the session the desired behavior?
8. Is the mobile bottom sheet acceptable?
9. Any changes to the pill label/icons, typography, motion, or control placement?

## Production directions

### Direction A — Quiet portfolio companion (implemented, recommended)

Persistent “Ask Nour AI” pill beside the menu bar plus a movable, collapsible text/voice panel. Preserves the portfolio as the primary product.

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
