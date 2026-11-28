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
check('privacy: Gemini paid disclosure', /Google Gemini/i.test(privacy) && /paid Gemini API services/i.test(privacy) && /does not use them to improve its products/i.test(privacy) && /cannot promise zero retention/i.test(privacy));
check('privacy: Resend disabled', /Resend is currently disabled/i.test(privacy));
check('privacy: age 18', /18 and older/i.test(privacy) && !/16 or older|under 16|16 ans/i.test(privacy));
check('privacy: covers portfolio and Nupa', /covers both the portfolio and Nupa/i.test(privacy));
check('privacy: independent assistant identity', /independent AI-powered portfolio assistant operated by Nour Chkair/i.test(privacy) && /does not impersonate him/i.test(privacy));
check('privacy: French independent assistant identity', /assistant de portfolio indépendant/i.test(privacy) && /ne se fait pas passer pour lui/i.test(privacy));
check('privacy: own opinions are not Nour beliefs', /Nupa's own opinions and conclusions are not Nour's documented beliefs/i.test(privacy));
check('privacy: French own opinions are not Nour beliefs', /Les opinions et conclusions de Nupa lui appartiennent/i.test(privacy));
check('privacy: no AI representation language', !/AI representation|digital twin|digital version|AI replica/i.test(privacy) && !/représentation par IA|jumeau numérique|réplique/i.test(privacy));
check('privacy: public beta without access key', /publicly available in beta to visitors aged 18 and older/i.test(privacy) && /does not require an account or access key/i.test(privacy) && !/private-beta|restricted private beta|clé de bêta|bêta privée restreinte/i.test(privacy));
check('privacy: paid tier and no retroactive claim', /paid Gemini API services/i.test(privacy) && /does not retroactively claim paid-tier protections/i.test(privacy) && !/production Gemini project is on the free tier/i.test(privacy));
check('privacy: no unlimited-retention promise', /cannot promise zero retention/i.test(privacy));
check('privacy: deletion contact', /nourchkair@gmail\.com/.test(privacy));
check('privacy: retention', /7 days/i.test(privacy) && /30 days/i.test(privacy));
check('terms: exact 18+ clause', terms.includes('Nupa is intended for individuals aged 18 and older for professional networking, business discussions and portfolio exploration.'));
check('terms: no 16+ threshold', !/16 or older|at least 16|under 16|16 ans/i.test(terms));
check('terms: portfolio open to everyone', /portfolio itself is available to everyone/i.test(terms));
check('terms: combined eligibility acceptance', /combines this eligibility confirmation with your acceptance/i.test(terms));
check('terms: paid Gemini disclosure', /paid Gemini API services/i.test(terms) && /Data Processing Addendum/i.test(terms) && /does not use them to improve its products/i.test(terms) && !/production Gemini project is on the free tier/i.test(terms));
check('terms: no retroactive paid claim', /do not retroactively apply paid-tier protections/i.test(terms));
check('terms: independent assistant identity', /Nupa is Nour's Unique Portfolio Assistant/i.test(terms) && /independent AI-powered portfolio guide operated by Nour Chkair/i.test(terms) && /does not impersonate him/i.test(terms));
check('terms: French independent assistant identity', /guide de portfolio indépendant/i.test(terms) && /ne se fait pas passer pour lui/i.test(terms));
check('terms: no authority to bind Nour', /no authority to bind Nour/i.test(terms) && /cannot make professional commitments on his behalf/i.test(terms));
check('terms: own opinions are not Nour beliefs', /Nupa's own opinions and conclusions are not Nour's documented beliefs/i.test(terms));
check('terms: French own opinions are not Nour beliefs', /Les opinions et conclusions de Nupa lui appartiennent/i.test(terms));
check('terms: no AI representation language', !/AI representation|digital twin|digital version|AI replica/i.test(terms) && !/représentation par IA|jumeau numérique|réplique/i.test(terms));
check('terms: public beta without access key', /publicly available in beta to visitors aged 18 and older/i.test(terms) && /No account or access key is required/i.test(terms) && !/private-beta|restricted private beta|clé de bêta|bêta privée restreinte/i.test(terms));
check('terms: high-impact restriction', /high-impact/i.test(terms));
check('legal version 1.4', /Version 1\.4 · Effective 27 November 2026/.test(privacy) && /Version 1\.4 · Effective 27 November 2026/.test(terms));
check('legal current branding', !/AI Nour|AI-Nour/.test(privacy + terms) && /Nupa/.test(privacy) && /Nupa/.test(terms));
check('legal footer', index.includes('class="legal-foot"') && index.includes('href="/privacy/"') && index.includes('href="/terms/"'));
check('contact legal links', index.includes('class="contact-legal"'));
check('reading legal links', readPage.includes('href="/privacy/"') && readPage.includes('href="/terms/"'));
check('assistant consent gate', companion.includes("consent.id = 'ainourConsent'") && /Meet Nupa\./.test(companion) && /By selecting “Let’s explore”, you confirm you are 18 or older/.test(companion) && /agree to the/.test(companion));
check('assistant no separate acceptance checkbox', !companion.includes('id="ainourAgree"') && !companion.includes('id="ainourAge"') && !companion.includes('age16'));
check('assistant current consent version', companion.includes("2026-11-27-v1.4"));
check('assistant no mic-error label', !companion.includes('Mic error'));
check('assistant microphone consent', companion.includes('id="ainourMicConsent"') && companion.includes('Allow microphone'));
check('assistant disclaimer', companion.includes('id="ainourDisclaimer"') && companion.includes('can make mistakes'));
check('assistant legal links', companion.includes('href="/privacy/"') && companion.includes('href="/terms/"'));
check('assistant Nupa branding', companion.includes('Nupa') && !/AI Nour|AI-Nour/.test(companion));
check('assistant tagline', companion.includes('Your intelligent portfolio companion.'));
check('assistant primary action', companion.includes('Let’s explore') && !/Continue and agree/.test(companion));
check('voice tour does not auto-start a predefined presentation', !/startGuidedPresentation|tourPresentationStarted|tourFollowPrompt/.test(companion) && /do not start navigating or presenting yet/i.test(companion) && /one natural, open question|one natural, open question/i.test(companion));
check('voice tour asks for a dynamic presentation direction', /most relevant presentation direction/i.test(companion) && /do not use rigid predefined tours/i.test(companion) && /confidently initiate a general portfolio overview/i.test(companion));
check('voice tour gates interface actions until the visitor speaks', /tourActive && !voice\.tourVisitorSpoke/.test(companion) && /WAIT_FOR_VISITOR_INTENT/.test(companion) && /tourVisitorSpoke = true/.test(companion));
check('About navigation returns to the home section', /\$\('NavMe'\)\.addEventListener\('click',\(\)=>goHome\(\)\)/.test(read('src/app/immersive.js')) && /\$\('projectNavMe'\)\.addEventListener\('click',\(\)=>goHome\(\)\)/.test(read('src/app/immersive.js')));
check('assistant identity separation', /independent AI/i.test(companion) && /Nupa is not Nour Chkair/i.test(privacy) && /Nupa is not Nour Chkair/i.test(terms));
check('assistant paid Gemini and retention disclosure', /Text and voice are processed by Google Gemini/.test(companion) && /paid API terms/.test(companion) && /do not use prompts or responses to improve/.test(companion) && /kept for up to 7 days/.test(companion) && /site administrator/.test(companion) && /Do not share personal, sensitive or confidential information/.test(companion));
check('opening independent choice', index.includes('Explore independently'));
check('opening Nupa choice', index.includes('Explore with Nupa') && !/Explore with AI Nour/.test(index));
check('assistant daily budget reset detail', companion.includes('DAILY_BUDGET_EXHAUSTED') && companion.includes('formatVoiceReset') && companion.includes('resetsAt'));
check('existing-session consent endpoint', read('ai-nour/src/routes/session.js').includes('/api/session/:id/consent'));
check('server-side consent enforcement', read('ai-nour/src/sessions/manager.js').includes('config.publicAccess') && read('ai-nour/src/services/conversation.js').includes('config.publicAccess'));
check('server-issued owner endpoint', read('ai-nour/src/routes/session.js').includes("'/api/owner'") && read('ai-nour/src/auth/secure.js').includes('generateOwnerToken'));
check('no web research surface', !/webResearch|WEB_RESEARCH_ENABLED|googleSearch/i.test(read('ai-nour/src/tools/registry.js') + read('ai-nour/src/services/conversation.js') + read('ai-nour/src/config.js')));
check('production daily cap is $3', /DAILY_SPEND_CAP_USD_MICROS = "3000000"/.test(read('ai-nour/wrangler.production.toml')) && /textReservationUsdMicros/.test(read('ai-nour/src/config.js')));
check('voice concurrency leases and release endpoint', fs.existsSync(path.join(root, 'ai-nour/migrations/0008_live_session_leases.sql')) && read('ai-nour/src/routes/session.js').includes("'/api/live/end'") && read('ai-nour/src/services/conversation.js').includes('acquireLiveSessionLease'));
check('conservative Flash-Lite text rates', /TEXT_INPUT_USD_PER_MILLION = "0.30"/.test(read('ai-nour/wrangler.production.toml')) && /TEXT_OUTPUT_USD_PER_MILLION = "2.50"/.test(read('ai-nour/wrangler.production.toml')));
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
