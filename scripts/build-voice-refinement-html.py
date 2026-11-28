#!/usr/bin/env python3
"""Build the Nupa voice-refinement validation page."""
from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_DIR = ROOT / "results" / "audio-samples"
DATA = ROOT / "results" / "nupa-voice-refinement.json"
OUT = SAMPLE_DIR / "refinement.html"


def main() -> None:
    data = json.loads(DATA.read_text())
    scenarios = data["scenarios"]
    labels = {
        "A_current_production_config": ("A", "Current configuration", "Iapetus · old system prompt · long opening"),
        "B_sadachbia_short_intro": ("B", "Sadachbia + short opening", "Sadachbia · old system prompt · short opening"),
        "C_sadachbia_optimized_prompt": ("C", "Sadachbia + optimized prompt", "Sadachbia · structured prompt · short opening"),
        "D_optimized_prompt_pipeline": ("D", "Optimized prompt + new audio pipeline", "Sadachbia · structured prompt · 48 kHz pipeline render"),
    }

    def esc(value):
        return html.escape(str(value or ""))

    def fmt(value, digits=2):
        return "—" if value is None else f"{float(value):.{digits}f}"

    cards = []
    for key, (letter, title, subtitle) in labels.items():
        scenario = scenarios[key]
        items = scenario["items"]
        players = []
        for item in items:
            players.append(f"""
              <div class="clip">
                <div class="clip-head"><b>{esc(item['locale'].upper())}</b><span>{fmt(item['duration_s'])}s · first audio {item['first_audio_ms'] if item['first_audio_ms'] is not None else '—'} ms</span></div>
                <audio controls preload="none" src="./direct/{esc(item['name'])}.wav"></audio>
                <div class="metrics">pitch {fmt(item['f0_st_std'])} st · micro {fmt(item['f0_micro_mean'])} st · energy {fmt(item['speech_rms_variation_db'])} dB · centroid {fmt(item['spectral_centroid_hz'], 0)} Hz · {item['sample_rate'] // 1000} kHz</div>
                <details><summary>Transcript</summary><div class="transcript">{esc(item['transcript'])}</div></details>
              </div>""")
        cards.append(f"""
          <section class="card">
            <div class="tag">{letter}</div>
            <h3>{esc(title)}</h3>
            <p class="sub">{esc(subtitle)}</p>
            <div class="stats">
              <span><b>{fmt(scenario['duration_s'])}s</b> avg length</span>
              <span><b>{fmt(scenario['f0_st_std'])} st</b> pitch</span>
              <span><b>{fmt(scenario['f0_micro_mean'])} st</b> micro</span>
              <span><b>{fmt(scenario['speech_rms_variation_db'])} dB</b> energy</span>
            </div>
            {''.join(players)}
          </section>""")

    tool_rows = []
    for item in data["toolComparison"]:
        calls = ", ".join(f"{call['name']}({json.dumps(call.get('args', {}), ensure_ascii=False)})" for call in (item.get("toolCalls") or []))
        tool_rows.append(f"<tr><td>{esc(item['scenario'])}</td><td>{esc(item['name'])}</td><td class='num'>{fmt(item['duration_s'])}s</td><td><code>{esc(calls)}</code></td><td>{esc(item['transcript'])}</td></tr>")

    prompt = data["promptComparison"]
    table_rows = []
    for key, (letter, title, _) in labels.items():
        s = scenarios[key]
        table_rows.append(f"<tr><td><b>{letter}</b> {esc(title)}</td><td class='num'>{fmt(s['duration_s'])}s</td><td class='num'>{s['first_audio_ms'] if s['first_audio_ms'] is not None else '—'}</td><td class='num'>{fmt(s['f0_st_std'])}</td><td class='num'>{fmt(s['f0_micro_mean'])}</td><td class='num'>{fmt(s['speech_rms_variation_db'])}</td><td class='num'>{fmt(s['spectral_centroid_hz'], 0)}</td><td class='num'>{fmt(s['words_per_min_speech'], 0)}</td></tr>")

    template = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nupa voice refinement — validation</title>
