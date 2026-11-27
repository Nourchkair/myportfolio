import { PROJECT_BY_ID } from '../data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../data/journey.js';

const params = new URLSearchParams(location.search);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const DEV = params.get('ainour') === 'dev' && LOCAL;
const API_BASE = (params.get('ainour-api') || (LOCAL ? 'http://127.0.0.1:8789' : 'https://api.nourchkair.com')).replace(/\/+$/, '');
const CHAPTER_BY_ID = Object.fromEntries(PROFESSIONAL_CHAPTERS.map((chapter) => [chapter.id, chapter]));
const STORE = { key: 'ainour:key', owner: 'ainour:owner', session: 'ainour:session', locale: 'ainour:locale' };
const CONSENT_VERSION = '2026-11-27-v1.2';
const CONSENT_STORE = 'ainour:consent';
const MIC_CONSENT_STORE = 'ainour:mic-consent';

function readConsent() {
  try {
    const value = JSON.parse(localStorage.getItem(CONSENT_STORE) || 'null');
    if (value?.version === CONSENT_VERSION && value.age18 === true && value.terms === true && value.privacy === true) return value;
  } catch {}
  return null;
}

const state = {
  key: sessionStorage.getItem(STORE.key) || '',
  owner: localStorage.getItem(STORE.owner) || randomId(48),
  sessionId: localStorage.getItem(STORE.session) || null,
  locale: localStorage.getItem(STORE.locale) || 'en',
  messages: [],
  meta: null,
  size: 'standard',
  busy: false,
  unread: false,
  ready: false,
  mounted: false,
  voice: 'idle',
  presentation: { active: false, projectId: null, nodeId: null, paused: false, stepIndex: 0, totalSteps: 0, label: '' },
  consent: readConsent(),
  sessionConsentRequired: false,
  exploreRequested: false,
  exploreIntroStarted: false,
  micConsentResolver: null,
  voiceError: ''
};
document.documentElement.dataset.ainourLocale = state.locale;

const voice = {
  active: false,
  session: null,
  mic: null,
  inputContext: null,
  outputContext: null,
  processor: null,
  micSource: null,
  analyser: null,
  orbFrame: null,
  orbLevel: 0,
  sources: [],
  nextPlayTime: 0,
  usage: null,
  lastTotals: { text: 0, audioIn: 0, audioOut: 0 },
  userText: '',
  assistantText: '',
  userDraftId: null,
  assistantDraftId: null,
  turnId: null,
  reservationId: null,
  expiryTimer: null
};

let els = {};
let nour = null;
let lastRoute = null;
let aiNavUntil = 0;
let mounted = false;
let drag = null;
let liveContextTimer = null;
let lastLiveContext = '';
let expectedAiRoutes = [];
let expectedAiRoutesTimer = null;
let aiActionEpoch = 0;

localStorage.setItem(STORE.owner, state.owner);

function randomId(bytes = 24) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
}
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function resolveApi(path) {
  return `${API_BASE}${path}`;
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(resolveApi(path), {
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        'x-prototype-key': state.key,
        'x-owner-token': state.owner,
        ...(options.headers || {})
      }
    });
  } catch (cause) {
    const error = new Error('network');
    error.code = 'NETWORK_ERROR';
    error.cause = cause;
    throw error;
  }
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (response.status === 401) {
    state.key = '';
    sessionStorage.removeItem(STORE.key);
    showGate(state.locale === 'fr'
      ? 'La clé de bêta privée n’a pas été acceptée, a expiré ou a été révoquée.'
      : 'The private-beta key was not accepted, expired, or was revoked.');
    throw new Error('unauthorized');
  }
  if (!response.ok) {
    const error = new Error(body?.error?.message || `HTTP ${response.status}`);
    error.code = body?.error?.code || null;
    error.status = response.status;
    error.details = body?.error?.details || null;
    throw error;
  }
  return body;
}

function consentPayload() {
  if (!state.consent) return null;
  return {
    age18: true,
    termsVersion: CONSENT_VERSION,
    privacyVersion: CONSENT_VERSION,
    acceptedAt: state.consent.acceptedAt
  };
}

function saveConsent() {
  const consent = {
    version: CONSENT_VERSION,
    age18: true,
    terms: true,
    privacy: true,
    acceptedAt: new Date().toISOString()
  };
  localStorage.setItem(CONSENT_STORE, JSON.stringify(consent));
  state.consent = consent;
}

