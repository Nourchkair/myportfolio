# Nupa voice naturalness & audio-quality audit

> **Historical audit.** The follow-up refinement was deployed on 28 November 2026: `gemini-3.8-live` + `Sadachbia`, natural opening, compact structured prompt and new audio pipeline. See `results/nupa-voice-refinement.md` and `results/nupa-voice-production-validation.json`.

**Status:** investigation only. No production voice, model, prompt or deployment was changed.

- **Production:** `gemini-3.8-live` + `Iapetus`
- **Pages:** `d84f8883-dce2-4c6a-a55b-10815b6f6979` (source `4195355`)
- **Caps:** $3.00 daily / $7.00 cumulative
- **Samples:** 50 comparable clips, 7 voices × EN/FR, 3.8 vs 2.5, prompt and pipeline variants
- **Sample index:** [`results/audio-samples/index.html`](audio-samples/index.html)
- **Prompt proposal:** [`results/nupa-voice-prompt-proposal.md`](nupa-voice-prompt-proposal.md)

## Executive summary

The robotic quality is not caused by one frontend bug. The evidence points to a stack of four causes, in this order:

1. **Voice choice.** `Iapetus` is one of the flattest voices in the matrix. Its neutral pitch variation is **3.47 semitones** with **0.57 semitones** of frame-to-frame movement. `Sadachbia` reaches **4.45 / 0.94** and is consistent in English and French. `Zubenelgenubi` has the widest overall range (**4.74**) but lower moment-to-moment movement and a weaker French result.
2. **The opening prompt.** The current tour prompt tells Nupa to explain that the experience is “live, interactive and personalized” and to mention interrupting, questions, navigation and stopping. The model reproduces that list almost verbatim. This is the clearest “scripted” cause. The long opening averages **18.6s** and contains **4.8 disclaimer terms per 100 words**; the refined opening averages **6.4s** with **zero**.
3. **Model character.** `gemini-2.5-flash-native-audio-preview-12-2025` is consistently more expressive than 3.8 Live: neutral pitch variation **5.30 vs 3.47**, frame-to-frame movement **1.11 vs 0.57** (about double). But its first audio is **4.1s vs 1.3s** in the same test, and it is a preview model with an uncertain retirement path. It is not a free upgrade.
4. **Prompt density.** The live system prompt is about **30.2k characters / 4.3k words / 32 rule entries**, with **16.7k characters** of grounding. Identity, scope, grounding and question rules are duplicated. The current prompt makes openings longer and slightly flatter; appending another delivery rule at the end did not reliably fix it.

**Frontend playback is not the primary cause.** App-level Iapetus samples retain the same pitch variation as direct Gemini PCM (3.50–3.53 vs 3.47–3.50 semitones). Playback does add latency and fragility—naive resampling, `ScriptProcessor`, no jitter buffer, forced 24kHz output, no background/Bluetooth recovery—but it is not creating the flat timbre.

### Minimal test worth approving

Keep `gemini-3.8-live`. Change only two variables:

- **Voice:** `Iapetus` → `Sadachbia` (or `Achird` if the listener prefers a darker, warmer timbre).
- **Opening:** replace the long tour script with the refined one-sentence intro + one genuine question.

This preserves tools, presentation behavior, 3.8 latency and the existing caps. Do **not** switch to 2.5 permanently without a separate approval and a tool/presentation/latency test.

## What was tested

| Area | What was captured |
|---|---|
| Voice matrix | 7 voices × EN/FR on 3.8 Live with an identical neutral intro: Iapetus, Achird, Puck, Zubenelgenubi, Algieba, Sulafat, Sadachbia |
| Model | 3.8 Live vs 2.5 Native on Iapetus, EN/FR, neutral / current prompt / long opening / short opening |
| 2.5-only features | Affective dialogue + proactive audio, EN/FR |
| Prompt | Current reconstructed system prompt, current + delivery tail, short prompt + grounding, short prompt only, long opening, short opening, refined opening |
| Playback | Production app captures (Iapetus) vs direct Gemini PCM; chunk timing, gaps, underruns, boundary jumps |
| Configuration | 3.8 temperature/topP/topK acceptance test; documented VAD fields; 3.8 affective/proactivity/thinking/language constraints |

Method:

