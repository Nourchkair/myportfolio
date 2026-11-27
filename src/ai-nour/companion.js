import { PROJECT_BY_ID } from '../data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../data/journey.js';

const params = new URLSearchParams(location.search);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const DEV = params.get('ainour') === 'dev' && LOCAL;
const API_BASE = (params.get('ainour-api') || (LOCAL ? 'http://127.0.0.1:8789' : 'https://api.nourchkair.com')).replace(/\/+$/, '');
const CHAPTER_BY_ID = Object.fromEntries(PROFESSIONAL_CHAPTERS.map((chapter) => [chapter.id, chapter]));
const STORE = { key: 'ainour:key', owner: 'ainour:owner', session: 'ainour:session', locale: 'ainour:locale' };

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
  presentation: { active: false, projectId: null, nodeId: null, paused: false }
};

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
  reservationId: null
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

localStorage.setItem(STORE.owner, state.owner);

function randomId(bytes = 24) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveApi(path) {
  return `${API_BASE}${path}`;
}

async function api(path, options = {}) {
  const response = await fetch(resolveApi(path), {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      'x-prototype-key': state.key,
      'x-owner-token': state.owner,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (response.status === 401) {
    state.key = '';
    sessionStorage.removeItem(STORE.key);
    showGate('The private-beta key was not accepted, expired, or was revoked.');
    throw new Error('unauthorized');
  }
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body;
}

function mountCss() {
  if (document.querySelector('link[data-ainour-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./companion.css', import.meta.url).href;
  link.dataset.ainourCss = '1';
  document.head.appendChild(link);
}

function pillMarkup() {
  return `
    <button class="ainour-pill-main" type="button" data-ainour="mode-text" aria-label="Ask Nour AI — open text chat">
      <svg class="ainour-pill-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.2h12v8.2H8.8L5.4 16v-2.6H4z"/><path d="M7 8h6M7 10.6h4"/></svg>
      <span class="ainour-orb" id="ainourOrb" aria-hidden="true"></span>
      <span id="ainourPillLabel">Ask Nour AI</span>
    </button>
    <span class="ainour-pill-sep" aria-hidden="true"></span>
    <button class="ainour-pill-mic" type="button" data-ainour="mode-voice" aria-label="Start voice with AI Nour" title="Voice">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7.1" y="3.1" width="5.8" height="9.2" rx="2.9"/><path d="M4.8 9.6a5.2 5.2 0 0 0 10.4 0M10 15v2.2M7.8 17.2h4.4"/></svg>
    </button>
  `;
}

function panelMarkup() {
  return `
    <header class="ainour-head" data-drag-handle title="Drag to move">
      <div class="ainour-id"><b>AI Nour</b></div>
      <div class="ainour-head-actions">
        <button class="ainour-icon" type="button" data-ainour="minimize" aria-label="Collapse chat" title="Collapse chat">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M3 8h10"/></svg>
        </button>
        <button class="ainour-icon" type="button" data-ainour="expand" aria-label="Expand panel" title="Expand">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2H2v4M10 14h4v-4M14 6V2h-4M2 10v4h4"/></svg>
        </button>
        <button class="ainour-icon" type="button" data-ainour="close" aria-label="Close AI Nour panel" title="Close panel (voice keeps running)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>
        </button>
      </div>
    </header>
    <div class="ainour-context" id="ainourContext">
      <span class="ainour-context-label" id="ainourContextLabel">Viewing <b>portfolio</b></span>
      <div class="ainour-context-actions">
        <button type="button" data-ainour="locale" id="ainourLocale">EN</button>
        <button type="button" data-ainour="reset">New</button>
      </div>
    </div>
    <div class="ainour-gate" id="ainourGate">
      <p>Enter your private-beta access key to talk with AI Nour. The key is validated by AI Nour and stays in this tab; the permanent Gemini key never reaches the browser.</p>
      <form id="ainourGateForm">
        <input id="ainourKey" type="password" autocomplete="off" placeholder="Private-beta access key" aria-label="Private-beta access key" required>
        <button type="submit">Open</button>
      </form>
      <p id="ainourGateError" role="status" aria-live="polite" style="color:rgba(255,180,180,.8);margin:10px 0 0;min-height:1em"></p>
    </div>
    <div class="ainour-body" id="ainourBody" hidden>
      <div class="ainour-thread" id="ainourThread" aria-live="polite"></div>
      <form class="ainour-compose" id="ainourForm">
        <div class="ainour-compose-bar">
          <textarea id="ainourInput" rows="1" maxlength="2000" placeholder="Ask about Nour's work, or say “open Safiy”…" aria-label="Message AI Nour"></textarea>
          <button class="ainour-compose-btn ainour-send" id="ainourSend" type="submit" aria-label="Send message" title="Send">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10h13M11 4.5l5.5 5.5-5.5 5.5"/></svg>
          </button>
        </div>
      </form>
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
  pill.setAttribute('aria-label', 'AI Nour');
  pill.innerHTML = pillMarkup();
  document.body.appendChild(pill);

  const panel = document.createElement('section');
  panel.className = 'ainour-panel';
  panel.id = 'ainourPanel';
  panel.dataset.size = 'standard';
  panel.dataset.state = 'idle';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'AI Nour companion');
  panel.hidden = true;
  panel.innerHTML = panelMarkup();
  document.body.appendChild(panel);

  els = {
    pill,
    pillText: pill.querySelector('[data-ainour="mode-text"]'),
    pillVoice: pill.querySelector('[data-ainour="mode-voice"]'),
    pillLabel: pill.querySelector('#ainourPillLabel'),
    panel,
    context: panel.querySelector('#ainourContext'),
    contextLabel: panel.querySelector('#ainourContextLabel'),
    gate: panel.querySelector('#ainourGate'),
    gateForm: panel.querySelector('#ainourGateForm'),
    gateInput: panel.querySelector('#ainourKey'),
    gateError: panel.querySelector('#ainourGateError'),
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
  setLocaleButton();
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
  const voiceLabel = ['connecting', 'listening', 'speaking'].includes(state.voice) || voice.active;
  const label = state.voice === 'error' ? 'Mic error' : voiceLabel ? 'Listening' : 'Ask Nour AI';
  els.pillLabel.textContent = label;
  els.pillText.setAttribute('aria-label', `${label} — open text chat`);
  els.pillText.classList.toggle('is-active', !els.panel.hidden);
  els.pillVoice.classList.toggle('is-active', voiceIsActive());
  els.pillVoice.setAttribute('aria-label', voiceIsActive() ? 'Stop voice with AI Nour' : 'Start voice with AI Nour');
  requestAnimationFrame(positionPill);
}

function showGate(message = '') {
  if (!els.gate) return;
  els.gate.hidden = false;
  els.body.hidden = true;
  els.gateError.textContent = message;
  if (!els.panel.hidden) setTimeout(() => els.gateInput?.focus({ preventScroll: true }), 40);
}

function showBody() {
  els.gate.hidden = true;
  els.body.hidden = false;
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
  if (!state.ready && state.key) await init();
  if (!state.key) showGate();
  if (state.ready) setTimeout(() => els.input?.focus({ preventScroll: true }), 60);
  updateContext();
  clampPanel();
}

function closePanel() {
  // Closing the UI deliberately does NOT stop the voice session or the D1 session.
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
  if (!status) {
    els.contextLabel.innerHTML = 'Viewing <b>portfolio</b>';
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
    label = chapter ? `Journey · ${chapter.label}` : 'About Nour';
  } else if (status.context?.contact?.open) {
    label = 'Contact';
  }
  els.contextLabel.innerHTML = `Viewing <b>${escapeHtml(label)}</b>`;
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
      paused: state.presentation.paused
    }
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
      ? `Presentation: active${state.presentation.projectId ? ` in ${state.presentation.projectId}` : ''}${state.presentation.paused ? ' (paused)' : ''}`
      : 'Presentation: not active'
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
    hint.textContent = collapsed
      ? 'Ask Nour AI anything.'
      : 'Ask about Nour’s work, thinking, or this section. AI Nour can also open a project when you ask.';
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
  if (!action) return 'Navigation';
  if (action.type === 'openProject') return `Opened ${PROJECT_BY_ID[action.projectId]?.title || action.projectId}`;
  if (action.type === 'openProjectFlow') return `Opened ${PROJECT_BY_ID[action.projectId]?.title || action.projectId} flow`;
  if (action.type === 'openJourneyChapter') return `Opened ${CHAPTER_BY_ID[action.chapterId]?.label || action.chapterId}`;
  if (action.type === 'openContact') return 'Opened contact';
  if (action.type === 'navigate') return `Opened ${action.section}`;
  return action.route || action.type;
}

async function createSession() {
  const data = await api('/api/session', { method: 'POST', body: JSON.stringify({ locale: state.locale }) });
  state.sessionId = data.session.id;
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
  } catch (error) {
    if (String(error.message).includes('not found') || String(error.message).includes('expired')) {
      localStorage.removeItem(STORE.session);
      state.sessionId = null;
      await createSession();
    } else {
      throw error;
    }
  }
}

async function init() {
  if (!state.key) return showGate();
  try {
    state.meta = await api('/api/meta');
    showBody();
    await loadSession();
    state.ready = true;
    setState('idle');
    updateContext();
  } catch (error) {
    if (String(error.message).includes('unauthorized')) return;
    showGate(String(error.message || error));
  }
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.busy || !state.ready) return;
  const message = els.input.value.trim();
  if (!message) return;
  state.busy = true;
  els.send.disabled = true;
  els.input.value = '';
  els.input.style.height = '';
  addMessage('user', message);
  setState('processing');
  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        message,
        locale: state.locale,
        clientMessageId: randomId(12),
        portfolioContext: portfolioContext()
      })
    });
    state.sessionId = data.sessionId;
    localStorage.setItem(STORE.session, state.sessionId);
    addMessage('assistant', data.reply, data.actions || []);
    await runActions(data.actions || []);
    setState('idle');
    if (els.panel.hidden) {
      state.unread = true;
      updatePill();
    }
  } catch (error) {
    addMessage('system', `Could not answer: ${error.message || error}`);
    setState('error');
    setTimeout(() => setState('idle'), 1800);
  } finally {
    state.busy = false;
    els.send.disabled = false;
  }
}

async function runActions(actions) {
  const list = (actions || []).filter(Boolean);
  if (!list.length) return { ok: true, applied: [] };
  if (!voice.active) setState('processing');
  const applied = [];
  let failed = false;
  for (let index = 0; index < list.length; index++) {
    const action = list[index];
    const status = window.NourOS;
    if (!status) { failed = true; break; }
    if (action.type === 'presentationStart') {
      state.presentation = { active: true, projectId: action.projectId || null, nodeId: action.startNodeId || null, paused: false };
      continue;
    }
    if (action.type === 'presentationStep') {
      state.presentation = { ...state.presentation, active: true, projectId: action.projectId || state.presentation.projectId, nodeId: action.nodeId || null, paused: false };
      continue;
    }
    if (action.type === 'presentationPause') { state.presentation.paused = true; continue; }
    if (action.type === 'presentationResume') { state.presentation.paused = false; continue; }
    if (action.type === 'presentationEnd') {
      state.presentation = { active: false, projectId: null, nodeId: null, paused: false };
      continue;
    }
    aiNavUntil = Date.now() + 2500;
    queueAiRoute(action.route);
    try {
      if (action.type === 'navigate') { await status.navigateTo(action.section); applied.push(action); }
      else if (action.type === 'openProject') { await status.openProject(action.projectId); applied.push(action); }
      else if (action.type === 'openProjectFlow') {
        if (index > 0 && list[index - 1]?.type === 'openProject') await sleep(900);
        await status.openProjectFlow(action.projectId, action.nodeId || null);
        applied.push(action);
        if (state.presentation.active) state.presentation.nodeId = action.nodeId || null;
      } else if (action.type === 'openJourneyChapter') { await status.openJourneyChapter(action.chapterId); applied.push(action); }
      else if (action.type === 'openContact') { await status.openContact(); applied.push(action); }
    } catch (error) {
      failed = true;
      if (String(error?.code || error?.message || '').includes('BUSY')) {
        await sleep(900);
        try {
          if (action.type === 'openProject') { await status.openProject(action.projectId); applied.push(action); failed = false; }
          if (action.type === 'openProjectFlow') { await status.openProjectFlow(action.projectId, action.nodeId || null); applied.push(action); failed = false; }
        } catch {}
      }
    }
    if (index < list.length - 1) await sleep(250);
  }
  aiNavUntil = Date.now() + 2500;
  updateContext();
  sendLiveContextUpdate();
  if (!voice.active) setState('idle');
  return { ok: !failed, applied };
}

function onNourState(status) {
  const nextRoute = status?.route?.path || lastRoute;
  const routeChanged = Boolean(nextRoute && nextRoute !== lastRoute);
  const aiNavigation = routeChanged ? consumeAiRoute(nextRoute) : false;
  if (routeChanged && !aiNavigation) {
    expectedAiRoutes = [];
    if (state.presentation.active) {
      state.presentation = { active: false, projectId: null, nodeId: null, paused: false };
    }
  }
  updateContext();
  schedulePillPosition();
  if (routeChanged) sendLiveContextUpdate();
  lastRoute = nextRoute;
}

function toggleLocale() {
  state.locale = state.locale === 'fr' ? 'en' : 'fr';
  localStorage.setItem(STORE.locale, state.locale);
  setLocaleButton();
}

function setLocaleButton() {
  if (els.locale) els.locale.textContent = state.locale === 'fr' ? 'FR' : 'EN';
}

async function resetSession() {
  if (voice.active) await stopVoice();
  localStorage.removeItem(STORE.session);
  state.sessionId = null;
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
    console.warn('AI Nour voice turn could not be saved');
  }
  finalizeVoiceDrafts();
  voice.userText = '';
  voice.assistantText = '';
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
      responses.push({
        id: call.id,
        name: call.name,
        response: result.ok
          ? {
              ...(result.modelResponse || { ok: true }),
              ok: true,
              ...(routes.length ? { confirmed: applied?.ok === true, routes } : {})
            }
          : { ok: false, error: result.error?.code }
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
  if (!state.ready) {
    await openPanel();
    if (!state.ready) return;
  }
  openPanel();
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
        onerror: () => { stopVoice(); setState('error'); setTimeout(() => { if (state.voice === 'error') setState('idle'); }, 3000); },
        onclose: () => {
          if (voice.active) stopVoice();
        }
      }
    });
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
    setState('error');
    setTimeout(() => { if (state.voice === 'error') setState('idle'); }, 3000);
  }
}

async function stopVoice() {
  voice.active = false;
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
}
