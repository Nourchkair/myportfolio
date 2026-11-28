# Nupa V3 — Interactive Presentation Intelligence (formerly AI Nour)

> Historical naming note: this release was originally documented as AI Nour. The assistant is now Nupa; internal paths, browser keys and API routes remain unchanged.

Status: **deployed publicly on 27 November 2026.** Worker `00fb071e-77f7-4192-a46e-d09b9fd796fe`; static deployment `d84f8883-dce2-4c6a-a55b-10815b6f6979`; source `39b29ac`. Public beta access requires no beta key; legal v1.4 and consent v1.4 are live.

## 1. Architecture

| Layer | Responsibility |
| --- | --- |
| `src/app/presentation.js` | Target registry, highlight/spotlight system, virtual Nupa cursor, tooltips, workflow tracing, compare/zoom, presentation state, cancellation and layout synchronisation. |
| `src/app/commands.js` | Extends the existing `window.NourOS` command API with presentation targets, visual actions, readiness waits and cancellation. |
| `src/app/immersive.js` | Bridges presentation actions to the real portfolio navigation and existing interaction logic (project flow, journey tabs, project cards). |
| `ai-nour/src/tools/registry.js` | Allowlisted presentation tools, target validation, action construction and navigation/readiness metadata. |
| `ai-nour/src/knowledge/context.js` | Normalises the client’s approved target registry into the model’s portfolio context. |
| `ai-nour/src/sessions/manager.js` | Mode-selection, visual-tool, presentation-step, interruption and visitor-tailoring instructions. |
| `src/ai-nour/companion.js` | Orchestrates tool actions, presentation state, text/voice transitions, unified-pill controls, pauses and cancellation. |
| `src/ai-nour/companion.css` | Native glass highlight, spotlight, cursor, tooltip, text-range highlight and unified-pill styling, including reduced-motion and mobile rules. |

## 1b. Opening experience

The opening greeting now offers two optional paths without blocking entry:

- **Explore independently** — immediately completes the intro and leaves the portfolio in its normal state.
- **Explore with Nupa** — available on the public portfolio; on first use it shows the short “Meet Nupa.” / “Let’s explore” consent panel, then a separate microphone-consent panel. “Allow microphone and start” begins a live, conversational experience on the main portfolio view without opening the chat panel. Nupa introduces itself, asks one natural question, then dynamically chooses what to present based on the response. No project or presentation action is applied before the visitor speaks. “Use text chat instead” opens chat. No beta key is required.

If no choice is made, the intro continues automatically into independent browsing. The portfolio never requires an AI selection, and the assistant remains available from the pill later. The first Nupa choice shows a concise paid-processing/retention/admin disclosure with inline Terms and Privacy links and no checkbox. “Let’s explore” records consent; microphone consent remains separate and appears only when voice is activated.

## 2. Interaction modes

Nupa selects the mode from intent, without asking the visitor to configure one:

- **Conversation** — answers without visual manipulation; still receives the current section/project/flow/chapter.
- **Contextual assistance** — one or more focused highlights, spotlight, hover, expand, point or compare actions, followed by natural conversation.
- **Presentation** — project or workflow navigation with step-by-step visual actions and internal presentation state. Active-session controls live in the unified Nupa pill; there is no bottom presentation bar.

The prompt explicitly discourages full presentations for simple factual questions and visual overuse when the answer is clear in words.

## 3. Target registry

Stable target ids are generated for approved components only:

- `section:*`, `main-card:*`, `project-card:<projectId>[:tag:<index>]`
- `project:<projectId>`, `project-hero:*`, `project-overview:<projectId>:<what|challenges|value>`
- `project-text:<projectId>:<view>:<index>`, `project-contribution:*`, `project-tag:*`
- `flow:<projectId>`, `flow-node:<projectId>:<nodeId>`, `flow-link:<projectId>:<from>-><to>`
- `journey`, `journey-chapter:*`, `journey-tab:*`, `journey-text:*`, `journey-chip:*`
- `contact`, `about`

The registry exposes labels, semantic descriptions, available actions, relationships and knowledge references. It is generated from the actual application state and verified project/journey data; arbitrary CSS selectors and JavaScript execution are not accepted.

Backend validation rejects unknown tools, unknown projects/nodes/chapters, malformed target ids, compare requests without two targets, and out-of-range paragraph/tag indexes. The frontend re-validates against the live registry before applying an effect.

## 3b. Stable semantic targets

Paragraph, capability, contribution-block, and journey-text ids use semantic slugs (with a short content hash where needed) instead of numeric indexes. Examples: `project-card:acquisition:tag:sales-strategy`, `project-text:acquisition:what:an-ai-assisted-customer-acquisition-syst-vp84o9`, `project-contribution:acquisition:block:problem`. Reordering content does not change an id; editing the underlying text changes it. Resolution is by semantic text matching within the approved component, not by position.