- Direct captures used a temporary production API key, bypassing the app token endpoint that locks `Iapetus`.
- App captures used the production token endpoint and the existing capture harness.
- PCM is 24kHz mono 16-bit; each clip is written to WAV and analyzed with YIN pitch tracking, frame RMS/energy, pause ratio, spectral centroid and chunk timing.
- Direct test spend is estimated at **$0.31** from usage metadata; it is outside the app ledger but well inside the remaining budget.

Limits:

- One or two samples per cell. Treat differences as directional, not statistically stable.
- Objective metrics are proxies. They cannot judge warmth, trust, gender, humour or how a voice feels over five minutes.
- The “current system prompt” is reconstructed from source. The live token response omits `systemInstruction`, and DB persona/knowledge overrides may differ.
- App-level samples are Iapetus only because the client voice override did not change the token-configured voice.

## Audio pipeline audit

| Area | Current implementation | Finding | Impact | Recommendation |
|---|---|---|---|---|
| PCM decoding | `base64ToInt16` → `Int16Array` | Correct for 16-bit little-endian PCM; no header parsing; assumes an even byte count | Works today; brittle if the provider changes format | Validate byte length and mime type |
| Output sample rate | `createBuffer(1, pcm.length, 24000)` hardcoded | Gemini currently returns `audio/pcm;rate=24000`; correct | Silent pitch/speed error if the rate changes | Parse the rate from `inlineData.mimeType` |
| Input resampling | `downsampleTo16k` takes every Nth sample | Naive decimation with no anti-alias low-pass; energy above 8kHz folds into the speech band | Degrades ASR/VAD on sibilants and noisy rooms; can cause misheard words and awkward replies | AudioWorklet resampler, or low-pass + interpolation; test 44.1k and 48k devices |
| AudioContext | Input at device rate; output forced to 24kHz | Works in tested Chrome; OS/browser may resample; no `resume()` on visibility/gesture | Bluetooth/iOS can resample or suspend; background tabs can queue or gap | Use the device default rate; resume on gesture/visibility; handle device change |
| AudioWorklet | None; `createScriptProcessor(4096)` | Deprecated; 4096 frames ≈ 85ms input buffer at 48kHz, plus processing | Adds turn-taking latency; can make barge-in feel late | Move mic path to AudioWorklet with 128–256 frame blocks |
| Chunk scheduling | One `AudioBufferSourceNode` per chunk; `nextPlayTime += buffer.duration`; late chunks reset to `now` | No jitter buffer, no crossfade; a late chunk starts immediately after the previous one ends | Fine on a stable network; gaps/clicks when arrival jitter exceeds buffered lead | Keep 150–300ms lead; crossfade 5–10ms; avoid clock reset for small lateness |
| Gaps / overlap / clipping | Sequential scheduling; no overlap by construction | App chunk gaps reached 159ms (Puck) and 190ms (Iapetus), but scheduled underruns were zero in the measured runs. One direct 3.8 sample had a 2ms scheduled gap. 3.8 peaks ~−2.3dBFS average; 2.5 reaches 0dBFS with 20 clipped samples across the set | Low risk on desktop; moderate on mobile/Bluetooth; 2.5 needs headroom | Add −3dB safety gain or a soft limiter; keep a jitter buffer |
| Pitch / speed | Buffer rate 24kHz; no playback-rate changes | No pitch shift measured; direct and app samples have the same F0 statistics | Not the cause | Keep, but make rate dynamic |
| VAD | Automatic defaults; no `realtimeInputConfig` | No tuning of start/end sensitivity, prefix padding or silence duration | Can cut soft speech or wait too long; affects conversational rhythm | Test documented fields: start high, end low, prefix 20ms, silence 500–700ms |
| Interruption | `stopPlayback()` stops all sources immediately | No gain ramp | Possible click; otherwise correct cancellation | Ramp gain to zero over 20–30ms |
| Bluetooth/browser | `getUserMedia` with echoCancellation/noiseSuppression/autoGainControl; forced 24kHz output; no `setSinkId`/device handling | Bluetooth headsets may switch to HFP (8/16kHz); Safari/iOS behavior unverified | Muffled or choppy audio on some devices; not the desktop robotic timbre | Test iPhone Safari, Android Chrome, Bluetooth; consider default-rate output and a worklet ring buffer |

### Raw Gemini vs Nupa playback

