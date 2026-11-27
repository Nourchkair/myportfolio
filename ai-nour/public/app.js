import { GoogleGenAI } from '@google/genai';

const $ = (selector) => document.querySelector(selector);
const state = {
  accessKey: sessionStorage.getItem('ainour_access_key') || '',
  ownerToken: localStorage.getItem('ainour_owner') || randomId(48),
  sessionId: localStorage.getItem('ainour_session') || null,
  locale: localStorage.getItem('ainour_locale') || 'auto',
  messages: [],
  busy: false,
  meta: null,
  live: null,
  liveState: 'idle',
  liveUserText: '',
  liveAssistantText: '',
  liveUsage: null,
  lastUsageTotals: { text: 0, audioIn: 0, audioOut: 0 },
  turnId: null,
  reservationId: null,
  micStream: null,
  inputContext: null,
  outputContext: null,
  processor: null,
  sources: [],
  nextPlayTime: 0,
  running: false
};

localStorage.setItem('ainour_owner', state.ownerToken);

function randomId(bytes = 24) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function money(micros) {
  return `$${(Number(micros || 0) / 1_000_000).toFixed(4)}`;
}

function headers(extra = {}) {
  return {
    'x-prototype-key': state.accessKey,
    'x-owner-token': state.ownerToken,
    ...extra
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: headers({
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    })
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (response.status === 401) {
    showGate('The access key was not accepted. Enter the prototype key again.');
    throw new Error('unauthorized');
  }
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body;
}

function showGate(message = '') {
  $('#gate').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $('#gate-error').textContent = message;
}

function showApp() {
  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

function setPill(id, value, label = value) {
  const node = document.getElementById(id);
  node.className = `pill ${value}`;
  node.textContent = label;
}

function logActivity(text) {
  const node = $('#activity');
  const stamp = new Date().toLocaleTimeString();
  node.textContent = `[${stamp}] ${text}\n${node.textContent}`.slice(0, 8000);
}

function toast(text) {
  const node = $('#toast');
  node.textContent = text;
  node.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add('hidden'), 3200);
}

function updateBudget(budget) {
  if (!budget) return;
  $('#budget').textContent = `${money(budget.cumulativeUsdMicros)} USD cumulative / ${money(budget.cumulativeCapUsdMicros)} USD · ${money(budget.dailyUsdMicros)} USD today${budget.allowed ? '' : ' · BUDGET CAP REACHED'}`;
}

function addMessage(role, content) {
  state.messages.push({ role, content });
  renderMessages();
}

function renderMessages() {
  const node = $('#messages');
  node.textContent = '';
  for (const message of state.messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const item = document.createElement('div');
    item.className = `message ${message.role}`;
    item.textContent = message.content;
    node.appendChild(item);
  }
  node.scrollTop = node.scrollHeight;
}

function renderActions(actions) {
  const node = $('#actions');
  if (!actions?.length) {
    node.textContent = 'No navigation yet.';
    return;
  }
  node.textContent = '';
  for (const action of actions) {
    const item = document.createElement('div');
    item.className = 'action';
    const strong = document.createElement('strong');
    strong.textContent = action.type;
    item.append(strong, document.createTextNode(` → ${action.route || ''}`));
    if (action.projectId) item.append(document.createTextNode(` · ${action.projectId}`));
    if (action.chapterId) item.append(document.createTextNode(` · ${action.chapterId}`));
    node.appendChild(item);
  }
}

async function runNourOS(actions) {
  const nour = window.NourOS;
  for (const action of actions || []) {
    try {
      if (nour) {
        if (action.type === 'navigate' && typeof nour.navigateTo === 'function') await nour.navigateTo(action.section);
        else if (action.type === 'openProject' && typeof nour.openProject === 'function') await nour.openProject(action.projectId);
        else if (action.type === 'openProjectFlow' && typeof nour.openProjectFlow === 'function') await nour.openProjectFlow(action.projectId, action.nodeId);
        else if (action.type === 'openJourneyChapter' && typeof nour.openJourneyChapter === 'function') await nour.openJourneyChapter(action.chapterId);
        else if (action.type === 'openContact' && typeof nour.openContact === 'function') await nour.openContact();
        logActivity(`NourOS ${action.type} → ${action.route}`);
      } else {
        logActivity(`NourOS preview ${action.type} → ${action.route} (portfolio not embedded)`);
        const portfolio = new URLSearchParams(location.search).get('portfolio');
        if (portfolio) toast(`Opening ${portfolio}#${action.route}`);
      }
    } catch (error) {
      logActivity(`NourOS ${action.type} failed: ${error.message || error}`);
    }
  }
  renderActions(actions);
}

async function createSession() {
  const data = await api('/api/session', { method: 'POST', body: JSON.stringify({ locale: state.locale }) });
  state.sessionId = data.session.id;
  state.messages = [];
  localStorage.setItem('ainour_session', state.sessionId);
  renderMessages();
  $('#session-note').textContent = `New session · ${state.sessionId.slice(0, 8)}`;
}

async function loadSession() {
  if (!state.sessionId) return createSession();
  try {
    const data = await api(`/api/session/${encodeURIComponent(state.sessionId)}`);
    state.messages = data.session.messages || [];
    renderMessages();
    const summary = data.session.summary ? ' · summary restored' : '';
    $('#session-note').textContent = `Context restored · ${data.session.turnCount} turns${summary}`;
    if (data.session.summary) logActivity('Application-managed context summary restored.');
  } catch (error) {
    if (String(error.message).includes('not found') || String(error.message).includes('expired')) {
      localStorage.removeItem('ainour_session');
      state.sessionId = null;
      await createSession();
    } else {
      throw error;
    }
  }
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.busy) return;
  const input = $('#message');
  const message = input.value.trim();
  if (!message) return;
  state.busy = true;
  setPill('chat-state', 'processing', 'processing');
  addMessage('user', message);
  input.value = '';
  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        message,
        locale: state.locale,
        clientMessageId: randomId(12)
      })
    });
    state.sessionId = data.sessionId;
    localStorage.setItem('ainour_session', state.sessionId);
    addMessage('assistant', data.reply);
    renderActions(data.actions);
    await runNourOS(data.actions);
    updateBudget(data.budget);
    $('#chat-meta').textContent = `${data.usage.prompt + data.usage.output} tokens · ${money(data.costUsdMicros)} this turn · ${data.locale.toUpperCase()}`;
    setPill('chat-state', 'idle', 'ready');
  } catch (error) {
    addMessage('system', `Request failed: ${error.message || error}`);
    setPill('chat-state', 'error', 'error');
  } finally {
    state.busy = false;
  }
}

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
  for (const source of state.sources) {
    try { source.stop(); } catch {}
  }
  state.sources = [];
  state.nextPlayTime = 0;
}