## 4. Visual system

- Single and multiple highlights; `outline`, `glow` and `emphasis` treatments.
- Sequential highlighting with a cancellable step timer.
- Spotlight with surrounding dimming and a target outline.
- Virtual cursor labelled “Nupa”, with a ring/dot, smooth movement, target following and no pointer interception. The visitor’s actual cursor is never moved or replaced.
- Existing interaction states are reused: workflow tooltips (`showFlowTip`), project opening, flow opening, journey chapter selection, project-card selection and project deck selection.
- Workflow tracing uses the real SVG connection paths: highlighted nodes, highlighted connection, directional dash animation and a moving pulse dot.
- Compare highlights two targets and draws a viewport connector.
- Zoom transforms the actual workflow canvas around the target; reset restores it.
- Effects re-sync on scroll, resize, transition/animation end and route/state changes. Active targets are re-resolved if the DOM replaces them.
- `prefers-reduced-motion` disables movement/emphasis animations and removes transitions.

## 5. Presentation controls

The bottom presentation bar has been removed. All active-session controls live in the existing top-right Nupa pill:

- Inactive: chat access, Nupa label and microphone button.
- Active voice: animated voice indicator, label, mute/unmute, pause/resume when presenting, and end live session.
- Paused: resume replaces pause; the voice session and presentation context remain active.
- End: terminates Live, releases the microphone, cancels pending actions, clears visual effects and preserves the visitor’s current page.

Presentation state and progression tracking remain internal for orchestration. Visitors can also ask verbally to pause, skip, continue or stop. On mobile the pill stays within the viewport.

## 6. Speech / animation synchronisation

The implementation is **step-level**, not word-level.

1. The model calls one navigation/visual tool for the current step.
2. Navigation actions carry a `waitForTarget` id.
3. The frontend waits for the actual target to be rendered and visible; it does not rely on a fixed navigation delay.
4. Visual actions resolve the target, scroll it into view, apply the effect and return an acknowledgement.
5. In Live voice, the frontend sends the tool response only after `runActions` completes, so Gemini receives the visual confirmation before it speaks the step.
6. In text, actions are applied before the assistant reply is added to the transcript.
7. Presentation actions carry `stepIndex`, `totalSteps` and a label for internal orchestration. They are no longer shown as a bottom progress bar.
8. The current Gemini Live model exposes turn completion, voice activity and interruption events; it does not expose reliable word-level timestamps. The implementation therefore uses step-level readiness and interruption events rather than pretending to have word-level sync.

## 7. Interruptions and adaptation

- A monotonic action epoch cancels stale visual sequences and prevents outdated tool responses from overriding newer visitor actions.
- Manual route changes cancel pending visual actions, clear effects and **pause** the presentation. The Nupa pill remains available, the current location is sent to Nupa, and it can adapt or resume. Only an explicit stop/end terminates the session.
- Live interruption pauses the presentation, stops queued audio playback and cancels pending visual sequencing while preserving the current context.
- The same presentation state carries across text and voice, including voice-session expiry.
- Sending a text message during a presentation pauses it before the question is processed.
- The unified pill can pause, resume or end. Verbal requests can still skip, go back, continue or explore another section.
- Visitor profile and current context continue to drive emphasis: recruiter, business owner, technical visitor or curious visitor.

## 8. Validation

Consolidated evidence: `results/nupa-validation.json`.

Local regression:

- Unit tests: **75/75** (including Nupa identity regressions and public-access auth)
- API tests: **23/23**
- CRM tests: **14/14**
- Consent tests: **12/12**
- Lifecycle tests: **28/28**
- Admin auth: **16/16**
- Live budget/duration: **9/9**
- Portfolio validation: **261**
- Legal validator: **76/76**

Nupa opening experience (`results/nupa-v3-opening-browser.json`): **22/22** — two English panel cards inside the intro, explicit choice before entry, no auto-close, cards below the greeting, independent default, public Nupa path, centered “Meet Nupa.” consent panel outside the chat with blurred portfolio background, “Let’s explore” action, no checkbox, paid-Gemini/retention/admin disclosure, legal links, a separate bilingual microphone-consent panel, voice-tour entry on the main view without opening chat, no automatic predefined tour, French consent and French companion UI with English opening cards, and an EN/FR consent-modal language toggle.

Nupa browser presentation run (`results/nupa-v3-presentation-browser.json`): **22/22**