function mountCss() {
  if (document.querySelector('link[data-ainour-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./companion.css?v=10', import.meta.url).href;
  link.dataset.ainourCss = '1';
  document.head.appendChild(link);
}

function pillMarkup() {
  return `
    <button class="ainour-pill-main" type="button" data-ainour="mode-text" aria-label="Nupa — open text chat">
      <svg class="ainour-pill-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.2h12v8.2H8.8L5.4 16v-2.6H4z"/><path d="M7 8h6M7 10.6h4"/></svg>
      <span class="ainour-orb" id="ainourOrb" aria-hidden="true"></span>
      <span id="ainourPillLabel">Nupa</span>
    </button>
    <span class="ainour-pill-sep" aria-hidden="true"></span>
    <button class="ainour-pill-mic" type="button" data-ainour="mode-voice" aria-label="Start voice with Nupa" title="Voice">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7.1" y="3.1" width="5.8" height="9.2" rx="2.9"/><path d="M4.8 9.6a5.2 5.2 0 0 0 10.4 0M10 15v2.2M7.8 17.2h4.4"/></svg>
    </button>
  `;
}

function panelMarkup() {
  return `
    <header class="ainour-head" data-drag-handle title="Drag to move">
      <div class="ainour-id"><b>Nupa</b><small id="ainourTagline">Your intelligent portfolio companion.</small></div>
      <div class="ainour-head-actions">
        <button class="ainour-icon" type="button" data-ainour="minimize" aria-label="Collapse chat" title="Collapse chat">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M3 8h10"/></svg>
        </button>
        <button class="ainour-icon" type="button" data-ainour="expand" aria-label="Expand panel" title="Expand">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2H2v4M10 14h4v-4M14 6V2h-4M2 10v4h4"/></svg>
        </button>
        <button class="ainour-icon" type="button" data-ainour="close" aria-label="Close Nupa panel" title="Close panel (voice keeps running)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>
        </button>
      </div>
    </header>
    <div class="ainour-context" id="ainourContext">
      <span class="ainour-context-label" id="ainourContextLabel">Viewing <b>portfolio</b></span>
      <div class="ainour-context-actions">
        <button type="button" data-ainour="locale" id="ainourLocale">EN</button>
        <button type="button" data-ainour="reset" id="ainourReset">New</button>
      </div>
    </div>
    <div class="ainour-gate" id="ainourGate">
      <p id="ainourGateCopy">Enter your private-beta access key to talk with Nupa. The key is validated by Nupa and stays in this tab; the permanent Gemini key never reaches the browser.</p>
      <form id="ainourGateForm">
        <input id="ainourKey" type="password" autocomplete="off" placeholder="Private-beta access key" aria-label="Private-beta access key" required>
        <button type="submit" id="ainourKeySubmit">Open</button>
      </form>
      <p id="ainourGateError" role="status" aria-live="polite" style="color:rgba(255,180,180,.8);margin:10px 0 0;min-height:1em"></p>
    </div>
    <div class="ainour-gate ainour-consent" id="ainourConsent" hidden>
      <p id="ainourConsentIntro">Nupa is a live, interactive, personalized portfolio guide for professional visitors aged 18 and older. Confirm that you are 18 or older and agree to the Terms of Use and Privacy Policy. You can start in text and switch to voice later; microphone permission is requested separately. AI processing is involved; do not share personal, sensitive, confidential, or third-party information.</p>
      <label class="ainour-check"><input id="ainourAgree" type="checkbox"> <span id="ainourAgreeLabel">I am 18 or older and agree to the Terms of Use and Privacy Policy.</span></label>
      <p class="ainour-legal-links"><a href="/terms/" target="_blank" rel="noopener">Terms of Use</a> · <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a></p>
      <button id="ainourConsentBtn" type="button">Continue</button>
      <p id="ainourConsentError" role="status" aria-live="polite" class="ainour-form-error"></p>
    </div>
    <div class="ainour-body" id="ainourBody" hidden>
      <div class="ainour-thread" id="ainourThread" aria-live="polite"></div>
      <div class="ainour-mic-consent" id="ainourMicConsent" hidden>
        <p id="ainourMicCopy">Nupa’s voice uses your microphone and streams audio to Google Gemini for real-time processing. Transcripts are stored for up to 7 days in this service. Do not share personal or sensitive information.</p>
        <div class="ainour-mic-actions">
          <button id="ainourMicAllow" type="button">Allow microphone</button>
          <button id="ainourMicCancel" type="button" class="ainour-secondary">Cancel</button>
        </div>
        <p class="ainour-legal-links"><a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a> · <a href="/terms/" target="_blank" rel="noopener">Terms of Use</a></p>
      </div>
      <p class="ainour-voice-error" id="ainourVoiceError" role="status" aria-live="polite" hidden></p>
      <form class="ainour-compose" id="ainourForm">
        <div class="ainour-compose-bar">
          <textarea id="ainourInput" rows="1" maxlength="2000" placeholder="Ask about Nour's work, or say “open Safiy”…" aria-label="Message Nupa"></textarea>
          <button class="ainour-compose-btn ainour-send" id="ainourSend" type="submit" aria-label="Send message" title="Send">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10h13M11 4.5l5.5 5.5-5.5 5.5"/></svg>
          </button>
        </div>
      </form>
      <p class="ainour-disclaimer" id="ainourDisclaimer">Nupa can make mistakes. Do not share sensitive information. <a href="/privacy/" target="_blank" rel="noopener">Privacy</a> · <a href="/terms/" target="_blank" rel="noopener">Terms</a></p>
    </div>
  `;
}

function mount() {
  if (mounted) return;
  mounted = true;
  mountCss();

  const pill = document.createElement('div');
  pill.className = 'ainour-pill';
  pill.id = 'ainourPill';
  pill.dataset.state = 'idle';
  pill.setAttribute('role', 'group');
  pill.setAttribute('aria-label', 'Nupa');
  pill.innerHTML = pillMarkup();
  document.body.appendChild(pill);

  const exploreButton = document.querySelector('#introChoices [data-explore="ai"]');
  if (exploreButton) exploreButton.hidden = false;
  if (window.__ainourExploreRequested) state.exploreRequested = true;

  const panel = document.createElement('section');
  panel.className = 'ainour-panel';
  panel.id = 'ainourPanel';
  panel.dataset.size = 'standard';
  panel.dataset.state = 'idle';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'Nupa companion');
  panel.hidden = true;
  panel.innerHTML = panelMarkup();
  document.body.appendChild(panel);

  els = {
    pill,
    pillText: pill.querySelector('[data-ainour="mode-text"]'),
    pillVoice: pill.querySelector('[data-ainour="mode-voice"]'),
    pillLabel: pill.querySelector('#ainourPillLabel'),
    panel,
    tagline: panel.querySelector('#ainourTagline'),
    context: panel.querySelector('#ainourContext'),
    contextLabel: panel.querySelector('#ainourContextLabel'),
    reset: panel.querySelector('#ainourReset'),
    gate: panel.querySelector('#ainourGate'),
    gateCopy: panel.querySelector('#ainourGateCopy'),
    gateForm: panel.querySelector('#ainourGateForm'),
    gateInput: panel.querySelector('#ainourKey'),
    gateSubmit: panel.querySelector('#ainourKeySubmit'),
    gateError: panel.querySelector('#ainourGateError'),
    consent: panel.querySelector('#ainourConsent'),
    consentIntro: panel.querySelector('#ainourConsentIntro'),
    agree: panel.querySelector('#ainourAgree'),
    agreeLabel: panel.querySelector('#ainourAgreeLabel'),
    consentBtn: panel.querySelector('#ainourConsentBtn'),
    consentError: panel.querySelector('#ainourConsentError'),
    micConsent: panel.querySelector('#ainourMicConsent'),
    micCopy: panel.querySelector('#ainourMicCopy'),
    micAllow: panel.querySelector('#ainourMicAllow'),
    micCancel: panel.querySelector('#ainourMicCancel'),
    voiceError: panel.querySelector('#ainourVoiceError'),
    disclaimer: panel.querySelector('#ainourDisclaimer'),
    body: panel.querySelector('#ainourBody'),
    thread: panel.querySelector('#ainourThread'),
    form: panel.querySelector('#ainourForm'),
    input: panel.querySelector('#ainourInput'),
    send: panel.querySelector('#ainourSend'),
    locale: panel.querySelector('#ainourLocale'),
    expand: panel.querySelector('[data-ainour="expand"]'),
    minimize: panel.querySelector('[data-ainour="minimize"]')
  };

  pill.addEventListener('click', (event) => {
    const action = event.target.closest('[data-ainour]')?.dataset.ainour;
    if (action === 'mode-text') {
      openPanel();
    } else if (action === 'mode-voice') {
      if (voiceIsActive()) stopVoice();
      else startVoice();
    }
  });
  panel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-ainour]')?.dataset.ainour;
    if (!action) return;
    if (action === 'close') closePanel();
    else if (action === 'minimize') setSize(state.size === 'collapsed' ? 'standard' : 'collapsed');
    else if (action === 'expand') setSize(state.size === 'expanded' ? 'standard' : 'expanded');
    else if (action === 'locale') toggleLocale();
    else if (action === 'reset') resetSession();
  });
  els.gateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.key = els.gateInput.value.trim();
    if (!state.key) return;
    sessionStorage.setItem(STORE.key, state.key);
    els.gateError.textContent = '';
    await init();
  });
  els.consentBtn.addEventListener('click', async () => {
    if (!els.agree.checked) {
      els.consentError.textContent = state.locale === 'fr'
        ? 'Confirmez que vous avez 18 ans ou plus et acceptez les conditions et la politique de confidentialité.'
        : 'Confirm that you are 18 or older and agree to the Terms and Privacy Policy.';
      return;
    }
    els.consentError.textContent = '';
    saveConsent();
    if (state.sessionId && state.sessionConsentRequired) {
      try {
        await api(`/api/session/${encodeURIComponent(state.sessionId)}/consent`, {
          method: 'POST',
          body: JSON.stringify({ consent: consentPayload() })
        });
        state.sessionConsentRequired = false;
        if (!state.key) showGate();
        else await init();
        return;
      } catch {
        state.sessionConsentRequired = false;
        state.sessionId = null;
        localStorage.removeItem(STORE.session);
      }
    }
    if (!state.key) showGate();
    else await init();
  });
  els.micAllow.addEventListener('click', () => resolveMicConsent(true));
  els.micCancel.addEventListener('click', () => resolveMicConsent(false));
  window.addEventListener('ainour:presentation-control', (event) => handlePresentationControl(event.detail?.action));
  window.addEventListener('ainour:explore', openExplore);
  els.form.addEventListener('submit', sendMessage);
  els.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      els.form.requestSubmit();
    }
  });
  els.input.addEventListener('input', () => {
    els.input.style.height = 'auto';
    els.input.style.height = `${Math.min(els.input.scrollHeight, 110)}px`;
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
    }
  });
  window.addEventListener('resize', () => {
    positionPill();
    if (els.panel.hidden) return;
    if (window.innerWidth <= 760) {
      els.panel.style.removeProperty('left');
      els.panel.style.removeProperty('top');
      els.panel.style.removeProperty('right');
      return;
    }
    clampPanel();
  });
  initDrag();

  localStorage.removeItem('ainour:panelpos');
  applyLocale();
  setSize('standard');
  updateContext();
  updatePill();
  positionPill();
  const toolbar = document.getElementById('toolbar');
  if (toolbar && 'ResizeObserver' in window) {
    new ResizeObserver(() => positionPill()).observe(toolbar);
  }
  if (toolbar) toolbar.addEventListener('transitionend', positionPill);
  if ('MutationObserver' in window) {
    new MutationObserver(() => schedulePillPosition()).observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-mode']
    });
  }
  if (state.key) init();
  else showGate();

  if (DEV) {
    window.AINourPrototype = {
      open: () => openPanel(),
      close: closePanel,
      expand: () => setSize('expanded'),
      compact: () => setSize('standard'),
      minimize: () => setSize('collapsed'),
      collapse: () => setSize('collapsed'),
      voiceView: () => openPanel(),
      startVoice,
      stopVoice,
      runActions: (actions) => runActions(actions),
      setVoiceState: (value) => setState(value),
      demoVoice: (userText, assistantText) => {
        openPanel();
        voice.active = true;
        voice.userText = userText || '';
        voice.assistantText = assistantText || '';
        appendVoiceTranscript('user', voice.userText);
        appendVoiceTranscript('assistant', voice.assistantText);
        setState('speaking');
      },
      state
    };
  }
}

function clampPanel() {
  if (!els.panel || els.panel.hidden || window.innerWidth <= 760) return;
  const rect = els.panel.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
  const left = Math.min(Math.max(8, rect.left), maxLeft);
  const top = Math.min(Math.max(8, rect.top), maxTop);
  els.panel.style.left = `${left}px`;
  els.panel.style.top = `${top}px`;
  els.panel.style.right = 'auto';
}

function initDrag() {
  const handle = els.panel.querySelector('[data-drag-handle]');
  if (!handle) return;
  handle.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button') || window.innerWidth <= 760) return;
    const rect = els.panel.getBoundingClientRect();
    drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, pointerId: event.pointerId };
    els.panel.style.left = `${rect.left}px`;
    els.panel.style.top = `${rect.top}px`;
    els.panel.style.right = 'auto';
    els.panel.classList.add('is-dragging');
    try { handle.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = els.panel.getBoundingClientRect();
    const left = Math.min(Math.max(8, event.clientX - drag.dx), Math.max(8, window.innerWidth - rect.width - 8));
    const top = Math.min(Math.max(8, event.clientY - drag.dy), Math.max(8, window.innerHeight - rect.height - 8));
    els.panel.style.left = `${left}px`;
    els.panel.style.top = `${top}px`;
  });
  const end = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    drag = null;
    els.panel.classList.remove('is-dragging');
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function voiceIsActive() {
  return voice.active || ['connecting', 'listening', 'processing', 'speaking'].includes(state.voice);
}

