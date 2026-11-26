import { PROJECT_BY_ID } from '../data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../data/journey.js';

const params = new URLSearchParams(location.search);
const DEV = params.get('ainour') === 'dev';
const API_BASE = (params.get('ainour-api') || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8789' : '')).replace(/\/+$/, '');
const CHAPTER_BY_ID = Object.fromEntries(PROFESSIONAL_CHAPTERS.map((chapter) => [chapter.id, chapter]));
const STORE = { key: 'ainour:key', owner: 'ainour:owner', session: 'ainour:session', locale: 'ainour:locale', pos: 'ainour:panelpos' };

const state = {
  key: sessionStorage.getItem(STORE.key) || '',
  owner: localStorage.getItem(STORE.owner) || randomId(48),
  sessionId: localStorage.getItem(STORE.session) || null,
  locale: localStorage.getItem(STORE.locale) || 'en',
  messages: [],
  meta: null,
  mode: 'text',
  size: 'standard',
  busy: false,
  thinking: false,
  unread: false,
  ready: false,
  mounted: false,
  voice: 'idle'
};

const voice = {
  active: false,
  session: null,
  mic: null,
  inputContext: null,
  outputContext: null,
  processor: null,
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
    showGate('The access key was not accepted. Enter the prototype key again.');
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
    <span class="ainour-pill-orb" aria-hidden="true"></span>
    <button type="button" data-ainour="mode-text" class="is-active">Text</button>
    <span class="ainour-pill-sep" aria-hidden="true"></span>
    <button type="button" data-ainour="mode-voice">Voice</button>
  `;
}

function panelMarkup() {
  return `
    <header class="ainour-head" data-drag-handle title="Drag to move">
      <div class="ainour-id">
        <span class="ainour-orb" aria-hidden="true"></span>
        <div><b>AI Nour</b><span>AI representation · not Nour</span></div>
      </div>
      <div class="ainour-head-actions">
        <button class="ainour-icon" type="button" data-ainour="minimize" aria-label="Minimize panel" title="Minimize">
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
    <div class="ainour-context" id="ainourContext">Reading portfolio</div>
    <div class="ainour-gate" id="ainourGate">
      <p>Enter the local prototype access key to talk with AI Nour. The key stays in this tab; the permanent Gemini key never reaches the browser.</p>
      <form id="ainourGateForm">
        <input id="ainourKey" type="password" autocomplete="off" placeholder="Prototype access key" aria-label="Prototype access key" required>
        <button type="submit">Open</button>
      </form>
      <p id="ainourGateError" role="status" aria-live="polite" style="color:rgba(255,180,180,.8);margin:10px 0 0;min-height:1em"></p>
    </div>
    <div class="ainour-body" id="ainourBody" hidden>
      <div class="ainour-live" id="ainourLive" hidden>
        <div class="ainour-orb-stage">
          <span class="ainour-orb-big" aria-hidden="true"></span>
          <b class="ainour-live-state" id="ainourLiveState">idle</b>
          <span class="ainour-live-hint" id="ainourLiveHint">Start a voice conversation; sessions are limited to about two minutes and the transcript stays in the chat.</span>
        </div>
        <div class="ainour-live-actions">
          <button class="ainour-start" type="button" data-ainour="start-voice">Start microphone</button>
          <button class="ainour-stop" type="button" data-ainour="stop-voice" hidden>Stop voice</button>
        </div>
      </div>
      <div class="ainour-thread" id="ainourThread" aria-live="polite"></div>
      <div class="ainour-thinking" id="ainourThinking" role="status" aria-live="polite" hidden><span class="ainour-thinking-dot" aria-hidden="true"></span>Thinking<span class="ainour-thinking-dots" aria-hidden="true">…</span></div>
      <form class="ainour-compose" id="ainourForm">
        <textarea id="ainourInput" rows="2" maxlength="2000" placeholder="Ask about Nour's work, or say “open Safiy”…" aria-label="Message AI Nour"></textarea>
        <div class="ainour-compose-actions">
          <button class="ainour-voice-btn" type="button" data-ainour="voice"><span class="ainour-mini-orb" aria-hidden="true"></span>Voice</button>
          <button class="ainour-send" id="ainourSend" type="submit">Send</button>
        </div>
      </form>
      <div class="ainour-foot">
        <span>AI representation · not the person</span>
        <span><button type="button" data-ainour="locale" id="ainourLocale">EN</button> · <button type="button" data-ainour="reset">New</button></span>
      </div>
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
  panel.dataset.mode = 'text';
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
    panel,
    context: panel.querySelector('#ainourContext'),
    gate: panel.querySelector('#ainourGate'),
    gateForm: panel.querySelector('#ainourGateForm'),
    gateInput: panel.querySelector('#ainourKey'),
    gateError: panel.querySelector('#ainourGateError'),
    body: panel.querySelector('#ainourBody'),
    live: panel.querySelector('#ainourLive'),
    liveState: panel.querySelector('#ainourLiveState'),
    liveHint: panel.querySelector('#ainourLiveHint'),
    liveStart: panel.querySelector('[data-ainour="start-voice"]'),
    liveStop: panel.querySelector('[data-ainour="stop-voice"]'),
    thread: panel.querySelector('#ainourThread'),
    thinking: panel.querySelector('#ainourThinking'),
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
      if (!els.panel.hidden && state.mode === 'text') closePanel();
      else openPanel('text');
    } else if (action === 'mode-voice') {
      if (!els.panel.hidden && state.mode === 'voice') closePanel();
      else openPanel('voice');
    }
  });
  panel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-ainour]')?.dataset.ainour;
    if (!action) return;
    if (action === 'close') closePanel();
    else if (action === 'minimize') setSize(state.size === 'mini' ? 'standard' : 'mini');
    else if (action === 'expand') setSize(state.size === 'expanded' ? 'standard' : 'expanded');
    else if (action === 'voice' || action === 'start-voice') {
      if (voice.active) openPanel('voice');
      else startVoice();
    } else if (action === 'stop-voice') stopVoice('Voice stopped.');
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
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
    }
  });
  window.addEventListener('resize', () => {
    if (els.panel.hidden) return;
    if (window.innerWidth <= 760) {
      els.panel.style.removeProperty('left');
      els.panel.style.removeProperty('top');
      els.panel.style.removeProperty('right');
      return;
    }
    applySavedPosition();
    clampPanel();
  });
  initDrag();

  setLocaleButton();
  setMode('text');
  setSize('standard');
  updateContext();
  updatePill();
  if (state.key) init();
  else showGate();

  if (DEV) {
    window.AINourPrototype = {
      open: (mode = state.mode) => openPanel(mode),
      close: closePanel,
      expand: () => setSize('expanded'),
      compact: () => setSize('standard'),
      minimize: () => setSize('mini'),
      voiceView: () => openPanel('voice'),
      startVoice,
      stopVoice,
      setVoiceState: (value, hint) => setLiveState(value, hint),
      thinking: (active) => showThinking(Boolean(active)),
      demoVoice: (userText, assistantText) => {
        openPanel('voice');
        voice.active = true;
        voice.userText = userText || '';
        voice.assistantText = assistantText || '';
        appendVoiceTranscript('user', voice.userText);
        appendVoiceTranscript('assistant', voice.assistantText);
        setLiveState('speaking', 'Speaking…');
      },
      state
    };
  }
}

