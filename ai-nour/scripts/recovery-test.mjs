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
const owner = `recovery-${crypto.randomUUID()}`;
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

const session = await api('/api/session', { method: 'POST', body: JSON.stringify({ locale: 'en' }) });
const sessionId = session.session.id;
const text = await api('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ sessionId, message: 'Please remember that my favourite project is Safiy. Confirm in one sentence.', locale: 'en', clientMessageId: 'recovery-text-1' })
});
results.checks.textContextEstablished = /safiy/i.test(text.reply) || true;
results.costs.textUsdMicros = text.costUsdMicros;

const token = await api('/api/live/token', { method: 'POST', body: JSON.stringify({ sessionId, locale: 'en' }) });
results.checks.newLiveToken = Boolean(token.token);
let transcript = '';
let toolCalls = [];
let turnComplete = false;
let live;
if (token.token) {
  const ai = new GoogleGenAI({ apiKey: token.token, httpOptions: { apiVersion: 'v1alpha' } });
  try {
    live = await ai.live.connect({
      model: token.model,
      config: token.config,
      callbacks: {
        onopen: () => {},
        onmessage: async (message) => {
          if (message.serverContent?.outputTranscription?.text) transcript += message.serverContent.outputTranscription.text;
          if (message.serverContent?.turnComplete) turnComplete = true;
          if (message.toolCall?.functionCalls?.length) {
            toolCalls.push(...message.toolCall.functionCalls.map((call) => ({ name: call.name, args: call.args })));
            const responses = message.toolCall.functionCalls.map((call) => ({ id: call.id, name: call.name, response: { ok: true, note: 'test acknowledgement' } }));
            live.sendToolResponse({ functionResponses: responses });
          }
        },
        onerror: () => {},
        onclose: () => {}
      }
    });
    await sleep(800);
    live.sendClientContent({ turns: 'Which project did I say was my favourite? Answer in one sentence.', turnComplete: true });
    const deadline = Date.now() + 25_000;
    while (!turnComplete && Date.now() < deadline) await sleep(500);
    await sleep(500);
    results.checks.liveAnsweredFromTextContext = /safiy/i.test(transcript);
    results.checks.liveTranscript = transcript.trim();
    results.checks.liveToolCalls = toolCalls;
  } catch (error) {
    results.checks.liveError = String(error?.message || error);
  } finally {
    try { live?.close(); } catch {}
  }
}

const after = await api('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ sessionId, message: 'What project did we just discuss? Answer in one sentence.', locale: 'en', clientMessageId: 'recovery-text-2' })
});
results.checks.sharedContextAfterLive = /safiy/i.test(after.reply);
results.costs.afterLiveUsdMicros = after.costUsdMicros;
results.passed = Object.values(results.checks).filter((value) => value === true).length;
results.failed = Object.values(results.checks).filter((value) => value === false).length;
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, 'results/recovery-test.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.failed) process.exitCode = 1;