function hasElementBox(el) {
  if (!el) return false;
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function isElementVisible(el) {
  if (!hasElementBox(el)) return false;
  return Number(getComputedStyle(el).opacity || 1) > 0.05;
}

function pillAnchor() {
  const body = document.body;
  if (body.classList.contains('project-open')) {
    const bar = document.querySelector('#project .pw-bar');
    const right = document.querySelector('#project .pw-bar-right');
    if (hasElementBox(right)) return { el: right, placement: 'left', nav: document.querySelector('#project .pw-global-nav') };
    if (hasElementBox(bar)) return { el: bar, placement: 'below-right' };
  }
  if (body.classList.contains('about-open')) {
    const bar = document.querySelector('#aboutView .about-bar');
    const right = document.querySelector('#aboutView .about-bar .pw-bar-right');
    if (hasElementBox(right)) return { el: right, placement: 'left', nav: document.querySelector('#aboutView .pw-global-nav') };
    if (hasElementBox(bar)) return { el: bar, placement: 'below-right' };
  }
  if (body.dataset.mode === 'contact') {
    const close = document.querySelector('#contactPanel .panel-close');
    if (hasElementBox(close)) return { el: close, placement: 'left' };
  }
  const toolbar = document.getElementById('toolbar');
  if (isElementVisible(toolbar)) return { el: toolbar, placement: 'right' };
  return null;
}

function positionPill() {
  if (!els.pill) return;
  const width = els.pill.offsetWidth || 148;
  const height = els.pill.offsetHeight || 34;
  const margin = 12;
  const gap = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  if (viewportW <= 760) {
    const anchor = pillAnchor();
    if (anchor) {
      const rect = anchor.el.getBoundingClientRect();
      const left = Math.min(Math.max(margin, rect.right - width), viewportW - width - margin);
      const top = Math.min(rect.bottom + gap, viewportH - height - margin);
      els.pill.style.left = `${Math.round(left)}px`;
      els.pill.style.top = `${Math.round(top)}px`;
      els.pill.style.right = 'auto';
      return;
    }
    els.pill.style.left = `${Math.max(margin, viewportW - width - margin)}px`;
    els.pill.style.top = `${margin}px`;
    els.pill.style.right = 'auto';
    return;
  }

  const anchor = pillAnchor();
  if (!anchor) {
    els.pill.style.left = `${Math.max(margin, viewportW - width - margin)}px`;
    els.pill.style.top = `${margin + 6}px`;
    els.pill.style.right = 'auto';
    return;
  }
  const rect = anchor.el.getBoundingClientRect();
  let left;
  let top;
  if (anchor.placement === 'left') {
    left = rect.left - width - gap;
    top = rect.top + (rect.height - height) / 2;
    const navRect = anchor.nav?.getBoundingClientRect();
    const collidesWithNav = navRect && navRect.width > 0 && left < navRect.right + gap;
    if (left < margin || collidesWithNav) {
      left = Math.min(Math.max(margin, rect.right - width), viewportW - width - margin);
      top = rect.bottom + gap;
    }
  } else if (anchor.placement === 'below-right') {
    left = Math.min(Math.max(margin, rect.right - width), viewportW - width - margin);
    top = rect.bottom + gap;
  } else {
    left = rect.right + gap;
    top = rect.top + (rect.height - height) / 2;
    if (left + width > viewportW - margin) {
      left = Math.min(Math.max(margin, rect.right - width), viewportW - width - margin);
      top = rect.bottom + gap;
    }
  }
  els.pill.style.left = `${Math.round(left)}px`;
  els.pill.style.top = `${Math.round(Math.min(top, viewportH - height - margin))}px`;
  els.pill.style.right = 'auto';
}

let pillRepositionTimer = null;
function schedulePillPosition() {
  requestAnimationFrame(positionPill);
  if (pillRepositionTimer) clearTimeout(pillRepositionTimer);
  pillRepositionTimer = setTimeout(() => {
    pillRepositionTimer = null;
    positionPill();
  }, 320);
}

function updatePill() {
  if (!els.pill) return;
  els.pill.dataset.state = state.voice;
  els.pill.dataset.live = voice.active ? 'true' : 'false';
  els.pill.dataset.unread = state.unread ? 'true' : 'false';
  els.pill.setAttribute('aria-expanded', String(!els.panel.hidden));
  const fr = state.locale === 'fr';
  const voiceLabel = ['connecting', 'listening', 'speaking'].includes(state.voice) || voice.active;
  const label = state.voice === 'error' ? (fr ? 'Voix indisponible' : 'Voice unavailable') : voiceLabel ? (fr ? 'Écoute' : 'Listening') : 'Nupa';
  els.pillLabel.textContent = label;
  els.pillText.setAttribute('aria-label', `${label} — ${fr ? 'ouvrir le clavardage' : 'open text chat'}`);
  els.pillText.classList.toggle('is-active', !els.panel.hidden);
  els.pillVoice.classList.toggle('is-active', voiceIsActive());
  els.pillVoice.setAttribute('aria-label', fr ? (voiceIsActive() ? 'Arrêter la voix avec Nupa' : 'Démarrer la voix avec Nupa') : (voiceIsActive() ? 'Stop voice with Nupa' : 'Start voice with Nupa'));
  requestAnimationFrame(positionPill);
}

function updateLegalCopy() {
  const fr = state.locale === 'fr';
  if (els.consentIntro) {
    els.consentIntro.textContent = fr
      ? 'Nupa est un guide de portfolio indépendant, propulsé par l’IA et exploité par Nour Chkair. Ce n’est pas Nour et ce n’est pas une représentation par IA de lui. Nupa est un guide interactif, vivant et personnalisé pour les visiteurs professionnels de 18 ans ou plus. Confirmez que vous avez 18 ans ou plus et que vous acceptez les Conditions d’utilisation et la Politique de confidentialité. Vous pouvez commencer par le texte et passer à la voix plus tard; l’autorisation du microphone est demandée séparément. Le service fait appel à l’IA; ne communiquez pas de renseignements personnels, sensibles, confidentiels ou appartenant à des tiers.'
      : 'Nupa is an independent AI-powered portfolio guide operated by Nour Chkair. Nupa is not Nour and not an AI representation of him. Nupa is a live, interactive, personalized portfolio guide for professional visitors aged 18 and older. Confirm that you are 18 or older and agree to the Terms of Use and Privacy Policy. You can start in text and switch to voice later; microphone permission is requested separately. AI processing is involved; do not share personal, sensitive, confidential, or third-party information.';

  }
  if (els.agreeLabel) els.agreeLabel.textContent = fr
    ? 'J’ai 18 ans ou plus et j’accepte les Conditions d’utilisation et la Politique de confidentialité.'
    : 'I am 18 or older and agree to the Terms of Use and Privacy Policy.';
  if (els.consentBtn) els.consentBtn.textContent = fr ? 'Continuer' : 'Continue';
  if (els.micCopy) {
    els.micCopy.textContent = fr
      ? 'La voix de Nupa utilise votre microphone et transmet l’audio à Google Gemini pour un traitement en temps réel. Les transcriptions sont conservées jusqu’à 7 jours dans ce service. Ne communiquez pas de renseignements personnels ou sensibles.'
      : 'Nupa’s voice uses your microphone and streams audio to Google Gemini for real-time processing. Transcripts are stored for up to 7 days in this service. Do not share personal or sensitive information.';
  }
  if (els.micAllow) els.micAllow.textContent = fr ? 'Autoriser le microphone' : 'Allow microphone';
  if (els.micCancel) els.micCancel.textContent = fr ? 'Annuler' : 'Cancel';
  if (els.disclaimer) {
    els.disclaimer.innerHTML = fr
      ? 'Nupa peut se tromper. Ne communiquez pas de renseignements personnels ou sensibles. <a href="/privacy/" target="_blank" rel="noopener">Confidentialité</a> · <a href="/terms/" target="_blank" rel="noopener">Conditions</a>'
      : 'Nupa can make mistakes. Do not share personal or sensitive information. <a href="/privacy/" target="_blank" rel="noopener">Privacy</a> · <a href="/terms/" target="_blank" rel="noopener">Terms</a>';
  }
}

function showGate(message = '') {
  if (!els.gate) return;
  updateLegalCopy();
  els.gate.hidden = false;
  els.consent.hidden = true;
  els.body.hidden = true;
  els.gateError.textContent = message;
  if (!els.panel.hidden) setTimeout(() => els.gateInput?.focus({ preventScroll: true }), 40);
}

function showConsent() {
  if (!els.consent) return;
  state.ready = false;
  updateLegalCopy();
  els.gate.hidden = true;
  els.consent.hidden = false;
  els.body.hidden = true;
  els.consentError.textContent = '';
  if (!els.panel.hidden) setTimeout(() => els.agree?.focus({ preventScroll: true }), 40);
}

function showBody() {
  updateLegalCopy();
  els.gate.hidden = true;
  els.consent.hidden = true;
  els.body.hidden = false;
}

function showMicConsent() {
  if (sessionStorage.getItem(MIC_CONSENT_STORE) === '1') return Promise.resolve(true);
  if (!els.micConsent) return Promise.resolve(false);
  updateLegalCopy();
  return new Promise((resolve) => {
    state.micConsentResolver = resolve;
    els.micConsent.hidden = false;
    els.micAllow?.focus({ preventScroll: true });
  });
}

function resolveMicConsent(allowed) {
  if (!els.micConsent) return;
  els.micConsent.hidden = true;
  const resolve = state.micConsentResolver;
  state.micConsentResolver = null;
  if (resolve) resolve(Boolean(allowed));
}

function showVoiceError(message) {
  state.voiceError = message || '';
  if (!els.voiceError) return;
  els.voiceError.textContent = state.voiceError;
  els.voiceError.hidden = !state.voiceError;
}

function clearVoiceError() {
  state.voiceError = '';
  if (els.voiceError) {
    els.voiceError.hidden = true;
    els.voiceError.textContent = '';
  }
}

function nextUtcMidnight(now = Date.now()) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function formatVoiceReset(ms) {
  const when = new Date(Number(ms) || nextUtcMidnight());
  try {
    return new Intl.DateTimeFormat(state.locale === 'fr' ? 'fr-CA' : undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(when);
  } catch {
    return when.toLocaleString();
  }
}

function voiceErrorMessage(error) {
  const code = error?.code || '';
  const name = error?.name || '';
  const details = error?.details || {};
  const fr = state.locale === 'fr';
  const reset = formatVoiceReset(details.resetsAt);
  if (code === 'DAILY_BUDGET_EXHAUSTED' || (code === 'BUDGET_EXCEEDED' && details.scope === 'daily')) {
    return fr
      ? `La voix est temporairement indisponible : l’allocation de tests vocaux du jour est épuisée. Elle se réinitialise le ${reset} (heure locale).`
      : `Voice is temporarily unavailable because today's voice testing allowance has been used. It resets ${reset} your time.`;
  }
  if (code === 'CUMULATIVE_BUDGET_EXHAUSTED' || (code === 'BUDGET_EXCEEDED' && details.scope === 'cumulative')) {
    return fr
      ? 'La voix est temporairement indisponible : l’allocation globale de tests vocaux de la bêta privée a été utilisée. Le clavardage texte reste disponible.'
      : 'Voice is temporarily unavailable because the overall private-beta voice allowance has been used. Text chat is still available.';
  }
  if (code === 'LIVE_SESSION_LIMIT') {
    return fr
      ? `La limite quotidienne de sessions vocales est atteinte. Réessayez après le ${reset} (heure locale).`
      : `The daily voice session limit has been reached. Try again after ${reset} your time.`;
  }
  if (code === 'RATE_LIMITED') {
    return fr
      ? 'Trop de tentatives vocales. Attendez quelques minutes et réessayez.'
      : 'Too many voice attempts. Wait a few minutes and try again.';
  }
  if (code === 'UNAVAILABLE') {
    return fr
      ? 'La voix est temporairement désactivée. Le clavardage texte reste disponible.'
      : 'Voice is temporarily disabled. Text chat is still available.';
  }
  if (code === 'GEMINI_LIVE_TOKEN_ERROR' || code === 'GEMINI_LIVE_TIMEOUT' || code === 'PROVIDER_ERROR' || (error?.status >= 500 && error?.status < 600)) {
    return fr
      ? 'La voix est temporairement indisponible en raison d’un problème du fournisseur vocal. Réessayez bientôt.'
      : 'Voice is temporarily unavailable because of a voice-provider problem. Try again shortly.';
  }
  if (code === 'NOT_FOUND') {
    return fr
      ? 'Votre session Nupa a expiré. Rouvrez l’assistant et réessayez.'
      : 'Your Nupa session expired. Reopen the assistant and try again.';
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return fr
      ? 'Ce navigateur ne prend pas en charge l’accès au microphone.'
      : 'This browser does not support microphone access.';
  }
  if (code === 'NETWORK_ERROR' || error instanceof TypeError) {
    return fr
      ? 'La voix n’a pas pu démarrer : la connexion a échoué. Vérifiez votre connexion et réessayez.'
      : 'Voice could not start because the connection failed. Check your connection and try again.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return fr
      ? 'L’accès au microphone a été refusé. Autorisez le microphone dans votre navigateur et réessayez.'
      : 'Microphone access was blocked. Allow microphone access in your browser and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return fr
      ? 'Aucun microphone utilisable n’a été trouvé. Vérifiez votre microphone et réessayez.'
      : 'No working microphone was found. Check your microphone and try again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return fr
      ? 'Le microphone est indisponible ou utilisé par une autre application. Vérifiez-le et réessayez.'
      : 'The microphone is unavailable or in use by another app. Check it and try again.';
  }
  return fr ? 'La voix n’a pas pu démarrer. Réessayez.' : 'Voice could not start. Try again.';
}

function positionPanelFromPill() {
  if (!els.pill || !els.panel || window.innerWidth <= 760) return;
  const pillRect = els.pill.getBoundingClientRect();
  const panelRect = els.panel.getBoundingClientRect();
  if (!pillRect.width || !panelRect.width) return;
  const margin = 12;
  const gap = 10;
  let left = pillRect.right - panelRect.width;
  let top = pillRect.bottom + gap;
  left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - panelRect.width - margin));
  top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - panelRect.height - margin));
  els.panel.style.left = `${Math.round(left)}px`;
  els.panel.style.top = `${Math.round(top)}px`;
  els.panel.style.right = 'auto';
}

