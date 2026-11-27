# AI Nour V3 — Interactive Presentation Intelligence

Status: **implemented and validated locally. Not deployed to production.** Production deployment requires explicit approval after the acceptance pass.

## 1. Architecture

| Layer | Responsibility |
| --- | --- |
| `src/app/presentation.js` | Target registry, highlight/spotlight system, virtual AI cursor, tooltips, workflow tracing, compare/zoom, presentation bar, cancellation and layout synchronisation. |
| `src/app/commands.js` | Extends the existing `window.NourOS` command API with presentation targets, visual actions, readiness waits and cancellation. |
| `src/app/immersive.js` | Bridges presentation actions to the real portfolio navigation and existing interaction logic (project flow, journey tabs, project cards). |
| `ai-nour/src/tools/registry.js` | Allowlisted presentation tools, target validation, action construction and navigation/readiness metadata. |
| `ai-nour/src/knowledge/context.js` | Normalises the client’s approved target registry into the model’s portfolio context. |
| `ai-nour/src/sessions/manager.js` | Mode-selection, visual-tool, presentation-step, interruption and visitor-tailoring instructions. |
| `src/ai-nour/companion.js` | Orchestrates tool actions, presentation state, text/voice transitions, bar controls, pauses and cancellation. |
| `src/ai-nour/companion.css` | Native glass highlight, spotlight, cursor, tooltip and presentation-control styling, including reduced-motion and mobile rules. |

## 2. Interaction modes

AI Nour selects the mode from intent, without asking the visitor to configure one:

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

## 4. Visual system

- Single and multiple highlights; `outline`, `glow` and `emphasis` treatments.
- Sequential highlighting with a cancellable step timer.
- Spotlight with surrounding dimming and a target outline.
- Virtual cursor labelled “AI Nour”, with a ring/dot, smooth movement, target following and no pointer interception. The visitor’s actual cursor is never moved or replaced.
- Existing interaction states are reused: workflow tooltips (`showFlowTip`), project opening, flow opening, journey chapter selection, project-card selection and project deck selection.
- Workflow tracing uses the real SVG connection paths: highlighted nodes, highlighted connection, directional dash animation and a moving pulse dot.
- Compare highlights two targets and draws a viewport connector.
- Zoom transforms the actual workflow canvas around the target; reset restores it.
- Effects re-sync on scroll, resize, transition/animation end and route/state changes. Active targets are re-resolved if the DOM replaces them.
- `prefers-reduced-motion` disables movement/emphasis animations and removes transitions.

## 5. Presentation controls

A single compact glass bar appears only while presenting:

- “AI Nour” live indicator, project/step label and `current / total` progress.
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
- Manual route changes end the presentation, clear effects and cancel pending timers.
- Live interruption pauses the presentation, stops queued audio playback and cancels pending visual sequencing while preserving the current context.
- Sending a text message during a presentation pauses it before the question is processed.
- Presentation controls can pause/resume/end; previous/next move to real flow nodes, highlight them and, in voice mode, ask the model to continue from that step.
- Visitor profile and current context continue to drive emphasis: recruiter, business owner, technical visitor or curious visitor.

## 8. Validation

Local regression:

- Unit tests: **67/67**
- API tests: **23/23**
- CRM tests: **14/14**
- Admin auth: **16/16**
- Live budget/duration: **9/9**
- Portfolio validation: **261**
- Legal validator: **46/46**

Browser presentation run (`results/v3-presentation-browser.json`): **19/19**

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

AI orchestration run (`results/v3-presentation-chat.json`):

- Text message → `highlightElement` → highlighted project card + cursor + action chip.
- Text message → `presentProject` → bar, project and flow open at the verified demo step with `5 / 9` progress.
- Manual `navigateTo('home')` → presentation ended, bar hidden, highlights/cursor cleared.
- No browser console errors.

A real Gemini text call also selected `highlightElement` for “Highlight the Customer Acquisition project card”, confirming the new tool contract is discoverable by the production text model.

## 9. Limitations

- Word-level speech timing is unavailable; synchronisation is step-level.
- Real-device microphone/Bluetooth/iOS voice acceptance is still pending. The presentation engine was browser-tested with text/tool orchestration and direct controller actions.
- In text mode, the previous/next controls move and highlight the real step but do not synthesize a new spoken explanation; the visitor can ask AI Nour to explain it. In voice mode the control sends a presentation-continuation message.
- Paragraph and capability targets are index-based within approved content. The ids are stable for the current render, but content changes that reorder paragraphs can change the index.
- The reading view remains assistant-free; presentation effects apply to the immersive portfolio.
- No unrestricted browser automation, offsite scripting, screenshots of the visitor’s screen, or arbitrary DOM control.

## 10. Performance and cost

- No new paid service, subscription, database, storage or fixed monthly infrastructure.
- No extra fixed cost; presentation actions use the existing Gemini tool loop.
- One model/tool step at a time avoids parallel animations and excessive tool calls.
- Target discovery is on demand; visual synchronisation uses requestAnimationFrame, short cancellable timers and one-shot readiness waits, not continuous polling.
- Active effects are cleared on end/manual navigation, limiting DOM and animation residue.

## 11. Manual acceptance scenarios

1. Ask “Guide me through what I’m looking at” from the home view.
2. Ask “How does this flow actually work?” while on a project flow.
3. Ask “Show me what Nour contributed to this project.”
4. Ask “What’s the difference between these two components?” on a flow.
5. Ask “Walk me through this from beginning to end.”
6. Ask “Where exactly does the AI come into play?”
7. Ask “Show me the most relevant project for an AI consulting position.”
8. Interrupt a voice presentation with a question; verify it pauses, answers and can resume.
9. Manually click another section/project during a presentation; verify visual effects stop immediately.
10. Test the same scenarios on a phone/touch viewport and with reduced motion enabled.
11. Test English and French prompts; verify narration language and visual targeting.
12. Verify the presentation bar pause/resume/previous/next/end controls.
