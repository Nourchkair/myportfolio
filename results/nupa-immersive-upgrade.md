# Nupa immersive presentation upgrade — local implementation

**Status:** implemented and validated locally. **Not deployed.** Production remains the approved Sadachbia release.

## 1. Fifteen-minute sessions

The Gemini Live capabilities guide confirms that **audio-only sessions are limited to 15 minutes**. A contiguous 15-minute session is therefore supported without provider resumption.

Implemented:

- `LIVE_SESSION_SECONDS=900` and `MAX_LIVE_SESSION_SECONDS=900`.
- Migration `0009_live_session_900.sql` updates the D1 `live_session_seconds` control to 900.
- Token expiry and session lease now run for 900 seconds.
- Reservation is **$0.45** at 900 seconds using `$0.03/minute`; hold extended to 20 minutes.
- `/api/live/end` now releases the concurrency lease immediately on an explicit visitor stop.
- `pagehide` closes the microphone/socket and sends a keepalive end request when the visitor leaves.
- A 5-minute inactivity timer ends the voice session and releases resources.
- If the browser disappears without sending end, the 900-second lease expires, but the budget reservation hold remains conservative for up to 20 minutes; a new session can be blocked until that hold clears. Real iOS/Android pagehide behavior remains a manual test item.
- Spending caps remain **$3 daily / $7 cumulative**; no cap change.

Local token check:

- `sessionSeconds`: **900**
- `reservationUsdMicros`: **450000**
- Model: `gemini-3.8-live`
- Voice: **Sadachbia**
- Explicit end: `leaseReleased: true`, active leases **0**
- Evidence: `results/nupa-immersive-15m-token.json`

**Resumption:** not required for the 15-minute duration because 15 minutes is the provider maximum. A network drop still ends the session cleanly and starts a new one; transparent network-drop resumption remains an explicit future reliability item.

## 2. Adaptive explanation depth

The Live delivery prompt no longer enforces a fixed short-answer count. It now distinguishes:

- **Brief:** direct answer in a sentence or two.
- **Substantive:** a coherent paragraph or two, connecting the relevant facts and explaining why they matter.
- **Presentation:** multiple connected segments, advancing through related components with checkpoints, not isolated fragments.

The prompt also explicitly tells Nupa to explain the whole requested subject rather than stopping after one component.

## 3. Autonomous presentation progression

Added a presentation continuation controller in the frontend:

- Tracks whether the last turn produced a presentation or visual action.
- Waits for `turnComplete` **and actual audio playback idle**, not merely generation completion.
- Sends a silent, explicit `[Presentation continuation]` message at segment boundaries.
- Asks the model to call `presentProjectStep` for the next verified workflow node and to call `endPresentation` when complete.
- Stops immediately on interruption, manual navigation, pause, end, voice end or epoch change.
- Stops automatically after 24 continuation segments to prevent uncontrolled loops.
- Detects checkpoint questions (`?`, “would you like”, French equivalents) and waits for the visitor instead of continuing.
- Does not count context updates as presentation turns.

Local full-presentation test: one question (“Walk me through the Customer Acquisition system…”) produced a continuous multi-segment presentation across all nine workflow nodes (`target` → `find` → `improve` → `prioritize` → `demo` → `outreach` → `nurture` → replies/bookings → `crm`), with 16 `presentProjectStep` calls, a natural conclusion, and `endPresentation`. The final route was `/projects/acquisition/flow/crm`; voice remained live and the presentation ended cleanly. The visitor never said “continue.” Evidence: `results/nupa-immersive-walkthrough.json`.

A second run confirmed that `presentProjectStep` now applies the verified workflow-node highlight deterministically (`flow-node:acquisition:improve`, step 3/9). Two short partial transcript segments appeared at tool boundaries during the first full run (“After improving the”, “The system then catches replies and scheduled”). The continuation and delivery prompts now require the model to call `presentProjectStep` and wait for confirmation before speaking any part of the next segment, including a lead-in. A short re-check after that revision produced three complete segments with no partial transcripts and a deterministic `flow-node:acquisition:find` highlight (2/9). A full 9-node re-run after the revision remains a manual item; call-level deduplication of repeated presentation-step calls also remains a possible refinement.

## 4. Real-time interface and visitor awareness

Added structured interaction capture:

- Current route/section/project/flow/chapter.
- Visible presentation targets.
- Selected portfolio text and its containing semantic target.
- Hovered, focused and clicked target.
- Scroll position and percentage.
- Workflow zoom state.
- Recent meaningful interactions.

Implementation details:

- `selectionchange`, `pointerover`, `pointerdown`, `focusin`, `scroll` and `resize` listeners.
- Hover is debounced; scroll is debounced; selection is debounced.
- Only portfolio surfaces are captured; inputs, textareas, selects, contenteditable and Nupa chrome are excluded.
- Selection is capped at 500 characters.
- Clicking the Nupa pill or microphone preserves the last meaningful selection.
- The most recent interaction is the primary referent; explicit “what I highlighted” still prioritizes selected text.
- Context updates are sent through **`sendContextUpdate`** as a silent system-instruction context, not a user turn. Context changes do not trigger speech.

Validated:

- Selecting Nour’s contribution paragraph and asking “Can you explain what I highlighted?” produced an answer about that exact contribution text, not the project overview.
- Clicking the demo workflow node then querying context produced `PRIMARY REFERENT — click: flow-node:acquisition:demo`, while retaining the selection for an explicit highlighted-text question.

