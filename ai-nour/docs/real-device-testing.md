# AI Nour — real-device test plan

This plan is for the isolated Phase 3 launch candidate. It does not require production deployment. Use the local Worker and portfolio; the only public exposure should be a temporary HTTPS tunnel if iOS microphone access is required.

**Status: prepared, not yet executed by a human.** No real-device result is marked passed. Automated mock UI checks cannot substitute for microphone, Bluetooth, iOS Safari, interruption, French pronunciation, or visual judgement.

## 1. Local desktop setup

```bash
# terminal 1 — Worker
cd ai-nour
npm install
npm run build
npm run db:migrate:local
npm run dev

# terminal 2 — portfolio
cd ..                 # repository root
python3 -m http.server 8771

# terminal 3 — local admin (optional)
cd ai-nour
npm run admin
```

Open:

```text
http://localhost:8771/?ainour=dev&ainour-api=http://127.0.0.1:8789
```

Enter the real `PROTOTYPE_ACCESS_KEY` from `.dev.vars`. The admin is at `http://127.0.0.1:8791` and now uses Google OAuth for the administrator account.

## 2. Desktop Chrome checklist

- [ ] The “Ask Nour AI” pill is visible on every page, immediately to the right of the menu bar.
- [ ] The six visual states are reachable: closed pill, standard text, collapsed chat, expanded, voice, and mobile.
- [ ] The panel can be dragged and keeps its position after close/reopen; it never leaves the viewport.
- [ ] Text opens the transparent panel without shifting the portfolio; Voice opens the voice view.
- [ ] The panel can be dragged by its header, collapsed to the latest reply plus input line, expanded, and keeps its position; it stays inside the viewport.
- [ ] A text question shows the glowing Thinking label while generating, then hides it.
- [ ] Text question returns a grounded answer; the transcript remains after switching modes.
- [ ] “Open the Safiy project” opens the project via NourOS; the pill stays above the project overlay.
- [ ] Manual navigation is never blocked and does not re-open a closed panel.
- [ ] Closing the panel with X does not end the text or voice session.
- [ ] Voice button asks for microphone permission only after the click.
- [ ] Listening, processing, speaking and idle states are visible in the panel and pill.
- [ ] Voice user and AI transcripts appear inside the shared chat thread, with no message labels and no in-panel mic/orb/voice controls.
- [ ] Speaking can be interrupted by talking over it; audio stops promptly.
- [ ] The pill mic toggles voice; the chat panel stays transcript-only; text still works.
- [ ] Closing the panel during a live voice turn keeps the microphone and session running; reopening the chat shows the continuing transcript, and the pill stops voice.
- [ ] The configured Live session limit (default 5 minutes, 10-minute maximum) is understandable, and a new session can be started without losing the transcript.
- [ ] Reload restores the conversation from D1.
- [ ] No console errors or failed network requests.
- [ ] Reading view has no assistant UI.

## 3. Desktop Safari checklist

Repeat the Chrome checklist. Pay special attention to:

- [ ] Microphone permission prompt appears and is remembered.
- [ ] Audio playback starts after the user gesture.
- [ ] AudioContext sample-rate behaviour does not distort voice.
- [ ] Interruptions stop playback and return to listening.
- [ ] Panel glass/backdrop-filter renders correctly.
- [ ] No horizontal overflow at 1440×900 and 1024×768.

## 4. iOS Safari checklist

iOS requires HTTPS for microphone access. Use a temporary HTTPS tunnel for the portfolio and Worker (for example two Cloudflare Quick Tunnels), or an approved dev preview. Do not change production DNS.

1. Start the portfolio on `8771` and Worker on `8789`.
2. Expose each with an HTTPS quick tunnel.
3. Open `https://<portfolio-tunnel>/?ainour=dev&ainour-api=https://<worker-tunnel>`.
4. Enter the prototype access key.
5. Test:
   - [ ] Page loads without layout breakage at 390×844 and 430×932.
   - [ ] The Ask Nour AI pill is reachable with one hand and the mic starts voice mode.
   - [ ] Bottom sheet opens, scrolls, and respects safe-area insets.
   - [ ] Microphone permission prompt appears; denial produces a clear error.
   - [ ] Voice playback routes to the speaker; Bluetooth headset switch works.
   - [ ] Talking over the assistant interrupts it.
   - [ ] Closing the bottom sheet while speaking keeps the session alive; reopening Voice restores it.
   - [ ] Switching to another app and back preserves the session; reconnect works.
   - [ ] French pronunciation is understandable and the answer is in French.
   - [ ] Text fallback works with the software keyboard.
   - [ ] Conversation restores after reload.

## 5. Bluetooth / audio routing

- Pair a headset before starting voice.
- Confirm the OS route is the headset, not the phone speaker.
- Start a voice turn, switch route mid-turn if the device allows it, and report whether playback continues.
- Disconnect the headset mid-turn and report whether playback falls back to the speaker or errors.

## 6. Latency and quality log

Record for each device:

| Measure | Chrome | Safari | iOS Safari |
| --- | --- | --- | --- |
| Time to panel open | | | |
| Time to first spoken response | | | |
| Time to complete a short answer | | | |
| Interrupt response time | | | |
| Reconnect time | | | |
| French clarity (1–5) | | | |
| Audio route issues | | | |

## 7. Known constraints

- Live tokens are one-use and carry a configurable provider-enforced expiry (default 300 seconds / 5 minutes, 600-second maximum). A new session can be started while the transcript and D1 context remain.
- Each Live token carries a prepaid evaluation reservation; a second token is blocked when the remaining daily/cumulative budget cannot cover it. There is a global 12-token/day cap.
- Resend is prepared but not enabled. Email jobs are dry runs (or mock deliveries in tests). No real email should be sent during device testing.
- The real microphone and Bluetooth path are not exercised by the automated mock UI tests; this plan is the required human validation.
- Automated checks are **not** evidence of human audio quality, Bluetooth routing, French pronunciation, or iOS behavior.

## 8. What to report back

- Device/OS/browser versions.
- Pass/fail per checklist item.
- Any permission, autoplay, Bluetooth or reconnection failures.
- Screenshots or screen recordings of voice states.
- Subjective French pronunciation and latency notes.
- Whether manual portfolio navigation always took priority over the assistant.
- Which of the six visual states needs adjustment before final production CSS.
- Whether the configured 5-minute voice limit is acceptable for private beta.
