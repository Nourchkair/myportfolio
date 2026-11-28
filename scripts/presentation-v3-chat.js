const p = await openTab('http://127.0.0.1:8771/?ainour=dev&ainour-api=http://127.0.0.1:8805&v=' + Date.now());
await p.setViewportSize({ width: 1440, height: 900 });
await p.evaluate((key) => {
  localStorage.setItem('ainour:consent', JSON.stringify({ version: '2026-11-27-v1.4', age18: true, terms: true, privacy: true, acceptedAt: new Date().toISOString() }));
  sessionStorage.setItem('ainour:key', key);
  localStorage.setItem('ainour:locale', 'en');
  localStorage.removeItem('ainour:session');
  localStorage.removeItem('ainour:owner');
}, '__LOCAL_PROTOTYPE_KEY__');
await p.reload({ ignoreCache: true });
await p.waitForSelector('#introChoices [data-explore="independent"]', { timeout: 30000 });
await p.locator('[data-explore="independent"]').click();
await p.waitForFunction(() => document.body.classList.contains('ready'), { timeout: 20000 });
await p.waitForSelector('#ainourPill', { timeout: 30000 });
await p.waitForTimeout(500);
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
  active: window.NourOS.getPresentationState().presentation.active,
  projectOpen: document.querySelector('#project').classList.contains('open'),
  flow: document.querySelector('#project').classList.contains('project-flow-mode'),
  presentation: window.NourOS.getPresentationState().presentation,
  hasBottomBar: Boolean(document.querySelector('.ai-pres-bar'))
}));

await p.evaluate(() => window.NourOS.navigateTo('home'));
await p.waitForTimeout(900);
const manualNavigation = await p.evaluate(() => ({
  paused: window.NourOS.getPresentationState().presentation.paused,
  presentation: window.NourOS.getPresentationState().presentation,
  highlights: document.querySelectorAll('.ai-highlight').length,
  cursorHidden: document.querySelector('.ai-pres-cursor')?.hidden
}));

await p.evaluate(async () => window.NourOS.applyPresentationAction({ type: 'presentationEnd' }));
await p.waitForTimeout(300);
const explicitlyEnded = await p.evaluate(() => ({ presentation: window.NourOS.getPresentationState().presentation, highlights: document.querySelectorAll('.ai-highlight').length, hasBottomBar: Boolean(document.querySelector('.ai-pres-bar')) }));

await send('Who are you? Are you Nour?');
await p.waitForTimeout(700);
const identityEn = await p.evaluate(() => ({
  text: [...document.querySelectorAll('.ainour-msg.assistant')].at(-1)?.innerText || '',
  locale: document.querySelector('#ainourLocale')?.innerText
}));
await p.evaluate(() => document.querySelector('[data-ainour="locale"]').click());
await send('Es-tu Nour ?');
await p.waitForTimeout(700);
const identityFr = await p.evaluate(() => ({
  text: [...document.querySelectorAll('.ainour-msg.assistant')].at(-1)?.innerText || '',
  locale: document.querySelector('#ainourLocale')?.innerText
}));

const consoleErrors = (await p.console.logs()).filter((entry) => entry.type === 'error');
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  highlighted,
  presented,
  manualNavigation,
  explicitlyEnded,
  identity: {
    en: { ...identityEn, ok: /^No, I'm Nupa/.test(identityEn.text) && /not him/.test(identityEn.text) },
    fr: { ...identityFr, ok: /^Non, je suis Nupa/.test(identityFr.text) && /pas lui/.test(identityFr.text) }
  },
  consoleErrors: consoleErrors.map((entry) => entry.text || entry.message || String(entry))
}, null, 2));