| Sample | Pitch variation | Frame-to-frame | First audio | Chunks |
|---|---:|---:|---:|---:|
| App capture `voice-default`, Iapetus (current prompt) | 3.50 st | 0.56 st | 1.65s | 49 |
| App capture `puck-en`, actual voice Iapetus (current prompt) | 3.53 st | 0.49 st | 1.30s | 43 |
| Direct 3.8, Iapetus neutral | 3.47 st | 0.57 st | 1.27s | 31 (avg) |
| Direct 3.8, Iapetus current prompt | 3.50 st | 0.60 st | 1.35s | 44 (avg) |

The app path preserves the flat prosody. It does not add a robotic timbre. The strongest playback finding is fragility, not current sound quality.

## Model comparison

All rows use Iapetus and the same prompt within each scenario. Values are averages across EN/FR unless noted.

| Scenario | Model | Pitch variation | Frame-to-frame | Energy variation | First audio | Chunk size | Duration |
|---|---|---:|---:|---:|---:|---:|---:|
| Neutral | 3.8 Live | 3.47 st | 0.57 st | 7.30 dB | 1.27s | ~370ms | 11.5s |
| Neutral | 2.5 Native | **5.30 st** | **1.11 st** | 7.92 dB | **4.11s** | ~44ms | 10.2s |
| Current prompt | 3.8 Live | 3.50 st | 0.60 st | 5.42 dB | 1.35s | ~335ms | 14.9s |
| Current prompt | 2.5 Native | **4.82 st** | — | 7.21 dB | **4.90s** | ~42ms | 17.6s |
| Long opening | 3.8 Live | 3.78 st | 0.60 st | 7.78 dB | 2.18s | ~358ms | 18.6s |
| Long opening | 2.5 Native | **5.58 st** | — | 7.63 dB | **6.18s** | ~43ms | 14.0s |
| Short opening | 3.8 Live | 4.38 st | 0.70 st | 9.12 dB | 1.40s | ~349ms | 7.9s |
| Short opening | 2.5 Native | **5.95 st** | **1.72 st** | 10.58 dB | **5.14s** | ~45ms | 7.9s |

What this means:

- 2.5 Native has **31–53% more overall pitch movement** and roughly **double the moment-to-moment pitch movement**. That is the closest objective signal to “more alive.”
- 2.5 Native pays for it with **2.8–4.0s slower first audio** in like-for-like scenarios. The short opening closes the length gap but not the latency gap.
- 2.5 streams ~44ms chunks vs ~350ms on 3.8. More granular streaming may be smoother under jitter, but it is more messages and more scheduling overhead.
- 2.5 peaks at 0dBFS in several samples; the 3.8 set averages −2.3dBFS peak. Add headroom before considering 2.5.
- Affective dialogue on 2.5 did not consistently increase measured pitch/energy variation in the one EN/FR pair (EN 5.90 vs 5.70 neutral; FR 3.55 vs 4.91). Do not assume the flag is the naturalness lever. The model/voice is.
- `gemini-2.5-flash-native-audio-preview-12-2025` is a preview model; verify availability and retirement before any switch. Do not switch permanently without approval.

## Voice comparison

3.8 Live, neutral intro, average of EN and FR.

| Voice | Pitch variation | Range (p10–p90) | Frame-to-frame | Energy variation | Centroid | First audio | Read |
|---|---:|---:|---:|---:|---:|---:|---|
| **Sadachbia** | 4.45 st | 11.21 st | **0.94 st** | 9.87 dB | 2688 Hz | 1.36s | Best combination of movement and range; consistent EN/FR |
| **Zubenelgenubi** | **4.74 st** | **12.95 st** | 0.61 st | 10.01 dB | 2208 Hz | 1.22s | Widest range, darker; weaker French and less moment-to-moment movement |
| **Algieba** | 4.33 st | 11.87 st | 0.80 st | 9.84 dB | 2830 Hz | 1.37s | Dynamic but bright; watch for a salesy edge |
| **Achird** | 4.05 st | 10.31 st | 0.67 st | 7.74 dB | **2292 Hz** | 1.29s | Warmest/darkest; less movement; good for candour and dry humour |
| **Sulafat** | 3.96 st | 10.78 st | 0.75 st | 9.12 dB | **2879 Hz** | 1.11s | Brightest/clear; can feel forward or sing-song |
| **Puck** | 3.48 st | 7.78 st | 0.91 st | 7.85 dB | 2492 Hz | 1.40s | Chatty micro-movement but narrow range; flatter overall |
| **Iapetus** | 3.47 st | 9.12 st | **0.57 st** | 7.30 dB | 2411 Hz | 1.27s | Current voice; flattest overall in this matrix |

