# Nour OS

**Nour OS** is Nour Chkair's immersive portfolio: floating glass cards over four generated landscapes, a profile workspace, a six-chapter career journey, five project case studies and two process views.

The experience is static, data-driven and built with native ES modules. There is no framework, no runtime AI and no external integration.

## Entry points

- **`index.html`** — the production immersive experience (hash-router).
- **`read.html`** — a generated, accessible reading page that works without JavaScript.
- **`spatial2.html`** — a compatibility redirect that preserves the query string and hash.
- **`404.html`** — static fallback for hosts that support custom 404 pages.

## Run locally

```bash
npm run build
python3 -m http.server 8768
```

Open `http://localhost:8768/index.html#/home`. No package installation is required; the build and validation scripts use Node only.

The public content is generated from `src/data/`, so run `npm run build` after changing project, journey, profile or site metadata.

## Routes

| Route | View |
| --- | --- |
| `#/home` | Main card deck |
| `#/me` | About Nour — profile introduction |
| `#/me/brain` | About Nour — Brain workspace |
| `#/journey` | My Journey, default chapter |
| `#/journey/:chapterId` | My Journey, selected chapter |
| `#/projects` | Project deck |
| `#/projects/:projectId` | Project overview |
| `#/projects/:projectId/flow` | Process view |
| `#/projects/:projectId/flow/:nodeId` | Process view with a selected step |
| `#/contact` | Contact panel |
| `#/read` | Redirects to `read.html` |

Legacy aliases are canonicalized with `history.replaceState`: `#/about`, `#/about-me`, `#/professional`, `#/about/professional` and `#/simple`. Unknown projects, chapters or flow nodes fall back to `#/home` without creating a new history entry.

`Home` and `Me` are deliberately separate destinations. The Nour OS brand returns home; the About button opens Me. Hover and focus interactions never create browser-history entries. Clicking a process step does.

## Structure

```text
index.html                 production immersive entry
read.html                  generated accessible reading page
spatial2.html              hash-preserving compatibility redirect
assets/                    11 active scene, cover and portrait assets
src/
  main.js                  module entry
  app/immersive.js          UI, rendering and manual interactions
  app/routes.js             canonical route parsing and aliases
  app/store.js              frozen centralized state store
  app/commands.js           versioned NourOS command API
  data/                     projects, journey, profile, environments, site
  reading/render.js         static reading-page generator
  styles/                   base, app and reading styles
scripts/
  build.mjs                 static page generation and dist allowlist
  validate.mjs              261 data, route, API, build and separation checks
tests/baseline/             pre-refactor visual baseline
archive/                    legacy experiments, retired data and unused assets
docs/                       architecture, API and validation notes
```

`src/reading/` is build-time only. It is removed from `dist/`.

## Build and deployment

`npm run build` writes:

- generated `read.html`;
- `spatial2.html`, `favicon.svg`, `robots.txt`, `sitemap.xml` and `404.html`;
- an allowlisted `dist/` containing only runtime files, `assets/` and `src/`.

The build uses `https://nourchkair.com` as the canonical URL by default. Override it with `SITE_URL` for previews.

`archive/`, `tests/`, `docs/`, `scripts/`, `node_modules/` and build-time reading source never enter `dist/`.

Production is hosted on Cloudflare Pages:

- https://nourchkair.com
- https://www.nourchkair.com
- https://nourchkair.pages.dev

Deploy the built site from this repo:

```bash
npm run deploy
```

This builds the site and uploads `dist/` to the `nourchkair` Pages project on the `main` branch. Wrangler authentication is required.

For a preview build against another origin:

```bash
SITE_URL="https://preview.example.com" npm run build
```

## NourOS command API

The immersive page exposes `window.NourOS` version `1.0.0`. It is whitelist-only and rejects unknown sections, projects, chapters and flow nodes.

```js
NourOS.apiVersion;                 // "1.0.0"
NourOS.actions;                    // discoverable action names
NourOS.getStatus();                // readiness, route, context, actions
NourOS.getCurrentState();          // full frozen state snapshot
await NourOS.openProject('safiy');
await NourOS.openProjectFlow('safiy', 'context');
```

`getStatus()` reports readiness and transition state. Automated callers must wait until `ready` is true and `transitioning` is false. Manual visitor interactions always take priority; commands return `BUSY` while a close/open transition is in progress. See `docs/nouros-api.md` for the full contract.

## Content and archive

- Exactly five projects are public: Customer Acquisition, Dispatch, AI Customer Communications, B.R.A.I.N. and Safiy.
- The public project model contains only overview and process data. Legacy Brief/System/Demonstrations/Technology fields and renderers were removed after dependency checks.
- Retired projects (`WaterAir`, `Afuntime`, `Academia`, `ChefSkiss`, `TrackIt`) and legacy workshop/3D experiments live under `archive/`.
- Project illustrations that may be useful as future evidence are preserved under `archive/assets/projects/`.
- Active assets are limited to four scenes, five covers and two portraits (11 files, about 1.9 MB). Archived assets are about 43 MB.

Project visuals are illustrations or conceptual process views, not live product captures, and no measured business results are claimed.

## Validation

```bash
npm run validate
npm test
```

Both run the build first, then validate data invariants, route canonicalization, build artifacts, dist separation, dead-CSS removal and the command API contract. Browser-level route, history, hover/focus, accessibility and visual-regression results are recorded in `docs/validation.md`.

## AI Nour

AI Nour is implemented in `ai-nour/` and mounts only with `?ainour=dev` or `?ainour=1`; the default portfolio and reading view remain assistant-free. The Phase 4 private-beta candidate, acceptance checklist, approval packages, and validation are documented in `docs/ai-nour-phase4.md`.

## Deliberately out of scope for the default portfolio

- External CRM, messaging, booking or analytics integrations in the default experience.
- New appearance modes or speculative visual features.
- Automated GitHub-to-Cloudflare deployments; production is deployed directly from this repo with `npm run deploy`.
