#!/usr/bin/env bash
# Generates synthetic 16 kHz mono PCM inputs using macOS `say`.
# These are public, synthetic prompts only; no microphone or personal audio is used.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p audio

if ! command -v say >/dev/null 2>&1; then
  echo "macOS 'say' is required to generate synthetic voice fixtures." >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to convert AIFF to raw PCM." >&2
  exit 1
fi

say -v Samantha -o /tmp/ainour-en.aiff "Hi, I am AI Nour. Tell me briefly about Nour's work and the Safiy project."
say -v Amélie -o /tmp/ainour-fr.aiff "Bonjour, je suis AI Nour. Parlez-moi brièvement du parcours de Nour et du projet Safiy."
say -v Samantha -o /tmp/ainour-tool.aiff "Please open the Safiy project."
say -v Samantha -o /tmp/ainour-interrupt.aiff "Wait, actually tell me about Dispatch instead."
say -v Samantha -o /tmp/ainour-context.aiff "Which project did I mention?"

for name in en fr tool interrupt context; do
  ffmpeg -hide_banner -loglevel error -y -i "/tmp/ainour-${name}.aiff" -ar 16000 -ac 1 -f s16le "audio/ainour-${name}.pcm"
done

ls -lh audio/ainour-*.pcm