function animatePanelFromPill() {
  if (!els.pill || !els.panel) return;
  const pillRect = els.pill.getBoundingClientRect();
  const panelRect = els.panel.getBoundingClientRect();
  if (!pillRect.width || !panelRect.width) {
    els.panel.classList.remove('is-morphing');
    return;
  }
  const dx = (pillRect.left + pillRect.width / 2) - (panelRect.left + panelRect.width / 2);
  const dy = (pillRect.top + pillRect.height / 2) - (panelRect.top + panelRect.height / 2);
  const scaleX = Math.max(0.08, pillRect.width / panelRect.width);
  const scaleY = Math.max(0.08, pillRect.height / panelRect.height);
  els.panel.getAnimations().forEach((animation) => animation.cancel());
  els.panel.classList.add('is-morphing');
  const animation = els.panel.animate([
    {
      transformOrigin: 'center center',
      transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
      opacity: 0,
      borderRadius: '999px'
    },
    {
      transformOrigin: 'center center',
      transform: 'translate(0, 0) scale(1, 1)',
      opacity: 1,
      borderRadius: '22px'
    }
  ], {
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320,
    easing: 'cubic-bezier(.2,.9,.25,1)',
    fill: 'both'
  });
  animation.finished.finally(() => {
    els.panel.classList.remove('is-morphing');
    try { animation.cancel(); } catch {}
  });
}

async function openPanel() {
  state.unread = false;
  const wasHidden = els.panel.hidden;
  if (wasHidden) {
    els.panel.hidden = false;
    els.panel.style.animation = 'none';
    els.panel.classList.add('is-morphing');
    setSize(state.size);
    requestAnimationFrame(() => {
      positionPanelFromPill();
      animatePanelFromPill();
    });
  } else {
    setSize(state.size);
  }
  updatePill();
  if (!state.consent) showConsent();
  else if (!state.key) showGate();
  else if (!state.ready) await init();
  if (state.ready) setTimeout(() => els.input?.focus({ preventScroll: true }), 60);
  updateContext();
  clampPanel();
  startExploreIntroIfNeeded();
}

function closePanel() {
  // Closing the UI deliberately does NOT stop the voice session or the D1 session.
  if (state.micConsentResolver) resolveMicConsent(false);
  els.panel.hidden = true;
  state.unread = false;
  updatePill();
  els.pillText.focus({ preventScroll: true });
}

function setSize(size) {
  state.size = size;
  els.panel.dataset.size = size;
  const isCollapsed = size === 'collapsed';
  const isExpanded = size === 'expanded';
  if (els.expand) {
    els.expand.setAttribute('aria-label', isExpanded ? 'Restore panel size' : 'Expand panel');
    els.expand.title = isExpanded ? 'Restore panel size' : 'Expand';
  }
  if (els.minimize) {
    els.minimize.setAttribute('aria-label', isCollapsed ? 'Expand chat' : 'Collapse chat');
    els.minimize.title = isCollapsed ? 'Expand chat' : 'Collapse chat';
  }
  renderThread({ forceScroll: true });
  requestAnimationFrame(() => {
    renderThread({ forceScroll: true });
    clampPanel();
  });
}

function setState(value) {
  state.voice = value;
  els.panel.dataset.state = value;
  updatePill();
}