Production opening cards and consent (`results/nupa-production-intro.json`): **11/11** — two English panel cards inside the intro with no foreground-depth occlusion and improved contrast, no auto-close, cards below the greeting, independent entry, centered English/French “Meet Nupa.” consent panel outside the chat with blurred background, “Let’s explore” acceptance with no checkbox, a separate voice-tour microphone panel that starts on the main view without an automatic predefined tour, and independent entry that never opens the Nupa panel.

Public default entry (`results/nupa-production-public-default.json`): **4/4** — Nupa appears on the normal portfolio URL without a query parameter. The new flow shows “Meet Nupa.” only when Nupa is chosen, then the voice-tour microphone panel; “Allow microphone and start” opens a conversational experience on the main view; Nupa asks one question and then chooses the presentation direction dynamically. Public-controls validation: **23/23**.

- Approved target registry on home, project deck and flow.
- Multiple simultaneous highlights.
- Spotlight and virtual cursor.
- Existing workflow tooltip through hover; collapse.
- Real connection trace with 3 highlighted components, one traced path and one animated pulse.
- Compare with two highlights and a connector.
- Zoom and reset.
- Sequential highlight with final target retained.
- Cancellation of a stale sequence without wiping the current highlight.
- Invalid target rejection.
- Clear effects preserving internal presentation state and no bottom bar.
- Pause, resume and end.
- Reduced-motion behavior.
- Mobile pill at 390px viewport: fits with no overflow.
- Stable semantic paragraph/tag ids resolve and highlight.
- Nupa pill/cursor branding.
- French pill control labels.

Earlier Nupa AI orchestration run (`results/nupa-v3-chat.json`, before the unified-pill change):

- Text message → `highlightElement` → highlighted project card + cursor + action chip.
- Text message → `presentProject` → project and flow open at the verified demo step with internal `5 / 9` progress; no bottom bar.
- Manual `navigateTo('home')` → pending effects cleared and presentation paused; pill remains available.
- Explicit **End** → presentation terminated, effects cleared and voice resources released.
- Identity in text: “Who are you? Are you Nour?” → “No, I’m Nupa…” with no claim to be Nour.
- Identity in French: “Es-tu Nour ?” → “Non, je suis Nupa…” with no claim to be Nour.
- No browser console errors.

Earlier V3 evidence (`results/v3-opening-real-model.json`), captured before the Nupa identity update, produced a natural live/personalized greeting and asked what to explore first. The current source prompt and system rules introduce Nupa; a new real-model production check is part of the post-deployment validation.

Visual evidence:

- `results/v3-visual/opening-paths.jpg`
- `results/v3-visual/desktop-compare.jpg`
- `results/v3-visual/mobile-highlight.jpg`

A real Gemini text call also selected `highlightElement` for “Highlight the Customer Acquisition project card”, confirming the new tool contract is discoverable by the production text model.

## 9. Limitations

- Word-level speech timing is unavailable; synchronisation is step-level.
- Real-device microphone/Bluetooth/iOS voice acceptance is still pending. The presentation engine was browser-tested with text/tool orchestration and direct controller actions.
- In text mode, previous/next now request an explanation through the normal text budget; in voice mode they send a presentation-continuation message. Real-device voice remains pending.
- Paragraph/tag targets use semantic slugs. Editing the underlying content changes its id; reordering does not.
- The reading view remains assistant-free; presentation effects apply to the immersive portfolio.
- No unrestricted browser automation, offsite scripting, screenshots of the visitor’s screen, or arbitrary DOM control.

## 10. Performance and cost

- No new paid service, subscription, database, storage or fixed monthly infrastructure.
- No extra fixed cost; presentation actions use the existing Gemini tool loop.
- One model/tool step at a time avoids parallel animations and excessive tool calls.
- Target discovery is on demand; visual synchronisation uses requestAnimationFrame, short cancellable timers and one-shot readiness waits, not continuous polling.
- Active effects are cleared on end/manual navigation, limiting DOM and animation residue.

## 11. Manual acceptance scenarios

1. On opening, choose Explore independently and confirm browsing continues normally; then try Explore with Nupa and the existing consent/key flow.
2. Ask “Guide me through what I’m looking at” from the home view.
3. Ask “How does this flow actually work?” while on a project flow.
4. Ask “Show me what Nour contributed to this project.”
5. Ask “What’s the difference between these two components?” on a flow.
6. Ask “Walk me through this from beginning to end.”
7. Ask “Where exactly does the AI come into play?”
8. Ask “Show me the most relevant project for an AI consulting position.”
9. Interrupt a voice presentation with a question; verify it pauses, answers and can resume.
10. Manually click another section/project during a presentation; verify visual effects stop immediately.
11. Test the same scenarios on a phone/touch viewport and with reduced motion enabled.
12. Test English and French prompts; verify narration language and visual targeting.
13. Verify the unified pill mute, pause/resume and end controls; confirm no bottom presentation bar exists.
