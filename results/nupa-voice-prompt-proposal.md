# Nupa spoken-delivery prompt proposal

Status: **implemented in source, not deployed**. The source configuration is now `gemini-3.8-live` + `Sadachbia`; production remains `Iapetus` until approval. See `results/nupa-voice-refinement.md` for validation.

The goal is not to add more personality rules. It is to remove the instructions that make Nupa sound like it is reading a product tour, and to give the voice model a small number of concrete delivery behaviours.

## 1. Replace the tour opening

The current opening tells Nupa to explain that the experience is live, interactive and personalized, and to mention interrupting, asking questions, navigating and stopping. The model reproduces that list almost verbatim.

### Refined opening (recommended)

**English**

```text
Start like a person, not a presenter. Introduce yourself in one sentence, then ask one genuine question about what brought them to Nour's portfolio. Do not list features, explain the interface, or mention that the experience is live, interactive or personalized. Do not start presenting yet.
```

**French (Canadian, `vous` register)**

```text
Commence comme une personne, pas comme un présentateur. Présente-toi en une phrase, puis pose une vraie question sur ce qui amène la personne dans le portfolio de Nour. N'énumère pas les fonctionnalités, n'explique pas l'interface et ne mentionne pas que l'expérience est en direct, interactive ou personnalisée. Ne commence pas encore à présenter.
```

Observed result in the audit:

- `38-sadachbia-en-tourrefined`: 5.89s, “Hi, I'm Nupa, Nour's independent AI portfolio assistant. What brings you to Nour's work today?”
- `38-sadachbia-fr-tourrefined`: 6.81s, “Je suis Nupa, l'assistant de portfolio de Nour, et je suis curieux de savoir ce qui vous amène à explorer son travail aujourd'hui.”
- No “live, interactive, personalized”, no “interrupt / navigate / stop” disclaimer.
- Current long opening: 18.6s average and 4.8 disclaimer terms per 100 words.

### Short alternative

**English**

```text
Start the conversation like a person, not a presenter. Introduce yourself in one sentence, then ask one genuine question about what brought the visitor to Nour's portfolio. Do not list features, do not explain how the interface works, and do not start presenting yet.
```

**French**

```text
Commence la conversation comme une personne, pas comme un présentateur. Présente-toi en une phrase, puis pose une vraie question sur ce qui amène le visiteur dans le portfolio de Nour. N'énumère pas les fonctionnalités, n'explique pas le fonctionnement de l'interface et ne commence pas encore à présenter.
```

## 2. Compact live-delivery block

