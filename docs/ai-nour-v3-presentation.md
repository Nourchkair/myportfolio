# Nupa V3 — Interactive Presentation Intelligence (formerly AI Nour)

> Historical naming note: this release was originally documented as AI Nour. The assistant is now Nupa; internal paths, browser keys and API routes remain unchanged.

Status: **deployed to the production private beta on 27 November 2026.** Worker `28bcef6b-4260-495e-94bc-4fc7e90d203a`; static deployment `13f85f66-363f-48f9-996c-a205ef12e6ec`; source `c6142e8`.

## 1. Architecture

| Layer | Responsibility |
| --- | --- |
| `src/app/presentation.js` | Target registry, highlight/spotlight system, virtual Nupa cursor, tooltips, workflow tracing, compare/zoom, presentation bar, cancellation and layout synchronisation. |
| `src/app/commands.js` | Extends the existing `window.NourOS` command API with presentation targets, visual actions, readiness waits and cancellation. |
| `src/app/immersive.js` | Bridges presentation actions to the real portfolio navigation and existing interaction logic (project flow, journey tabs, project cards). |
| `ai-nour/src/tools/registry.js` | Allowlisted presentation tools, target validation, action construction and navigation/readiness metadata. |
| `ai-nour/src/knowledge/context.js` | Normalises the client’s approved target registry into the model’s portfolio context. |
| `ai-nour/src/sessions/manager.js` | Mode-selection, visual-tool, presentation-step, interruption and visitor-tailoring instructions. |
| `src/ai-nour/companion.js` | Orchestrates tool actions, presentation state, text/voice transitions, bar controls, pauses and cancellation. |
| `src/ai-nour/companion.css` | Native glass highlight, spotlight, cursor, tooltip and presentation-control styling, including reduced-motion and mobile rules. |

## 1b. Opening experience

The opening greeting now offers two optional paths without blocking entry:

- **Explore independently** — immediately completes the intro and leaves the portfolio in its normal state.
- **Explore with Nupa** — available only when the private-beta companion is loaded; it completes the intro, opens the assistant and uses the existing consent/key gate.

If no choice is made, the intro continues automatically into independent browsing. The portfolio never requires an AI selection, and the assistant remains available from the pill later. Choosing Nupa explains the live/personalized nature, offers text first with voice as an optional switch, asks about interests, and starts with a natural AI introduction. The existing age/Terms/Privacy acceptance and separate microphone consent are reused without another screen.

## 2. Interaction modes

Nupa selects the mode from intent, without asking the visitor to configure one:

- **Conversation** — answers without visual manipulation; still receives the current section/project/flow/chapter.
- **Contextual assistance** — one or more focused highlights, spotlight, hover, expand, point or compare actions, followed by natural conversation.
- **Presentation** — project or workflow navigation with step-by-step visual actions, a minimal presentation bar, pause/resume/previous/next/end controls and progress.

The prompt explicitly discourages full presentations for simple factual questions and visual overuse when the answer is clear in words.

## 3. Target registry

Stable target ids are generated for approved components only:

- `section:*`, `main-card:*`, `project-card:<projectId>[:tag:<index>]`
- `project:<projectId>`, `project-hero:*`, `project-overview:<projectId>:<what|challenges|value>`
- `project-text:<projectId>:<view>:<index>`, `project-contribution:*`, `project-tag:*`
- `flow:<projectId>`, `flow-node:<projectId>:<nodeId>`, `flow-link:<projectId>:<from>-><to>`
- `journey`, `journey-chapter:*`, `journey-tab:*`, `journey-text:*`, `journey-chip:*`
- `contact`, `about`, `control:presentation-*`

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

A single compact glass bar appears only while presenting:

- “Nupa” live indicator, project/step label and `current / total` progress.
- Previous, pause, resume, next and end.
- The visitor can always end visual assistance; controls are keyboard-focusable and the bar is a labelled region, not a focus trap.
- On mobile the bar is constrained to the viewport and placed above the home indicator.

