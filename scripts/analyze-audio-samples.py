#!/usr/bin/env python3
"""Objective metrics for Nupa / Gemini Live audio samples.

Reads 24 kHz mono 16-bit WAVs plus optional metadata JSON, and writes a
machine-readable analysis file. No network access and no credentials.
"""
from __future__ import annotations

import csv
import json
import math
import re
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_DIR = ROOT / "results" / "audio-samples"
OUT_JSON = SAMPLE_DIR / "analysis.json"
OUT_CSV = SAMPLE_DIR / "analysis.csv"

FRAME_MS = 20
F0_FRAME_MS = 40
F0_HOP_MS = 10
F0_MIN = 55
F0_MAX = 420


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.getnframes()
        raw = handle.readframes(frames)
    if width != 2:
        raise ValueError(f"{path}: expected 16-bit PCM, got {width * 8}-bit")
    data = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, rate


def frame_signal(x: np.ndarray, rate: int, frame_ms: int) -> np.ndarray:
    size = max(1, int(rate * frame_ms / 1000))
    count = max(1, math.ceil(len(x) / size))
    padded = np.pad(x, (0, count * size - len(x)))
    return padded.reshape(count, size)


def db(value: float) -> float:
    return 20.0 * math.log10(max(value, 1e-12))


def f0_track(x: np.ndarray, rate: int, speech_mask: np.ndarray) -> np.ndarray:
    """YIN F0 for 40 ms windows on a 10 ms hop (robust against octave errors)."""
    frame_len = int(rate * F0_FRAME_MS / 1000)
    hop = int(rate * F0_HOP_MS / 1000)
    if len(x) < frame_len:
        return np.array([])
    count = 1 + (len(x) - frame_len) // hop
    nfft = 1
    while nfft < frame_len * 2:
        nfft *= 2
    min_lag = max(1, int(rate / F0_MAX))
    max_lag = min(frame_len - 1, int(rate / F0_MIN))
    values: list[float] = []
    for index in range(count):
        start = index * hop
        center = start + frame_len // 2
        frame_index = min(len(speech_mask) - 1, center // int(rate * FRAME_MS / 1000))
        if not speech_mask[frame_index]:
            continue
        frame = x[start:start + frame_len].astype(np.float64)
        if np.max(np.abs(frame)) < 1e-4:
            continue
        frame = frame - frame.mean()
        spectrum = np.fft.rfft(frame, nfft)
        autocorr = np.fft.irfft(spectrum * np.conj(spectrum), nfft)[:frame_len]
        cumulative = np.concatenate(([0.0], np.cumsum(frame * frame)))
        lags = np.arange(frame_len)
        difference = (
            cumulative[frame_len - lags]
            + (cumulative[frame_len] - cumulative[lags])
            - 2.0 * autocorr
        )
        difference = np.maximum(difference, 0.0)
        difference[0] = 0.0
        cmnd = np.ones(frame_len)
        denominator = np.cumsum(difference[1:])
        with np.errstate(divide="ignore", invalid="ignore"):
            cmnd[1:] = np.where(denominator > 1e-12, difference[1:] * lags[1:] / denominator, 1.0)
        segment = cmnd[min_lag:max_lag + 1]
        if len(segment) < 3:
            continue
        candidates = [
            index for index in range(1, len(segment) - 1)
            if segment[index] < segment[index - 1]
            and segment[index] <= segment[index + 1]
            and segment[index] < 0.18
        ]
        offset_index = candidates[0] if candidates else int(np.argmin(segment))
        lag = offset_index + min_lag
        if cmnd[lag] > 0.28:
            continue
        if 0 < lag < frame_len - 1:
            left, center_value, right = cmnd[lag - 1], cmnd[lag], cmnd[lag + 1]
            parabolic = left - 2 * center_value + right
            offset = 0.5 * (left - right) / parabolic if abs(parabolic) > 1e-9 else 0.0
        else:
            offset = 0.0
        values.append(float(rate / (lag + offset)))
    return np.asarray(values, dtype=np.float32)


def spectral_stats(x: np.ndarray, rate: int, speech_mask: np.ndarray) -> tuple[float, float, float]:
    frame_len = int(rate * F0_FRAME_MS / 1000)
    hop = int(rate * F0_HOP_MS / 1000)
    if len(x) < frame_len:
        return (0.0, 0.0, 0.0)
    count = 1 + (len(x) - frame_len) // hop
    window = np.hanning(frame_len)
    freqs = np.fft.rfftfreq(frame_len, 1 / rate)
    centroids: list[float] = []
    rolloffs: list[float] = []
    for index in range(count):
        start = index * hop
        center = start + frame_len // 2
        frame_index = min(len(speech_mask) - 1, center // int(rate * FRAME_MS / 1000))
        if not speech_mask[frame_index]:
            continue
        frame = x[start:start + frame_len]
        if np.max(np.abs(frame)) < 1e-4:
            continue
        magnitude = np.abs(np.fft.rfft(frame * window))
        total = float(magnitude.sum())
        if total <= 1e-9:
            continue
        centroids.append(float((freqs * magnitude).sum() / total))
        cumulative = np.cumsum(magnitude)
        rolloffs.append(float(freqs[np.searchsorted(cumulative, 0.85 * cumulative[-1])]))
    if not centroids:
        return (0.0, 0.0, 0.0)
    return (float(np.mean(centroids)), float(np.std(centroids)), float(np.mean(rolloffs)))


def transcript_words(transcript: str) -> int:
    if not transcript:
        return 0
    return len(re.findall(r"[\wÀ-ÖØ-öø-ÿ’'-]+", transcript, flags=re.UNICODE))


def chunk_timing(meta: dict, sample_count: int, rate: int) -> dict:
    durations = meta.get("chunkDurationsMs") or []
    gaps = meta.get("chunkArrivalGapsMs") or []
    if not durations or not gaps:
        return {
            "boundary_jump_max": None,
            "boundary_jump_mean": None,
            "scheduled_gap_total_ms": None,
            "scheduled_gap_count": None,
        }
    first = meta.get("firstAudioAtMs")
    arrivals = []
    cursor = float(first or 0)
    arrivals.append(cursor)
    for gap in gaps:
        cursor += float(gap)
        arrivals.append(cursor)
    counts = [max(1, int(round(float(value) * rate / 1000))) for value in durations]
    if sum(counts) > sample_count:
        counts[-1] = max(1, sample_count - sum(counts[:-1]))
    boundaries = []
    total = 0
    for count in counts[:-1]:
        total += count
        boundaries.append(total)
    boundaries = [value for value in boundaries if 0 < value < sample_count]
    return {
        "boundaries": boundaries,
        "arrivals": arrivals,
        "durations": [float(value) for value in durations],
        "counts": counts,
    }


def analyze(path: Path) -> dict:
    x, rate = read_wav(path)
    duration = len(x) / rate
    frames = frame_signal(x, rate, FRAME_MS)
    frame_rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    frame_db = 20 * np.log10(np.maximum(frame_rms, 1e-12))
    noise_floor = float(np.percentile(frame_db, 10))
    threshold = max(-55.0, noise_floor + 8.0)
    speech_mask = frame_db >= threshold

    speech_seconds = float(speech_mask.sum() * FRAME_MS / 1000)
    pause_seconds = max(0.0, duration - speech_seconds)
    pause_ratio = pause_seconds / duration if duration else 0.0
    leading = 0
    for active in speech_mask:
        if active:
            break
        leading += 1
    trailing = 0
    for active in speech_mask[::-1]:
        if active:
            break
        trailing += 1

    # Internal pauses: runs of silence bounded by speech, at least 120 ms.
    pause_runs: list[int] = []
    run = 0
    seen_speech = False
    for active in speech_mask:
        if active:
            if seen_speech and run:
                pause_runs.append(run)
            seen_speech = True
            run = 0
        elif seen_speech:
            run += 1
    pause_runs = [value for value in pause_runs if value * FRAME_MS >= 120]
    internal_pauses = [value * FRAME_MS for value in pause_runs]

    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    rms = float(np.sqrt(np.mean(x.astype(np.float64) ** 2))) if len(x) else 0.0
    clipping = int(np.sum(np.abs(x) >= 32760 / 32768))
    dc_offset = float(np.mean(x)) if len(x) else 0.0
    speech_db = frame_db[speech_mask]
    rms_variation = float(np.std(speech_db)) if len(speech_db) else 0.0

    f0 = f0_track(x, rate, speech_mask)
    if len(f0):
        f0_median = float(np.median(f0))
        f0_mean = float(np.mean(f0))
        f0_std = float(np.std(f0))
        f0_p10 = float(np.percentile(f0, 10))
        f0_p90 = float(np.percentile(f0, 90))
    else:
        f0_median = f0_mean = f0_std = f0_p10 = f0_p90 = 0.0
    f0_cv = f0_std / f0_median if f0_median else 0.0
    f0_range = f0_p90 - f0_p10
    if len(f0) and f0_median:
        semitones = 12.0 * np.log2(f0 / f0_median)
        semitones = semitones[np.abs(semitones) <= 12.0]
    else:
        semitones = np.array([])
    if len(semitones):
        f0_st_std = float(np.std(semitones))
        f0_st_p10 = float(np.percentile(semitones, 10))
        f0_st_p90 = float(np.percentile(semitones, 90))
        if len(semitones) > 2:
            micro = np.abs(np.diff(semitones))
            f0_micro_mean = float(np.mean(micro))
            f0_micro_p90 = float(np.percentile(micro, 90))
        else:
            f0_micro_mean = f0_micro_p90 = 0.0
    else:
        f0_st_std = f0_st_p10 = f0_st_p90 = 0.0
        f0_micro_mean = f0_micro_p90 = 0.0

    centroid, centroid_std, rolloff = spectral_stats(x, rate, speech_mask)

    meta_path = path.with_suffix(".json")
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    timing = chunk_timing(meta, len(x), rate)
    if timing.get("boundaries"):
        jumps = [
            abs(float(x[boundary]) - float(x[boundary - 1]))
            for boundary in timing["boundaries"]
        ]
        boundary_jump_max = float(np.max(jumps)) if jumps else 0.0
        boundary_jump_mean = float(np.mean(jumps)) if jumps else 0.0
        scheduled_end = timing["arrivals"][0] + timing["durations"][0]
        scheduled_gap_total = 0.0
        scheduled_gap_count = 0
        for arrival, chunk_duration in zip(timing["arrivals"][1:], timing["durations"][1:]):
            if arrival > scheduled_end + 1.0:
                scheduled_gap_total += arrival - scheduled_end
                scheduled_gap_count += 1
                scheduled_end = arrival + chunk_duration
            else:
                scheduled_end += chunk_duration
    else:
        boundary_jump_max = boundary_jump_mean = None
        scheduled_gap_total = scheduled_gap_count = None
    words = transcript_words(meta.get("transcript", ""))
    words_per_min_speech = words / speech_seconds * 60 if speech_seconds else 0.0
    words_per_min_total = words / duration * 60 if duration else 0.0

    base = path.name
    model = meta.get("model") or "app"
    locale = meta.get("locale") or ("fr" if "-fr" in base else "en")
    voice = meta.get("actualVoice") or meta.get("requestedVoice") or "app"
    variant = meta.get("variant") or "app"
    source = "app" if meta.get("tokenModel") else "direct"

    return {
        "file": str(path.relative_to(ROOT)),
        "name": path.stem,
        "source": source,
        "model": model,
        "voice": voice,
        "locale": locale,
        "variant": variant,
        "transcript": meta.get("transcript", ""),
        "sample_rate": rate,
        "duration_s": round(duration, 3),
        "speech_s": round(speech_seconds, 3),
        "pause_s": round(pause_seconds, 3),
        "pause_ratio": round(pause_ratio, 4),
        "leading_silence_s": round(leading * FRAME_MS / 1000, 3),
        "trailing_silence_s": round(trailing * FRAME_MS / 1000, 3),
        "internal_pause_count": len(internal_pauses),
        "internal_pause_mean_ms": round(float(np.mean(internal_pauses)), 1) if internal_pauses else 0.0,
        "internal_pause_max_ms": round(float(np.max(internal_pauses)), 1) if internal_pauses else 0.0,
        "peak_dbfs": round(db(peak), 2),
        "rms_dbfs": round(db(rms), 2),
        "crest_db": round(db(peak) - db(rms), 2),
        "clipping_samples": clipping,
        "dc_offset": round(dc_offset, 6),
        "speech_rms_variation_db": round(rms_variation, 2),
        "f0_frames": int(len(f0)),
        "f0_median_hz": round(f0_median, 2),
        "f0_mean_hz": round(f0_mean, 2),
        "f0_std_hz": round(f0_std, 2),
        "f0_cv": round(f0_cv, 4),
        "f0_p10_hz": round(f0_p10, 2),
        "f0_p90_hz": round(f0_p90, 2),
        "f0_range_hz": round(f0_range, 2),
        "f0_st_std": round(f0_st_std, 3),
        "f0_st_p10": round(f0_st_p10, 3),
        "f0_st_p90": round(f0_st_p90, 3),
        "f0_st_range": round(f0_st_p90 - f0_st_p10, 3),
        "f0_micro_mean": round(f0_micro_mean, 3),
        "f0_micro_p90": round(f0_micro_p90, 3),
        "spectral_centroid_hz": round(centroid, 1),
        "spectral_centroid_std_hz": round(centroid_std, 1),
        "spectral_rolloff85_hz": round(rolloff, 1),
        "words": words,
        "words_per_min_speech": round(words_per_min_speech, 1),
        "words_per_min_total": round(words_per_min_total, 1),
        "chunk_count": meta.get("chunkCount", 0),
        "chunk_ms_mean": round(float(np.mean(meta.get("chunkDurationsMs", []))), 1) if meta.get("chunkDurationsMs") else 0.0,
        "chunk_ms_max": round(float(np.max(meta.get("chunkDurationsMs", [0]))), 1) if meta.get("chunkDurationsMs") else 0.0,
        "first_audio_ms": meta.get("firstAudioAtMs"),
        "arrival_gap_max_ms": max(meta.get("chunkArrivalGapsMs", [0]) or [0]),
        "underruns": meta.get("underruns"),
        "boundary_jump_max": round(boundary_jump_max, 4) if boundary_jump_max is not None else None,
        "boundary_jump_mean": round(boundary_jump_mean, 4) if boundary_jump_mean is not None else None,
        "scheduled_gap_total_ms": round(scheduled_gap_total, 1) if scheduled_gap_total is not None else None,
        "scheduled_gap_count": scheduled_gap_count,
    }


def main() -> None:
    paths = sorted(SAMPLE_DIR.glob("*.wav")) + sorted((SAMPLE_DIR / "direct").glob("*.wav"))
    rows = [analyze(path) for path in paths]
    OUT_JSON.write_text(json.dumps({"samples": rows}, indent=2) + "\n")
    fields = list(rows[0].keys()) if rows else []
    with OUT_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"samples": len(rows), "json": str(OUT_JSON), "csv": str(OUT_CSV)}, indent=2))


if __name__ == "__main__":
    main()
