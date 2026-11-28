#!/usr/bin/env python3
"""Build the Nupa voice-audit sample index from analysis.json."""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_DIR = ROOT / "results" / "audio-samples"
ANALYSIS = SAMPLE_DIR / "analysis.json"
OUT = SAMPLE_DIR / "index.html"

SCENARIOS = {
    "neutral": "Neutral intro",
    "currentprompt": "Current system prompt",
    "tailprompt": "Current + delivery tail",
    "shortprompt": "Short prompt + grounding",
    "shortonly": "Short prompt only",
    "tourlong": "Tour opening — current (long)",
    "tourshort": "Tour opening — short",
    "tourrefined": "Tour opening — refined",
    "affective": "Affective + proactive",
    "temp": "Temperature 1.2",
    "temp2": "Temperature 1.2 (repeat)",
    "app": "App playback",
}

RECOMMENDED = {
    "38-iapetus-en-tourlong": "Current config (reconstructed)",
    "38-iapetus-fr-tourlong": "Current config (reconstructed)",
    "38-sadachbia-en-tourrefined": "Recommended test",
    "38-sadachbia-fr-tourrefined": "Recommended test",
    "38-sadachbia-en-tourshort": "Recommended test",
    "38-sadachbia-fr-tourshort": "Recommended test",
    "38-zubenelgenubi-en-tourshort": "English alternative",
    "38-achird-en-tourshort": "Warm alternative",
    "25-iapetus-en-tourshort": "2.5 comparison",
    "25-iapetus-en-tourlong": "2.5 comparison",
}

MODEL_LABELS = {
    "gemini-3.8-live": "3.8 Live",
    "gemini-2.5-flash-native-audio-preview-12-2025": "2.5 Native",
}


def scenario_for(name: str) -> str:
    for key in ("currentprompt", "tailprompt", "shortprompt", "shortonly", "tourrefined", "tourlong", "tourshort", "affective", "temp2", "temp"):
        if name.endswith("-" + key):
            return key
    if re.fullmatch(r"(38|25)-[a-z]+-(en|fr)", name):
        return "neutral"
    return "app"


def audio_path(file: str) -> str:
    if file.startswith("results/audio-samples/direct/"):
        return "./direct/" + Path(file).name
    return "./" + Path(file).name


def main() -> None:
    rows = [row for row in json.loads(ANALYSIS.read_text())["samples"] if not row["name"].startswith("v2-")]
    samples = []
    for row in rows:
        name = row["name"]
        scenario = scenario_for(name)
        samples.append({
            "name": name,
            "audio": audio_path(row["file"]),
            "model": row["model"],
            "modelLabel": "3.8 Live (app)" if row["model"] == "app" else MODEL_LABELS.get(row["model"], row["model"]),
            "voice": row["voice"],
            "locale": row["locale"],
            "scenario": scenario,
            "scenarioLabel": SCENARIOS.get(scenario, scenario),
            "recommended": RECOMMENDED.get(name, ""),
            "duration": row["duration_s"],
            "first": row["first_audio_ms"],
            "pitch": row["f0_st_std"],
            "range": row["f0_st_range"],
            "micro": row["f0_micro_mean"],
            "rmsvar": row["speech_rms_variation_db"],
            "pause": row["pause_ratio"],
            "centroid": row["spectral_centroid_hz"],
            "wpm": row["words_per_min_speech"],
            "chunks": row["chunk_count"],
            "chunkMs": row["chunk_ms_mean"],
            "clipping": row["clipping_samples"],
            "transcript": row["transcript"],
        })
    # Recommended first, then model/scenario/voice/locale.
    samples.sort(key=lambda item: (
        0 if item["recommended"] else 1,
        item["model"],
        item["scenario"],
        item["voice"],
        item["locale"],
    ))
    payload = json.dumps(samples, ensure_ascii=False).replace("</", "<\\/")

    template = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nupa voice audit — comparable samples</title>
