# My Portfolio

**Nour OS** — an immersive, Vision Pro-inspired portfolio for Nour Chkair.

The site is built as a static experience: floating glass surfaces over four generated landscapes, a Me / My Journey / Projects deck, a project workspace with system breakdowns and collapsible product panels, and a profile workspace with a My Journey professional chapter narrative.

The experience enters automatically on load, with a reduced-motion path. A simplified, scrollable reading view is also available for accessibility and quick reading.

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

## Direct links

- `#/home` — main deck
- `#/me` — Me profile and mindset workspace
- `#/professional` — My Journey professional experience and direction
- `#/projects` — eight-project business showcase deck
- `#/contact` — contact panel
- `#/simple` — simplified, scrollable reading view

Legacy aliases canonicalize to `#/me` or `#/professional`: `#/about`, `#/about-me`, `#/about/professional`, and `#/journey`.

## Projects

The Projects deck contains eight showcases in the approved order: Customer Acquisition, Dispatch, AI Customer Communications, Sales & Referrals, Business Knowledge Assistant, Safiy, AFunTime and Academia OS.

Customer Acquisition uses the revised project experience: a four-panel overview (identity card, What it is, Business challenges, Business value) and one prominent **Understand how it works** action. The process view places nine fixed-size glass steps and their connections directly over the environment, with no enclosing panel or canvas. The free-floating process plane scrolls in any direction. Target definition branches into new-prospect discovery and existing-data improvement, converges at prioritization, then continues through demonstrations, outreach, conditional follow-up, replies/bookings and CRM. Hover, focus or tap a step for an anchored explanation; **Back to project** restores the overview. This is a business-process view, not a technical workflow editor. The five value items are intended benefits, not measured outcomes.

The remaining seven projects retain the existing Brief / System / Demonstrations / Components / Technology workspace. The overview and flow are data-driven so the same presentation can be adopted selectively for those projects later.

Five covers and all eight demonstration diagrams are original local SVG illustrations. They are visibly labeled as conceptual system views or sample scenarios. Safiy, AFunTime and Academia OS retain their existing representative cover artwork. No live workflow, messaging, booking or CRM integration is connected to the portfolio, and no measured business results are claimed. Replace labeled sample visuals with approved product captures as they become available.

## Portrait assets

- `assets/portraits/nour-about.jpg` — Me card portrait
- `assets/portraits/nour-contact.jpg` — Contact panel portrait

## Stack

- HTML, CSS, and vanilla JavaScript
- Local image and interface assets
- Local clock (no weather or IP-based location requests)
- LinkedIn and GitHub contact links
- Responsive layouts with a flat fallback below 1020px
- Data-driven project overview and horizontal process flow for Customer Acquisition

## Structure

- `spatial2.html` — current Nour OS portfolio
- `assets/` — scenes, project artwork, audio, and interface assets
- Other HTML files are earlier spatial and 3D explorations preserved for reference

> Project visuals are labeled illustrations or sample scenarios. Replace them with approved product captures before publishing the portfolio as final.
