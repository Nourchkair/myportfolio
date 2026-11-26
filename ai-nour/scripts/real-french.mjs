import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const base = process.env.PHASE1_WORKER_URL || 'http://127.0.0.1:8789';
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const owner = `real-french-${crypto.randomUUID()}`;
const headers = { 'x-prototype-key': env.PROTOTYPE_ACCESS_KEY, 'x-owner-token': owner, 'content-type': 'application/json' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = { generatedAt: new Date().toISOString(), checks: {}, costs: {} };

async function api(pathname, options = {}) {
  const response = await fetch(base + pathname, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body;
}

const session = await api('/api/session', { method: 'POST', body: JSON.stringify({ locale: 'fr' }) });
const sessionId = session.session.id;
const chat = await api('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, message: 'Bonjour, que fait Safiy ? Réponds en une phrase.', locale: 'fr', clientMessageId: 'fr-chat-1' }) });
results.checks.frenchText = chat.locale === 'fr' && /safiy|assistant|conversation/i.test(chat.reply);
results.checks.frenchReply = chat.reply;
results.costs.textUsdMicros = chat.costUsdMicros;

const token = await api('/api/live/token', { method: 'POST', body: JSON.stringify({ sessionId, locale: 'fr' }) });
results.checks.frenchLiveToken = Boolean(token.token) && token.locale === 'fr';
let transcript = '';
let audioBytes = 0;
let usage = null;
let events = [];
let turnComplete = false;
let live;
if (token.token) {
  const ai = new GoogleGenAI({ apiKey: token.token, httpOptions: { apiVersion: 'v1alpha' } });
  try {
    live = await ai.live.connect({
      model: token.model,
      config: token.config,
      callbacks: {
        onopen: () => events.push('open'),
        onmessage: (message) => {
          if (message.setupComplete) events.push('setup');
          if (message.serverContent?.outputTranscription?.text) transcript += message.serverContent.outputTranscription.text;
          for (const part of message.serverContent?.modelTurn?.parts || []) if (part.inlineData?.data) audioBytes += Buffer.from(part.inlineData.data, 'base64').length;
          if (message.serverContent?.turnComplete) { turnComplete = true; events.push('turnComplete'); }
          if (message.usageMetadata) usage = message.usageMetadata;
        },
        onerror: (error) => events.push(`error:${error?.message || error}`),
        onclose: (close) => events.push(`close:${close?.code || ''}`)
      }
    });
    await sleep(800);
    live.sendClientContent({ turns: 'Bonjour, présente Safiy en une phrase.', turnComplete: true });
    const deadline = Date.now() + 25000;
    while (!turnComplete && Date.now() < deadline) await sleep(500);
    await sleep(800);
    results.checks.frenchLiveSetup = events.includes('setup');
    results.checks.frenchLiveAudio = audioBytes > 0;
    results.checks.frenchLiveTranscript = /safiy|assistant|conversation/i.test(transcript);
    results.live = { events, transcript: transcript.trim(), audioBytes, usage };
    const details = (items) => Object.fromEntries((items || []).map((item) => [String(item.modality || '').toLowerCase(), Number(item.tokenCount || 0)]));
    const prompt = details(usage?.promptTokensDetails);
    const response = details(usage?.responseTokensDetails);
    const turn = await api('/api/live/turn', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        turnId: `fr-live-${Date.now()}`,
        locale: 'fr',
        userText: 'Bonjour, présente Safiy en une phrase.',
        assistantText: transcript.trim(),
        usage: { textInput: prompt.text || 0, audioInput: prompt.audio || 0, audioOutput: response.audio || 0 }
      })
    });
    results.checks.frenchLiveTurnPersisted = turn.duplicate === false;
    results.costs.liveUsdMicros = turn.costUsdMicros;
  } catch (error) {
    results.checks.frenchLiveError = String(error?.message || error);
  } finally {
    try { live?.close(); } catch {}
  }
}

const view = await api(`/api/session/${encodeURIComponent(sessionId)}`);
results.checks.sharedFrenchContext = (view.session.messages || []).length >= 3;
results.passed = Object.values(results.checks).filter((value) => value === true).length;
results.failed = Object.values(results.checks).filter((value) => value === false).length;
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, 'results/real-french.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.failed) process.exitCode = 1;
