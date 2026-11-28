#!/usr/bin/env python3
"""Build the Nupa voice-refinement summary from V2 captures and analysis."""
from __future__ import annotations

import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = ROOT / "results" / "audio-samples" / "analysis.json"
DIRECT = ROOT / "results" / "audio-samples" / "direct"
OUT = ROOT / "results" / "nupa-voice-refinement.json"

KEYS = [
    "duration_s", "f0_st_std", "f0_st_range", "f0_micro_mean",
    "speech_rms_variation_db", "pause_ratio", "spectral_centroid_hz",
    "words_per_min_speech", "first_audio_ms",
]


def mean(rows, key):
    values = [row[key] for row in rows if row.get(key) is not None]
    return round(statistics.mean(values), 2) if values else None


def aggregate(rows):
    out = {key: mean(rows, key) for key in KEYS}
    out["samples"] = len(rows)
    out["items"] = [
        {
            "name": row["name"],
            "locale": row["locale"],
            "duration_s": row["duration_s"],
            "first_audio_ms": row["first_audio_ms"],
            "f0_st_std": row["f0_st_std"],
            "f0_micro_mean": row["f0_micro_mean"],
            "speech_rms_variation_db": row["speech_rms_variation_db"],
            "spectral_centroid_hz": row["spectral_centroid_hz"],
            "words_per_min_speech": row["words_per_min_speech"],
            "sample_rate": row["sample_rate"],
            "transcript": row["transcript"],
        }
        for row in sorted(rows, key=lambda item: (item["locale"], item["name"]))
    ]
    return out


