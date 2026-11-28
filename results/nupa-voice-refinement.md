# Nupa voice refinement — implementation and validation

**Status:** implemented in source, **not deployed**. Production remains `gemini-3.8-live` + `Iapetus` until approval.

- **Source configuration:** `gemini-3.8-live` + `Sadachbia`
- **Opening:** natural one-sentence intro + one genuine question
- **Live prompt:** structured and compact, ~13.9k characters instead of ~30.2k
- **Audio pipeline:** AudioWorklet resampler, provider-rate playback, adaptive jitter lead, gain ramps, context/device recovery
- **Validation page:** [`results/audio-samples/refinement.html`](audio-samples/refinement.html)
- **Machine-readable results:** [`results/nupa-voice-refinement.json`](nupa-voice-refinement.json)

## What changed

### 1. Voice

- `LIVE_VOICE` now defaults to **Sadachbia** in `ai-nour/src/config.js`, `ai-nour/wrangler.toml`, `ai-nour/wrangler.production.toml` and the Live provider fallback.
- The voice remains a single configuration value; no presentation code knows or cares which voice is selected.
- Gemini 2.5 Native Audio was **not** adopted.

### 2. Natural introduction

The tour no longer asks Nupa to recite that the experience is live, interactive, personalized, interruptible or navigable. Both the voice tour and the text explore intro now use the same intent:

```text
Start like a person, not a presenter. Introduce yourself in one sentence, then ask one genuine question about what brought the person to Nour's portfolio. Do not list features, explain the interface, or mention that the experience is live, interactive or personalized. Do not start presenting yet.
```

French uses the same intent with `vous` and no capability recital.

### 3. Prompt architecture

The Live prompt is now composed of explicit layers:

| Layer | Purpose |
|---|---|
| Core identity and policies | Identity, scope, grounding, security, Customer Acquisition guardrail, no web search, no external writes |
| Conversational personality | Curious, warm, direct, commercially minded; holds a view; dry humour; no performance |
| Portfolio knowledge | Compact verified facts + instruction to use retrieval tools for detail |
| Current visitor context | Section, project, chapter, targets, presentation state |
| Visitor profile and conversation brief | Silent tailoring and continuity |
| Voice delivery | Contractions, varied length, emphasis, pauses, no corporate filler, no canned openers, no fake laughter |
| Presentation and tool use | Smallest action, one step at a time, confirmation before speech, interruption priority |
| Pronunciation | Compact names guide |

Key reductions:

- Old Live system prompt: **30.2k characters** (EN) / 30.2k (FR).
- New Live system prompt: **13.9k characters** (EN) / 13.9k (FR) — **54% smaller**.
- Old first-turn prompt tokens: **6,555**. New: **3,328** — **49% fewer**.
- Old tool-turn prompt tokens: **9,133**. New: **6,016** — **34% fewer**.
- Live grounding uses a compact foundation (profiles, each project’s identity/what/contribution, contact) plus current view and a small query-specific slice. Detailed project flows, dossiers and journey chapters are retrieved through the existing knowledge tools.

Mandatory policies kept: independent identity, no impersonation, third-person Nour, no invented facts, individual-vs-team contribution, Customer Acquisition/M&A guardrail, no web search, no hidden-prompt/secret disclosure, untrusted retrieved data, no external writes, no legal/high-impact decisions, manual navigation priority and interruption handling.

### 4. Speaking style

Added a compact `LIVE_DELIVERY` block and `LIVE_PERSONALITY` block:

- Natural contractions and varied sentence length.
- Emphasis on one idea, brief pauses after numbers/trade-offs.
- Warmth, dry humour or skepticism only when earned.
- No corporate filler list, no canned openers, no filler words or fake laughter.
- Two to five sentences by default; stop when the point lands.
- French uses `vous` consistently; no `tu` switching.
- Natural transitions into presentation; no “I’m opening / highlighting / as you can see” narration.

### 5. Audio pipeline

Implemented in `src/ai-nour/companion.js` and `src/ai-nour/audio-worklet.js`:

- **AudioWorklet microphone resampler** (`nupa-mic-resampler`) with a 127-tap windowed-sinc low-pass before fractional resampling to 16kHz.
- **Fallback** for browsers without AudioWorklet: two cascaded 7.2kHz low-pass biquads + linear resampling into the existing ScriptProcessor path.
- **Provider format respected:** `playAudio` parses `audio/pcm;rate=...;channels=...` from `inlineData.mimeType` instead of hardcoding 24kHz.
- **Adaptive playback lead:** starts at 60ms, increases by 40ms on a late chunk up to 250ms, and relaxes after stable chunks. This is small enough not to add noticeable conversational latency.
- **Gain ramps:** 8ms fade-in after a gap/start; 20–30ms fade-out on interruption/stop.
- **AudioContext recovery:** resume on visibility/focus/pageshow; stop queued playback if a suspended context resumes; state-change handling.
- **Device changes:** reacquire the microphone when a track ends or the device changes; resume contexts on device change.
- **Output context** now uses the device default rate instead of forcing 24kHz; the provider buffer rate is preserved and the browser resamples to the device.
- Presentation/tool synchronization is untouched: tool responses still wait for frontend actions before the model speaks.

