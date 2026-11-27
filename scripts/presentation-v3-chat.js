const p = await openTab('http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8805&v=' + Date.now());
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForSelector('#ainourPill', { timeout: 30000 });
await p.evaluate((key) => {
  localStorage.setItem('ainour:consent', JSON.stringify({ version: '2026-11-27-v1.1', age18: true, terms: true, privacy: true, acceptedAt: new Date().toISOString() }));
  sessionStorage.setItem('ainour:key', key);
  localStorage.setItem('ainour:locale', 'en');
  localStorage.removeItem('ainour:session');
  localStorage.removeItem('ainour:owner');
}, '__LOCAL_PROTOTYPE_KEY__');
await p.reload({ ignoreCache: true });
await p.waitForSelector('#ainourPill', { timeout: 30000 });
await p.waitForTimeout(2800);
await p.locator('.ainour-pill-main').click();
await p.waitForSelector('#ainourBody:not([hidden])', { timeout: 30000 });
await p.waitForTimeout(500);

async function send(text) {
  await p.locator('#ainourInput').fill(text);
  await p.locator('#ainourSend').click();
  await p.waitForFunction(() => !document.querySelector('#ainourSend')?.disabled, { timeout: 30000 });
}

await send('Highlight the Acquisition project card');
await p.waitForTimeout(900);
const highlighted = await p.evaluate(() => ({
  highlights: document.querySelectorAll('.ai-highlight').length,
  cursor: !document.querySelector('.ai-pres-cursor').hidden,
  route: window.NourOS.getStatus().route,
  chips: [...document.querySelectorAll('.ainour-action-chip')].map((element) => element.textContent)
}));

await send('Present the Acquisition project');
await p.waitForTimeout(1700);
const presented = await p.evaluate(() => ({
  bar: !document.querySelector('.ai-pres-bar').hidden,
  title: document.querySelector('.ai-pres-title')?.textContent,
  progress: document.querySelector('.ai-pres-progress')?.textContent,
  projectOpen: document.querySelector('#project').classList.contains('open'),
  flow: document.querySelector('#project').classList.contains('project-flow-mode'),
  presentation: window.NourOS.getPresentationState().presentation
}));

await p.evaluate(() => window.NourOS.navigateTo('home'));
await p.waitForTimeout(900);
const manualNavigation = await p.evaluate(() => ({
  barHidden: document.querySelector('.ai-pres-bar')?.hidden,
  presentation: window.NourOS.getPresentationState().presentation,
  highlights: document.querySelectorAll('.ai-highlight').length,
  cursorHidden: document.querySelector('.ai-pres-cursor')?.hidden
}));

const consoleErrors = (await p.console.logs()).filter((entry) => entry.type === 'error');
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  highlighted,
  presented,
  manualNavigation,
  consoleErrors: consoleErrors.map((entry) => entry.text || entry.message || String(entry))
}, null, 2));
