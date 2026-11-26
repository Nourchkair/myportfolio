import { PROJECT_BY_ID } from '../data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../data/journey.js';

const params = new URLSearchParams(location.search);
const DEV = params.get('ainour') === 'dev';
const API_BASE = (params.get('ainour-api') || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8789' : '')).replace(/\/+$/, '');
const CHAPTER_BY_ID = Object.fromEntries(PROFESSIONAL_CHAPTERS.map((chapter) => [chapter.id, chapter]));
const STORE = { key: 'ainour:key', owner: 'ainour:owner', session: 'ainour:session', locale: 'ainour:locale' };

const state = {
  key: sessionStorage.getItem(STORE.key) || '',
  owner: localStorage.getItem(STORE.owner) || randomId(48),
  sessionId: localStorage.getItem(STORE.session) || null,
  locale: localStorage.getItem(STORE.locale) || 'en',
  messages: [],
  meta: null,
  view: 'compact',
  busy: false,
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
  turnId: null,
  reservationId: null
};

let els = {};
let nour = null;
let lastRoute = null;
let aiNavUntil = 0;
let mounted = false;

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

function panelMarkup() {
  return `
    <header class="ainour-head">
      <div class="ainour-id">
        <span class="ainour-orb" aria-hidden="true"></span>
        <div><b>AI Nour</b><span>AI representation · not Nour</span></div>
      </div>
      <div class="ainour-head-actions">
        <button class="ainour-icon" type="button" data-ainour="expand" aria-label="Expand conversation" title="Expand">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2H2v4M10 14h4v-4M14 6V2h-4M2 10v4h4"/></svg>
        </button>
        <button class="ainour-icon" type="button" data-ainour="close" aria-label="Close AI Nour" title="Close">
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
          <span class="ainour-live-hint" id="ainourLiveHint">Start a voice conversation, or type below.</span>
        </div>
        <div class="ainour-live-transcript" id="ainourLiveTranscript" aria-live="polite"></div>
        <div class="ainour-live-actions">
          <button class="ainour-stop" type="button" data-ainour="stop-voice">Stop voice</button>
        </div>
      </div>
      <div class="ainour-thread" id="ainourThread" aria-live="polite"></div>
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

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tb-read ainour-trigger';
  trigger.id = 'ainourTrigger';
  trigger.setAttribute('aria-label', 'Ask AI Nour');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<span class="ainour-orb" aria-hidden="true"></span><span>AI Nour</span>';
  const readButton = document.getElementById('readViewBtn');
  if (readButton?.parentElement) readButton.insertAdjacentElement('afterend', trigger);
  else document.getElementById('toolbar')?.appendChild(trigger);

  const panel = document.createElement('section');
  panel.className = 'ainour-panel';
  panel.id = 'ainourPanel';
  panel.dataset.view = 'compact';
  panel.dataset.state = 'idle';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'AI Nour companion');
  panel.hidden = true;
  panel.innerHTML = panelMarkup();
  document.body.appendChild(panel);

  els = {
    trigger,
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
    liveTranscript: panel.querySelector('#ainourLiveTranscript'),
    thread: panel.querySelector('#ainourThread'),
    form: panel.querySelector('#ainourForm'),
    input: panel.querySelector('#ainourInput'),
    send: panel.querySelector('#ainourSend'),
    locale: panel.querySelector('#ainourLocale')
  };

  trigger.addEventListener('click', () => {
    if (els.panel.hidden) open();
    else close();
  });
  panel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-ainour]')?.dataset.ainour;
    if (!action) return;
    if (action === 'close') close();
    else if (action === 'expand') setView(state.view === 'expanded' ? 'compact' : 'expanded');
    else if (action === 'voice') startVoice();
    else if (action === 'stop-voice') stopVoice('Voice stopped.');
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
      close();
    }
  });

  setLocaleButton();
  updateContext();
  if (state.key) init();
  else showGate();

  if (DEV) {
    window.AINourPrototype = {
      open,
      close,
      expand: () => setView('expanded'),
      compact: () => setView('compact'),
      voiceView: () => setView('voice'),
      startVoice,
      stopVoice,
      setVoiceState: (value, hint) => setLiveState(value, hint),
      demoVoice: (userText, assistantText) => {
        voice.userText = userText || '';
        voice.assistantText = assistantText || '';
        setView('voice');
        setLiveState('speaking', 'Speaking…');
        renderLive();
      },
      state
    };
  }
}

function showGate(message = '') {
  els.gate.hidden = false;
  els.body.hidden = true;
  els.gateError.textContent = message;
  if (!els.panel.hidden) setTimeout(() => els.gateInput?.focus({ preventScroll: true }), 40);
}

function showBody() {
  els.gate.hidden = true;
  els.body.hidden = false;
}

async function open() {
  if (els.panel.hidden) {
    els.panel.hidden = false;
    els.trigger.setAttribute('aria-expanded', 'true');
    setView(state.view === 'voice' ? 'voice' : 'compact');
  }
  if (!state.ready && state.key) await init();
  if (!state.key) showGate();
  if (state.ready) setTimeout(() => els.input?.focus({ preventScroll: true }), 60);
  updateContext();
}

function close() {
  if (voice.active) stopVoice('Voice stopped.');
  els.panel.hidden = true;
  els.trigger.setAttribute('aria-expanded', 'false');
  els.trigger.focus({ preventScroll: true });
}

function setView(view) {
  state.view = view;
  els.panel.dataset.view = view;
  const expand = els.panel.querySelector('[data-ainour="expand"]');
  if (expand) expand.setAttribute('aria-label', view === 'expanded' ? 'Collapse conversation' : 'Expand conversation');
  if (view === 'voice') {
    els.live.hidden = false;
    renderLive();
  } else {
    els.live.hidden = true;
  }
}

function setState(value) {
  state.voice = value;
  els.panel.dataset.state = value;
  els.trigger.dataset.state = value;
}

function setLiveState(value, hint) {
  setState(value);
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
  renderLive();
}

function renderLive() {
  if (!els.live) return;
  els.live.hidden = state.view !== 'voice';
  if (els.live.hidden) return;
  els.live.dataset.state = state.voice;
  els.liveTranscript.textContent = voice.userText || voice.assistantText
    ? `${voice.userText ? `You: ${voice.userText}\n` : ''}${voice.assistantText ? `AI Nour: ${voice.assistantText}` : ''}`.trim()
    : 'Voice transcript will appear here.';
  els.liveTranscript.scrollTop = els.liveTranscript.scrollHeight;
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
    item.className = `ainour-msg ${message.role}`;
    const label = document.createElement('span');
    label.className = 'ainour-msg-label';
    label.textContent = message.role === 'user' ? 'You' : 'AI Nour';
    const text = document.createElement('span');
    text.textContent = message.content;
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
    setLiveState('idle', 'Start a voice conversation, or type below.');
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
  } catch (error) {
    addMessage('system', `Could not answer: ${error.message || error}`);
    setState('error');
    setTimeout(() => setState('idle'), 1800);
  } finally {
    state.busy = false;
    els.send.disabled = false;
  }
}

async function runActions(actions, { collapse = true } = {}) {
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
  if (collapse && !voice.active) setView('compact');
  if (!voice.active) setState('idle');
}

function onNourState(status) {
  const path = status?.route?.path || null;
  updateContext();
  if (lastRoute && path && path !== lastRoute) {
    if (Date.now() < aiNavUntil) {
      aiNavUntil = 0;
    } else if (!els.panel.hidden) {
      if (voice.active) stopVoice('Voice stopped because you navigated.');
      if (state.view === 'expanded' || state.view === 'voice') setView('compact');
    }
  }
  lastRoute = path;
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
    if (userText) addMessage('user', userText);
    if (assistantText) addMessage('assistant', assistantText);
  } catch {
    voice.lastTotals = usageTotals(voice.usage);
  }
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
      if (result.ok) await runActions(result.actions || (result.action ? [result.action] : []), { collapse: false });
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
  if (voice.active) return stopVoice('Voice stopped.');
  if (!state.ready) {
    await open();
    if (!state.ready) return;
  }
  setView('voice');
  setLiveState('connecting', 'Requesting microphone and a one-use Live token…');
  voice.turnId = randomId(12);
  voice.lastTotals = { text: 0, audioIn: 0, audioOut: 0 };
  voice.usage = null;
  voice.userText = '';
  voice.assistantText = '';
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
            renderLive();
          }
          if (message.serverContent?.outputTranscription?.text) {
            voice.assistantText += message.serverContent.outputTranscription.text;
            renderLive();
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
          if (voice.active) setLiveState('idle', 'Voice session ended. Start again when ready.');
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
    setLiveState('error', 'Could not start voice. Check microphone permission and the local Worker.');
    await stopVoice('');
  }
}

async function stopVoice(message = '') {
  const wasActive = voice.active;
  voice.active = false;
  if (voice.processor) { voice.processor.disconnect(); voice.processor = null; }
  if (voice.mic) { for (const track of voice.mic.getTracks()) track.stop(); voice.mic = null; }
  stopPlayback();
  if (voice.session) { try { voice.session.close(); } catch {} voice.session = null; }
  if (voice.inputContext) { try { await voice.inputContext.close(); } catch {} voice.inputContext = null; }
  if (voice.outputContext) { try { await voice.outputContext.close(); } catch {} voice.outputContext = null; }
  setLiveState('idle', 'Voice is off. Use Voice to start again.');
  if (wasActive) setView('compact');
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