<style>
:root{
  color-scheme: dark;
  --bg:#0b0e12; --panel:#121820; --panel-2:#18212b; --line:#263241;
  --text:#e8eef6; --muted:#9fb0c2; --accent:#7ad6c4; --accent-2:#f0b86e;
  --danger:#ff8a8a; --good:#8ee0a8; --radius:14px;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 600px at 20% -10%,#172532 0%,var(--bg) 55%);color:var(--text);line-height:1.55}
a{color:var(--accent)}
.wrap{max-width:1240px;margin:0 auto;padding:34px 22px 70px}
.eyebrow{letter-spacing:.16em;text-transform:uppercase;font-size:11px;color:var(--accent);font-weight:700}
h1{font-size:clamp(30px,4.6vw,54px);line-height:1.04;margin:10px 0 14px;letter-spacing:-.03em}
h2{font-size:23px;margin:0 0 6px;letter-spacing:-.02em}
h3{font-size:16px;margin:0 0 8px}
p{margin:0 0 12px;color:var(--muted)}
.lede{max-width:850px;font-size:17px;color:#c7d4e2}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:24px 0 30px}
.card{background:linear-gradient(180deg,var(--panel-2),var(--panel));border:1px solid var(--line);border-radius:var(--radius);padding:15px}
.card b{display:block;font-size:22px;color:var(--text);letter-spacing:-.02em}
.card span{font-size:12px;color:var(--muted)}
.card .note{font-size:12px;color:var(--muted);margin-top:6px}
.listen{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0 34px}
.listen .card{padding:17px}
.listen .tag{display:inline-block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--bg);background:var(--accent);border-radius:999px;padding:3px 8px;font-weight:800;margin-bottom:8px}
.listen .tag.alt{background:var(--accent-2)}
.listen .meta{font-size:12px;color:var(--muted);margin:2px 0 8px}
audio{width:100%;height:36px;margin-top:8px;filter:saturate(.8)}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 14px;position:sticky;top:0;background:rgba(11,14,18,.92);backdrop-filter:blur(10px);padding:10px 0;z-index:3;border-bottom:1px solid var(--line)}
select,input{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:9px;padding:8px 10px;font:inherit;font-size:13px}
input{min-width:220px;flex:1}
.count{font-size:12px;color:var(--muted);margin-left:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--muted);font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid var(--line);padding:9px 8px;position:sticky;top:57px;background:var(--bg);z-index:2}
td{border-bottom:1px solid rgba(38,50,65,.65);padding:9px 8px;vertical-align:top}
tr:hover td{background:rgba(122,214,196,.04)}
.badge{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 7px;font-size:11px;color:var(--muted);white-space:nowrap}
.badge.rec{border-color:var(--accent);color:var(--accent)}
.badge.alt{border-color:var(--accent-2);color:var(--accent-2)}
.badge.model{background:var(--panel-2);color:var(--text)}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.muted{color:var(--muted)}
details{max-width:470px}
summary{cursor:pointer;color:var(--muted);font-size:12px}
.transcript{color:#c7d4e2;font-size:12px;margin-top:6px;white-space:pre-wrap}
.section{margin-top:38px}
.section-head{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:4px}
.section-head p{margin:0;font-size:13px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.note-box{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin:16px 0}
.note-box h3{color:var(--accent)}
.note-box ul{margin:8px 0 0 18px;padding:0;color:var(--muted);font-size:13px}
.note-box li{margin:5px 0}
.warn{border-color:#5a3a2a;background:linear-gradient(180deg,#241a15,#181311)}
.warn h3{color:var(--accent-2)}
.footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
@media(max-width:900px){.cards{grid-template-columns:repeat(2,1fr)}.listen{grid-template-columns:1fr}.grid2{grid-template-columns:1fr}}
@media(max-width:620px){.cards{grid-template-columns:1fr}th:nth-child(4),td:nth-child(4),th:nth-child(8),td:nth-child(8),th:nth-child(9),td:nth-child(9){display:none}}
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">Nupa · Gemini Live voice audit · 28 Nov 2026</div>
  <h1>Comparable voice samples.<br>Same prompts, same pipeline.</h1>
  <p class="lede">Direct Gemini Live captures plus app-level captures, used to separate model, voice, prompt and playback causes. No production voice or model was changed. All clips are 24 kHz mono WAV. Metrics are objective; perceived warmth and naturalness still need your ear.</p>

  <div class="cards">
    <div class="card"><b>__COUNT__</b><span>captured samples</span><div class="note">7 voices × EN/FR, 3.8 vs 2.5, prompt and pipeline variants</div></div>
    <div class="card"><b>3.47 → 4.6–5.2</b><span>pitch variation (semitones)</span><div class="note">Iapetus → Sadachbia, same 3.8 model, refined/short opening</div></div>
    <div class="card"><b>18.6s → 6.4s</b><span>opening length</span><div class="note">Current long tour prompt → refined opening, same model</div></div>
    <div class="card"><b>1.3s vs 4.1s</b><span>first audio</span><div class="note">3.8 Live vs 2.5 Native (neutral Iapetus)</div></div>
  </div>

  <div class="section">
    <div class="section-head"><div><h2>Listen first</h2><p>Four comparisons that isolate the main decisions.</p></div></div>
    <div class="listen">
      <div class="card">
        <span class="tag">Current configuration</span>
        <h3>Iapetus · current long opening</h3>
        <div class="meta">3.8 Live · EN · 19.0s · reconstructed prompt · scripted disclaimer</div>
        <audio controls preload="none" src="./direct/38-iapetus-en-tourlong.wav"></audio>
      </div>
      <div class="card">
        <span class="tag">Recommended test</span>
        <h3>Sadachbia · refined opening</h3>
        <div class="meta">3.8 Live · EN · 5.9s · no disclaimer</div>
        <audio controls preload="none" src="./direct/38-sadachbia-en-tourrefined.wav"></audio>
      </div>
      <div class="card">
        <span class="tag alt">Model comparison</span>
        <h3>2.5 Native · Iapetus · short opening</h3>
        <div class="meta">2.5 Native · EN · 7.9s · more pitch movement, slower first audio</div>
        <audio controls preload="none" src="./direct/25-iapetus-en-tourshort.wav"></audio>
      </div>
      <div class="card">
        <span class="tag">French pair</span>
        <h3>Current vs proposed</h3>
        <div class="meta">Iapetus long 18.1s · Sadachbia refined 6.8s</div>
        <audio controls preload="none" src="./direct/38-iapetus-fr-tourlong.wav"></audio>
        <audio controls preload="none" src="./direct/38-sadachbia-fr-tourrefined.wav"></audio>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><div><h2>All samples</h2><p>Filter by model, voice, language, prompt or pipeline variant.</p></div></div>
    <div class="toolbar">
      <select id="f-model"><option value="">All models</option></select>
      <select id="f-voice"><option value="">All voices</option></select>
      <select id="f-locale"><option value="">EN + FR</option><option value="en">English</option><option value="fr">French</option></select>
      <select id="f-scenario"><option value="">All scenarios</option></select>
      <input id="f-search" type="search" placeholder="Search name, voice or transcript…">
      <span class="count" id="count"></span>
    </div>
    <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>Sample</th><th>Model / voice</th><th>Scenario</th><th>Lang</th>
          <th>Duration</th><th>First audio</th><th>Pitch variation</th><th>Micro pitch</th><th>Energy variation</th>
          <th>Pause</th><th>Centroid</th><th>WPM</th><th>Chunks</th><th>Transcript</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>

  <div class="section grid2">
    <div class="note-box">
      <h3>How to read the metrics</h3>
      <ul>
        <li><b>Pitch variation</b> is the standard deviation of voiced F0 in semitones. Higher usually means more intonation movement, not necessarily better taste.</li>
        <li><b>Micro pitch</b> is the mean frame-to-frame F0 change in semitones. It is a closer proxy for moment-to-moment liveliness than overall range.</li>
        <li><b>Energy variation</b> is the standard deviation of speech-frame level in dB. Higher means more dynamic emphasis and stress.</li>
        <li><b>Pause</b> is the share of the clip below the adaptive speech threshold. <b>WPM</b> is words per minute of voiced speech.</li>
        <li><b>Centroid</b> is the spectral centre of gravity. Lower is darker/warmer; higher is brighter/more forward.</li>
        <li><b>First audio</b> is measured from prompt send to the first PCM chunk. <b>Chunks</b> shows stream granularity.</li>
      </ul>
    </div>
    <div class="note-box warn">
      <h3>What this page cannot tell you</h3>
      <ul>
        <li>Whether a voice sounds male, female, young, old, trustworthy or warm. Listen and judge.</li>
        <li>How the voice feels over a five-minute conversation, after interruptions, on a phone or over Bluetooth.</li>
        <li>Whether 2.5 Native remains available. It is a preview model; do not switch production without approval.</li>
        <li>Exact production prompt equality: the current system prompt here is reconstructed from source, not read from the live token.</li>
      </ul>
    </div>
  </div>

  <div class="note-box">
    <h3>Provisional root-cause ranking</h3>
    <ul>
      <li><b>1. Voice choice.</b> Iapetus is one of the flattest voices in this matrix. Sadachbia and Zubenelgenubi move more in pitch and energy.</li>
      <li><b>2. Opening prompt.</b> The current tour prompt tells Nupa to mention “live, interactive, personalized”, “interrupt”, “navigate” and “stop at any time”. The transcripts reproduce that list almost verbatim. The short/refined opening removes it.</li>
      <li><b>3. Model character.</b> 2.5 Native is consistently more expressive than 3.8 Live, but its first audio is 2.8–4.0s slower in like-for-like tests and it is a preview model with an uncertain retirement path.</li>
      <li><b>4. Prompt density.</b> The live system prompt is ~30k characters and ~30 rules. The current prompt makes openings longer and less dynamic, but it is not the only cause.</li>
      <li><b>5. Playback.</b> App-level Iapetus samples retain the same pitch variation as direct Gemini PCM. The frontend is not the primary source of the robotic timbre, though it adds latency and fragility on jittery/Bluetooth paths.</li>
    </ul>
  </div>

  <div class="footer">
    Generated from <code>results/audio-samples/analysis.json</code> · objective analysis by <code>scripts/analyze-audio-samples.py</code> · WAVs are local and intentionally untracked · no credentials embedded · no production change.
  </div>
</div>

<script>
const SAMPLES = __SAMPLES__;
const byId = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = (value, digits = 2) => value === null || value === undefined ? '—' : Number(value).toFixed(digits);

function fill(select, values) {
  const current = select.value;
  select.innerHTML = select.querySelector('option').outerHTML + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  select.value = current;
}

fill(byId('f-model'), [...new Set(SAMPLES.map((s) => s.modelLabel))].sort());
fill(byId('f-voice'), [...new Set(SAMPLES.map((s) => s.voice))].sort());
fill(byId('f-scenario'), [...new Set(SAMPLES.map((s) => s.scenarioLabel))].sort());

function render() {
  const model = byId('f-model').value;
  const voice = byId('f-voice').value;
  const locale = byId('f-locale').value;
  const scenario = byId('f-scenario').value;
  const query = byId('f-search').value.trim().toLowerCase();
  const rows = SAMPLES.filter((s) =>
    (!model || s.modelLabel === model) &&
    (!voice || s.voice === voice) &&
    (!locale || s.locale === locale) &&
    (!scenario || s.scenarioLabel === scenario) &&
    (!query || `${s.name} ${s.voice} ${s.transcript}`.toLowerCase().includes(query))
  );
  byId('count').textContent = `${rows.length} / ${SAMPLES.length} samples`;
  byId('rows').innerHTML = rows.map((s) => {
    const badgeClass = s.recommended === 'Recommended test' ? 'rec' : (s.recommended ? 'alt' : '');
    return `<tr>
      <td>
        <div style="font-weight:650">${esc(s.name)}</div>
        ${s.recommended ? `<span class="badge ${badgeClass}">${esc(s.recommended)}</span>` : ''}
        <audio controls preload="none" src="${esc(s.audio)}" aria-label="Play ${esc(s.name)}"></audio>
      </td>
      <td><span class="badge model">${esc(s.modelLabel)}</span><div class="muted">${esc(s.voice)}</div></td>
      <td>${esc(s.scenarioLabel)}</td>
      <td>${esc(s.locale.toUpperCase())}</td>
      <td class="num">${fmt(s.duration)}s</td>
      <td class="num">${s.first == null ? '—' : `${s.first} ms`}</td>
      <td class="num">${fmt(s.pitch)} st</td>
      <td class="num">${fmt(s.micro)} st</td>
      <td class="num">${fmt(s.rmsvar)} dB</td>
      <td class="num">${fmt(s.pause * 100, 0)}%</td>
      <td class="num">${fmt(s.centroid, 0)} Hz</td>
      <td class="num">${fmt(s.wpm, 0)}</td>
      <td class="num">${s.chunks || '—'}${s.chunkMs ? `<div class="muted">${fmt(s.chunkMs, 0)} ms</div>` : ''}</td>
      <td><details><summary>Show</summary><div class="transcript">${esc(s.transcript || 'No transcript')}</div></details></td>
    </tr>`;
  }).join('');
}

['f-model','f-voice','f-locale','f-scenario'].forEach((id) => byId(id).addEventListener('change', render));
byId('f-search').addEventListener('input', render);
render();
</script>
</body>
</html>
"""
    html_text = template.replace("__SAMPLES__", payload).replace("__COUNT__", str(len(samples)))
    OUT.write_text(html_text)
    print(json.dumps({"html": str(OUT), "samples": len(samples), "bytes": OUT.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