<style>
:root{color-scheme:dark;--bg:#0b0e12;--panel:#121820;--panel2:#18212b;--line:#263241;--text:#e8eef6;--muted:#9fb0c2;--accent:#7ad6c4;--accent2:#f0b86e;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 15% -10%,#172532 0%,var(--bg) 55%);color:var(--text);line-height:1.5}
a{color:var(--accent)}.wrap{max-width:1240px;margin:0 auto;padding:34px 22px 70px}
.eyebrow{letter-spacing:.16em;text-transform:uppercase;font-size:11px;color:var(--accent);font-weight:800}
h1{font-size:clamp(30px,4.6vw,52px);line-height:1.05;margin:10px 0 14px;letter-spacing:-.03em}
h2{font-size:23px;margin:0 0 6px}h3{font-size:17px;margin:7px 0 3px}p{color:var(--muted);margin:0 0 12px}
.lede{max-width:900px;font-size:17px;color:#c7d4e2}
.note{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 15px;margin:16px 0;font-size:13px;color:var(--muted)}
.note b{color:var(--text)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0 28px}
.card{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:15px;padding:16px}
.tag{display:inline-flex;width:26px;height:26px;border-radius:50%;background:var(--accent);color:var(--bg);font-weight:900;align-items:center;justify-content:center;font-size:13px}
.sub{font-size:12px;color:var(--muted);margin:0 0 9px}
.stats{display:flex;flex-wrap:wrap;gap:7px;margin:8px 0 10px}.stats span{font-size:11px;color:var(--muted);background:#0d1319;border:1px solid var(--line);border-radius:999px;padding:3px 8px}.stats b{color:var(--text)}
.clip{border-top:1px solid var(--line);padding-top:9px;margin-top:9px}.clip-head{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted)}.clip-head b{color:var(--text)}
audio{width:100%;height:34px;margin:6px 0 4px;filter:saturate(.8)}
.metrics{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}details{margin-top:4px}summary{cursor:pointer;color:var(--muted);font-size:12px}.transcript{font-size:12px;color:#c7d4e2;margin-top:5px}
.table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 22px}th{text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line);padding:8px}td{border-bottom:1px solid rgba(38,50,65,.7);padding:8px;vertical-align:top}.num{font-variant-numeric:tabular-nums;white-space:nowrap}
code{font-size:11px;color:#c7d4e2;background:#0d1319;border:1px solid var(--line);border-radius:6px;padding:1px 4px}
.score td{height:34px}.score input{width:100%;background:#0d1319;border:1px solid var(--line);border-radius:7px;color:var(--text);padding:5px 7px;font:inherit;font-size:12px}
.footer{margin-top:34px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
@media(max-width:900px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">Nupa · voice refinement · 28 Nov 2026</div>
  <h1>Listen to the four configurations.</h1>
  <p class="lede">Source configuration is now <b>gemini-3.8-live + Sadachbia</b>, with a shorter natural opening, a structured Live prompt and a new audio pipeline. Nothing is deployed. Production remains Iapetus until approval.</p>

  <div class="note"><b>How to compare:</b> A is the current production shape. B changes the voice and opening only. C adds the optimized prompt. D is the C audio rendered through the new playback scheduling. English and French clips use the same scenario within each configuration. Acoustic metrics are shown separately from the subjective scorecard at the bottom.</div>

  <div class="grid">__CARDS__</div>

  <h2>Acoustic comparison</h2>
  <p>Averages across the available EN/FR captures. D has no network first-audio measurement; it is an offline pipeline render.</p>
  <table class="table"><thead><tr><th>Configuration</th><th>Length</th><th>First audio (ms)</th><th>Pitch (st)</th><th>Micro pitch (st)</th><th>Energy (dB)</th><th>Centroid (Hz)</th><th>WPM</th></tr></thead><tbody>__TABLE_ROWS__</tbody></table>

  <h2>Prompt and token comparison</h2>
  <table class="table"><thead><tr><th>Metric</th><th>Old</th><th>New</th><th>Change</th></tr></thead><tbody>
    <tr><td>System prompt characters (EN)</td><td class="num">__OLD_SYS__</td><td class="num">__NEW_SYS__</td><td class="num">−__SYS_REDUCTION__%</td></tr>
    <tr><td>Opening prompt characters (EN)</td><td class="num">__OLD_INTRO__</td><td class="num">__NEW_INTRO__</td><td class="num">shorter</td></tr>
    <tr><td>First-turn prompt tokens</td><td class="num">__OLD_TOKENS__</td><td class="num">__NEW_TOKENS__</td><td class="num">−__TOKEN_REDUCTION__%</td></tr>
    <tr><td>Tool-turn prompt tokens (EN)</td><td class="num">__OLD_TOOL_TOKENS__</td><td class="num">__NEW_TOOL_TOKENS__</td><td class="num">−__TOOL_TOKEN_REDUCTION__%</td></tr>
  </tbody></table>

  <h2>Tool and presentation decision</h2>
  <p>Direct Live calls with the real tool declarations. The harness returns a generic success; the app’s actual tool path still waits for frontend confirmation before speaking.</p>
  <table class="table"><thead><tr><th>Configuration</th><th>Sample</th><th>Audio</th><th>Tool calls</th><th>Spoken response</th></tr></thead><tbody>__TOOL_ROWS__</tbody></table>

  <h2>Subjective scorecard</h2>
  <p><b>Subjective quality is not scored here.</b> Listen to A→B→C→D and fill this in separately from the acoustic metrics. A useful scale is 1 (poor) to 5 (excellent).</p>
  <table class="table score"><thead><tr><th>Configuration</th><th>Naturalness</th><th>Warmth</th><th>Expressiveness</th><th>Trust</th><th>Pronunciation</th><th>Perceived latency</th><th>Notes</th></tr></thead><tbody>
    <tr><td><b>A</b> current configuration</td><td><input aria-label="A naturalness"></td><td><input aria-label="A warmth"></td><td><input aria-label="A expressiveness"></td><td><input aria-label="A trust"></td><td><input aria-label="A pronunciation"></td><td><input aria-label="A latency"></td><td><input aria-label="A notes"></td></tr>
    <tr><td><b>B</b> Sadachbia + short opening</td><td><input aria-label="B naturalness"></td><td><input aria-label="B warmth"></td><td><input aria-label="B expressiveness"></td><td><input aria-label="B trust"></td><td><input aria-label="B pronunciation"></td><td><input aria-label="B latency"></td><td><input aria-label="B notes"></td></tr>
    <tr><td><b>C</b> Sadachbia + optimized prompt</td><td><input aria-label="C naturalness"></td><td><input aria-label="C warmth"></td><td><input aria-label="C expressiveness"></td><td><input aria-label="C trust"></td><td><input aria-label="C pronunciation"></td><td><input aria-label="C latency"></td><td><input aria-label="C notes"></td></tr>
    <tr><td><b>D</b> C + new audio pipeline</td><td><input aria-label="D naturalness"></td><td><input aria-label="D warmth"></td><td><input aria-label="D expressiveness"></td><td><input aria-label="D trust"></td><td><input aria-label="D pronunciation"></td><td><input aria-label="D latency"></td><td><input aria-label="D notes"></td></tr>
  </tbody></table>

  <div class="note"><b>Preliminary read:</b> A still recites the interactive-experience disclaimer and runs long. B/C remove it and cut the opening roughly in half. C is the shortest and most consistent, with roughly half the prompt tokens of A. D preserves the C prosody and is the pipeline check; it adds 60 ms of lead and 8 ms fades by design. The subjective question is whether C/D sound warmer and more alive than A in the room, not just more dynamic on paper.</div>

  <div class="footer">Generated from <code>results/nupa-voice-refinement.json</code> and <code>results/audio-samples/analysis.json</code>. WAVs are local and intentionally untracked. No production deployment. No credentials embedded.</div>
</div>
</body>
</html>
"""
    html_text = (template
        .replace("__CARDS__", "".join(cards))
        .replace("__TABLE_ROWS__", "".join(table_rows))
        .replace("__TOOL_ROWS__", "".join(tool_rows))
        .replace("__OLD_SYS__", f"{prompt['oldSystemChars']['en']:,}")
        .replace("__NEW_SYS__", f"{prompt['newSystemChars']['en']:,}")
        .replace("__SYS_REDUCTION__", str(prompt['reductionPercent']))
        .replace("__OLD_INTRO__", f"{prompt['oldIntroChars']['en']:,}")
        .replace("__NEW_INTRO__", f"{prompt['newIntroChars']['en']:,}")
        .replace("__OLD_TOKENS__", f"{prompt['firstTurnPromptTokens']['old']:,}")
        .replace("__NEW_TOKENS__", f"{prompt['firstTurnPromptTokens']['new']:,}")
        .replace("__TOKEN_REDUCTION__", str(prompt['firstTurnPromptTokens']['reductionPercent']))
        .replace("__OLD_TOOL_TOKENS__", f"{prompt['toolTurnPromptTokens']['old']:,}")
        .replace("__NEW_TOOL_TOKENS__", f"{prompt['toolTurnPromptTokens']['new']:,}")
        .replace("__TOOL_TOKEN_REDUCTION__", str(prompt['toolTurnPromptTokens']['reductionPercent']))
    )
    html_text = "\n".join(line.rstrip() for line in html_text.splitlines()) + "\n"
    OUT.write_text(html_text)
    print(json.dumps({"html": str(OUT), "bytes": OUT.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