Use this once, near the end of the live system prompt, so it is close to the generation point. Do not duplicate it in the persona and in the rules.

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
When you move into a presentation, connect the next item to what was just said. Do not announce interface mechanics ("I'm opening", "I'm highlighting", "as you can see").
Avoid corporate filler: leverage, synergy, innovative, passionate, seamless, robust, cutting-edge, unlock, empower, unique combination, commercial acumen.
Avoid canned openers: "Great question", "Absolutely", "I'd be happy to", "Let's dive in".
```

Why this shape:

- It gives behaviours, not adjectives. “Be charismatic” is not audible; “put emphasis on one idea and pause after a trade-off” is.
- It separates delivery from tool mechanics. The current prompt mixes 30 rules about identity, grounding, safety, presentation and tone; the voice has to infer which one applies at each turn.
- It puts the delivery block at the end. In the current prompt the one live-delivery rule sits before 16.7k characters of grounding context.

This block alone was not a reliable fix when appended to the full prompt (the “delivery tail” test was inconsistent). It should be used together with the shorter opening and a trimmed prompt, not as another layer on top of the current 30k-character prompt.

## 3. Suggested prompt architecture

| Layer | Keep | Move out |
|---|---|---|
| Base live prompt | Identity, scope, safety, grounding guardrails, pronunciation, compact spoken delivery | Text-only rules, repeated identity/scope/grounding rules, long presentation protocol |
| Tour-start context message | Presentation protocol: one step at a time, wait for confirmation, connect to the business problem, follow interruptions | — |
| Tool declarations | Target IDs, action schemas, confirmation semantics | — |
| Opening turn | Refined one-sentence intro + one genuine question | The current list of “interrupt, ask, navigate, stop” instructions |

Target base prompt: roughly 3–5k characters, not 30k. The reconstructed current prompt is ~30.2k characters / ~4.3k words, with ~16.7k characters of grounding. Token cost is small at current prices; the bigger issue is instruction dilution and latency.

## 4. Voice notes

These are starting points for listening tests, not permanent personality rules.

| Voice | Objective proxy | Delivery note to test |
|---|---|---|
| **Sadachbia** | Best cross-language pitch movement: 5.24 semitones EN and FR with the short opening; 4.63 with the refined opening; centroid ~2.7kHz | Let the pitch movement do the warmth. Avoid pushing energy; the voice already moves. |
| **Zubenelgenubi** | Most dynamic EN: 5.61 semitones, range 14.87; FR weaker at 3.75; darker centroid ~2.1kHz | Strong English option. In French, check whether it sounds flat or simply more measured. |
| **Achird** | Warm/dark: centroid ~2.0kHz; 4.29 semitones EN short opening | Lean into candour and dry humour. Do not add perkiness; it would fight the timbre. |
| **Iapetus** | Current voice: 3.47 semitones neutral; 4.54 EN / 4.22 FR short opening; centroid ~2.4kHz | If retained, compensate with a shorter opening and more deliberate emphasis; do not rely on the voice for expressiveness. |
| **Puck** | Flat in this matrix: 3.48 semitones, range 7.78 | Light texture but limited movement. Test only if the brief wants a younger/brighter character. |
| **Algieba** | Dynamic but bright: 4.33 semitones, centroid ~2.8kHz | Good energy; watch for a salesy or over-bright edge. |
| **Sulafat** | Brightest: centroid ~2.9kHz; 3.96 semitones | Clear but can feel forward. Use lower endings and pauses to avoid sing-song. |

## 5. Phrase blacklist

Add to the live prompt only if the model keeps using these after the opening is shortened:

- Corporate: leverage, synergy, innovative, passionate, seamless, robust, cutting-edge, unlock, empower, unique combination, commercial acumen, drive growth, solutions, various, throughout.
- Canned openers: “Great question”, “Absolutely”, “I'd be happy to”, “Let's dive in”, “At the end of the day”, “It's important to note”.
- Mechanical narration: “I'm opening”, “I'm highlighting”, “As you can see”, “Let me show you”, “I'll navigate to”.
- Scripted tour disclaimer: “live, interactive, personalized”, “feel free to interrupt”, “navigate on your own”, “stop at any time”, “you're in the driver's seat”.

## 6. French register

The current French tour prompt uses `tu` (“Tu commences… Présente-toi… t'interrompre”), while the UI and most French copy use `vous` (“Posez une question…”, “Votre compagnon…”). The model mixes both in the same conversation. Pick one register and apply it everywhere. For a professional portfolio, `vous` is the safer default; the refined French opening above uses `vous` and avoids explicit pronouns in the instruction.

## 7. Validation before any production change

1. Generate 3.8 + candidate voice (Sadachbia first, then Achird/Zubenelgenubi) with the refined opening, EN and FR, five samples each.
2. Listen blind: naturalness, warmth, clarity, trust, energy, latency, French accent/register.
3. Run a full Live session: interruption, barge-in, tool call, project opening, presentation step, manual navigation, session end.
4. Test on iPhone Safari, Android Chrome, desktop Chrome and a Bluetooth headset.
5. Compare against current production in the same room/device.
6. Change one variable at a time. Do not change voice, prompt and model together unless the goal is only a demo.
