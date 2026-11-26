# AI Nour — real-device test plan

This plan is for the isolated Phase 2 prototype. It does not require production deployment. Use the local Worker and portfolio; the only public exposure should be a temporary HTTPS tunnel if iOS microphone access is required.

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

- [ ] Ambient AI Nour button is visible in the toolbar; panel is closed by default.
- [ ] Clicking AI Nour opens the compact panel without shifting the portfolio.
- [ ] Text question returns a grounded answer.
- [ ] Expand/collapse changes the panel width and preserves the thread.
- [ ] “Open the Safiy project” opens the project via NourOS; the panel collapses.
- [ ] Manual navigation while the panel is open collapses it and does not re-open.
- [ ] Voice button asks for microphone permission only after the click.
- [ ] Listening, processing, speaking and idle states are visible.
- [ ] Speaking can be interrupted by talking over it; audio stops promptly.
- [ ] Stop voice ends the session; text still works.
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
   - [ ] AI Nour trigger is reachable with one hand.
   - [ ] Bottom sheet opens, scrolls, and respects safe-area insets.
   - [ ] Microphone permission prompt appears; denial produces a clear error.
   - [ ] Voice playback routes to the speaker; Bluetooth headset switch works.
   - [ ] Talking over the assistant interrupts it.
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

- Live tokens are one-use and expire after 120 seconds; a very long voice session will need to restart. The conversation context is restored from D1.
- Each Live token carries a prepaid evaluation reservation; a second token is blocked when the remaining daily/cumulative budget cannot cover it.
- Gmail sends are disabled; email jobs are queued as dry runs. No real email should be sent during device testing.
- The real microphone and Bluetooth path are not exercised by the automated mock UI tests; this plan is the required human validation.

## 8. What to report back

- Device/OS/browser versions.
- Pass/fail per checklist item.
- Any permission, autoplay, Bluetooth or reconnection failures.
- Screenshots or screen recordings of voice states.
- Subjective French pronunciation and latency notes.
- Whether manual portfolio navigation always took priority over the assistant.