function updateContext() {
  if (!els.context) return;
  const status = window.NourOS?.getStatus?.();
  const viewing = state.locale === 'fr' ? 'Vous consultez' : 'Viewing';
  if (!status) {
    els.contextLabel.innerHTML = `${viewing} <b>portfolio</b>`;
    return;
  }
  const project = status.context?.project;
  const about = status.context?.about;
  let label = status.section || 'portfolio';
  if (project?.open && project.id) {
    const title = PROJECT_BY_ID[project.id]?.title || project.id;
    label = `${title} · ${project.view || 'overview'}${project.nodeId ? ` · ${project.nodeId}` : ''}`;
  } else if (about?.open) {
    const chapter = about.chapterId ? CHAPTER_BY_ID[about.chapterId] : null;
    label = chapter ? `${state.locale === 'fr' ? 'Parcours' : 'Journey'} · ${chapter.label}` : (state.locale === 'fr' ? 'À propos de Nour' : 'About Nour');
  } else if (status.context?.contact?.open) {
    label = 'Contact';
  }
  els.contextLabel.innerHTML = `${viewing} <b>${escapeHtml(label)}</b>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function portfolioContext() {
  const status = window.NourOS?.getStatus?.();
  if (!status) return null;
  const project = status.context?.project;
  const about = status.context?.about;
  return {
    section: status.section,
    route: status.route?.path,
    projectId: project?.open ? project.id : null,
    projectView: project?.open ? project.view : null,
    nodeId: project?.open ? project.nodeId : null,
    chapterId: about?.open ? about.chapterId : null,
    view: project?.open ? 'project' : about?.open ? 'about' : status.context?.contact?.open ? 'contact' : 'portfolio',
    navigationSource: Date.now() <= aiNavUntil ? 'assistant' : 'visitor',
    presentation: {
      active: state.presentation.active,
      projectId: state.presentation.projectId,
      nodeId: state.presentation.nodeId,
      paused: state.presentation.paused,
      stepIndex: state.presentation.stepIndex,
      totalSteps: state.presentation.totalSteps,
      label: state.presentation.label
    },
    targets: window.NourOS?.getPresentationTargets?.({ visibleOnly: true, limit: 40 })?.targets || []
  };
}

function describeCurrentView() {
  const status = window.NourOS?.getStatus?.();
  if (!status) return 'Current view: portfolio.';
  const project = status.context?.project?.open ? PROJECT_BY_ID[status.context.project.id] : null;
  const flowNode = project?.flow?.nodes?.find((node) => node.id === status.context?.project?.nodeId);
  const chapter = status.context?.about?.open
    ? PROFESSIONAL_CHAPTERS.find((item) => item.id === status.context.about.chapterId)
    : null;
  return [
    `Section: ${status.section || 'portfolio'}`,
    project ? `Project: ${project.title} (${project.id})` : '',
    project ? `Project view: ${status.context.project.view || 'overview'}` : '',
    flowNode ? `Selected step: ${flowNode.title} (${flowNode.id})` : '',
    chapter ? `Journey chapter: ${chapter.title} (${chapter.id})` : '',
    `Route: ${status.route?.path || '/'}`,
    `Navigation source: ${Date.now() <= aiNavUntil ? 'assistant' : 'visitor'}`,
    state.presentation.active
      ? `Presentation: active${state.presentation.projectId ? ` in ${state.presentation.projectId}` : ''}${state.presentation.nodeId ? ` at ${state.presentation.nodeId}` : ''}${state.presentation.paused ? ' (paused)' : ''}${state.presentation.totalSteps ? ` · step ${state.presentation.stepIndex}/${state.presentation.totalSteps}` : ''}`
      : 'Presentation: not active',
    (() => {
      const targets = window.NourOS?.getPresentationTargets?.({ visibleOnly: true, limit: 24 })?.targets || [];
      return targets.length ? `Visible targets: ${targets.map((target) => `${target.id} (${target.label})`).join('; ')}` : '';
    })()
  ].filter(Boolean).join('\n');
}

function queueAiRoute(route) {
  if (!route) return;
  expectedAiRoutes.push(route);
  if (expectedAiRoutesTimer) clearTimeout(expectedAiRoutesTimer);
  expectedAiRoutesTimer = setTimeout(() => { expectedAiRoutes = []; }, 5000);
}

function consumeAiRoute(route) {
  const index = expectedAiRoutes.indexOf(route);
  if (index < 0) return false;
  expectedAiRoutes.splice(0, index + 1);
  return true;
}

function sendLiveContextUpdate() {
  if (!voice.active || !voice.session) return;
  const text = `[Context update — not a visitor message]\n${describeCurrentView()}`;
  if (text === lastLiveContext) return;
  if (liveContextTimer) clearTimeout(liveContextTimer);
  liveContextTimer = setTimeout(() => {
    liveContextTimer = null;
    if (!voice.active || !voice.session || text === lastLiveContext) return;
    try {
      voice.session.sendClientContent({ turns: text, turnComplete: false });
      lastLiveContext = text;
    } catch {}
  }, 180);
}

function addMessage(role, content, actions = []) {
  state.messages.push({ role, content, actions });
  renderThread();
}

function renderThread({ forceScroll = false } = {}) {
  if (!els.thread) return;
  const previousTop = els.thread.scrollTop;
  const nearBottom = els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight < 28;
  els.thread.textContent = '';
  const collapsed = state.size === 'collapsed';
  const visibleMessages = state.messages;
  if (!visibleMessages.length) {
    const hint = document.createElement('div');
    hint.className = 'ainour-msg system';
    const fr = state.locale === 'fr';
    hint.textContent = collapsed
      ? (fr ? 'Demandez n’importe quoi à Nupa.' : 'Ask Nupa anything.')
      : (fr ? 'Posez une question sur le travail de Nour, sa réflexion ou cette section. Nupa peut aussi ouvrir un projet sur demande.' : 'Ask about Nour’s work, thinking, or this section. Nupa can also open a project when you ask.');
    els.thread.appendChild(hint);
    return;
  }
  for (const message of visibleMessages) {
    if (message.role === 'system') {
      const item = document.createElement('div');
      item.className = 'ainour-msg system';
      item.textContent = message.content;
      els.thread.appendChild(item);
      continue;
    }
    const item = document.createElement('div');
    item.className = `ainour-msg ${message.role}${message.streaming ? ' streaming' : ''}`;
    const text = document.createElement('span');
    text.className = 'ainour-msg-text';
    text.textContent = message.content || '…';
    item.append(text);
    if (message.actions?.length) {
      const actions = document.createElement('div');
      actions.className = 'ainour-actions';
      for (const action of message.actions) {
        const chip = document.createElement('span');
        chip.className = 'ainour-action-chip';
        chip.textContent = actionLabel(action);
        actions.appendChild(chip);
      }
      item.appendChild(actions);
    }
    els.thread.appendChild(item);
  }
  requestAnimationFrame(() => {
    if (!els.thread) return;
    els.thread.scrollTop = forceScroll || nearBottom ? els.thread.scrollHeight : previousTop;
  });
}

function actionLabel(action) {
  const fr = state.locale === 'fr';
  if (!action) return 'Navigation';
  if (action.type === 'openProject') return `${fr ? 'Ouverture de' : 'Opened'} ${PROJECT_BY_ID[action.projectId]?.title || action.projectId}`;
  if (action.type === 'showProjectCard') return `${fr ? 'Focus sur' : 'Focused'} ${PROJECT_BY_ID[action.projectId]?.title || action.projectId}`;
  if (action.type === 'openProjectFlow') return `${fr ? 'Ouverture du flux' : 'Opened'} ${PROJECT_BY_ID[action.projectId]?.title || action.projectId}${fr ? '' : ' flow'}`;
  if (action.type === 'openJourneyChapter') return `${fr ? 'Ouverture de' : 'Opened'} ${CHAPTER_BY_ID[action.chapterId]?.label || action.chapterId}`;
  if (action.type === 'openContact') return fr ? 'Ouverture du contact' : 'Opened contact';
  if (action.type === 'navigate') return `${fr ? 'Ouverture de' : 'Opened'} ${action.section}`;
  if (action.type === 'presentationStart') return fr ? 'Présentation commencée' : 'Started presentation';
  if (action.type === 'presentationStep') return fr ? 'Étape suivante' : 'Next step';
  if (action.type === 'presentationPause') return fr ? 'En pause' : 'Paused';
  if (action.type === 'presentationResume') return fr ? 'Reprise' : 'Resumed';
  if (action.type === 'presentationEnd') return fr ? 'Présentation terminée' : 'Ended presentation';
  if (action.type === 'highlightElement') return fr ? 'Élément mis en évidence' : 'Highlighted';
  if (action.type === 'spotlightElement') return fr ? 'Mise en lumière' : 'Spotlight';
  if (action.type === 'compareElements') return fr ? 'Comparaison' : 'Compared';
  if (action.type === 'traceWorkflow' || action.type === 'traceConnection') return fr ? 'Flux tracé' : 'Traced workflow';
  if (action.type === 'zoomToElement') return fr ? 'Zoom' : 'Zoomed';
  if (action.type === 'clearVisualEffects') return fr ? 'Effets visuels effacés' : 'Cleared visuals';
  return action.route || action.type;
}

async function createSession() {
  const data = await api('/api/session', { method: 'POST', body: JSON.stringify({ locale: state.locale, consent: consentPayload() }) });
  state.sessionId = data.session.id;
  state.sessionConsentRequired = false;
  localStorage.setItem(STORE.session, state.sessionId);
  state.messages = [];
  renderThread();
}

async function loadSession() {
  if (!state.sessionId) return createSession();
  try {
    const data = await api(`/api/session/${encodeURIComponent(state.sessionId)}`);
    state.messages = (data.session.messages || []).map((message) => ({
      role: message.role,
      content: message.content,
      actions: message.meta?.actions || []
    }));
    renderThread();
    state.sessionConsentRequired = false;
    return true;
  } catch (error) {
    if (error.code === 'CONSENT_REQUIRED') {
      state.sessionConsentRequired = true;
      showConsent();
      return false;
    }
    if (String(error.message).includes('not found') || String(error.message).includes('expired')) {
      localStorage.removeItem(STORE.session);
      state.sessionId = null;
      await createSession();
      return true;
    }
    throw error;
  }
}

async function init() {
  if (!state.consent) return showConsent();
  if (!state.key) return showGate();
  try {
    state.meta = await api('/api/meta');
    const loaded = await loadSession();
    if (loaded === false) return;
    showBody();
    state.ready = true;
    setState('idle');
    updateContext();
    startExploreIntroIfNeeded();
  } catch (error) {
    if (String(error.message).includes('unauthorized')) return;
    showGate(String(error.message || error));
  }
}

function openExplore() {
  state.exploreRequested = true;
  openPanel();
}

function startExploreIntroIfNeeded() {
  if (!state.exploreRequested || state.exploreIntroStarted || !state.ready || state.busy) return;
  state.exploreRequested = false;
  state.exploreIntroStarted = true;
  if (state.messages.length) return;
  void startExploreIntro();
}

async function startExploreIntro() {
  const prompt = state.locale === 'fr'
    ? "Présente-toi brièvement comme Nupa, un guide de portfolio indépendant propulsé par l’IA. Explique que cette exploration est une présentation interactive, vivante et personnalisée, et que je peux t’interrompre, poser des questions, demander plus de détails, naviguer seul, sauter des sections, mettre en pause ou reprendre, ou terminer l’expérience à tout moment. Demande-moi ce que je souhaite explorer en premier. Ne commence pas encore une présentation complète et ne demande pas de confirmation pour chaque étape."
    : "Introduce yourself briefly as Nupa, an independent AI portfolio guide. Explain that this is a live, interactive, personalized presentation and that I can interrupt, ask questions, request more detail, navigate independently, skip sections, pause or resume, or end the experience at any time. Ask what I want to explore first. Do not start a full presentation yet, and do not ask for permission before every step.";
  await sendMessage(null, { message: prompt, showUser: false, pausePresentation: false });
}

async function sendMessage(event, options = {}) {
  event?.preventDefault?.();
  if (state.busy || !state.ready) return;
  const message = String(options.message ?? els.input.value).trim();
  if (!message) return;
  const showUser = options.showUser !== false;
  if (options.pausePresentation !== false && state.presentation.active && !state.presentation.paused) {
    state.presentation = { ...state.presentation, paused: true };
    window.NourOS?.applyPresentationAction?.({ type: 'presentationPause' });
  }
  state.busy = true;
  els.send.disabled = true;
  if (options.message === undefined) {
    els.input.value = '';
    els.input.style.height = '';
  }
  if (showUser) addMessage('user', message);
  setState('processing');
  try {
    const context = portfolioContext();
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        message,
        locale: state.locale,
        clientMessageId: randomId(12),
        portfolioContext: context
      })
    });
    state.sessionId = data.sessionId;
    localStorage.setItem(STORE.session, state.sessionId);
    await runActions(data.actions || []);
    addMessage('assistant', data.reply, data.actions || []);
    setState('idle');
    if (els.panel.hidden) {
      state.unread = true;
      updatePill();
    }
  } catch (error) {
    if (error?.code === 'CONSENT_REQUIRED') {
      state.sessionConsentRequired = true;
      showConsent();
      setState('idle');
      return;
    }
    addMessage('system', state.locale === 'fr' ? 'Impossible de répondre. Réessayez.' : 'Could not answer. Please try again.');
    setState('error');
    setTimeout(() => setState('idle'), 1800);
  } finally {
    state.busy = false;
    els.send.disabled = false;
  }
}

const VISUAL_ACTIONS = new Set([
  'navigateToElement', 'highlightElement', 'spotlightElement', 'hoverElement',
  'expandElement', 'collapseElement', 'pointToElement', 'traceConnection',
  'traceWorkflow', 'scrollToElement', 'zoomToElement', 'resetZoom',
  'compareElements', 'clearVisualEffects'
]);

async function runActions(actions) {
  const list = (actions || []).filter(Boolean);
  if (!list.length) return { ok: true, applied: [] };
  if (!voice.active) setState('processing');
  const applied = [];
  let failed = false;
  let cancelled = false;
  const runEpoch = aiActionEpoch;
  const status = window.NourOS;
  if (!status) return { ok: false, applied: [], error: 'INTERFACE_UNAVAILABLE' };
  const waitForTarget = async (targetId) => {
    if (!targetId || typeof status.waitForPresentationTarget !== 'function') { await nextFrame(); return true; }
    return status.waitForPresentationTarget(targetId);
  };
  for (let index = 0; index < list.length; index++) {
    if (runEpoch !== aiActionEpoch) { cancelled = true; break; }
    const action = list[index];
    if (action.type === 'presentationStart' || action.type === 'presentationStep') {
      state.presentation = {
        active: true,
        projectId: action.projectId || state.presentation.projectId || null,
        nodeId: action.nodeId || action.startNodeId || null,
        paused: false,
        stepIndex: Number(action.stepIndex) || 0,
        totalSteps: Number(action.totalSteps) || state.presentation.totalSteps || 0,
        label: action.label || state.presentation.label || ''
      };
      await status.applyPresentationAction?.(action);
      applied.push(action);
      continue;
    }
    if (action.type === 'presentationPause') { state.presentation = { ...state.presentation, paused: true }; await status.applyPresentationAction?.(action); applied.push(action); continue; }
    if (action.type === 'presentationResume') { state.presentation = { ...state.presentation, paused: false }; await status.applyPresentationAction?.(action); applied.push(action); continue; }
    if (action.type === 'presentationEnd') {
      state.presentation = { active: false, projectId: null, nodeId: null, paused: false, stepIndex: 0, totalSteps: 0, label: '' };
      await status.applyPresentationAction?.(action);
      applied.push(action);
      continue;
    }
    if (VISUAL_ACTIONS.has(action.type)) {
      if (action.navigationRoute) queueAiRoute(action.navigationRoute);
      aiNavUntil = Date.now() + 5000;
      const result = await status.applyPresentationAction?.(action);
      if (result?.ok === false || result?.ok === undefined) failed = true;
      applied.push({ ...action, result });
      continue;
    }
    aiNavUntil = Date.now() + 4000;
    if (action.route) queueAiRoute(action.route);
    try {
      if (action.type === 'navigate') { await status.navigateTo(action.section); applied.push(action); }
      else if (action.type === 'showProjectCard') { await status.showProjectCard(action.projectId); applied.push(action); }
      else if (action.type === 'openProject') { await status.openProject(action.projectId); applied.push(action); }
      else if (action.type === 'openProjectFlow') {
        await status.openProjectFlow(action.projectId, action.nodeId || null);
        applied.push(action);
        if (state.presentation.active) state.presentation.nodeId = action.nodeId || null;
      } else if (action.type === 'openJourneyChapter') { await status.openJourneyChapter(action.chapterId); applied.push(action); }
      else if (action.type === 'openContact') { await status.openContact(); applied.push(action); }
      if (action.waitForTarget && !(await waitForTarget(action.waitForTarget))) failed = true;
    } catch (error) {
      failed = true;
      if (String(error?.code || error?.message || '').includes('BUSY')) {
        await nextFrame();
        try {
          if (action.type === 'openProject') { await status.openProject(action.projectId); applied.push(action); failed = false; }
          if (action.type === 'openProjectFlow') { await status.openProjectFlow(action.projectId, action.nodeId || null); applied.push(action); failed = false; }
          if (action.waitForTarget) await waitForTarget(action.waitForTarget);
        } catch {}
      }
    }
    if (index < list.length - 1) await nextFrame();
  }
  aiNavUntil = Date.now() + 3000;
  updateContext();
  sendLiveContextUpdate();
  if (!voice.active) setState('idle');
  return { ok: !failed && !cancelled, cancelled, applied, failed };
}

function onNourState(status) {
  const nextRoute = status?.route?.path || lastRoute;
  const routeChanged = Boolean(nextRoute && nextRoute !== lastRoute);
  const aiNavigation = routeChanged ? consumeAiRoute(nextRoute) : false;
  if (routeChanged && !aiNavigation) {
    expectedAiRoutes = [];
    aiActionEpoch += 1;
    if (state.presentation.active) {
      const project = status?.context?.project;
      const projectId = project?.open ? project.id : state.presentation.projectId;
      const projectData = projectId ? PROJECT_BY_ID[projectId] : null;
      const nodeId = project?.open ? project.nodeId : null;
      const nodes = projectData?.flow?.nodes || [];
      const nodeIndex = nodeId ? nodes.findIndex((node) => node.id === nodeId) : -1;
      state.presentation = {
        ...state.presentation,
        active: true,
        paused: true,
        projectId,
        nodeId,
        stepIndex: nodeIndex >= 0 ? nodeIndex + 1 : 0,
        totalSteps: nodes.length || state.presentation.totalSteps || 0,
        label: projectData?.title || state.presentation.label || ''
      };
      window.NourOS?.cancelPresentationActions?.();
      window.NourOS?.applyPresentationAction?.({
        type: 'presentationPause',
        projectId,
        nodeId,
        stepIndex: state.presentation.stepIndex,
        totalSteps: state.presentation.totalSteps,
        label: state.presentation.label
      });
      window.NourOS?.applyPresentationAction?.({ type: 'clearVisualEffects' });
    }
  }
  updateContext();
  schedulePillPosition();
  if (routeChanged) sendLiveContextUpdate();
  lastRoute = nextRoute;
}

async function handlePresentationControl(action) {
  if (!state.presentation.active && action !== 'end') return;
  const status = window.NourOS;
  if (!status) return;
  if (action === 'pause') {
    state.presentation = { ...state.presentation, paused: true };
    if (voice.active) stopPlayback();
    await status.applyPresentationAction?.({ type: 'presentationPause' });
    return;
  }
  if (action === 'resume') {
    state.presentation = { ...state.presentation, paused: false };
    await status.applyPresentationAction?.({ type: 'presentationResume' });
    return;
  }
  if (action === 'end') {
    state.presentation = { active: false, projectId: null, nodeId: null, paused: false, stepIndex: 0, totalSteps: 0, label: '' };
    aiActionEpoch += 1;
    await status.applyPresentationAction?.({ type: 'presentationEnd' });
    status.cancelPresentationActions?.();
    return;
  }
  if (action === 'next' || action === 'prev') await movePresentationStep(action);
}

async function movePresentationStep(direction) {
  const project = PROJECT_BY_ID[state.presentation.projectId];
  if (!project?.flow?.nodes?.length) return;
  const ids = project.flow.nodes.map((node) => node.id);
  const current = ids.indexOf(state.presentation.nodeId);
  const base = current < 0 ? 0 : current + (direction === 'next' ? 1 : -1);
  const index = Math.max(0, Math.min(ids.length - 1, base));
  const nodeId = ids[index];
  const node = project.flow.nodes.find((item) => item.id === nodeId);
  state.presentation = {
    ...state.presentation,
    active: true,
    paused: false,
    projectId: project.id,
    nodeId,
    stepIndex: index + 1,
    totalSteps: ids.length,
    label: node?.title || nodeId
  };
  aiNavUntil = Date.now() + 5000;
  queueAiRoute(`/projects/${project.id}/flow/${nodeId}`);
  await window.NourOS?.applyPresentationAction?.({
    type: 'presentationStep',
    projectId: project.id,
    nodeId,
    stepIndex: index + 1,
    totalSteps: ids.length,
    label: node?.title || nodeId
  });
  await window.NourOS?.openProjectFlow?.(project.id, nodeId);
  await window.NourOS?.applyPresentationAction?.({
    type: 'highlightElement',
    targetIds: [`flow-node:${project.id}:${nodeId}`],
    style: 'glow',
    waitForTarget: `flow-node:${project.id}:${nodeId}`
  });
  updateContext();
  sendLiveContextUpdate();
  if (voice.active && voice.session) {
    try {
      voice.session.sendClientContent({
        turns: `[Presentation control — not a visitor message] The visitor selected ${direction}. Continue the presentation from step ${index + 1}, "${node?.title || nodeId}". Explain how it connects to the previous step and why it matters commercially or to Nour's contribution. Do not restart the tour and do not ask permission for every step.`,
        turnComplete: true
      });
    } catch {}
  } else {
    addMessage('system', `Step ${index + 1} of ${ids.length}: ${node?.title || nodeId}`);
    if (!state.busy && state.ready) {
      await openPanel();
      await sendMessage(null, {
        message: `Continue the presentation from step ${index + 1}, "${node?.title || nodeId}". Explain how it connects to the previous step and why it matters commercially or to Nour's contribution. Keep it concise, do not restart the tour, and do not ask permission for every step.`,
        showUser: false,
        pausePresentation: false
      });
    }
  }
}