def main() -> None:
    rows = json.loads(ANALYSIS.read_text())["samples"]
    by_name = {row["name"]: row for row in rows}
    meta = {}
    for path in DIRECT.glob("v2-*.json"):
        data = json.loads(path.read_text())
        meta[data["outName"]] = data

    scenarios = {
        "A_current_production_config": aggregate([
            row for name, row in by_name.items()
            if name.startswith("v2-a-iapetus-oldprompt-longintro")
        ]),
        "B_sadachbia_short_intro": aggregate([
            row for name, row in by_name.items()
            if name.startswith("v2-b-sadachbia-oldprompt-shortintro")
        ]),
        "C_sadachbia_optimized_prompt": aggregate([
            row for name, row in by_name.items()
            if name.startswith("v2-c-sadachbia-newprompt-shortintro")
        ]),
        "D_optimized_prompt_pipeline": aggregate([
            row for name, row in by_name.items()
            if name.startswith("v2-d-sadachbia-newprompt-pipeline")
        ]),
    }

    first_old = meta["v2-a-iapetus-oldprompt-longintro-en"]["usage"]["promptTokenCount"]
    first_new = meta["v2-c-sadachbia-newprompt-shortintro-en"]["usage"]["promptTokenCount"]
    tool_old = meta["v2-a-iapetus-oldprompt-tool-en"]["usage"]["promptTokenCount"]
    tool_new = meta["v2-c-sadachbia-newprompt-tool-en"]["usage"]["promptTokenCount"]

    direct_cost = 0.0
    direct_samples = 0
    for name, data in meta.items():
        if "pipeline" in name:
            continue
        direct_samples += 1
        usage = data.get("usage") or {}
        text = sum(int(item.get("tokenCount") or 0) for item in usage.get("promptTokensDetails") or [] if str(item.get("modality")).lower() == "text")
        audio_in = sum(int(item.get("tokenCount") or 0) for item in usage.get("promptTokensDetails") or [] if str(item.get("modality")).lower() == "audio")
        audio_out = sum(int(item.get("tokenCount") or 0) for item in usage.get("responseTokensDetails") or [] if str(item.get("modality")).lower() == "audio")
        direct_cost += text * 0.75 / 1e6 + audio_in * 3 / 1e6 + audio_out * 12 / 1e6

    tool_rows = []
    for name, label in [
        ("v2-a-iapetus-oldprompt-tool-en", "A current config"),
        ("v2-c-sadachbia-newprompt-tool-en", "C optimized prompt"),
        ("v2-c-sadachbia-newprompt-tool-fr", "C optimized prompt"),
    ]:
        tool_rows.append({
            "scenario": label,
            "name": name,
            "duration_s": by_name[name]["duration_s"],
            "toolCalls": meta[name].get("toolCalls"),
            "transcript": by_name[name]["transcript"],
        })

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "implementation and validation only; not deployed",
        "deploymentState": "source only; production remains gemini-3.8-live + Iapetus until approval",
        "config": {"model": "gemini-3.8-live", "voice": "Sadachbia (provisional source configuration)"},
        "promptComparison": {
            "oldSystemChars": {"en": 30218, "fr": 30225},
            "newSystemChars": {"en": 13854, "fr": 13925},
            "reductionPercent": round((1 - 13854 / 30218) * 100, 1),
            "oldIntroChars": {"en": 968, "fr": 1057},
            "newIntroChars": {"en": 408, "fr": 430},
            "firstTurnPromptTokens": {"old": first_old, "new": first_new, "reductionPercent": round((1 - first_new / first_old) * 100, 1)},
            "toolTurnPromptTokens": {"old": tool_old, "new": tool_new, "reductionPercent": round((1 - tool_new / tool_old) * 100, 1)},
        },
        "scenarios": scenarios,
        "toolComparison": tool_rows,
        "directApiEstimatedUsd": round(direct_cost, 4),
        "directApiSamples": direct_samples,
        "verification": {
            "portfolioValidator": "270/270",
            "legalValidator": "79/79",
            "aiNourTests": "76/76",
            "workletBrowserLoad": "passed",
            "resamplerToneTest": "1kHz preserved; 12kHz attenuated",
            "playbackOfflineTest": "passed",
            "pipelineRender": "C audio rendered through new playAudio scheduling; pitch/energy preserved",
            "realDevices": "not yet tested",
        },
        "acousticVsSubjective": {
            "acoustic": "YIN F0, semitone variance, frame-to-frame pitch movement, RMS variation, pause ratio, spectral centroid, chunk/first-audio timing.",
            "subjective": "Pending Nour listening. Rate naturalness, warmth, expressiveness, trust, pronunciation, French register, perceived latency and presentation feel separately.",
        },
        "preliminarySubjective": [
            "A retains the live/interactive/personalized disclaimer and sounds like a guided product tour.",
            "B and C open like a person and ask one genuine question; C is shorter and more consistent across repeats.",
            "C French uses vous and avoids the capability list.",
            "D is the same C performance through the new pipeline; listening is required to judge the 60ms lead and fades.",
            "These are transcript-only observations, not a listening score.",
        ],
        "codeChanges": [
            "LIVE_VOICE Sadachbia (single config switch)",
            "short natural tour/text opening",
            "structured live prompt with compact grounding",
            "AudioWorklet 16kHz resampler with anti-alias FIR",
            "filtered ScriptProcessor fallback",
            "provider mime rate/channel parsing",
            "adaptive playback lead and gain ramps",
            "AudioContext visibility/focus/device recovery",
        ],
        "caveats": [
            "One or two generation samples per scenario and language; directional, not statistical.",
            "D is an OfflineAudioContext 48kHz render of the C audio through the new playAudio scheduling; it tests pipeline scheduling/resampling, not real network jitter or Bluetooth.",
            "The production token endpoint still uses Iapetus until the source configuration is deployed with approval.",
            "Direct provider spend is separate from the app ledger.",
        ],
    }
    OUT.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"json": str(OUT), "directUsd": summary["directApiEstimatedUsd"], "C": scenarios["C_sadachbia_optimized_prompt"]}, indent=2)[:2500])


if __name__ == "__main__":
    main()
