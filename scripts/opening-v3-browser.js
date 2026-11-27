const checks = [];
const check = (name, pass, detail = {}) => checks.push({ name, pass: Boolean(pass), detail });
const base = 'http://127.0.0.1:8771';
const api = 'http://127.0.0.1:8805';

const plain = await openTab(`${base}/?v=${Date.now()}`);
await plain.setViewportSize({ width: 1440, height: 900 });
await plain.waitForSelector('#introChoices [data-explore="independent"]', { timeout: 15000 });
const plainBefore = await plain.evaluate(() => ({
  aiHidden: document.querySelector('[data-explore="ai"]')?.hidden,
  independentVisible: !document.querySelector('[data-explore="independent"]')?.hidden,
  panel: Boolean(document.querySelector('#ainourPanel'))
}));
check('plain portfolio defaults to independent exploration', plainBefore.aiHidden === true && plainBefore.independentVisible === true && plainBefore.panel === false, plainBefore);
await plain.locator('[data-explore="independent"]').click();
await plain.waitForTimeout(900);
const plainAfter = await plain.evaluate(() => ({
  introDone: document.querySelector('#enterScreen')?.classList.contains('done'),
  ready: document.body.classList.contains('ready'),
  aiPanel: Boolean(document.querySelector('#ainourPanel'))
}));
check('independent choice enters without an AI panel', plainAfter.introDone === true && plainAfter.ready === true && plainAfter.aiPanel === false, plainAfter);

const beta = await openTab(`${base}/?ainour=dev&ainour-api=${encodeURIComponent(api)}&v=${Date.now()}`);
await beta.setViewportSize({ width: 1440, height: 900 });
await beta.waitForSelector('#introChoices [data-explore="ai"]:not([hidden])', { timeout: 20000 });
await beta.evaluate(() => {
  localStorage.removeItem('ainour:consent');
  sessionStorage.removeItem('ainour:key');
  localStorage.removeItem('ainour:session');
  localStorage.removeItem('ainour:owner');
});
await beta.reload({ ignoreCache: true });
await beta.waitForSelector('#introChoices [data-explore="ai"]:not([hidden])', { timeout: 20000 });
await beta.locator('[data-explore="ai"]').click();
await beta.waitForSelector('#ainourConsent:not([hidden])', { timeout: 15000 });
const consent = await beta.evaluate(() => ({
  introDone: document.querySelector('#enterScreen')?.classList.contains('done'),
  panelHidden: document.querySelector('#ainourPanel').hidden,
  consentVisible: !document.querySelector('#ainourConsent').hidden,
  gateHidden: document.querySelector('#ainourGate').hidden,
  copy: document.querySelector('#ainourConsentIntro').innerText,
  links: [...document.querySelectorAll('#ainourConsent .ainour-legal-links a')].map((link) => link.getAttribute('href'))
}));
check('AI choice uses the existing consent gate', consent.introDone === true && consent.panelHidden === false && consent.consentVisible === true && consent.gateHidden === true, consent);
check('consent explains the live guide and text-first option', /live, interactive, personalized/i.test(consent.copy) && /start in text/i.test(consent.copy), { copy: consent.copy.slice(0, 220) });
check('consent carries legal links', consent.links.includes('/terms/') && consent.links.includes('/privacy/'), consent.links);

const ready = await openTab(`${base}/?ainour=dev&ainour-api=${encodeURIComponent(api)}&v=${Date.now()}`);
await ready.setViewportSize({ width: 1440, height: 900 });
await ready.waitForSelector('#ainourPill', { timeout: 30000 });
await ready.evaluate((key) => {
  localStorage.setItem('ainour:consent', JSON.stringify({ version: '2026-11-27-v1.1', age18: true, terms: true, privacy: true, acceptedAt: new Date().toISOString() }));
  sessionStorage.setItem('ainour:key', key);
  localStorage.setItem('ainour:locale', 'en');
  localStorage.removeItem('ainour:session');
  localStorage.removeItem('ainour:owner');
}, '__LOCAL_PROTOTYPE_KEY__');
await ready.reload({ ignoreCache: true });
await ready.waitForSelector('#introChoices [data-explore="ai"]:not([hidden])', { timeout: 20000 });
await ready.locator('[data-explore="ai"]').click();
await ready.waitForSelector('#ainourBody:not([hidden])', { timeout: 30000 });
await ready.waitForTimeout(1800);
const aiIntro = await ready.evaluate(() => ({
  assistantMessages: [...document.querySelectorAll('.ainour-msg.assistant')].map((message) => message.innerText),
  bodyVisible: !document.querySelector('#ainourBody').hidden,
  consentHidden: document.querySelector('#ainourConsent')?.hidden,
  gateHidden: document.querySelector('#ainourGate')?.hidden
}));
check('AI choice starts a text introduction after authorization', aiIntro.bodyVisible === true && aiIntro.consentHidden === true && aiIntro.gateHidden === true && aiIntro.assistantMessages.length > 0, aiIntro);
const errors = (await ready.console.logs()).filter((entry) => entry.type === 'error');
check('opening experience has no console errors', errors.length === 0, { errors: errors.map((entry) => entry.text || entry.message || String(entry)) });

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), passed: checks.filter((item) => item.pass).length, failed: checks.filter((item) => !item.pass).length, total: checks.length, checks }, null, 2));
