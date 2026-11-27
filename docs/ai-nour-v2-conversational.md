# AI Nour V2 — conversational intelligence upgrade

Status: **implemented and validated locally; production private beta updated after the local suite passed.** Public access remains disabled.

## 1. Voice

- Default Live voice is **Schedar**, configured in `src/config.js`, `wrangler.toml`, and `wrangler.production.toml`.
- Verified with a real Gemini 3.8 Live session: Schedar produced audio, transcripts, tool calls and a completed turn.
- No Voice Studio or extra voice interface was added.
- Live prompting now asks for natural rhythm, varied sentence lengths, expressive emphasis, brief pauses and a conversational rather than narrated delivery.
- Pronunciation guidance is included for Nour Chkair, Safiy, H2Ops, B.R.A.I.N., H2Ops Brain and MPN Capital Markets.
- The ephemeral-token/provider-enforced duration and spending controls are unchanged.

## 2. Personality

The restrictive one-to-two-sentence persona was replaced with a 3.6k-character character prompt covering:

- Charisma, confidence, curiosity, commercial judgement and situational humour.
- Point-of-view, respectful disagreement and counterarguments.
- Specificity over corporate filler; banned-phrase guidance includes "unique combination", "commercial acumen" and "driving business growth".
- Visitor interest, appropriate follow-up questions, and no mechanical question at the end of every reply.
- Clear AI identity without repeating disclosure.
- Separate general knowledge/opinion from verified portfolio facts and Nour's beliefs.
- Plain-text chat formatting; Markdown emphasis is stripped server-side.

The production `persona_instruction` control was updated to the new prompt after local acceptance.

## 3. Knowledge parity between text and voice

`handleLiveToken` now builds the same verified grounding foundation as text:

- Profile, positioning, thinking/work style, direction and contact.
- All five project identities, contributions and process overviews.
- Journey chapter summaries.
- Current section/project/flow/chapter and selected step.
- Published knowledge overrides, merged by chunk id.

Live tools added:

- `searchPortfolio`
- `getProjectDossier`
- `getProjectStep`
- `getJourneyChapter`
- `getCurrentView`

Text and Live both use the same server-side allowlisted tool executor. Published overrides are included in search results and foundation context.

Guardrails:

- Customer Acquisition is explicitly a sales/customer-acquisition project, **never mergers and acquisitions**.
- Nour's individual contribution is separated from broader system/team capability.
- Unsupported claims are rejected by grounding rules and verified context.
- Flow steps include their neighbours and place in the process.

## 4. Visitor intelligence

Session state now carries an inferred visitor profile:

- Primary type: recruiter, business owner, technical, collaborator or unknown.
- Mentioned role, industry, technical familiarity and preferred depth.
- Interests mapped to projects/topics.
- Safe visitor goals/challenges and a short turn count.
- Locale and last section/project.

Profiles are updated from text and persisted Live turns, survive recovery via `sessions.state_json`, and are injected into text/Live prompts silently. Instruction-like text is filtered so visitor-supplied prompt injection cannot enter the system prompt.

## 5. Proactive conversation

Prompt behaviour now encourages relevant recommendations, connections between projects, alternative perspectives, next steps and genuine follow-up questions. It explicitly avoids ending every reply with a question, repeated booking pushes, and asking the visitor to choose a project again after requesting a recommendation.

## 6. Interactive portfolio guide

`presentProject` is now a presentation capability, not only navigation:

- Starts a presentation state.
- Opens the project and optionally the flow/start step.
- Returns the verified project dossier for narration.
- `presentProjectStep` moves through flow nodes and returns step content and neighbours.
- `pausePresentation`, `resumePresentation` and `endPresentation` update presentation state.
- Manual visitor navigation clears the presentation immediately.
- Frontend confirms navigation before a Live tool response is marked confirmed.
- Text navigation is described as requested/in progress, not already completed.

Verified deterministically: start → open project/flow/node → pause → resume → manual navigation stops → end. No console errors.

## 7. Dynamic page awareness

The companion sends silent `[Context update]` messages to an active Live session when the route/view changes. The Live prompt tells the model not to answer these updates aloud. The update includes section, project, view, selected step, journey chapter, route, navigation source and presentation state.

Verified with a real Live session: the context update produced no spoken response, then “What is this step?” was answered from the Customer Acquisition demo step.

## 8. Intellectual conversations and research

The prompt now allows substantive general discussion across business, sales, AI, technology, economics, politics, philosophy, psychology, leadership and entrepreneurship, with opinions and counterarguments clearly separated from Nour's verified views.

A `webResearch` tool using Gemini Google Search grounding is implemented behind `WEB_RESEARCH_ENABLED`. The current free Gemini key returns **429 RESOURCE_EXHAUSTED** for search grounding, so the tool is omitted from model declarations and disabled in both environments. Enabling it requires available Google Search grounding quota; no billing was activated.

## 9. Professional opportunities

Recruiter, consulting, business-owner and technical scenarios now use the visitor profile and verified project dossiers to tailor proof and recommendations. Contact is offered when interest is genuine; the assistant cannot claim an email, booking or calendar action succeeded without confirmation. Existing consent, beta auth, external-write and appointment restrictions are unchanged.

## 10. Conversation quality evaluation

`scripts/conversation-quality.mjs` runs 13 multi-turn scenarios:

1. Recruiter evaluation
2. AI consulting opportunity
3. Operational problem
4. Complete portfolio tour
5. Detailed project presentation
6. Technical questions
7. Intellectual discussion
8. Casual conversation and humour
9. French conversation
10. Ambiguous current-page reference
11. Incorrect transcription / Customer Acquisition M&A bait
12. Contact opportunity
13. Customer Acquisition regression

Checks cover factual grounding, naturalness proxies, banned corporate language, plain-text formatting, depth, proactivity/actions, contribution/scope separation, navigation, repetition and question-ending behaviour. The suite records latency and cost per turn.

Final merged result: **13/13 scenarios passed**, average score **1.0**, with retries after Gemini per-minute 429s. Evidence: `results/v2-conversation-quality-final.json`.

Additional evidence:

- Live voice smoke: **12/12** (`results/v2-smoke.json`).
- Live context/page awareness: **6/6** (`results/v2-live-context.json`).
- Live budget/tool/Schedar checks: **8/8** (`results/live-budget-tests.json`).
- Security suite: **8/8** (`results/security-api.json`).
- Unit: **61/61**.
- API: **23/23**.
- CRM: **14/14**.
- Admin: **16/16**.
- Portfolio validation: **261 checks**.
- Secret scan: **429 files, 0 hits**.

## 11. Constraints preserved

- Gemini 3.8 Live and the existing text model retained.
- Schedar default voice.
- Existing portfolio UI and admin dashboard preserved.
- No Voice Studio.
- $0 fixed monthly infrastructure.
- Daily/cumulative spending limits, beta authentication and emergency shutdown unchanged.
- External writes and automated email remain disabled.
- No credentials exposed, rotated or regenerated.
- Public access remains disabled.
- Web research disabled until quota is available.

## 12. Remaining manual actions

1. **Google OAuth durability** — the current Testing-mode refresh token expires in about 6.5 days; publish/verify and reauthorize for a durable token.
2. **Real-device voice acceptance** — microphone, Bluetooth, iOS Safari, interruptions, French pronunciation and mobile feel.
3. **Visual acceptance** — confirm the updated pill/panel expansion, placement and listening orb.
4. **Public launch approval** — not before product acceptance.