function playAudio(base64) {
  if (!state.outputContext) return;
  const pcm = base64ToInt16(base64);
  const buffer = state.outputContext.createBuffer(1, pcm.length, 24000);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
  const source = state.outputContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.outputContext.destination);
  const now = state.outputContext.currentTime;
  if (state.nextPlayTime < now) state.nextPlayTime = now;
  source.start(state.nextPlayTime);
  state.nextPlayTime += buffer.duration;
  state.sources.push(source);
  source.onended = () => { state.sources = state.sources.filter((item) => item !== source); };
}

function appendLive(role, text) {
  if (!text) return;
  const node = $('#live-transcript');
  if (node.dataset.empty !== 'false') {
    node.textContent = '';
    node.dataset.empty = 'false';
  }
  node.textContent += `${role}: ${text}\n`;
  node.scrollTop = node.scrollHeight;
}

function usageTotals(metadata) {
  const details = (items) => Object.fromEntries((items || []).map((item) => [String(item.modality || '').toLowerCase(), Number(item.tokenCount || 0)]));
  const prompt = details(metadata?.promptTokensDetails);
  const response = details(metadata?.responseTokensDetails);
  return {
    text: prompt.text || 0,
    audioIn: prompt.audio || 0,
    audioOut: response.audio || 0
  };
}

function usageDelta() {
  if (!state.liveUsage) return null;
  const current = usageTotals(state.liveUsage);
  const previous = state.lastUsageTotals;
  const delta = {
    textInput: Math.max(0, current.text - previous.text),
    audioInput: Math.max(0, current.audioIn - previous.audioIn),
    audioOutput: Math.max(0, current.audioOut - previous.audioOut)
  };
  state.lastUsageTotals = current;
  return delta;
}