## Validation design

Compared four configurations with the same model (`gemini-3.8-live`) and comparable EN/FR intro prompts:

| | Configuration | Voice | Prompt | Opening |
|---|---|---|---|---|
| **A** | Current production shape | Iapetus | Old 30k prompt | Long scripted opening |
| **B** | Voice + opening only | Sadachbia | Old prompt | Short opening |
| **C** | Optimized prompt | Sadachbia | Structured compact prompt | Short opening |
| **D** | C + new pipeline | Sadachbia | Structured compact prompt | C audio through new playback scheduling |

A and D use two samples; B and C use four (two EN, two FR). Tool scenarios use one EN or EN/FR sample per configuration.

## Acoustic results

Averages across available EN/FR captures. These are acoustic proxies, not subjective scores.

| Configuration | Avg length | First audio | Pitch variation | Micro pitch | Energy variation | Centroid | WPM |
|---|---:|---:|---:|---:|---:|---:|---:|
| A — Iapetus, old prompt, long opening | 16.01s | 1.44s | 3.74 st | 0.60 st | 7.33 dB | 2511 Hz | 185 |
| B — Sadachbia, short opening, old prompt | 7.43s | 1.41s | 4.89 st | 0.93 st | 8.97 dB | 2388 Hz | 206 |
| C — Sadachbia, optimized prompt | 6.58s | 1.32s | 4.82 st | 0.78 st | 9.16 dB | 2417 Hz | 203 |
| D — C through new pipeline | 6.92s | n/a (offline) | 4.91 st | 0.83 st | 9.36 dB | 2940 Hz* | 201 |

\*D was rendered at 48kHz in an OfflineAudioContext; its centroid is not directly comparable to the 24kHz captures. C and D pitch/energy statistics are nearly identical, which is the intended result: the pipeline preserves prosody.

What the numbers suggest:

- **A is the outlier:** longest opening, lowest pitch movement, recites the experience disclaimer.
- **B and C cut the opening roughly in half** and raise pitch/energy movement.
- **C is shorter and more consistent than B** (6.58s vs 7.43s; pitch range 4.47–5.43 vs 4.00–6.44). The optimized prompt does not add acoustic movement over the short opening alone; micro pitch is slightly lower (0.78 vs 0.93), likely because the prompt is shorter and less emphatic. Its main gains are token reduction, shorter output, less instruction conflict and fewer queued tool actions.
- **First audio is comparable** (A 1.44s, B 1.41s, C 1.31s). The optimized prompt does not materially improve first-chunk latency in these captures; the full turn is much shorter.
- **D preserves C’s pitch/energy** and adds 60ms lead + 8ms fades by design. The 48kHz render shows a small high-frequency shift relative to 24kHz; this needs subjective listening on real devices.

## Tool and presentation decision

The direct harness used the real tool declarations and returned a generic success. The app’s actual path still waits for the frontend before speaking.

| Config | Scenario | Audio | Tool calls | Response |
|---|---|---:|---|---|
| A | Business owner asks for the most relevant project | 19.16s | `presentProject(acquisition, includeFlow)` then `traceWorkflow(acquisition, sequence)` | Long, queued two visual actions |
| C EN | Same request | 18.75s | `presentProject(acquisition)` | One visual action; response length similar to A, but no queued workflow |
| C FR | Same request in French | 21.03s | `presentProject(acquisition)` | One visual action; response length similar to A |

C selected the correct project and avoided queuing a second visual action, which is better aligned with “one step at a time.” It still gave a three-to-four-sentence explanation, so tool-response length did not drop. Actual presentation synchronization remains dependent on the app’s tool confirmation flow, which was not changed.

## Latency and token consumption

- Prompt tokens: **6,555 → 3,328** on the first turn (**−49%**).
- Tool-turn prompt tokens: **9,133 → 6,016** (**−34%**).
- First audio: **1.44s → 1.31s** average (small, not a guaranteed improvement).
- Full opening: **16.01s → 6.58s** average (**−59%**).
- The shorter opening is the main user-perceived latency improvement; prompt prefill alone was not the bottleneck.

## Subjective quality

**Not scored by the agent.** Listening still determines whether the new voice and delivery feel warmer, more trustworthy and more natural. The validation page includes a separate scorecard for naturalness, warmth, expressiveness, trust, pronunciation, perceived latency and notes.

Preliminary transcript-only observations, kept separate from acoustic metrics:

