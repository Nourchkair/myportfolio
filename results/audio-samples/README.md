# Nupa voice audit samples

Open [`index.html`](index.html) for the original 50-clip audit, or [`refinement.html`](refinement.html) for the four-configuration refinement validation.

- `index.html` — players, filters and objective metrics.
- `analysis.json` / `analysis.csv` — YIN pitch, energy, pause, centroid and chunk-timing metrics.
- `refinement.html` — A/B/C/D players, prompt/token comparison, tool-decision comparison and a subjective scorecard.
- `direct/v2-*` — refinement captures and the 48kHz pipeline render.
- `direct/` — direct Gemini Live captures; WAVs are local and intentionally **not committed** (about 22 MB).
- Root `puck-en.wav` and `voice-default-C.UTF-8.wav` — production app captures; both actually used **Iapetus** because the app token locks the voice. The `puck-en` filename records the requested override, not the actual voice. Both are local/untracked.

The WAV files are kept locally so the repository does not grow by 22 MB. They can be regenerated with the local, gitignored harness `ai-nour/.wrangler/direct-voice-sample.mjs`:

```bash
cd ai-nour
GEMINI_API_KEY=... MODEL=gemini-3.8-live VOICE=Sadachbia LOCALE=en \
  OUT=sadachbia-en-tourrefined \
  SYSTEM_FILE=/path/to/system.txt PROMPT_FILE=/path/to/opening.txt \
  node .wrangler/direct-voice-sample.mjs
```

Then rebuild the metrics and index from the repository root:

```bash
python3 scripts/analyze-audio-samples.py
python3 scripts/build-voice-audit-summary.py
python3 scripts/build-voice-audit-html.py
```

No credentials are stored in this directory or in the generated metadata.