async function persistLiveTurn() {
  const userText = state.liveUserText.trim();
  const assistantText = state.liveAssistantText.trim();
  const usage = usageDelta();
  const turnId = state.turnId || randomId(12);
  state.turnId = null;
  if (!userText && !assistantText && !usage) return;
  try {
    const data = await api('/api/live/turn', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        turnId,
        reservationId: state.reservationId,
        locale: state.locale,
        userText: userText || (usage ? '[voice turn]' : ''),
        assistantText: assistantText || (usage ? '[voice response]' : ''),
        usage: usage || undefined
      })
    });
    updateBudget(data.budget);
    if (!data.duplicate) {
      if (userText) addMessage('user', userText);
      if (assistantText) addMessage('assistant', assistantText);
      logActivity(`Live turn persisted · ${money(data.costUsdMicros)}`);
    }
  } catch (error) {
    logActivity(`Live turn persistence failed: ${error.message || error}`);
  }
  state.liveUserText = '';
  state.liveAssistantText = '';
}

async function handleToolCall(session, message) {
  const calls = message.toolCall?.functionCalls || [];
  if (!calls.length) return;
  const responses = [];
  for (const call of calls) {
    logActivity(`Live tool call ${call.name} ${JSON.stringify(call.args || {})}`);
    try {
      const result = await api('/api/tools/execute', {
        method: 'POST',
        body: JSON.stringify({ sessionId: state.sessionId, name: call.name, args: call.args || {} })
      });
      if (result.ok) await runNourOS([result.action]);
      responses.push({
        id: call.id,
        name: call.name,
        response: result.ok ? { ok: true, route: result.action?.route || null } : { ok: false, error: result.error?.code }
      });
    } catch (error) {
      responses.push({ id: call.id, name: call.name, response: { ok: false, error: 'TOOL_FAILED' } });
    }
  }
  if (session && responses.length) session.sendToolResponse({ functionResponses: responses });
}

async function startVoice() {
  if (state.liveState !== 'idle' && state.liveState !== 'error') return;
  state.liveState = 'connecting';
  setPill('voice-state', 'connecting', 'connecting');
  $('#voice-start').disabled = true;
  $('#voice-stop').disabled = false;
  $('#live-transcript').textContent = '';
  $('#live-transcript').dataset.empty = 'true';
  state.lastUsageTotals = { text: 0, audioIn: 0, audioOut: 0 };
  state.liveUsage = null;
  state.liveUserText = '';
  state.liveAssistantText = '';
  state.turnId = randomId(12);

  try {
    const token = await api('/api/live/token', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.sessionId, locale: state.locale })
    });
    state.sessionId = token.sessionId;
    state.reservationId = token.reservationId;
    localStorage.setItem('ainour_session', state.sessionId);

    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    state.inputContext = new AudioContext();
    state.outputContext = new AudioContext({ sampleRate: 24000 });
    logActivity(`Microphone ${state.inputContext.sampleRate} Hz; Live token issued.`);

    const ai = new GoogleGenAI({ apiKey: token.token, httpOptions: { apiVersion: 'v1alpha' } });
    state.live = await ai.live.connect({
      model: token.model,
      config: token.config,
      callbacks: {
        onopen: () => {
          state.liveState = 'listening';
          setPill('voice-state', 'listening', 'listening');
          logActivity('Live socket open; setup complete.');
        },
        onmessage: async (message) => {
          if (message.setupComplete) logActivity('Live setup complete.');
          const activity = message.voiceActivity?.voiceActivityType || message.voiceActivity?.type;
          if (activity === 'START_OF_SPEECH') {
            state.liveState = 'listening';
            setPill('voice-state', 'listening', 'listening');
          } else if (activity === 'END_OF_SPEECH') {
            state.liveState = 'processing';
            setPill('voice-state', 'processing', 'processing');
          }
          if (message.serverContent?.interrupted) {
            stopPlayback();
            state.liveState = 'listening';
            setPill('voice-state', 'listening', 'listening');
            logActivity('interrupted=true; playback stopped.');
          }
          const inputText = message.serverContent?.inputTranscription?.text;
          if (inputText) {
            state.liveUserText += inputText;
            appendLive('You', inputText);
          }
          const outputText = message.serverContent?.outputTranscription?.text;
          if (outputText) {
            state.liveAssistantText += outputText;
            appendLive('AI Nour', outputText);
          }
          for (const part of message.serverContent?.modelTurn?.parts || []) {
            if (part.inlineData?.data) {
              playAudio(part.inlineData.data);
              state.liveState = 'speaking';
              setPill('voice-state', 'speaking', 'speaking');
            }
          }
          if (message.serverContent?.turnComplete) {
            state.liveState = 'listening';
            setPill('voice-state', 'listening', 'listening');
            await persistLiveTurn();
            state.turnId = randomId(12);
          }
          if (message.usageMetadata) state.liveUsage = message.usageMetadata;
          if (message.toolCall) await handleToolCall(state.live, message);
        },
        onerror: (error) => {
          state.liveState = 'error';
          setPill('voice-state', 'error', 'error');
          logActivity(`Live error: ${error?.message || error}`);
        },
        onclose: (close) => {
          state.liveState = 'idle';
          setPill('voice-state', 'idle', 'idle');
          logActivity(`Live closed ${close?.code || ''} ${close?.reason || ''}`);
        }
      }
    });

    const source = state.inputContext.createMediaStreamSource(state.micStream);
    state.processor = state.inputContext.createScriptProcessor(4096, 1, 1);
    state.processor.onaudioprocess = (event) => {
      if (!state.live || state.liveState === 'idle') return;
      const pcm16 = downsampleTo16k(event.inputBuffer.getChannelData(0), state.inputContext.sampleRate);
      state.live.sendRealtimeInput({ audio: { data: base64FromInt16(pcm16), mimeType: 'audio/pcm;rate=16000' } });
    };
    source.connect(state.processor);
    const silent = state.inputContext.createGain();
    silent.gain.value = 0;
    state.processor.connect(silent);
    silent.connect(state.inputContext.destination);
    state.running = true;
    state.liveState = 'listening';
    setPill('voice-state', 'listening', 'listening');
    logActivity('Streaming microphone at 16 kHz PCM.');
  } catch (error) {
    state.liveState = 'error';
    setPill('voice-state', 'error', 'error');
    logActivity(`Voice start failed: ${error.message || error}`);
    await stopVoice();
  }
}

