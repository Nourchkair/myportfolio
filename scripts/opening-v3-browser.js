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
await plain.waitForTimeout(3200);
const plainWaiting = await plain.evaluate(() => ({
  introDone: document.querySelector('#enterScreen')?.classList.contains('done'),
  ready: document.body.classList.contains('ready'),
  choiceVisible: Boolean(document.querySelector('#introChoices [data-explore="independent"]')) && !document.querySelector('#introChoices [data-explore="independent"]').hidden
}));
check('opening waits for an explicit choice instead of auto-entering', plainWaiting.introDone === false && plainWaiting.ready === false && plainWaiting.choiceVisible === true, plainWaiting);
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
  localStorage.setItem('ainour:locale', 'en');
  localStorage.removeItem('ainour:session');
  localStorage.removeItem('ainour:owner');
});
await beta.reload({ ignoreCache: true });
await beta.waitForSelector('#introChoices [data-explore="ai"]:not([hidden])', { timeout: 20000 });
await beta.waitForTimeout(3200);
const betaWaiting = await beta.evaluate(() => {
  const cards = [...document.querySelectorAll('#introChoices .intro-choice')].filter((card) => !card.hidden);
  const greeting = document.querySelector('.intro-depth-text > strong')?.getBoundingClientRect();
  const firstCard = cards[0]?.getBoundingClientRect();
  return {
    introDone: document.querySelector('#enterScreen')?.classList.contains('done'),
    ready: document.body.classList.contains('ready'),
    cardCount: cards.length,
    cardTexts: cards.map((card) => card.innerText.trim()),
    cardsBelowGreeting: Boolean(greeting && firstCard && firstCard.top >= greeting.bottom - 2),
    cardsInsideIntro: Boolean(document.querySelector('#enterScreen #introChoices')),
    cardsTopmost: cards.every((card) => {
      const r = card.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(top && (top === card || card.contains(top)));
    }),
    noteVisible: (() => {
      const note = document.querySelector('.intro-choice-note');
      if (!note) return false;
      const style = getComputedStyle(note);
      return Number(style.opacity) > 0.9 && note.getBoundingClientRect().height > 0;
    })(),
    depthLayerHidden: getComputedStyle(document.querySelector('.intro-fg')).display === 'none',
    welcomeAboveOverlays: Number(getComputedStyle(document.querySelector('.intro-welcome')).zIndex) > Math.max(
      Number(getComputedStyle(document.querySelector('.intro-shade')).zIndex),
      Number(getComputedStyle(document.querySelector('.intro-glow')).zIndex),
      Number(getComputedStyle(document.querySelector('.intro-grain')).zIndex)
    )
  };
});
check('beta opening waits for a choice and shows two unobstructed panel cards', betaWaiting.introDone === false && betaWaiting.ready === false && betaWaiting.cardCount === 2 && betaWaiting.cardsBelowGreeting === true && betaWaiting.cardsInsideIntro === true && betaWaiting.cardsTopmost === true && betaWaiting.noteVisible === true && betaWaiting.depthLayerHidden === true && betaWaiting.welcomeAboveOverlays === true, betaWaiting);
check('opening cards remain in English', betaWaiting.cardTexts.some((text) => /Explore independently/i.test(text)) && betaWaiting.cardTexts.some((text) => /Explore with Nupa/i.test(text)) && !betaWaiting.cardTexts.some((text) => /Explorer/i.test(text)), betaWaiting.cardTexts);
await beta.locator('[data-explore="ai"]').click();
await beta.waitForSelector('#ainourConsent:not([hidden])', { timeout: 15000 });
const consent = await beta.evaluate(() => ({
  introDone: document.querySelector('#enterScreen')?.classList.contains('done'),
  panelHidden: document.querySelector('#ainourPanel').hidden,
  consentVisible: !document.querySelector('#ainourConsent').hidden,
  consentModal: Boolean(document.querySelector('#ainourConsent .ainour-consent-modal')),
  blur: getComputedStyle(document.querySelector('#ainourConsent')).backdropFilter,
  overlayBg: getComputedStyle(document.querySelector('#ainourConsent')).backgroundColor,
  modalBg: getComputedStyle(document.querySelector('.ainour-consent-modal')).backgroundColor,
  buttonBgImage: getComputedStyle(document.querySelector('#ainourConsentBtn')).backgroundImage,
  buttonColor: getComputedStyle(document.querySelector('#ainourConsentBtn')).color,
  gateHidden: document.querySelector('#ainourGate').hidden,
  welcome: document.querySelector('#ainourConsentIntro').innerText,
  disclosure: document.querySelector('#ainourConsentPrivacy').innerText,
  accept: document.querySelector('#ainourConsentAccept').innerText,
  button: document.querySelector('#ainourConsentBtn').innerText.trim(),
  buttonAria: document.querySelector('#ainourConsentBtn').getAttribute('aria-label'),
  checkboxCount: document.querySelectorAll('#ainourConsent input[type="checkbox"]').length,
  choice: document.querySelector('#introChoices [data-explore="ai"]').innerText.trim(),
  pill: document.querySelector('#ainourPillLabel')?.innerText.trim(),
  tagline: document.querySelector('#ainourTagline')?.innerText.trim(),
  links: [...document.querySelectorAll('#ainourConsentAccept a')].map((link) => link.getAttribute('href'))
}));
check('AI choice opens a centered consent modal outside the chat', consent.introDone === true && consent.panelHidden === true && consent.consentVisible === true && consent.consentModal === true && /blur/i.test(consent.blur) && consent.gateHidden === true, consent);
check('opening choice and companion use Nupa branding', /explore with nupa/i.test(consent.choice) && !/AI Nour/i.test(consent.choice) && consent.pill === 'Nupa' && /intelligent portfolio companion/i.test(consent.tagline), { choice: consent.choice, pill: consent.pill, tagline: consent.tagline });
check('consent welcomes the visitor with a short independent identity', /independent AI(-powered)? portfolio guide/i.test(consent.welcome) && /not Nour/i.test(consent.welcome) && !/live, interactive, personalized/i.test(consent.welcome), { welcome: consent.welcome });
check('consent has no separate acceptance checkbox', consent.checkboxCount === 0, { checkboxCount: consent.checkboxCount });
check('consent button says Continue and agree while age is confirmed in the acceptance line', /Continue and agree/i.test(consent.button) && !/18/.test(consent.button) && /18 or older/i.test(consent.accept) && /Terms of Use/i.test(consent.accept) && /Privacy Policy/i.test(consent.accept) && /18 or older/i.test(consent.buttonAria) && /Terms of Use/i.test(consent.buttonAria) && /Privacy Policy/i.test(consent.buttonAria), { button: consent.button, buttonAria: consent.buttonAria, accept: consent.accept });
check('consent button text has strong contrast', /linear-gradient/i.test(consent.buttonBgImage) && !/255, 255, 255/.test(consent.buttonColor) && !/rgba\(0, 0, 0, 0\)/.test(consent.buttonBgImage), { buttonBgImage: consent.buttonBgImage, buttonColor: consent.buttonColor });
check('consent modal is light transparent glass, not a dark slab', /rgba\(255, 255, 255/.test(consent.modalBg) && /rgba\(2, 6, 9, 0\.3\)/.test(consent.overlayBg), { modalBg: consent.modalBg, overlayBg: consent.overlayBg });
check('consent discloses Gemini, improvement use, retention, admin access and sensitive-data warning', /Google Gemini/i.test(consent.disclosure) && /improve its products/i.test(consent.disclosure) && /7 days/i.test(consent.disclosure) && /administrator/i.test(consent.disclosure) && /Do not share personal, sensitive or confidential information/i.test(consent.disclosure), { disclosure: consent.disclosure });
check('consent carries legal links', consent.links.includes('/terms/') && consent.links.includes('/privacy/'), consent.links);
await beta.locator('#ainourConsentLocale').click();
await beta.waitForTimeout(150);
const consentFr = await beta.evaluate(() => ({
  locale: document.querySelector('#ainourConsentLocale')?.textContent.trim(),
  kicker: document.querySelector('#ainourConsentKicker')?.innerText.trim(),
  welcome: document.querySelector('#ainourConsentIntro')?.innerText.trim(),
  disclosure: document.querySelector('#ainourConsentPrivacy')?.innerText.trim(),
  accept: document.querySelector('#ainourConsentAccept')?.innerText.trim(),
  button: document.querySelector('#ainourConsentBtn')?.innerText.trim()
}));
check('French consent is short, welcoming and complete', consentFr.locale === 'FR' && /Avant de commencer/i.test(consentFr.kicker) && /Bienvenue/i.test(consentFr.welcome) && /et non Nour/i.test(consentFr.welcome) && /Google Gemini/i.test(consentFr.disclosure) && /améliorer ses produits/i.test(consentFr.disclosure) && /7 jours/i.test(consentFr.disclosure) && /administrateur/i.test(consentFr.disclosure) && /18 ans ou plus/i.test(consentFr.accept) && /Conditions d’utilisation/i.test(consentFr.accept) && /Politique de confidentialité/i.test(consentFr.accept) && /Continuer/i.test(consentFr.button), consentFr);
await beta.locator('#ainourConsentLocale').click();
await beta.waitForTimeout(150);
await beta.locator('#ainourConsentBtn').click();
await beta.waitForSelector('#ainourGate:not([hidden])', { timeout: 15000 });
const accepted = await beta.evaluate(() => ({
  consent: JSON.parse(localStorage.getItem('ainour:consent') || '{}'),
  gateVisible: !document.querySelector('#ainourGate').hidden,
  consentHidden: document.querySelector('#ainourConsent').hidden
}));
check('Continue alone records age, Terms and Privacy acceptance', accepted.consent.version === '2026-11-27-v1.3' && accepted.consent.age18 === true && accepted.consent.terms === true && accepted.consent.privacy === true && accepted.gateVisible === true && accepted.consentHidden === true, accepted);

const indie = await openTab(`${base}/?ainour=dev&ainour-api=${encodeURIComponent(api)}&v=${Date.now()}`);
await indie.setViewportSize({ width: 1440, height: 900 });
await indie.waitForSelector('#introChoices [data-explore="independent"]', { timeout: 30000 });
await indie.evaluate((key) => {
  localStorage.setItem('ainour:consent', JSON.stringify({ version: '2026-11-27-v1.3', age18: true, terms: true, privacy: true, acceptedAt: new Date().toISOString() }));
  sessionStorage.setItem('ainour:key', key);
  localStorage.setItem('ainour:locale', 'en');
  localStorage.removeItem('ainour:session');
  localStorage.removeItem('ainour:owner');
}, '__LOCAL_PROTOTYPE_KEY__');
await indie.reload({ ignoreCache: true });
await indie.waitForSelector('#introChoices [data-explore="independent"]', { timeout: 20000 });
await indie.locator('[data-explore="independent"]').click();
await indie.waitForFunction(() => document.body.classList.contains('ready'), { timeout: 20000 });
await indie.waitForTimeout(600);
const indieState = await indie.evaluate(() => ({
  panelHidden: document.querySelector('#ainourPanel')?.hidden,
  consentHidden: document.querySelector('#ainourConsent')?.hidden,
  pill: Boolean(document.querySelector('#ainourPill')),
  ready: document.body.classList.contains('ready')
}));
check('independent entry never opens the Nupa chat panel', indieState.panelHidden === true && indieState.consentHidden === true && indieState.ready === true, indieState);

const ready = await openTab(`${base}/?ainour=dev&ainour-api=${encodeURIComponent(api)}&v=${Date.now()}`);
await ready.setViewportSize({ width: 1440, height: 900 });
await ready.waitForSelector('#introChoices [data-explore="ai"]:not([hidden])', { timeout: 30000 });
await ready.evaluate((key) => {
  localStorage.setItem('ainour:consent', JSON.stringify({ version: '2026-11-27-v1.3', age18: true, terms: true, privacy: true, acceptedAt: new Date().toISOString() }));
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
await ready.evaluate(() => document.querySelector('[data-ainour="locale"]').click());
await ready.waitForTimeout(150);
const french = await ready.evaluate(() => ({
  locale: document.querySelector('#ainourLocale')?.innerText.trim(),
  tagline: document.querySelector('#ainourTagline')?.innerText.trim(),
  placeholder: document.querySelector('#ainourInput')?.getAttribute('placeholder'),
  inputLabel: document.querySelector('#ainourInput')?.getAttribute('aria-label'),
  reset: document.querySelector('#ainourReset')?.innerText.trim(),
  openingChoice: document.querySelector('#introChoices [data-explore="ai"]')?.textContent.trim(),
  disclaimer: document.querySelector('#ainourDisclaimer')?.innerText
}));
check('French companion UI uses Nupa branding while opening cards stay English', french.locale === 'FR' && /compagnon de portfolio intelligent/i.test(french.tagline) && /Posez une question sur Nour/.test(french.placeholder) && /Message à Nupa/.test(french.inputLabel) && /^nouveau$/i.test(french.reset) && /explore with nupa/i.test(french.openingChoice) && !/explorer avec nupa/i.test(french.openingChoice) && /Nupa peut se tromper/.test(french.disclaimer), french);
const errors = (await ready.console.logs()).filter((entry) => entry.type === 'error');
check('opening experience has no console errors', errors.length === 0, { errors: errors.map((entry) => entry.text || entry.message || String(entry)) });

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), passed: checks.filter((item) => item.pass).length, failed: checks.filter((item) => !item.pass).length, total: checks.length, checks }, null, 2));