## 5. Privacy

No screenshots, desktop capture, external browser monitoring or continuous screen streaming were added.

The interaction context contains portfolio page state and selected portfolio text only. It does not transmit form values, credentials, private messages or unrelated browser content. The in-app consent and tour disclosures now state that Nupa receives the current portfolio view and selected portfolio text as context, and that it does not capture the screen or other browser content. The Privacy Policy was clarified on 28 November 2026 under the same version 1.4, provider and purpose. No provider change or new paid service.

## 6. Unified Nupa pill

The bottom presentation bar is completely removed:

- No floating bottom pill.
- No previous/next buttons.
- No project title/step counter/progress bar.
- No bottom pause/resume/end controls.

Internal `presentation` state and step tracking remain for orchestration.

The top-right Nupa pill is now the single control surface:

- **Inactive:** chat access, Nupa label, microphone button.
- **Active voice:** animated voice activity, label, mute/unmute, pause/resume when presenting, end live session.
- **Paused presentation:** resume replaces pause; voice remains active.
- **End:** stops Live, releases microphone, cancels pending presentation actions, clears visual effects and preserves the current portfolio location.

Local checks:

- Inactive pill: start microphone, pause/end hidden.
- Active pill: live state, mute label, end visible.
- Mute: `data-muted=true`, label “Unmute microphone”, text “Muted”.
- Presentation: pause visible; pause keeps voice active; resume restores progression.
- End: pill returns to inactive, end hidden, presentation inactive, route preserved, effects cleared.
- Mobile 390px: pill fits with no overflow; no bottom bar.
- Reduced motion: presentation animations/transitions disabled.

Presentation core browser test: **21/21** (`results/nupa-immersive-presentation.json`).

## 7. Visual storytelling

Existing presentation capabilities remain: highlight, spotlight, dim, cursor, tooltip, expand, workflow trace, compare, zoom/reset, scroll, sequence, clear effects.

Added:

- **Text-range highlighting** via `highlightElement` with an exact `quote`: finds the phrase in the target text, renders positioned highlight rectangles, re-syncs on scroll/resize and clears with visual effects.
- Prompt guidance for narrative-driven visual actions and avoiding mechanical UI narration.
- Existing zoom/pan/trace capabilities are used through the same target registry; no browser-wide zoom changes.

## 8. Speech / visual synchronization

- Continuation waits for **actual audio playback idle**, not just `turnComplete`.
- Visual actions still complete and confirm before the model speaks the step.
- Interruption increments the action epoch, cancels pending continuation and stops playback.
- Pause stops progression without disconnecting voice.
- Segment-level synchronization is used; no word-level timing claim is made.

## 9. Validation summary

| Check | Result | Evidence |
|---|---|---|
| Portfolio validator | **278/278** | `npm run validate` |
| Legal validator | **79/79** | `npm run validate:legal` |
| Nupa unit tests | **78/78** | `ai-nour && npm test` |
| Presentation core browser test | **21/21** | `results/nupa-immersive-presentation.json` |
| 15-minute token/reservation | passed | `results/nupa-immersive-15m-token.json` |
| Selection/hover/click awareness | passed | `results/nupa-immersive-local-validation.json` |
| Unified pill controls | passed | `results/nupa-immersive-local-validation.json` |
| Autonomous multi-segment presentation | passed to natural `endPresentation` | `results/nupa-immersive-walkthrough.json` |
| Deterministic workflow-node highlight | passed | `results/nupa-immersive-walkthrough.json` |
| Public-mode lifecycle/lease controls | 23/23 | `results/public-controls-tests.json` |
| Context updates cause no speech | passed | `results/nupa-immersive-local-validation.json` |
| Text-range quote highlight | passed | `results/nupa-immersive-local-validation.json` |

Not yet tested:

- A full 15-minute wall-clock session.
- Network-drop session resumption.
- iPhone Safari, Android Chrome, Bluetooth and real microphones.
- A full presentation re-run after the latest tool-boundary prompt revision.
- Subjective naturalness, warmth and presentation feel.
- Screen-reader and manual reduced-motion acceptance.

## 10. Deployment state

- Source changes are local/committed; **not deployed**.
- Production remains `gemini-3.8-live` + Sadachbia, 300-second sessions, $3/$7 caps.
- Deployment requires approval, D1 migration `0009`, Worker update and Pages update.
- Rollback remains the previous Worker/Pages versions; migration `0009` is a single control update.

## 11. Artifacts

- `results/nupa-immersive-local-validation.json`
- `results/nupa-immersive-15m-token.json`
- `results/nupa-immersive-walkthrough.json`
- `results/nupa-immersive-presentation.json`
- `src/ai-nour/companion.js`
- `src/ai-nour/audio-worklet.js`
- `src/app/presentation.js`
- `src/app/commands.js`
- `ai-nour/src/services/conversation.js`
- `ai-nour/src/routes/session.js`
- `ai-nour/src/sessions/manager.js`
- `ai-nour/src/knowledge/context.js`
- `ai-nour/src/tools/registry.js`
- `ai-nour/migrations/0009_live_session_900.sql`
- `ai-nour/wrangler.toml` / `wrangler.production.toml`