async function stopVoice() {
  state.running = false;
  $('#voice-start').disabled = false;
  $('#voice-stop').disabled = true;
  if (state.processor) { state.processor.disconnect(); state.processor = null; }
  if (state.micStream) { for (const track of state.micStream.getTracks()) track.stop(); state.micStream = null; }
  stopPlayback();
  if (state.live) { try { state.live.close(); } catch {} state.live = null; }
  if (state.inputContext) { await state.inputContext.close(); state.inputContext = null; }
  if (state.outputContext) { await state.outputContext.close(); state.outputContext = null; }
  state.liveState = 'idle';
  setPill('voice-state', 'idle', 'idle');
  logActivity('Voice session stopped.');
}

async function init() {
  if (!state.accessKey) return showGate();
  try {
    state.meta = await api('/api/meta');
    showApp();
    $('#locale').value = state.locale;
    $('#session-note').textContent = `Corpus ${state.meta.corpus.chunks} chunks · ${state.meta.models.live}`;
    await loadSession();
    setPill('chat-state', 'idle', 'ready');
    setPill('voice-state', 'idle', 'idle');
    logActivity(`Meta loaded · ${state.meta.models.text} / ${state.meta.models.live}`);
  } catch (error) {
    if (String(error.message).includes('unauthorized')) return;
    showGate(`Could not open the prototype: ${error.message || error}`);
  }
}

$('#gate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.accessKey = $('#access-key').value.trim();
  sessionStorage.setItem('ainour_access_key', state.accessKey);
  await init();
});

$('#composer').addEventListener('submit', sendMessage);
$('#message').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('#composer').requestSubmit();
  }
});
$('#voice-start').addEventListener('click', startVoice);
$('#voice-stop').addEventListener('click', stopVoice);
$('#locale').addEventListener('change', () => {
  state.locale = $('#locale').value;
  localStorage.setItem('ainour_locale', state.locale);
  logActivity(`Locale set to ${state.locale}.`);
});
$('#reset').addEventListener('click', async () => {
  await stopVoice().catch(() => {});
  localStorage.removeItem('ainour_session');
  state.sessionId = null;
  state.messages = [];
  renderMessages();
  renderActions([]);
  await createSession();
  logActivity('New session created.');
});

init();