## 6. Speech / animation synchronisation

The implementation is **step-level**, not word-level.

1. The model calls one navigation/visual tool for the current step.
2. Navigation actions carry a `waitForTarget` id.
3. The frontend waits for the actual target to be rendered and visible; it does not rely on a fixed navigation delay.
4. Visual actions resolve the target, scroll it into view, apply the effect and return an acknowledgement.
5. In Live voice, the frontend sends the tool response only after `runActions` completes, so Gemini receives the visual confirmation before it speaks the step.
6. In text, actions are applied before the assistant reply is added to the transcript.
7. Presentation actions carry `stepIndex`, `totalSteps` and a label for progress.
8. The current Gemini Live model exposes turn completion, voice activity and interruption events; it does not expose reliable word-level timestamps. The implementation therefore uses step-level readiness and interruption events rather than pretending to have word-level sync.

## 7. Interruptions and adaptation

- A monotonic action epoch cancels stale visual sequences and prevents outdated tool responses from overriding newer visitor actions.
- Manual route changes cancel pending visual actions, clear effects and **pause** the presentation. The bar remains available, the current location is sent to Nupa, and it can adapt or resume. Only an explicit stop/end terminates the session.
- Live interruption pauses the presentation, stops queued audio playback and cancels pending visual sequencing while preserving the current context.
- Text previous/next requests a contextual explanation from the model, not merely a highlight movement; the same presentation state carries across text and voice, including voice-session expiry.
- Sending a text message during a presentation pauses it before the question is processed.
- Presentation controls can pause/resume/end; previous/next move to real flow nodes, highlight them, and request a contextual explanation in text or a continuation in voice.
- Visitor profile and current context continue to drive emphasis: recruiter, business owner, technical visitor or curious visitor.

## 8. Validation

Consolidated evidence: `results/nupa-validation.json`.

Local regression:

- Unit tests: **72/72** (including 5 Nupa identity regressions)
- API tests: **23/23**
- CRM tests: **14/14**
- Consent tests: **12/12**
- Lifecycle tests: **28/28**
- Admin auth: **16/16**
- Live budget/duration: **9/9**
- Portfolio validation: **261**
- Legal validator: **64/64**

Nupa opening experience (`results/nupa-v3-opening-browser.json`): **17/17** — two English panel cards inside the intro, explicit choice before entry, no auto-close, cards below the greeting, independent default, beta-only Nupa path, centered consent modal outside the chat with blurred portfolio background, “Continue and agree” button, no checkbox, Gemini/retention/admin disclosure, legal links, Nupa introduction, French consent and French companion UI with English opening cards, and an EN/FR consent-modal language toggle.

Nupa browser presentation run (`results/nupa-v3-presentation-browser.json`): **22/22**

Production opening cards and explicit choice (`results/nupa-production-intro.json`): **10/10** — two English panel cards inside the intro, no auto-close, cards below the greeting, independent entry, centered English/French consent modal outside the chat with blurred background, “Continue and agree” acceptance with no checkbox, and Nupa consent path.

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
- Clear effects preserving the presentation bar.
- Pause, resume and end.
- Reduced-motion behavior.
- Mobile bar at 390px viewport: 291px wide, no overflow.
- Stable semantic paragraph/tag ids resolve and highlight.
- Nupa bar/cursor branding.
- French presentation-control labels (`Terminer`, `Reprendre`, `Étape suivante`).

Nupa AI orchestration run (`results/nupa-v3-chat.json`):

- Text message → `highlightElement` → highlighted project card + cursor + action chip.
- Text message → `presentProject` → bar, project and flow open at the verified demo step with `5 / 9` progress.
- Manual `navigateTo('home')` → pending effects cleared, presentation paused, bar retained.
- Text **Next** → contextual assistant explanation added and progress advanced.
- Explicit **End** → presentation terminated, bar hidden and effects cleared.
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
13. Verify the presentation bar pause/resume/previous/next/end controls.
