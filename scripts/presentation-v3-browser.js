const checks = [];
const check = (name, pass, detail = {}) => checks.push({ name, pass: Boolean(pass), detail });
const p = await openTab('http://127.0.0.1:8771/?ainour=dev&v=' + Date.now());
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForFunction(() => Boolean(window.NourOS), { timeout: 30000 });
await p.waitForTimeout(2800);

const initialTargets = await p.evaluate(() => window.NourOS.getPresentationTargets({ visibleOnly: true }).targets.map((target) => target.id));
check('visible target registry exposes approved home targets', initialTargets.includes('main-card:projects') && initialTargets.includes('section:home'), { initialTargets });

const start = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'presentationStart', projectId: 'acquisition', stepIndex: 1, totalSteps: 9, label: 'Customer Acquisition' }));
check('presentation bar starts', start.ok === true && await p.evaluate(() => !document.querySelector('.ai-pres-bar').hidden), { start });

const deck = await p.evaluate(async () => {
  await window.NourOS.showProjectCard('acquisition');
  await new Promise((resolve) => setTimeout(resolve, 450));
  return window.NourOS.getPresentationTargets({ visibleOnly: true }).targets.map((target) => target.id);
});
check('project card and tags become visible targets', deck.includes('project-card:acquisition') && deck.some((id) => id.startsWith('project-card:acquisition:tag:')), { deck });

const multi = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'highlightElement', targetIds: ['project-card:acquisition', 'project-card:acquisition:tag:0'], style: 'glow' }));
const multiState = await p.evaluate(() => ({ highlights: document.querySelectorAll('.ai-highlight').length, cursor: !document.querySelector('.ai-pres-cursor').hidden }));
check('multiple simultaneous highlights and cursor', multi.ok === true && multiState.highlights === 2 && multiState.cursor === true, { multi, multiState });

const spotlight = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'spotlightElement', targetId: 'project-card:acquisition', dim: 0.6 }));
const spotlightState = await p.evaluate(() => ({ spotlight: !document.querySelector('.ai-pres-spotlight').hidden, cursor: !document.querySelector('.ai-pres-cursor').hidden }));
check('spotlight isolates a target', spotlight.ok === true && spotlightState.spotlight === true && spotlightState.cursor === true, { spotlight, spotlightState });

const flow = await p.evaluate(async () => {
  await window.NourOS.openProject('acquisition');
  await window.NourOS.openProjectFlow('acquisition', 'demo');
  await new Promise((resolve) => setTimeout(resolve, 600));
  return window.NourOS.getPresentationTargets({ visibleOnly: true, limit: 80 }).targets;
});
check('flow target registry exposes nodes and connections', flow.some((target) => target.kind === 'flow-node') && flow.some((target) => target.kind === 'flow-link'), { count: flow.length });

const hover = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'hoverElement', targetId: 'flow-node:acquisition:demo' }));
const hoverState = await p.evaluate(() => ({ tip: !document.querySelector('#projectFlowTip').hidden, hover: document.querySelectorAll('#projectFlow .ai-hover').length }));
check('hover reveals existing workflow tooltip', hover.ok === true && hoverState.tip === true && hoverState.hover === 1, { hover, hoverState });

const collapse = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'collapseElement', targetId: 'flow-node:acquisition:demo' }));
const collapsed = await p.evaluate(() => document.querySelector('#projectFlowTip').hidden === true && document.querySelectorAll('#projectFlow .ai-hover').length === 0);
check('collapse clears existing tooltip state', collapse.ok === true && collapsed === true, { collapse });

const trace = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'traceConnection', projectId: 'acquisition', from: 'demo', to: 'outreach' }));
const traceState = await p.evaluate(() => ({ highlighted: document.querySelectorAll('#projectFlow .ai-highlight').length, traced: document.querySelectorAll('#projectFlow .ai-flow-trace').length, pulse: document.querySelectorAll('.ai-flow-pulse').length }));
check('workflow connection trace animates real path', trace.ok === true && traceState.highlighted === 3 && traceState.traced === 1 && traceState.pulse === 1, { trace, traceState });

const compare = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'compareElements', targetIds: ['flow-node:acquisition:demo', 'flow-node:acquisition:outreach'], label: 'Demo vs outreach' }));
const compareState = await p.evaluate(() => ({ highlighted: document.querySelectorAll('#projectFlow .ai-highlight').length, connector: document.querySelectorAll('.ai-pres-compare-line').length, tooltip: document.querySelector('.ai-pres-tooltip')?.textContent }));
check('compare highlights two targets and draws connector', compare.ok === true && compareState.highlighted === 2 && compareState.connector === 1 && compareState.tooltip === 'Demo vs outreach', { compare, compareState });