Short-opening comparison (same 3.8 model, current system prompt):

| Voice | EN | FR |
|---|---|---|
| Sadachbia | 5.24 st / 0.99 micro | 5.24 st / 1.17 micro |
| Zubenelgenubi | 5.61 st / 0.60 micro | 3.75 st / 0.58 micro |
| Iapetus | 4.54 st / 0.78 micro | 4.22 st / 0.61 micro |
| Achird | 4.29 st / 0.58 micro | not captured |
| Algieba | 3.53 st / 0.83 micro | 4.52 st / 1.01 micro |

Reading the table:

- **Sadachbia** is the strongest 3.8 replacement candidate: best micro-movement, strong range, and nearly identical EN/FR results.
- **Zubenelgenubi** is the most dramatic English option, but its French sample is much flatter. Test both languages before choosing.
- **Achird** is the warmth/darkness option. It has less pitch movement than Sadachbia, but a lower centroid may read as calmer and more human to some listeners.
- **Iapetus** and **Puck** are the two flattest overall. Keeping Iapetus while changing only the prompt leaves expressive range on the table.
- These are proxies, not verdicts. Perceived gender, age, accent and warmth need your ear.

## Prompt and persona review

### Size and duplication

The reconstructed live prompt is approximately:

- **30.2k characters**
- **4.3k words**
- **32 rule entries**
- **16.7k characters of grounding context**

Duplication that adds instruction load without adding information:

- Identity paragraph appears in the persona and again as rule 2.
- “Do not become a free general-purpose chatbot” appears in the persona and in the rules.
- “Never invent…” appears in the persona grounding section and in two rules.
- “Do not end every response with a question” appears in the persona and in the rules.
- Presentation/tool mechanics occupy roughly ten rule entries; they matter for a tour but dominate a normal conversation.
- The single live-delivery rule sits before 16.7k characters of grounding, far from the generation point.

### The opening is the clearest script

The current live opening prompt says, among other things:

> “Introduce yourself briefly as Nupa… explain… that this is a live, interactive and personalized experience. Mention naturally that the visitor can interrupt, ask questions, navigate independently, or stop at any time… ask one natural, open question…”

Observed production-style transcript:

> “Hi there! I’m Nupa, Nour’s independent AI-powered portfolio assistant. This is a live, interactive, and personalized experience where you’re in the driver’s seat—so feel free to interrupt, ask questions, or explore on your own at any time. What brings you to Nour’s work today…?”

That is not the model inventing a disclaimer. It is the prompt’s content, delivered as a script. The long opening measured **4.8 disclaimer terms per 100 words**; the short/refined openings measured **zero**.

### Prompt experiments

| Experiment | Result |
|---|---|
| Current system prompt vs neutral | Opening ~30% longer (14.9s vs 11.5s), energy variation lower (5.42 vs 7.30dB), micro pitch slightly lower (0.603 vs 0.648). No pitch gain. One incorrect self-reference: “your independent AI-powered portfolio guide.” |
| Long opening vs short opening (same Iapetus voice) | 18.6s → 7.9s; micro pitch 0.596 → 0.782 (+31%); disclaimer terms 4.8 → 0. |
| Long opening vs refined opening (Sadachbia) | 18.6s → 6.4s; zero disclaimer; “Hi, I’m Nupa… What brings you to Nour’s work today?” |
| Current + delivery tail | Inconsistent: EN improved slightly, FR got flatter; responses grew to 20.8s/21.5s. Do not just append another rule. |
| Short prompt + grounding | Mixed; FR improved, EN slightly flatter. Grounding text itself may constrain delivery. |
| Short prompt only | Natural and dynamic (micro 0.79) but removes factual grounding; not safe without hallucination testing. |

### Proposed delivery block

Use once, near the end of a trimmed live prompt. Full text and rationale: [`results/nupa-voice-prompt-proposal.md`](nupa-voice-prompt-proposal.md).