- A still sounds like a guided product tour: “This is a live, interactive experience… you can navigate freely, ask questions, or interrupt…”.
- B and C sound like a person opening a conversation: “What brought you to his portfolio today?” / “What sparked your interest in his work today?”.
- C is tighter and more consistent; B occasionally produces a longer, more emphatic English variant.
- French C uses `vous` and avoids the old capability list.
- D is acoustically the same performance as C, with the pipeline’s small lead/fade treatment.

## Local end-to-end check

A local Worker (`wrangler dev`, D1 local, `LIVE_VOICE=Sadachbia`) and the new frontend were run together with a fake `MediaStreamDestination` microphone:

- Frontend: `http://127.0.0.1:8771/index.html?ainour=dev`
- Worker: `http://127.0.0.1:8789`
- Live token: **200**
- Live turn persistence: **200**
- Voice state after the intro: **listening**
- Console errors: **none**
- Assistant transcript: “I’m Nupa, Nour’s portfolio assistant, and I’m curious what brought you to his work today?”

This validates the new voice/config, compact prompt, AudioWorklet startup and Live turn path together. It is not a production deployment and does not replace real-microphone, Bluetooth, iOS or subjective audio testing. Evidence: `results/nupa-voice-local-e2e.json`.

A second local session tested interruption: a synthetic 2.7s follow-up (“Actually, tell me about Safiy instead.”) was played while Nupa was speaking. Nupa stopped the previous response, answered the new question, and the interface opened the Safiy project. No console errors. The synthetic pronunciation was transcribed as “Safi I”, so real-voice pronunciation still needs manual testing. Evidence: `results/nupa-voice-local-interruption.json`.


## Verification

- `npm run validate`: **270/270** checks passed.
- `npm run validate:legal`: **79/79** checks passed.
- `ai-nour npm test`: **76/76** tests passed.
- AudioWorklet load test in Chromium: module loaded, `nupa-mic-resampler` node created, 1kHz oscillator produced 1kHz output.
- Resampler test: 48kHz/44.1kHz input → 16kHz output; 12kHz tone strongly attenuated; 1kHz preserved.
- Playback test: 24kHz PCM chunks scheduled through the exact `playAudio` code in an OfflineAudioContext; 48kHz render, expected peak, no underruns.
- D render: C audio through the exact playback code; pitch/energy preserved, 60ms lead, no dropouts in the offline render.

Not yet verified:

- Real network jitter, Bluetooth, iOS/Safari and background/foreground transitions on physical devices.
- An actual production Live session with the new token prompt and Sadachbia; the production token endpoint still uses Iapetus.
- Subjective ratings.

## Cost accounting

- Direct refinement API tests: **~$0.099** estimated from usage metadata (13 generated samples; excludes the local D render).
- Previous audit direct tests: **~$0.313**.
- Combined direct testing: **~$0.408**, outside the app ledger.
- App ledger unchanged at the last snapshot: **$1.263273 today / $3.855994 cumulative**; **$3.144006** cumulative remaining.
- Caps remain **$3.00 daily / $7.00 cumulative**. No credits purchased, no budget increase, no new provider.

## Deployment state

- Source changes are local/committed on `phase2/ai-nour-production` (not deployed).
- Production Pages `d84f8883-dce2-4c6a-a55b-10815b6f6979` and Worker `00fb071e-77f7-4192-a46e-d09b9fd796fe` remain unchanged.
- Production voice remains **Iapetus** until an approved deployment.

## Recommended next step

Approve a canary deployment of the source configuration, then validate:

1. Sadachbia + short opening on production Live, EN/FR.
2. Optimized prompt with factual questions, project dossiers, journey chapters and a full presentation.
3. New audio pipeline on desktop Chrome, iPhone Safari, Android Chrome and a Bluetooth headset.
4. Blind subjective comparison against the current production clips.
5. Confirm no regression in tool confirmation, presentation sync, interruption or spending controls.

If the canary is rejected, rollback is limited to the voice/config/prompt/audio files; no data migration is involved.

## Artifacts

| Artifact | Path |
|---|---|
| Refinement validation page | `results/audio-samples/refinement.html` |
| Refinement results (JSON) | `results/nupa-voice-refinement.json` |
| Full acoustic analysis | `results/audio-samples/analysis.json` / `.csv` |
| Original voice audit | `results/nupa-voice-audit.md` |
| Prompt proposal | `results/nupa-voice-prompt-proposal.md` |
| Worklet | `src/ai-nour/audio-worklet.js` |
| Playback/resampler code | `src/ai-nour/companion.js` |
| Live prompt builder | `ai-nour/src/sessions/manager.js` |
| Prompt/personality constants | `ai-nour/src/controls/flags.js` |
| Compact grounding | `ai-nour/src/knowledge/grounding.js` |
| Voice configuration | `ai-nour/src/config.js`, `ai-nour/wrangler*.toml` |