const zoom = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'zoomToElement', targetId: 'flow-node:acquisition:demo', scale: 1.4 }));
const zoomState = await p.evaluate(() => ({ transform: document.querySelector('#projectFlow .pw-flow-canvas')?.style.transform, zoomed: document.querySelector('#projectFlow .pw-flow-canvas')?.classList.contains('ai-zoomed') }));
check('workflow zoom works', zoom.ok === true && zoomState.transform === 'scale(1.4)' && zoomState.zoomed === true, { zoom, zoomState });
const reset = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'resetZoom' }));
const resetState = await p.evaluate(() => document.querySelector('#projectFlow .pw-flow-canvas')?.style.transform === '');
check('workflow zoom resets', reset.ok === true && resetState === true, { reset });

const sequence = await p.evaluate(async () => {
  const promise = window.NourOS.applyPresentationAction({ type: 'highlightElement', targetIds: ['flow-node:acquisition:demo', 'flow-node:acquisition:outreach', 'flow-node:acquisition:nurture'], style: 'emphasis', sequence: true, stepMs: 300 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const early = document.querySelectorAll('#projectFlow .ai-highlight').length;
  const result = await promise;
  const final = [...document.querySelectorAll('#projectFlow .ai-highlight')].map((element) => element.dataset.flowNode);
  return { result, early, final };
});
check('sequential highlighting advances and leaves the final target', sequence.result.ok === true && sequence.early === 1 && sequence.final.includes('nurture'), { sequence });

const cancel = await p.evaluate(async () => {
  const promise = window.NourOS.applyPresentationAction({ type: 'highlightElement', targetIds: ['flow-node:acquisition:demo', 'flow-node:acquisition:outreach'], style: 'emphasis', sequence: true, stepMs: 700 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  window.NourOS.cancelPresentationActions();
  const result = await promise;
  return { result, highlights: document.querySelectorAll('#projectFlow .ai-highlight').length };
});
check('cancellation stops stale sequencing without wiping current context', cancel.result?.result?.cancelled === true && cancel.highlights === 1, { cancel });

const invalid = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'highlightElement', targetId: 'body > script' }));
check('invalid frontend target is rejected', invalid.ok === false, { invalid });

const clear = await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'clearVisualEffects' }));
const cleared = await p.evaluate(() => ({ highlights: document.querySelectorAll('.ai-highlight').length, cursorHidden: document.querySelector('.ai-pres-cursor').hidden, spotlightHidden: document.querySelector('.ai-pres-spotlight').hidden, barVisible: !document.querySelector('.ai-pres-bar').hidden }));
check('clear effects preserves the presentation bar', clear.ok === true && cleared.highlights === 0 && cleared.cursorHidden === true && cleared.spotlightHidden === true && cleared.barVisible === true, { clear, cleared });

await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'presentationPause' }));
const paused = await p.evaluate(() => document.querySelector('.ai-pres-bar').classList.contains('is-paused'));
await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'presentationResume' }));
const resumed = await p.evaluate(() => !document.querySelector('.ai-pres-bar').classList.contains('is-paused'));
await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'presentationEnd' }));
const ended = await p.evaluate(() => document.querySelector('.ai-pres-bar').hidden === true);
check('pause, resume and end controls update presentation state', paused && resumed && ended, { paused, resumed, ended });

await p.emulateMedia({ reducedMotion: 'reduce' });
const reduced = await p.evaluate(() => {
  const element = document.querySelector('.ai-highlight--emphasis');
  return { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, transition: getComputedStyle(document.querySelector('.ai-pres-cursor')).transitionDuration, animation: element ? getComputedStyle(element).animationName : 'none' };
});
check('reduced motion disables presentation animation', reduced.reduced === true && (reduced.animation === 'none' || reduced.animation === ''), { reduced });

await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(300);
const mobile = await p.evaluate(async () => {
  await window.NourOS.applyPresentationAction({ type: 'presentationStart', projectId: 'acquisition', stepIndex: 1, totalSteps: 9, label: 'Customer Acquisition' });
  await window.NourOS.showProjectCard('acquisition');
  await new Promise((resolve) => setTimeout(resolve, 400));
  const bar = document.querySelector('.ai-pres-bar').getBoundingClientRect();
  return { width: Math.round(bar.width), left: Math.round(bar.left), right: Math.round(bar.right), viewport: innerWidth, overflow: bar.left < 0 || bar.right > innerWidth, css: Boolean(document.querySelector('link[data-ainour-css]')) };
});
check('mobile presentation bar fits the viewport', mobile.width > 0 && mobile.width <= mobile.viewport && mobile.overflow === false, { mobile });

const summary = {
  generatedAt: new Date().toISOString(),
  passed: checks.filter((item) => item.pass).length,
  failed: checks.filter((item) => !item.pass).length,
  total: checks.length,
  checks
};
console.log(JSON.stringify(summary, null, 2));