```text
SPOKEN DELIVERY
Talk like a thoughtful person across a table, not a narrator, announcer or tour guide.
Use contractions and everyday words. Vary sentence length; let some sentences be short.
Put the vocal emphasis on the one idea that matters. Do not stress every clause.
Pause briefly after a number, a trade-off or a surprising point. Do not fill every pause.
Let warmth, dry humour, skepticism or seriousness appear when the moment earns it. Never perform enthusiasm.
React to the visitor's exact words instead of delivering a prepared paragraph.
Most turns are two to five sentences. Stop when the point has landed.
Ask a question only when it genuinely moves the conversation forward.
When you move into a presentation, connect the next item to what was just said. Do not announce interface mechanics.
Avoid corporate filler and canned openers.
```

### Persona issues

- **Adjective pile-up.** “Charismatic, approachable, confident without swagger, intellectually curious, commercially minded, warm, direct, occasionally dry or situationally funny” tells the model what to be, not what to do. Voice models perform adjectives; they can follow behaviours.
- **Duplication.** The identity, scope, grounding and question rules are repeated across persona and live rules. This consumes attention and can make the model sound like it is checking compliance.
- **Tool-dominant prompt.** Presentation mechanics are necessary, but they should be loaded when a tour starts, not carried through every casual turn.
- **French register conflict.** The French tour prompt uses `tu` (“Tu commences… Présente-toi… t’interrompre”), while the UI and most French copy use `vous` (“Posez une question…”, “Votre compagnon…”). The model mixes both. Pick one register; `vous` is safer for a professional portfolio.
- **The opening prompt is a script.** The model is doing what it was told. Shorten the instruction to intent, not content.

## Configuration review

| Setting | Current | Assessment |
|---|---|---|
| `responseModalities` | `['AUDIO']` | Correct |
| `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` | `Iapetus` | Strongest supported voice lever; change candidate is Sadachbia |
| `speechConfig.languageCode` | Omitted | Correct for native audio auto language selection; do not add |
| `enableAffectiveDialog` | Not set | 3.8 removed it; do not send. 2.5 supports it, but the one EN/FR pair did not show a consistent gain |
| `proactivity` | Not set | 3.8 permanently enabled; 2.5 configurable. Do not send a false value to 3.8 |
| `thinkingLevel` | Not set | 3.8 does not support it; omit |
| `temperature` / `topP` / `topK` | Not set | Accepted by the SDK and by 3.8 in two tests; effect was small/noisy (5.57/5.32 vs 5.24 st). Not a primary fix |
| `realtimeInputConfig.automaticActivityDetection` | Not set | Supported fields: start/end sensitivity, `prefixPaddingMs`, `silenceDurationMs`. Currently defaults; test on real devices |
| `inputAudioTranscription` / `outputAudioTranscription` | Enabled | Useful for UI/accounting; keep |
| `maxOutputTokens` | Not set | Do not use as the first length fix; audio token limits can cut speech. The short opening is safer |
| `contextWindowCompression` / `sessionResumption` | Not set | Not a voice-quality lever; relevant to long presentations/session recovery, test separately |
| `explicitVadSignal` / manual activity | Not used | Automatic VAD is fine for v1; manual VAD is a later option if barge-in remains unreliable |

## Root-cause separation

| Layer | Finding | Evidence | Confidence |
|---|---|---|---|
| Model | 3.8 Live is less micro-expressive than 2.5 Native | 0.57 vs 1.11 st frame-to-frame neutral; 3.47 vs 5.30 overall | High |
| Voice | Iapetus/Puck are the flattest; Sadachbia/Zubenelgenubi/Achird offer more | Neutral matrix; short-opening matrix | High |
| Prompt | The long opening produces a scripted disclaimer; the 30k prompt adds length and flattens energy | 18.6s → 6.4s; 4.8 → 0 disclaimer terms; current vs neutral | High |
| Pipeline | Not the primary cause; preserves prosody, but adds latency and fragility | App vs direct F0 match; gaps up to 190ms, zero underruns on test network | Medium-high |
| Configuration | Voice is the strongest lever; VAD/temperature are secondary/untested; 3.8 affective/thinking constraints are real | Documented constraints; temperature test; VAD defaults | Medium |

## Recommended changes (not applied)

### Phase 1 — minimal, reversible