function toggleLocale() {
  state.locale = state.locale === 'fr' ? 'en' : 'fr';
  localStorage.setItem(STORE.locale, state.locale);
  applyLocale();
  updateContext();
  updatePill();
}

function applyLocale() {
  const fr = state.locale === 'fr';
  setLocaleButton();
  updateLegalCopy();
  updateStaticCopy();
  if (els.input) {
    els.input.placeholder = fr
      ? 'Posez une question sur Nour, ou dites « ouvre Safiy »…'
      : 'Ask about Nour\'s work, or say “open Safiy”…';
  }
  document.documentElement.dataset.ainourLocale = state.locale;
  document.dispatchEvent(new CustomEvent('ainour:locale', { detail: { locale: state.locale } }));
}

function updateStaticCopy() {
  const fr = state.locale === 'fr';
  els.pillText?.setAttribute('aria-label', fr ? 'Nupa — ouvrir le clavardage' : 'Nupa — open text chat');
  els.pillVoice?.setAttribute('title', fr ? 'Voix' : 'Voice');
  els.pill?.setAttribute('aria-label', fr ? 'Assistant Nupa' : 'Nupa');
  els.panel?.setAttribute('aria-label', fr ? 'Assistant Nupa' : 'Nupa companion');
  els.panel?.querySelector('[data-drag-handle]')?.setAttribute('title', fr ? 'Déplacer' : 'Drag to move');
  if (els.tagline) els.tagline.textContent = fr ? 'Votre compagnon de portfolio intelligent.' : 'Your intelligent portfolio companion.';
  const minimize = els.panel?.querySelector('[data-ainour="minimize"]');
  const expand = els.panel?.querySelector('[data-ainour="expand"]');
  const close = els.panel?.querySelector('[data-ainour="close"]');
  if (minimize) {
    minimize.setAttribute('aria-label', fr ? 'Réduire le clavardage' : 'Collapse chat');
    minimize.setAttribute('title', fr ? 'Réduire le clavardage' : 'Collapse chat');
  }
  if (expand) {
    expand.setAttribute('aria-label', fr ? 'Agrandir le panneau' : 'Expand panel');
    expand.setAttribute('title', fr ? 'Agrandir' : 'Expand');
  }
  if (close) {
    close.setAttribute('aria-label', fr ? 'Fermer le panneau Nupa' : 'Close Nupa panel');
    close.setAttribute('title', fr ? 'Fermer le panneau (la voix continue)' : 'Close panel (voice keeps running)');
  }
  if (els.reset) els.reset.textContent = fr ? 'Nouveau' : 'New';
  if (els.gateCopy) els.gateCopy.textContent = fr
    ? 'Entrez votre clé d’accès à la bêta privée pour parler avec Nupa. La clé est validée par Nupa et reste dans cet onglet; la clé Gemini permanente ne parvient jamais au navigateur.'
    : 'Enter your private-beta access key to talk with Nupa. The key is validated by Nupa and stays in this tab; the permanent Gemini key never reaches the browser.';
  if (els.gateInput) {
    els.gateInput.placeholder = fr ? 'Clé d’accès à la bêta privée' : 'Private-beta access key';
    els.gateInput.setAttribute('aria-label', fr ? 'Clé d’accès à la bêta privée' : 'Private-beta access key');
  }
  if (els.gateSubmit) els.gateSubmit.textContent = fr ? 'Ouvrir' : 'Open';
  if (els.input) els.input.setAttribute('aria-label', fr ? 'Message à Nupa' : 'Message Nupa');
  els.send?.setAttribute('aria-label', fr ? 'Envoyer le message' : 'Send message');
  els.send?.setAttribute('title', fr ? 'Envoyer' : 'Send');
  els.panel?.querySelectorAll('.ainour-legal-links a[href="/terms/"]').forEach((link) => { link.textContent = fr ? 'Conditions d’utilisation' : 'Terms of Use'; });
  els.panel?.querySelectorAll('.ainour-legal-links a[href="/privacy/"]').forEach((link) => { link.textContent = fr ? 'Politique de confidentialité' : 'Privacy Policy'; });
}

