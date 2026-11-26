# Visual regression evidence

- `baseline/` — screenshots captured before the technical refactor (1440, 1024 and 390 widths).
- `current/` — screenshots captured after the refactor and CSS cleanup at the same states and viewport sizes.
- `current/visual-diff.json` — SSIM scores produced by ffmpeg.

The comparison is intentionally state-matched: home, About, My Journey, project deck, project overview, process view, contact, 1024 journey/projects and 390 project deck/journey.

The only visible differences are the local clock and the intentional separation of Home and Me in the primary navigation. Content, card geometry, scenes, workspaces and flows are otherwise unchanged. The former in-app simple view is intentionally replaced by the generated static `read.html`; `current/1440-reading-static.jpg` records the replacement separately.

Run a visual comparison locally after installing ffmpeg:

```bash
for f in tests/baseline/*.jpg; do
  b=$(basename "$f")
  printf '%s ' "$b"
  ffmpeg -hide_banner -i "$f" -i "tests/current/$b" -lavfi ssim -f null - 2>&1 | grep -o 'All:[0-9.]*' | tail -1
done
```