- Keep `gemini-3.8-live`.
- Change the production voice to **Sadachbia** (first choice), **Achird** (warmer/darker), or **Zubenelgenubi** (English-only alternative).
- Replace the long tour opening with the refined opening.
- Keep the current system prompt for the first canary; change only voice + opening.
- Run a blind EN/FR listening test and a full tool/presentation session before making it permanent.

Expected effect: shorter, less scripted opening; more pitch movement; no model-latency regression; no new provider; caps unchanged.

### Phase 2 — prompt cleanup

- Trim the live prompt to identity, scope, safety, grounding guardrails, pronunciation and the compact delivery block.
- Move the presentation protocol into a tour-start `sendClientContent` message.
- Deduplicate identity/scope/grounding/question rules.
- Standardize French on `vous`.
- Add the phrase blacklist only if unwanted phrases persist.

Expected effect: less instruction dilution, lower token cost, less “compliance voice.” Validate that grounding and tool behavior do not regress.

### Phase 3 — audio pipeline

- AudioWorklet mic capture with proper anti-alias resampling.
- 150–300ms output jitter buffer, 5–10ms crossfades, gain ramp on interrupt.
- Parse the PCM rate from `mimeType`; add −3dB safety gain or a soft limiter.
- Resume audio on gesture/visibility; handle device changes; test Bluetooth/iOS.
- Consider `setSinkId` for output selection where supported.

Expected effect: fewer clicks/gaps, better barge-in, more consistent Bluetooth/iOS behavior. It will not make Iapetus sound expressive; do not expect it to.

### Phase 4 — model (only if needed)

- Run 2.5 Native side-by-side on the same voice/opening, including tool calls, project opening, presentation steps, manual navigation and interruption.
- Accept or reject the 3–5s first-audio latency explicitly.
- Do not switch permanently while 2.5 is a preview model with an uncertain retirement path.

## Validation plan

1. Generate five samples per finalist voice, EN and FR, with the refined opening.
2. Blind listening: naturalness, warmth, clarity, trust, energy, latency, French register/accent.
3. Full Live session: intro → question → project → presentation step → manual navigation → interruption → end.
4. Device matrix: desktop Chrome, iPhone Safari, Android Chrome, Bluetooth headset.
5. Compare against current production in the same room/device; one variable at a time.
6. Watch caps and session cost; no new paid provider.

## Budget

- Direct test estimate: **~$0.31** from usage metadata.
- App ledger at the start of the audit: **$0.636037 today / $3.228758 cumulative**; cumulative remaining **$3.771242**.
- App ledger after the audit (`2026-11-28T06:42Z`): **$1.263273 today / $3.855994 cumulative**; cumulative remaining **$3.144006**.
- The **$0.627236** app-ledger increase is consistent with five Live reservation settlements at **$0.125** each, not five full audio sessions. The app's `endLive` charges the full reservation when no `/api/live/turn` usage is reported; this is conservative and protects the caps, but it overstates actual provider usage.
- The direct tests are outside the app ledger but inside the remaining budget. The app caps were not changed.
- No further app-level voice-token tests should be run without accounting for the $0.125 reservation behavior. Re-read the budget before any further paid testing.

## Artifacts

| Artifact | Path |
|---|---|
| Sample index (players + filters + metrics) | `results/audio-samples/index.html` |
| Objective analysis (JSON) | `results/audio-samples/analysis.json` |
| Objective analysis (CSV) | `results/audio-samples/analysis.csv` |
| Machine-readable audit summary | `results/nupa-voice-audit.json` |
| Prompt proposal | `results/nupa-voice-prompt-proposal.md` |
| Direct capture harness (local, gitignored) | `ai-nour/.wrangler/direct-voice-sample.mjs` |
| Analyzer | `scripts/analyze-audio-samples.py` |
| HTML builder | `scripts/build-voice-audit-html.py` |
| Summary builder | `scripts/build-voice-audit-summary.py` |

## Caveats

- The metrics are proxies. Perceived warmth, gender, humour and trust require listening.
- One or two samples per cell; differences are directional.
- The current prompt is reconstructed, not read from the live token.
- App-level samples are Iapetus only; the client voice override did not take effect.
- 2.5 Native is a preview model; availability and behavior may change.
- No production voice, model, prompt or deployment was changed.
