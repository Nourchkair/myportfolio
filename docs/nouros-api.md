# NourOS command API

Version **1.0.0**. Installed as `window.NourOS` after the immersive app boots.

The API is a whitelist. It rejects unknown actions at the JavaScript level and rejects unknown section, project, chapter and flow-node IDs before calling the UI adapter. It does not expose DOM nodes or state mutation.

## Readiness and discovery

```js
NourOS.apiVersion;   // "1.0.0"
NourOS.ready();      // boolean snapshot
NourOS.actions;      // frozen action-name list
NourOS.getStatus();  // readiness, transition, route, context and actions
NourOS.subscribe(fn); // returns an unsubscribe function
```

`getStatus()` returns a frozen object:

```json
{
  "ready": true,
  "transitioning": false,
  "apiVersion": "1.0.0",
  "route": "/home",
  "section": "home",
  "actions": ["navigateTo", "openProject", "..."],
  "context": {
    "route": { "path": "/home", "name": "home", "section": "home" },
    "home": { "deck": "main", "activeCard": "profile", "index": 1 },
    "about": { "open": false, "view": "intro", "chapterId": null },
    "project": { "open": false, "id": null, "view": "overview", "nodeId": null },
    "contact": { "open": false },
    "environment": { "index": 0, "name": "Alpine Dawn" }
  }
}
```

Rule for automated callers: wait until `ready === true` and `transitioning === false`. Do not assume a command has finished rendering just because the promise resolved; use `subscribe` or `getStatus()` when visual completion matters.

## Actions

### `navigateTo(section)`

```js
await NourOS.navigateTo('home');
await NourOS.navigateTo('me');
await NourOS.navigateTo('brain');
await NourOS.navigateTo('journey');
await NourOS.navigateTo('projects');
await NourOS.navigateTo('contact');
await NourOS.navigateTo('reading');
```

`reading` leaves the immersive page for `read.html`.

### `openProject(projectId)`

Opens `/projects/:projectId` on the project deck. Rejects unknown IDs with `UNKNOWN_PROJECT`.

```js
await NourOS.openProject('safiy');
```

### `openProjectFlow(projectId, nodeId?)`

Opens the project process view and optionally selects a step. With a node it routes to `/projects/:projectId/flow/:nodeId`; without one it routes to `/projects/:projectId/flow`.

```js
await NourOS.openProjectFlow('acquisition');
await NourOS.openProjectFlow('acquisition', 'demo');
```

Rejections: `UNKNOWN_PROJECT`, `UNKNOWN_NODE`.

### `highlightFlowNode(projectId, nodeId)`

Ensures the project and process view are open, selects the step and replaces the URL with the deep node route. It does not add a history entry.

```js
await NourOS.highlightFlowNode('knowledge', 'retrieve');
```

### `openJourneyChapter(chapterId)`

Opens My Journey and selects a chapter. Routes to `/journey/:chapterId`. Rejects unknown IDs with `UNKNOWN_CHAPTER`.

```js
await NourOS.openJourneyChapter('technology');
```

### `openContact()` / `openReadingView()`

```js
await NourOS.openContact();       // #/contact
await NourOS.openReadingView();   // read.html
```

### `goBack()`

Uses browser history when a previous entry exists, otherwise returns Home. The view is restored through `popstate`, not by replaying a synthetic click.

## State snapshots

`getCurrentState()` returns a deep-frozen clone:

```js
{
  apiVersion: "1.0.0",
  ready: true,
  route: { path, name, section },
  section: "home",
  home: { deck, activeCard, index },
  about: { open, view, chapterId, closing },
  project: { open, id, view, nodeId, closing },
  contact: { open },
  environment: { index, name },
  motion: { reduced },
  transition: { active, type },
  notFound: false
}
```

`subscribe(listener)` receives immutable snapshots whenever the store is replaced.

## Result and error shape

Successful commands return:

```js
{ ok: true, state: { /* frozen snapshot */ } }
```

Rejected commands return:

```js
{
  ok: false,
  error: {
    code: "UNKNOWN_NODE",
    message: "Unknown flow node"
  }
}
```

Codes:

| Code | Meaning |
| --- | --- |
| `UNKNOWN_SECTION` | `navigateTo` received a section outside the whitelist. |
| `UNKNOWN_PROJECT` | Project ID is not among the five public projects. |
| `UNKNOWN_NODE` | Flow node does not belong to the selected project. |
| `UNKNOWN_CHAPTER` | Journey chapter ID is unknown. |
| `BUSY` | An overlay open/close transition is in progress. |
| `INVALID_STATE` | The adapter declined the action in the current view. |
| `COMMAND_FAILED` | The adapter threw an unexpected error. |

## Manual-interaction priority

- Manual UI actions are not queued behind API calls; they always work.
- Commands fail with `BUSY` while the About or project overlay is closing.
- Hover, focus, pointer movement and tooltips never create history entries.
- Clicking a flow step creates one history entry for that node.
- Clearing a flow selection replaces the node route without adding history.
- No appearance mode and no AI behavior are exposed by this API.