function applySavedPosition() {
  if (window.innerWidth <= 760) return;
  try {
    const pos = JSON.parse(localStorage.getItem(STORE.pos) || 'null');
    if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
    els.panel.style.left = `${pos.left}px`;
    els.panel.style.top = `${pos.top}px`;
    els.panel.style.right = 'auto';
    clampPanel();
  } catch {}
}

function savePosition() {
  if (!els.panel || els.panel.hidden || window.innerWidth <= 760) return;
  const rect = els.panel.getBoundingClientRect();
  localStorage.setItem(STORE.pos, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
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
    savePosition();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function updatePill() {
  if (!els.pill) return;
  els.pill.dataset.state = state.voice;
  els.pill.dataset.live = voice.active ? 'true' : 'false';
  els.pill.dataset.unread = state.unread ? 'true' : 'false';
  els.pill.setAttribute('aria-expanded', String(!els.panel.hidden));
  els.pillText.classList.toggle('is-active', state.mode === 'text');
  els.pillVoice.classList.toggle('is-active', state.mode === 'voice');
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

async function openPanel(mode = state.mode) {
  state.unread = false;
  if (els.panel.hidden) {
    els.panel.hidden = false;
    applySavedPosition();
  }
  setMode(mode);
  setSize(state.size);
  updatePill();
  if (!state.ready && state.key) await init();
  if (!state.key) showGate();
  if (state.ready && mode === 'text') setTimeout(() => els.input?.focus({ preventScroll: true }), 60);
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

function setMode(mode) {
  state.mode = mode;
  els.panel.dataset.mode = mode;
  els.live.hidden = mode !== 'voice';
  if (mode === 'voice') renderLive();
  updatePill();
}

function setSize(size) {
  state.size = size;
  els.panel.dataset.size = size;
  const isMini = size === 'mini';
  const isExpanded = size === 'expanded';
  if (els.expand) els.expand.setAttribute('aria-label', isExpanded ? 'Restore panel size' : 'Expand panel');
  if (els.minimize) els.minimize.setAttribute('aria-label', isMini ? 'Restore panel size' : 'Minimize panel');
  requestAnimationFrame(clampPanel);
}

function setState(value) {
  state.voice = value;
  els.panel.dataset.state = value;
  updatePill();
}

function setLiveState(value, hint) {
  setState(value);
  if (!els.live) return;
  els.live.dataset.state = value;
  const labels = {
    idle: 'idle',
    connecting: 'connecting',
    listening: 'listening',
    processing: 'processing',
    speaking: 'speaking',
    error: 'error'
  };
  els.liveState.textContent = labels[value] || value;
  if (hint) els.liveHint.textContent = hint;
  els.liveStart.hidden = voice.active || value === 'connecting';
  els.liveStop.hidden = !voice.active && value !== 'connecting';
  renderLive();
}

function renderLive() {
  if (!els.live) return;
  els.live.hidden = state.mode !== 'voice';
  if (els.live.hidden) return;
  els.live.dataset.state = state.voice;
}

function showThinking(active) {
  state.thinking = active;
  if (!els.thinking) return;
  els.thinking.hidden = !active;
  els.panel.dataset.thinking = active ? 'true' : 'false';
}

function updateContext() {
  if (!els.context) return;
  const status = window.NourOS?.getStatus?.();
  if (!status) {
    els.context.textContent = 'Reading portfolio';
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
  els.context.innerHTML = `Viewing <b>${escapeHtml(label)}</b>`;
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
    view: project?.open ? 'project' : about?.open ? 'about' : status.context?.contact?.open ? 'contact' : 'portfolio'
  };
}

function addMessage(role, content, actions = []) {
  state.messages.push({ role, content, actions });
  renderThread();
}

function renderThread() {
  if (!els.thread) return;
  els.thread.textContent = '';
  if (!state.messages.length) {
    const hint = document.createElement('div');
    hint.className = 'ainour-msg system';
    hint.textContent = 'Ask about Nour’s work, thinking, or this section. AI Nour can also open a project when you ask.';
    els.thread.appendChild(hint);
    return;
  }
  for (const message of state.messages) {
    if (message.role === 'system') {
      const item = document.createElement('div');
      item.className = 'ainour-msg system';
      item.textContent = message.content;
      els.thread.appendChild(item);
      continue;
    }
    const item = document.createElement('div');
    item.className = `ainour-msg ${message.role}${message.streaming ? ' streaming' : ''}`;
    const label = document.createElement('span');
    label.className = 'ainour-msg-label';
    label.textContent = message.role === 'user' ? 'You' : 'AI Nour';
    const text = document.createElement('span');
    text.className = 'ainour-msg-text';
    text.textContent = message.content || '…';
    item.append(label, text);
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
  els.thread.scrollTop = els.thread.scrollHeight;
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
    setLiveState('idle', 'Start a voice conversation; sessions are limited to about two minutes and the transcript stays in the chat.');
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
  addMessage('user', message);
  setState('processing');
  showThinking(true);
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
    showThinking(false);
  }
}

async function runActions(actions) {
  const list = (actions || []).filter(Boolean);
  if (!list.length) return;
  if (!voice.active) setState('processing');
  for (let index = 0; index < list.length; index++) {
    const action = list[index];
    const status = window.NourOS;
    if (!status) break;
    aiNavUntil = Date.now() + 1700;
    try {
      if (action.type === 'navigate') await status.navigateTo(action.section);
      else if (action.type === 'openProject') await status.openProject(action.projectId);
      else if (action.type === 'openProjectFlow') {
        if (index > 0 && list[index - 1]?.type === 'openProject') await sleep(900);
        await status.openProjectFlow(action.projectId, action.nodeId || null);
      } else if (action.type === 'openJourneyChapter') await status.openJourneyChapter(action.chapterId);
      else if (action.type === 'openContact') await status.openContact();
    } catch (error) {
      if (String(error?.code || error?.message || '').includes('BUSY')) {
        await sleep(900);
        try {
          if (action.type === 'openProject') await status.openProject(action.projectId);
          if (action.type === 'openProjectFlow') await status.openProjectFlow(action.projectId, action.nodeId || null);
        } catch {}
      }
    }
    if (index < list.length - 1) await sleep(250);
  }
  aiNavUntil = Date.now() + 900;
  updateContext();
  if (!voice.active) setState('idle');
}

function onNourState(status) {
  updateContext();
  lastRoute = status?.route?.path || lastRoute;
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
  if (voice.active) await stopVoice('Voice stopped.');
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
    addMessage('system', 'Voice turn could not be saved; the transcript is still shown locally.');
  }
  finalizeVoiceDrafts();
  voice.userText = '';
  voice.assistantText = '';
  renderLive();
}

async function handleLiveTool(toolCall) {
  const calls = toolCall?.functionCalls || [];
  if (!calls.length) return;
  const responses = [];
  for (const call of calls) {
    try {
      const result = await api('/api/tools/execute', {
        method: 'POST',
        body: JSON.stringify({ sessionId: state.sessionId, name: call.name, args: call.args || {} })
      });
      if (result.ok) await runActions(result.actions || (result.action ? [result.action] : []));
      responses.push({
        id: call.id,
        name: call.name,
        response: result.ok
          ? { ok: true, routes: (result.actions || [result.action]).filter(Boolean).map((item) => item.route) }
          : { ok: false, error: result.error?.code }
      });
    } catch {
      responses.push({ id: call.id, name: call.name, response: { ok: false, error: 'TOOL_FAILED' } });
    }
  }
  voice.session?.sendToolResponse({ functionResponses: responses });
}

async function startVoice() {
  if (voice.active) {
    openPanel('voice');
    return;
  }
  if (!state.ready) {
    await openPanel('voice');
    if (!state.ready) return;
  }
  openPanel('voice');
  setLiveState('connecting', 'Requesting microphone and a one-use Live token (about two minutes)…');
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
        onopen: () => setLiveState('listening', 'Listening. Speak naturally; interrupt whenever you want.'),
        onmessage: async (message) => {
          if (message.setupComplete) setLiveState('listening', 'Listening. Speak naturally; interrupt whenever you want.');
          const activity = message.voiceActivity?.voiceActivityType || message.voiceActivity?.type;
          if (activity === 'START_OF_SPEECH') setLiveState('listening');
          else if (activity === 'END_OF_SPEECH') setLiveState('processing', 'Thinking…');
          if (message.serverContent?.interrupted) {
            stopPlayback();
            setLiveState('listening', 'Listening.');
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
              setLiveState('speaking', 'Speaking…');
            }
          }
          if (message.serverContent?.turnComplete) {
            setLiveState('listening', 'Listening.');
            await persistVoiceTurn();
            voice.turnId = randomId(12);
          }
          if (message.usageMetadata) voice.usage = message.usageMetadata;
          if (message.toolCall) await handleLiveTool(message.toolCall);
        },
        onerror: () => setLiveState('error', 'The Live connection failed. Try again.'),
        onclose: () => {
          if (voice.active) stopVoice('Live session ended. Start again when ready.');
        }
      }
    });
    const source = voice.inputContext.createMediaStreamSource(voice.mic);
    voice.processor = voice.inputContext.createScriptProcessor(4096, 1, 1);
    voice.processor.onaudioprocess = (event) => {
      if (!voice.session || !voice.active) return;
      const pcm16 = downsampleTo16k(event.inputBuffer.getChannelData(0), voice.inputContext.sampleRate);
      voice.session.sendRealtimeInput({ audio: { data: base64FromInt16(pcm16), mimeType: 'audio/pcm;rate=16000' } });
    };
    source.connect(voice.processor);
    const silent = voice.inputContext.createGain();
    silent.gain.value = 0;
    voice.processor.connect(silent);
    silent.connect(voice.inputContext.destination);
    setLiveState('listening', 'Listening. Speak naturally; interrupt whenever you want.');
  } catch (error) {
    await stopVoice('');
    setLiveState('error', 'Could not start voice. Check microphone permission and the local Worker.');
  }
}

async function stopVoice(message = '') {
  voice.active = false;
  if (voice.processor) { voice.processor.disconnect(); voice.processor = null; }
  if (voice.mic) { for (const track of voice.mic.getTracks()) track.stop(); voice.mic = null; }
  stopPlayback();
  if (voice.session) { try { voice.session.close(); } catch {} voice.session = null; }
  if (voice.inputContext) { try { await voice.inputContext.close(); } catch {} voice.inputContext = null; }
  if (voice.outputContext) { try { await voice.outputContext.close(); } catch {} voice.outputContext = null; }
  finalizeVoiceDrafts();
  voice.userText = '';
  voice.assistantText = '';
  setLiveState('idle', 'Voice is off. Use Start microphone to talk again.');
  if (message) addMessage('system', message);
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
