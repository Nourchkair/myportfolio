# My Portfolio

**Nour OS** — an immersive, Vision Pro-inspired spatial portfolio for Nour Chkair.

The site is built as a static experience: floating glass surfaces over four generated landscapes, a main Me / Achievements / Projects deck, a project workspace with system breakdowns and collapsible product panels, and a persistent ambient music player.

## Open

The primary experience is **`spatial2.html`**.

## Run locally

```bash
python3 -m http.server 8768
```

Then open:

```text
http://localhost:8768/spatial2.html
```

No build step or package installation is required.

## Stack

- HTML, CSS, and vanilla JavaScript
- Native HTML audio playback
- Local image and audio assets
- Open-Meteo weather and IP-based location
- Responsive layouts with a flat fallback below 1020px

## Structure

- `spatial2.html` — current Nour OS portfolio
- `assets/` — scenes, project artwork, audio, and interface assets
- Other HTML files are earlier spatial and 3D explorations preserved for reference

> Project/product visuals in the workspace are representative placeholders. Replace them with final product captures before publishing the portfolio as final.