function setLocaleButton() {
  if (els.locale) els.locale.textContent = state.locale === 'fr' ? 'FR' : 'EN';
}

async function resetSession() {
  if (voice.active) await stopVoice();
  localStorage.removeItem(STORE.session);
  state.sessionId = null;
  state.sessionConsentRequired = false;
  state.messages = [];
  state.unread = false;
  renderThread();
  if (state.ready) await createSession();
}

/* ---------- voice ---------- */

function base64FromInt16(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function downsampleTo16k(float32, sourceRate) {
  const ratio = sourceRate / 16000;
  const length = Math.floor(float32.length / ratio);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const sample = float32[Math.floor(i * ratio)] || 0;
    output[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
  }
  return output;
}

function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function stopPlayback() {
  for (const source of voice.sources) {
    try { source.stop(); } catch {}
  }
  voice.sources = [];
  voice.nextPlayTime = 0;
}

function playAudio(base64) {
  if (!voice.outputContext) return;
  const pcm = base64ToInt16(base64);
  const buffer = voice.outputContext.createBuffer(1, pcm.length, 24000);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
  const source = voice.outputContext.createBufferSource();
  source.buffer = buffer;
  source.connect(voice.outputContext.destination);
  const now = voice.outputContext.currentTime;
  if (voice.nextPlayTime < now) voice.nextPlayTime = now;
  source.start(voice.nextPlayTime);
  voice.nextPlayTime += buffer.duration;
  voice.sources.push(source);
  source.onended = () => { voice.sources = voice.sources.filter((item) => item !== source); };
}

function usageTotals(metadata) {
  const details = (items) => Object.fromEntries((items || []).map((item) => [String(item.modality || '').toLowerCase(), Number(item.tokenCount || 0)]));
  const prompt = details(metadata?.promptTokensDetails);
  const response = details(metadata?.responseTokensDetails);
  return { text: prompt.text || 0, audioIn: prompt.audio || 0, audioOut: response.audio || 0 };
}

function usageDelta() {
  if (!voice.usage) return null;
  const current = usageTotals(voice.usage);
  const previous = voice.lastTotals;
  return {
    textInput: Math.max(0, current.text - previous.text),
    audioInput: Math.max(0, current.audioIn - previous.audioIn),
    audioOutput: Math.max(0, current.audioOut - previous.audioOut)
  };
}

function appendVoiceTranscript(role, text) {
  if (!text) return;
  const key = role === 'user' ? 'userDraftId' : 'assistantDraftId';
  if (!voice[key]) {
    voice[key] = randomId(8);
    state.messages.push({ id: voice[key], role, content: '', actions: [], streaming: true });
  }
  const message = state.messages.find((item) => item.id === voice[key]);
  if (message) message.content += text;
  renderThread();
}

function finalizeVoiceDrafts() {
  for (const id of [voice.userDraftId, voice.assistantDraftId]) {
    if (!id) continue;
    const message = state.messages.find((item) => item.id === id);
    if (message) message.streaming = false;
  }
  voice.userDraftId = null;
  voice.assistantDraftId = null;
  renderThread();
}

async function persistVoiceTurn() {
  const userText = voice.userText.trim();
  const assistantText = voice.assistantText.trim();
  const usage = usageDelta();
  const turnId = voice.turnId || randomId(12);
  voice.turnId = null;
  if (!userText && !assistantText && !usage) return;
  try {
    await api('/api/live/turn', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        turnId,
        reservationId: voice.reservationId,
        locale: state.locale,
        userText: userText || (usage ? '[voice turn]' : ''),
        assistantText: assistantText || (usage ? '[voice response]' : ''),
        usage: usage || undefined
      })
    });
    voice.lastTotals = usageTotals(voice.usage);
  } catch {
    console.warn('Nupa voice turn could not be saved');
  }
  finalizeVoiceDrafts();
  voice.userText = '';
  voice.assistantText = '';
}

function pausePresentationForVoiceEnd() {
  if (!state.presentation.active || state.presentation.paused) return;
  state.presentation = { ...state.presentation, paused: true };
  window.NourOS?.applyPresentationAction?.({ type: 'presentationPause' });
}

