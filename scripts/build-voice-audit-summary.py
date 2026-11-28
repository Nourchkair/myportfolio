#!/usr/bin/env python3
"""Build the machine-readable Nupa voice-audit summary from analysis.json."""
from __future__ import annotations

import json
import re
import statistics
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_DIR = ROOT / "results" / "audio-samples"
ANALYSIS = SAMPLE_DIR / "analysis.json"
OUT = ROOT / "results" / "nupa-voice-audit.json"

VOICES = ["Iapetus", "Achird", "Puck", "Zubenelgenubi", "Algieba", "Sulafat", "Sadachbia"]
KEYS = [
    "duration_s", "f0_st_std", "f0_st_range", "f0_micro_mean", "speech_rms_variation_db",
    "pause_ratio", "spectral_centroid_hz", "words_per_min_speech",
    "first_audio_ms", "chunk_ms_mean", "chunk_count",
]


def mean(rows, key):
    values = [row[key] for row in rows if row.get(key) is not None]
    return round(statistics.mean(values), 2) if values else None


def aggregate(rows):
    return {key: mean(rows, key) for key in KEYS} | {"samples": len(rows)}


def main() -> None:
    rows = json.loads(ANALYSIS.read_text())["samples"]
    by_name = {row["name"]: row for row in rows}

    def named(*names):
        return [by_name[name] for name in names if name in by_name]

    voice_ranking = []
    for voice in VOICES:
        sample_rows = [
            row for row in rows
            if row["model"] == "gemini-3.8-live"
            and row["voice"] == voice
            and re.fullmatch(r"38-[a-z]+-(en|fr)", row["name"])
        ]
        if sample_rows:
            voice_ranking.append({"voice": voice, **aggregate(sample_rows)})
    voice_ranking.sort(key=lambda item: item["f0_st_std"] or 0, reverse=True)

    short_by_voice = []
    for row in rows:
        if row["name"].endswith("-tourshort"):
            short_by_voice.append({
                "name": row["name"],
                "model": row["model"],
                "voice": row["voice"],
                "locale": row["locale"],
                "duration_s": row["duration_s"],
                "f0_st_std": row["f0_st_std"],
                "f0_st_range": row["f0_st_range"],
                "speech_rms_variation_db": row["speech_rms_variation_db"],
                "spectral_centroid_hz": row["spectral_centroid_hz"],
                "first_audio_ms": row["first_audio_ms"],
                "transcript": row["transcript"],
            })
    short_by_voice.sort(key=lambda item: (item["voice"], item["locale"]))

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "investigation only; no production voice, model, prompt or deployment change",
        "production": {
            "model": "gemini-3.8-live",
            "voice": "Iapetus",
            "pagesDeployment": "d84f8883-dce2-4c6a-a55b-10815b6f6979",
            "sourceCommit": "4195355",
            "dailyCapUsdMicros": 3_000_000,
            "cumulativeCapUsdMicros": 7_000_000,
        },
        "budget": {
            "appLedgerAtStart": {
                "dailyUsdMicros": 636_037,
                "cumulativeUsdMicros": 3_228_758,
                "cumulativeRemainingUsdMicros": 3_771_242,
            },
            "appLedgerAfterAudit": {
                "asOf": "2026-11-28T06:42:18Z",
                "dailyUsdMicros": 1_263_273,
                "cumulativeUsdMicros": 3_855_994,
                "cumulativeRemainingUsdMicros": 3_144_006,
            },
            "appLedgerIncreaseUsdMicros": 627_236,
            "appReservationSettlementUsdMicros": 125_000,
            "directApiEstimatedUsd": 0.3132,
            "note": "The app ledger charges the full $0.125 Live reservation when no /api/live/turn usage is reported. The increase is conservative and overstates actual provider usage.",
        },
        "scope": {
            "models": [
                "gemini-3.8-live",
                "gemini-2.5-flash-native-audio-preview-12-2025",
            ],
            "voices": VOICES,
            "locales": ["en", "fr"],
            "promptVariants": [
                "neutral intro",
                "current reconstructed system prompt",
                "current + delivery tail",
                "short prompt + grounding",
                "short prompt only",
                "current long tour opening",
                "short tour opening",
                "refined tour opening",
                "affective + proactive (2.5 only)",
                "temperature 1.2 (3.8 only)",
            ],
            "samples": len(rows),
            "directApiEstimatedUsd": 0.3132,
            "notes": "Direct API key testing bypassed the app token voice lock. App-level samples used the production token endpoint.",
        },
        "modelComparison": {
            "iapetusNeutral": {
                "gemini-3.8-live": aggregate(named("38-iapetus-en", "38-iapetus-fr")),
                "gemini-2.5-native": aggregate(named("25-iapetus-en", "25-iapetus-fr")),
            },
            "iapetusCurrentPrompt": {
                "gemini-3.8-live": aggregate(named("38-iapetus-en-currentprompt", "38-iapetus-fr-currentprompt")),
                "gemini-2.5-native": aggregate(named("25-iapetus-en-currentprompt", "25-iapetus-fr-currentprompt")),
            },
            "iapetusTourLong": {
                "gemini-3.8-live": aggregate(named("38-iapetus-en-tourlong", "38-iapetus-fr-tourlong")),
                "gemini-2.5-native": aggregate(named("25-iapetus-en-tourlong")),
            },
            "iapetusTourShort": {
                "gemini-3.8-live": aggregate(named("38-iapetus-en-tourshort", "38-iapetus-fr-tourshort")),
                "gemini-2.5-native": aggregate(named("25-iapetus-en-tourshort")),
            },
            "affective2_5": {
                "neutral": aggregate(named("25-iapetus-en", "25-iapetus-fr")),
                "affective": aggregate(named("25-iapetus-en-affective", "25-iapetus-fr-affective")),
            },
            "notes": [
                "2.5 Native has consistently wider pitch movement: neutral 5.30 vs 3.47 semitones, current prompt 4.82 vs 3.50, tour-long 5.58 vs 3.78, tour-short 5.95 vs 4.54.",
                "Frame-to-frame pitch movement is also more than double on 2.5: 1.27–1.72 semitones vs 0.60–0.99 on 3.8. This is a closer proxy for moment-to-moment liveliness than overall range.",
                "2.5 Native first audio is 2.8–4.0s slower in like-for-like captures: neutral 4.1s vs 1.3s; current prompt 4.9s vs 1.4s; tour-long 6.2s vs 2.2s; tour-short 5.1s vs 1.4s.",
                "2.5 Native streams ~44ms chunks vs ~350ms on 3.8 Live. More granular, but more messages and more scheduling overhead.",
                "2.5 Native peaks at 0 dBFS in several samples; 20 clipped samples total across the 2.5 set. Add headroom or a soft limiter before playback.",
                "Affective dialogue on 2.5 did not consistently increase measured pitch/energy variation in the one EN/FR pair. Subjective listening is required.",
            ],
        },
        "voiceRanking": voice_ranking,
        "shortOpeningByVoice": short_by_voice,
        "promptExperiments": {
            "currentSystemVsNeutral": {
                "neutral": aggregate(named("38-iapetus-en", "38-iapetus-fr")),
                "currentPrompt": aggregate(named("38-iapetus-en-currentprompt", "38-iapetus-fr-currentprompt")),
                "notes": [
                    "The current prompt makes the opening ~30% longer (14.9s vs 11.5s), reduces energy variation (5.42 dB vs 7.30 dB) and slightly reduces frame-to-frame pitch movement (0.603 vs 0.648 semitones) without increasing overall pitch variation.",
                    "The current prompt produced one incorrect self-reference: 'your independent AI-powered portfolio guide' instead of Nour's assistant.",
                ],
            },
            "tourOpening": {
                "long": aggregate(named("38-iapetus-en-tourlong", "38-iapetus-fr-tourlong")),
                "short": aggregate(named("38-iapetus-en-tourshort", "38-iapetus-fr-tourshort")),
                "refinedSadachbia": aggregate(named("38-sadachbia-en-tourrefined", "38-sadachbia-fr-tourrefined")),
                "notes": [
                    "Long tour opening: 18.6s average, 4.8 disclaimer terms per 100 words. Transcripts reproduce 'live, interactive, personalized', 'interrupt', 'navigate' and 'stop at any time' almost verbatim.",
                    "The short opening also raises frame-to-frame pitch movement on Iapetus from 0.596 to 0.782 semitones (+31%).",
                    "Short tour opening: 7.9s average, zero disclaimer terms. Refined Sadachbia opening: 6.4s average, 4.63 semitones, zero disclaimer terms.",
                    "The same long/short effect appears on Iapetus and Sadachbia, so it is a prompt effect, not a voice effect.",
                ],
            },
            "deliveryTail": {
                "currentPlusTail": aggregate(named("38-iapetus-en-tailprompt", "38-iapetus-fr-tailprompt")),
                "notes": [
                    "Appending a delivery block to the 30k-character prompt did not consistently improve prosody and made responses longer (20.8s EN / 21.5s FR). Trimming the opening is more effective than adding another rule.",
                ],
            },
            "shortPromptGrounded": aggregate(named("38-iapetus-en-shortprompt", "38-iapetus-fr-shortprompt")),
            "shortPromptOnly": aggregate(named("38-iapetus-en-shortonly")),
        },
        "pipeline": {
            "primaryCause": False,
            "evidence": [
                "App-level Iapetus samples: pitch variation 3.50–3.53 semitones, first audio 1.30–1.65s. Direct 3.8 Iapetus: 3.47 neutral / 3.50 current, first audio 1.27–1.35s. Playback preserves the flat prosody rather than creating it.",
                "App chunk arrival gaps reached 159ms (Puck) and 190ms (Iapetus); scheduled underruns were zero in the measured runs because the previous chunk covered the gap.",
                "Direct 3.8 chunks average ~350ms; 2.5 chunks average ~44ms. One direct 3.8 sample had a 2ms scheduled gap; no overlap or clipping in 3.8.",
                "Output PCM is 24 kHz, mono, 16-bit; base64 decoding is correct on little-endian browsers. No pitch/speed shift measured.",
            ],
            "issues": [
                {
                    "id": "resampling",
                    "severity": "medium",
                    "detail": "downsampleTo16k uses naive decimation without an anti-alias low-pass filter. Mic audio above 8kHz folds back into the speech band, degrading ASR/VAD.",
                    "fix": "Use an AudioWorklet resampler or a low-pass filter plus interpolation; test on 44.1k and 48k devices.",
                },
                {
                    "id": "script-processor",
                    "severity": "medium",
                    "detail": "createScriptProcessor(4096) is deprecated and adds ~85ms input buffering at 48kHz, plus processing latency.",
                    "fix": "Move mic capture to AudioWorklet with 128–256 frame blocks; keep a small ring buffer.",
                },
                {
                    "id": "jitter-buffer",
                    "severity": "medium",
                    "detail": "playAudio schedules each chunk at nextPlayTime with no jitter buffer or crossfade. A late chunk resets playback to now, creating an audible gap/click. Fine on the test network, fragile on mobile/Bluetooth.",
                    "fix": "Keep 150–300ms of lead, crossfade 5–10ms at chunk boundaries, and avoid resetting the clock for small lateness.",
                },
                {
                    "id": "hardcoded-24k",
                    "severity": "low",
                    "detail": "playAudio hardcodes 24000 when creating buffers and ignores inlineData.mimeType. Correct for current Gemini output, but breaks silently if the provider changes rate.",
                    "fix": "Parse the mimeType rate and validate 16-bit alignment.",
                },
                {
                    "id": "interrupt-fade",
                    "severity": "low",
                    "detail": "stopPlayback stops sources immediately with no gain ramp; interruption can click.",
                    "fix": "Ramp gain to zero over 20–30ms before stopping.",
                },
                {
                    "id": "background-bluetooth",
                    "severity": "medium",
                    "detail": "No AudioContext.resume() on visibility/user gesture, no device-change handling, and a forced 24kHz output context. Bluetooth headsets may switch to HFP and resample to 8/16kHz.",
                    "fix": "Resume on gesture/visibility; use the device default rate and a worklet ring buffer; test iOS/Safari, Chrome/Android and Bluetooth.",
                },
                {
                    "id": "clipping",
                    "severity": "low",
                    "detail": "2.5 Native output reached 0 dBFS with 20 clipped samples across the set; 3.8 peaked around -2.3 dBFS average.",
                    "fix": "Apply -3dB safety gain or a soft limiter in the output path.",
                },
            ],
        },
        "configuration": {
            "current": {
                "responseModalities": ["AUDIO"],
                "speechConfig": "voiceName only; no languageCode",
                "systemInstruction": "~30.2k characters reconstructed (~4.3k words); ~16.7k characters grounding",
                "tools": "portfolio, knowledge and presentation function declarations",
                "transcriptions": "input and output enabled",
                "vad": "automatic defaults; not configured",
                "temperatureTopP": "not set",
                "proactivity": "3.8 permanently enabled; 2.5 configurable",
                "affectiveDialog": "3.8 removed/unsupported; 2.5 supported",
                "thinkingLevel": "3.8 unsupported; omitted",
                "languageCode": "omitted; native audio auto-selects language",
            },
            "supportedLevers": [
                "realtimeInputConfig.automaticActivityDetection: start/end sensitivity, prefixPaddingMs, silenceDurationMs (documented for Live).",
                "generationConfig temperature/topP/topK: accepted by the SDK and by 3.8 in two test samples; effect on voice prosody was small and noisy (5.57/5.32 vs 5.24 semitones). Do not treat as a primary fix.",
                "proactivity and enableAffectiveDialog only on 2.5; do not send them to 3.8.",
                "speechConfig voiceName is the strongest supported voice lever.",
            ],
            "notSupportedOrNotRecommended": [
                "enableAffectiveDialog on 3.8 (removed).",
                "thinkingLevel on 3.8 (unsupported).",
                "languageCode for native audio (auto language selection).",
                "TTS-specific controls presented as Live controls.",
            ],
        },
        "recommendations": [
            {
                "priority": 1,
                "change": "Test Sadachbia as the production voice on 3.8 Live, with Zubenelgenubi as the English alternative and Achird as the warmer/darker alternative.",
                "evidence": "Sadachbia: 4.63 semitones with the refined opening (5.24 with the slightly longer short opening), in both EN and FR; frame-to-frame movement 0.83–0.99; first audio ~1.4s. Iapetus: 3.47 / 0.60. Zubenelgenubi EN 5.61 but FR 3.75 and lower micro-movement. Achird has the lowest centroid (warmest) but lower variation.",
            },
            {
                "priority": 2,
                "change": "Replace the long tour opening with the refined 1–2 sentence opening.",
                "evidence": "Opening length 18.6s -> 6.4s; disclaimer terms 4.8 per 100 words -> 0; same 3.8 model. Transcripts become 'Hi, I'm Nupa… What brings you to Nour's work today?' instead of listing interrupt/navigate/stop.",
            },
            {
                "priority": 3,
                "change": "Trim and deduplicate the live system prompt after the opening fix: keep identity, grounding, safety and a compact delivery block; move presentation protocol to a tour-start context message.",
                "evidence": "~30k characters and ~30 rules; identity, scope, grounding and question rules are duplicated. Tail-only addition did not fix prosody.",
            },
            {
                "priority": 4,
                "change": "Do not switch permanently to 2.5 Native without approval. If pursued, run a side-by-side tool-calling/presentation test and accept the 3–5s first-audio latency.",
                "evidence": "2.5 is more expressive (5.30 vs 3.47 neutral) but first audio 4.1s vs 1.3s; preview model with an uncertain retirement path; 2.5 output clips at 0 dBFS.",
            },
            {
                "priority": 5,
                "change": "Harden the audio pipeline: AudioWorklet mic capture with proper resampling, 150–300ms output jitter buffer, crossfades, gain ramp on interrupt, -3dB safety gain, resume/device-change handling.",
                "evidence": "Naive decimation, ScriptProcessor, no jitter buffer, forced 24k output, no background recovery; measured app gaps up to 190ms but zero underruns on this network.",
            },
        ],
        "artifacts": {
            "index": "results/audio-samples/index.html",
            "analysisJson": "results/audio-samples/analysis.json",
            "analysisCsv": "results/audio-samples/analysis.csv",
            "report": "results/nupa-voice-audit.md",
            "promptProposal": "results/nupa-voice-prompt-proposal.md",
            "captureHarness": "ai-nour/.wrangler/direct-voice-sample.mjs",
            "analyzer": "scripts/analyze-audio-samples.py",
        },
        "caveats": [
            "Objective metrics are proxies. Perceived warmth, gender, humour and trust require listening.",
            "Current system prompt is reconstructed from source; the live token response omits systemInstruction, and DB persona/knowledge overrides may differ.",
            "Each model/voice cell has one or two samples; treat differences as directional, not statistically stable.",
            "App-level samples used the production token endpoint and are Iapetus only; the client voice override did not take effect.",
            "Direct API spend is outside the app ledger (~$0.31 estimated); the app caps and ledger were not changed.",
            "2.5 Native is a preview model; availability and behavior may change.",
        ],
    }
    OUT.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"json": str(OUT), "voiceRanking": len(voice_ranking), "shortOpeningByVoice": len(short_by_voice)}, indent=2))


if __name__ == "__main__":
    main()
