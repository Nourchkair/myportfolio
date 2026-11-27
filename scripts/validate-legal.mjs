import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
let total = 0;
const check = (name, condition) => {
  total += 1;
  if (!condition) failures.push(name);
};

const privacy = read('privacy/index.html');
const terms = read('terms/index.html');
const companion = read('src/ai-nour/companion.js');
const index = read('index.html');
const readPage = read('read.html');

for (const [name, html] of [['privacy', privacy], ['terms', terms]]) {
  check(`${name}: English section`, html.includes('id="english"'));
  check(`${name}: French section`, html.includes('id="francais"'));
  check(`${name}: no script tag`, !/<script\b/i.test(html));
  check(`${name}: no draft banner`, !/class="draft"|Final review copy|not published/i.test(html));
  check(`${name}: indexable`, /name="robots" content="index,follow"/i.test(html));
}
check('privacy: Google Limited Use', /Google API Services User Data Policy/i.test(privacy) && /Limited Use/i.test(privacy));
check('privacy: Gemini disclosure', /Google Gemini/i.test(privacy) && /cannot promise that Google will never use data/i.test(privacy));
check('privacy: Resend disabled', /Resend is currently disabled/i.test(privacy));
check('privacy: age 18', /18 and older/i.test(privacy) && !/16 or older|under 16|16 ans/i.test(privacy));
check('privacy: covers portfolio and AI Nour', /covers both the portfolio and AI Nour/i.test(privacy));
check('privacy: Gemini terms and tiers', /23 March 2026/i.test(privacy) && /unpaid Gemini API quota/i.test(privacy) && /paid Gemini API quota/i.test(privacy));
check('privacy: EEA paid requirement', /EEA, Switzerland, or the UK/i.test(privacy));
check('privacy: current free-tier disclosure', /production Gemini project is on the free tier/i.test(privacy));
check('privacy: deletion contact', /nourchkair@gmail\.com/.test(privacy));
check('privacy: retention', /7 days/i.test(privacy) && /30 days/i.test(privacy));
check('terms: exact 18+ clause', terms.includes('AI Nour is intended for individuals aged 18 and older for professional networking, business discussions and portfolio exploration.'));
check('terms: no 16+ threshold', !/16 or older|at least 16|under 16|16 ans/i.test(terms));
check('terms: portfolio open to everyone', /portfolio itself is available to everyone/i.test(terms));
check('terms: combined eligibility acceptance', /combines this eligibility confirmation with your acceptance/i.test(terms));
check('terms: current free-tier disclosure', /production Gemini project is on the free tier/i.test(terms));
check('terms: AI identity', /AI representation of Nour Chkair/i.test(terms));
check('terms: high-impact restriction', /high-impact/i.test(terms));
check('legal footer', index.includes('class="legal-foot"') && index.includes('href="/privacy/"') && index.includes('href="/terms/"'));
check('contact legal links', index.includes('class="contact-legal"'));
check('reading legal links', readPage.includes('href="/privacy/"') && readPage.includes('href="/terms/"'));
check('assistant consent gate', companion.includes('id="ainourConsent"') && companion.includes('I am 18 or older and agree'));
check('assistant one acceptance checkbox', !companion.includes('id="ainourAge"') && !companion.includes('age16'));
check('assistant current consent version', companion.includes("2026-11-27-v1.1"));
check('assistant no mic-error label', !companion.includes('Mic error'));
check('assistant microphone consent', companion.includes('id="ainourMicConsent"') && companion.includes('Allow microphone'));
check('assistant disclaimer', companion.includes('id="ainourDisclaimer"') && companion.includes('can make mistakes'));
check('assistant legal links', companion.includes('href="/privacy/"') && companion.includes('href="/terms/"'));
check('assistant daily budget reset detail', companion.includes('DAILY_BUDGET_EXHAUSTED') && companion.includes('formatVoiceReset') && companion.includes('resetsAt'));
check('existing-session consent endpoint', read('ai-nour/src/routes/session.js').includes('/api/session/:id/consent'));
check('server-side consent enforcement', read('ai-nour/src/sessions/manager.js').includes('requireCurrentConsent'));
check('five-minute production default', /LIVE_SESSION_SECONDS = "300"/.test(read('ai-nour/wrangler.production.toml')));

for (const file of ['dist/privacy/index.html', 'dist/terms/index.html', 'dist/_redirects']) {
  check(`dist: ${file}`, fs.existsSync(path.join(root, file)));
}
if (fs.existsSync(path.join(root, 'dist/_redirects'))) {
  const redirects = read('dist/_redirects');
  check('dist: privacy redirect', redirects.includes('/privacy'));
  check('dist: terms redirect', redirects.includes('/terms'));
}

console.log(JSON.stringify({ passed: total - failures.length, failed: failures.length, total, failures }, null, 2));
if (failures.length) process.exitCode = 1;
