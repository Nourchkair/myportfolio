# Validation results

Captured against the local static server (`python3 -m http.server 8768`) after the final refactor. The site is now deployed to Cloudflare Pages at https://nourchkair.com.

## Automated build and contract checks

```text
$ npm test

> nour-os@2.0.0 test
> node scripts/build.mjs && node scripts/validate.mjs

{ "built": true, "projects": 5, "chapters": 6, "dist": true }
Validation passed: 261 checks
{
  "passed": 261,
  "failed": 0,
  "checked": 261,
  "projects": 5,
  "chapters": 6,
  "apiVersion": "1.0.0",
  "activeAssets": 16
}
```

The 261 checks cover content counts, project/flow graph integrity, chapter data, route aliases and rejections, generated `read.html` equality, no-JavaScript reading page, metadata, legacy CSS/renderer removal, dist allowlisting, archive separation, and the command API contract.

## Browser route matrix

All routes applied correctly with no console errors and no horizontal overflow at 1440×900:

| Route | Result |
| --- | --- |
| `#/me` | Me overlay open, intro view |
| `#/me/brain` | Me overlay open, Brain view |
| `#/journey` | Journey detail open, chapter `entry` |
| `#/journey/technology` | Journey detail open, chapter `technology` |
| `#/projects/acquisition` | Project overlay open, overview |
| `#/projects/acquisition/flow/target` | Process view open, node `target` selected |
| `#/contact` | Contact mode active |
| `#/home` | Home deck active, overlays closed |

Legacy `#/professional` canonicalized to `#/journey`. Invalid project and node routes moved to `#/home` with `notFound: true`; the URL was repaired with `replaceState`.

`spatial2.html?ref=legacy#/projects/acquisition` redirected to `index.html?ref=legacy#/projects/acquisition` with the project open.

## History and hover/focus behavior

Starting at `#/projects/acquisition/flow/demo`:

```text
before hover/focus   history.length = 11, route = /projects/acquisition/flow
pointerover + focus  history.length = 11, route unchanged, tooltip shown
click node           history.length = 12, route = /projects/acquisition/flow/demo
```

Back and Forward after the fix:

```text
back from node  → #/projects/acquisition/flow, selected node = null
forward         → #/projects/acquisition/flow/demo, selected node = demo
```

Browser Back/Forward reconstructs project, process and node views through `popstate`/`hashchange`; it does not replay clicks. Hover and focus never add history entries.

## Command API

- `window.NourOS.apiVersion` = `1.0.0`.
- 11 discoverable actions.
- `getStatus()` reports readiness, transition state, route, section and context (`route`, `home`, `about`, `project`, `contact`, `environment`).
- Rejections verified: `UNKNOWN_SECTION`, `UNKNOWN_PROJECT`, `UNKNOWN_NODE`, `UNKNOWN_CHAPTER`.
- Valid commands were accepted only after validation; invalid commands called no adapter methods.
- `BUSY` rejection is enforced while an overlay open/close transition is active.

## Accessibility checks

DOM audit across Home, Me, Journey, project overview, process view and contact:

- duplicate IDs: **0**
- images without `alt`: **0**
- unnamed buttons: **0**
- unnamed links: **0**
- focusable descendants inside `aria-hidden="true"` containers without `inert`: **0** after adding project-overlay and hidden-journey/Me focus containment
- skip link present and target resolvable: **yes**
- `lang` present: **en**
- horizontal overflow: **none** at 1440, 1024 and 390

The reading page also has zero duplicate IDs, zero missing `alt` attributes, one `h1`, one `main`, a working skip link, and **0 scripts**.

## Mobile and responsive checks

At 390×844:

- project overview has no horizontal overflow;
- the overview is an internally scrollable workspace (canvas `scrollHeight` 2088 / client 710);
- the obsolete mobile tab bar was removed; all five projects use the overview layout, so it was never visible;
- process view has no horizontal overflow and a deliberately horizontally scrollable flow viewport (2244 / 366);
- reading page has no horizontal overflow with 5 projects and 6 chapters.

## Performance summary

Local production load at 1440×900:

| Measure | Result |
| --- | --- |
| DOM nodes at Home | 617 |
| Baseline DOM nodes | 817 |
| DOM reduction | ~24% |
| `DOMContentLoaded` | ~47 ms |
| Load event | ~83 ms |
| Resources | 23 |
| Decoded resource bytes | ~2.2 MB |
| JS heap after load | ~15–24 MB |
| Horizontal overflow | none |

Source size changes:

| Asset | Baseline | Current |
| --- | --- | --- |
| `src/styles/app.css` | ~183.3 KB | ~112.8 KB |
| `src/styles/base.css` | ~107.5 KB | ~47.7 KB |
| `src/app/immersive.js` | ~177 KB | ~96.8 KB |
| Active assets | — | 16 files / ~2.1 MB |

## Visual regression

Baseline images are in `tests/baseline/`; post-refactor images are in `tests/current/`. SSIM scores from ffmpeg:

| State | SSIM |
| --- | ---: |
| 1024 journey | 0.999931 |
| 1024 projects | 0.992949 |
| 1440 about | 0.999962 |
| 1440 contact | 0.995490 |
| 1440 home | 0.987645 |
| 1440 journey | 0.999976 |
| 1440 project flow | 0.999973 |
| 1440 project overview | 0.999988 |
| 1440 projects deck | 0.995583 |
| 390 project deck | 0.990706 |
| 390 journey | 0.999882 |

The lower scores are explained by the local clock changing and the intentional Home/Me active-navigation separation; difference images showed changes confined to the toolbar. Content, card geometry, scene imagery and workspace layout matched. The in-app simple view was intentionally replaced by the static `read.html`; `tests/current/1440-reading-static.jpg` records that new surface instead of comparing it to the old overlay.

## Remaining issues

1. Production is deployed to Cloudflare Pages via direct upload; no GitHub Actions/CI workflow is committed. `npm run deploy` is the deployment path.
2. Browser QA was run against the local static server with the Aside browser session; there is no committed Playwright/Puppeteer dependency. The deterministic Node validation harness is committed.
3. The social preview uses the existing About portrait; a dedicated branded 1200×630 image is still open.
4. `spatial2.html` depends on JavaScript plus a visible fallback link; `index.html` is the primary entry.
5. `sitemap.xml` is generated for the production domain; `SITE_URL` can override it for preview builds.
6. Nupa, formerly AI Nour, is enabled by default on the public portfolio. “Explore with Nupa” shows the microphone-consent panel and starts a live conversation on the main view; Nupa asks one question and then chooses what to present dynamically. “Use text chat instead” opens the chat panel. The reading view remains assistant-free. Current legal/consent status is v1.4; public-beta controls and paid-tier evidence are in `docs/legal-data-audit.md`, `docs/ai-nour-v3-presentation.md`, and `ai-nour/docs/production-deployment.md`.