async function handleLiveTool(toolCall) {
  const calls = toolCall?.functionCalls || [];
  if (!calls.length) return;
  const responses = [];
  for (const call of calls) {
    try {
      const result = await api('/api/tools/execute', {
        method: 'POST',
        body: JSON.stringify({ sessionId: state.sessionId, name: call.name, args: call.args || {}, portfolioContext: portfolioContext() })
      });
      const applied = result.ok
        ? await runActions(result.actions || (result.action ? [result.action] : []))
        : null;
      const routes = (result.actions || (result.action ? [result.action] : [])).filter(Boolean).map((item) => item.route).filter(Boolean);
      const visualFailure = applied && applied.ok === false;
      responses.push({
        id: call.id,
        name: call.name,
        response: result.ok && !visualFailure
          ? {
              ...(result.modelResponse || { ok: true }),
              ok: true,
              ...(routes.length ? { confirmed: applied?.ok === true, routes } : {}),
              ...(applied?.applied?.length ? { visualApplied: true } : {})
            }
          : { ok: false, error: visualFailure ? 'VISUAL_ACTION_FAILED' : result.error?.code }
      });
    } catch {
      responses.push({ id: call.id, name: call.name, response: { ok: false, error: 'TOOL_FAILED' } });
    }
  }
  voice.session?.sendToolResponse({ functionResponses: responses });
}

async function startVoice() {
  if (voiceIsActive()) {
    openPanel();
    return;
  }
  if (!state.consent) {
    await openPanel();
    showConsent();
    return;
  }
  if (!state.ready) {
    await openPanel();
    if (!state.ready) return;
  }
  openPanel();
  if (sessionStorage.getItem(MIC_CONSENT_STORE) !== '1') {
    const allowed = await showMicConsent();
    if (!allowed) return;
    sessionStorage.setItem(MIC_CONSENT_STORE, '1');
  }
  clearVoiceError();
  setState('connecting');
  voice.turnId = randomId(12);
  voice.lastTotals = { text: 0, audioIn: 0, audioOut: 0 };
  voice.usage = null;
  voice.userText = '';
  voice.assistantText = '';
  voice.userDraftId = null;
  voice.assistantDraftId = null;
  try {
    const token = await api('/api/live/token', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.sessionId, locale: state.locale, portfolioContext: portfolioContext() })
    });
    state.sessionId = token.sessionId;
    voice.reservationId = token.reservationId;
    localStorage.setItem(STORE.session, state.sessionId);
    voice.mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    voice.inputContext = new AudioContext();
    voice.outputContext = new AudioContext({ sampleRate: 24000 });
    const { GoogleGenAI } = await import('./vendor/genai.js');
    const ai = new GoogleGenAI({ apiKey: token.token, httpOptions: { apiVersion: 'v1alpha' } });
    voice.active = true;
    voice.session = await ai.live.connect({
      model: token.model,
      config: token.config,
      callbacks: {
        onopen: () => { setState('listening'); lastLiveContext = ''; sendLiveContextUpdate(); },
        onmessage: async (message) => {
          if (message.setupComplete) setState('listening');
          const activity = message.voiceActivity?.voiceActivityType || message.voiceActivity?.type;
          if (activity === 'START_OF_SPEECH') setState('listening');
          else if (activity === 'END_OF_SPEECH') setState('processing');
          if (message.serverContent?.interrupted) {
            aiActionEpoch += 1;
            window.NourOS?.cancelPresentationActions?.();
            if (state.presentation.active) {
              state.presentation = { ...state.presentation, paused: true };
              window.NourOS?.applyPresentationAction?.({ type: 'presentationPause' });
            }
            stopPlayback();
            setState('listening');
          }
          if (message.serverContent?.inputTranscription?.text) {
            voice.userText += message.serverContent.inputTranscription.text;
            appendVoiceTranscript('user', message.serverContent.inputTranscription.text);
          }
          if (message.serverContent?.outputTranscription?.text) {
            voice.assistantText += message.serverContent.outputTranscription.text;
            appendVoiceTranscript('assistant', message.serverContent.outputTranscription.text);
          }
          for (const part of message.serverContent?.modelTurn?.parts || []) {
            if (part.inlineData?.data) {
              playAudio(part.inlineData.data);
              setState('speaking');
            }
          }
          if (message.serverContent?.turnComplete) {
            setState('listening');
            await persistVoiceTurn();
            voice.turnId = randomId(12);
          }
          if (message.usageMetadata) voice.usage = message.usageMetadata;
          if (message.toolCall) await handleLiveTool(message.toolCall);
        },
        onerror: async () => {
          if (!voice.active) return;
          await stopVoice();
          setState('error');
          showVoiceError(voiceErrorMessage({ code: 'PROVIDER_ERROR' }));
          setTimeout(() => { if (state.voice === 'error') setState('idle'); }, 7000);
        },
        onclose: async () => {
          if (!voice.active) return;
          pausePresentationForVoiceEnd();
          await stopVoice();
          setState('error');
          showVoiceError(state.locale === 'fr'
            ? (state.presentation.active ? 'La session vocale a pris fin. La présentation est en pause; continuez en texte ou relancez la voix.' : 'La session vocale a pris fin. Relancez la voix pour continuer.')
            : (state.presentation.active ? 'The voice session ended. The presentation is paused; continue in text or restart voice.' : 'The voice session ended. Start voice again to continue.'));
          setTimeout(() => { if (state.voice === 'error') setState('idle'); }, 7000);
        }
      }
    });
    const expiresAt = Date.parse(token.expiresAt);
    if (Number.isFinite(expiresAt)) {
      voice.expiryTimer = setTimeout(async () => {
        if (!voice.active) return;
        pausePresentationForVoiceEnd();
        await stopVoice();
        setState('error');
        showVoiceError(state.locale === 'fr'
          ? (state.presentation.active ? 'La session vocale a pris fin. La présentation est en pause; continuez en texte ou relancez la voix.' : 'La session vocale a pris fin. Relancez la voix pour continuer.')
          : (state.presentation.active ? 'The voice session ended. The presentation is paused; continue in text or restart voice.' : 'The voice session ended. Start voice again to continue.'));
        setTimeout(() => { if (state.voice === 'error') setState('idle'); }, 7000);
      }, Math.max(1000, expiresAt - Date.now()));
    }
    voice.micSource = voice.inputContext.createMediaStreamSource(voice.mic);
    voice.analyser = voice.inputContext.createAnalyser();
    voice.analyser.fftSize = 256;
    voice.analyser.smoothingTimeConstant = 0.72;
    voice.micSource.connect(voice.analyser);
    voice.processor = voice.inputContext.createScriptProcessor(4096, 1, 1);
    voice.processor.onaudioprocess = (event) => {
      if (!voice.session || !voice.active) return;
      const pcm16 = downsampleTo16k(event.inputBuffer.getChannelData(0), voice.inputContext.sampleRate);
      voice.session.sendRealtimeInput({ audio: { data: base64FromInt16(pcm16), mimeType: 'audio/pcm;rate=16000' } });
    };
    voice.micSource.connect(voice.processor);
    const silent = voice.inputContext.createGain();
    silent.gain.value = 0;
    voice.processor.connect(silent);
    silent.connect(voice.inputContext.destination);
    startOrbAnimation();
    setState('listening');
  } catch (error) {
    await stopVoice();
    if (error?.code === 'CONSENT_REQUIRED') {
      state.sessionConsentRequired = true;
      showConsent();
      return;
    }
    setState('error');
    showVoiceError(voiceErrorMessage(error));
    setTimeout(() => { if (state.voice === 'error') setState('idle'); }, 7000);
  }
}

async function stopVoice() {
  voice.active = false;
  if (voice.expiryTimer) { clearTimeout(voice.expiryTimer); voice.expiryTimer = null; }
  stopOrbAnimation();
  if (voice.micSource) { try { voice.micSource.disconnect(); } catch {} voice.micSource = null; }
  if (voice.analyser) { try { voice.analyser.disconnect(); } catch {} voice.analyser = null; }
  if (voice.processor) { voice.processor.disconnect(); voice.processor = null; }
  if (voice.mic) { for (const track of voice.mic.getTracks()) track.stop(); voice.mic = null; }
  stopPlayback();
  if (voice.session) { try { voice.session.close(); } catch {} voice.session = null; }
  if (voice.inputContext) { try { await voice.inputContext.close(); } catch {} voice.inputContext = null; }
  if (voice.outputContext) { try { await voice.outputContext.close(); } catch {} voice.outputContext = null; }
  finalizeVoiceDrafts();
  voice.userText = '';
  voice.assistantText = '';
  setState('idle');
}

function startOrbAnimation() {
  stopOrbAnimation();
  if (!voice.analyser || !els.pill) return;
  const data = new Uint8Array(voice.analyser.fftSize);
  const tick = () => {
    if (!voice.analyser || !voice.active || !els.pill) {
      voice.orbFrame = null;
      els.pill?.style.setProperty('--orb-level', '0');
      return;
    }
    voice.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const value = (data[index] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / data.length);
    const target = Math.min(1, Math.max(0, rms * 9));
    voice.orbLevel = voice.orbLevel * 0.72 + target * 0.28;
    els.pill.style.setProperty('--orb-level', voice.orbLevel.toFixed(3));
    voice.orbFrame = requestAnimationFrame(tick);
  };
  tick();
}

function stopOrbAnimation() {
  if (voice.orbFrame) cancelAnimationFrame(voice.orbFrame);
  voice.orbFrame = null;
  voice.orbLevel = 0;
  els.pill?.style.setProperty('--orb-level', '0');
}

function waitForNour() {
  if (window.NourOS) {
    nour = window.NourOS;
    lastRoute = nour.getStatus?.()?.route?.path || null;
    nour.subscribe?.(onNourState);
    updateContext();
    return;
  }
  setTimeout(waitForNour, 120);
}

export function mountCompanion() {
  if (mounted) return;
  mount();
  waitForNour();
  if (state.exploreRequested) setTimeout(() => openPanel(), 80);
}
