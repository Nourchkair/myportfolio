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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const owner = `real-smoke-${crypto.randomUUID()}`;
const betaKey = process.env.AINOUR_BETA_KEY || env.PROTOTYPE_ACCESS_KEY;
const headers = { 'x-prototype-key': betaKey, 'x-owner-token': owner, 'content-type': 'application/json' };
const results = { generatedAt: new Date().toISOString(), model: 'gemini-3.8-live', checks: {}, usage: {}, costs: {} };

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
results.checks.session = Boolean(sessionId);

const chat = await api('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, message: 'What does Safiy do? Keep it to two sentences.', locale: 'en', clientMessageId: 'real-chat-1' }) });
results.checks.textChat = Boolean(chat.reply);
results.checks.textGrounded = /safiy/i.test(chat.reply);
results.costs.textChatUsdMicros = chat.costUsdMicros;
results.checks.textReply = chat.reply;

const toolChat = await api('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, message: 'Open the Safiy project in the portfolio.', locale: 'en', clientMessageId: 'real-chat-2' }) });
results.checks.toolNavigation = toolChat.actions?.some((action) => action.type === 'openProject' && action.projectId === 'safiy') || false;
results.checks.toolReply = toolChat.reply;
results.costs.toolChatUsdMicros = toolChat.costUsdMicros;

const liveToken = await api('/api/live/token', { method: 'POST', body: JSON.stringify({ sessionId, locale: 'en' }) });
results.checks.liveToken = Boolean(liveToken.token);
results.checks.liveConfigTools = Array.isArray(liveToken.config?.tools) && liveToken.config.tools[0]?.functionDeclarations?.length > 0;

let live = null;
let transcript = '';
let audioBytes = 0;
let toolCalls = [];
let usageMetadata = null;
let events = [];

function usageTotals(metadata) {
  const details = (items) => Object.fromEntries((items || []).map((item) => [String(item.modality || '').toLowerCase(), Number(item.tokenCount || 0)]));
  const prompt = details(metadata?.promptTokensDetails);
  const response = details(metadata?.responseTokensDetails);
  return { text: prompt.text || 0, audioIn: prompt.audio || 0, audioOut: response.audio || 0 };
}

let lastTotals = { text: 0, audioIn: 0, audioOut: 0 };
function usageDelta() {
  const current = usageTotals(usageMetadata);
  return {
    textInput: Math.max(0, current.text - lastTotals.text),
    audioInput: Math.max(0, current.audioIn - lastTotals.audioIn),
    audioOutput: Math.max(0, current.audioOut - lastTotals.audioOut)
  };
}

if (liveToken.token) {
  const ai = new GoogleGenAI({ apiKey: liveToken.token, httpOptions: { apiVersion: 'v1alpha' } });
  try {
    live = await ai.live.connect({
      model: liveToken.model,
      config: liveToken.config,
      callbacks: {
        onopen: () => events.push('open'),
        onmessage: async (message) => {
          if (message.setupComplete) events.push('setup');
          if (message.serverContent?.interrupted) events.push('interrupted');
          const input = message.serverContent?.inputTranscription?.text;
          const output = message.serverContent?.outputTranscription?.text;
          if (input) { transcript += `\nYou: ${input}`; events.push('input-transcript'); }
          if (output) { transcript += `\nNupa: ${output}`; events.push('output-transcript'); }
          for (const part of message.serverContent?.modelTurn?.parts || []) if (part.inlineData?.data) audioBytes += Buffer.from(part.inlineData.data, 'base64').length;
          if (message.serverContent?.turnComplete) events.push('turnComplete');
          if (message.usageMetadata) usageMetadata = message.usageMetadata;
          if (message.toolCall?.functionCalls?.length) {
            toolCalls.push(...message.toolCall.functionCalls.map((call) => ({ name: call.name, args: call.args })));
            events.push('toolCall');
            const responses = [];
            for (const call of message.toolCall.functionCalls) {
              try {
                const result = await api('/api/tools/execute', { method: 'POST', body: JSON.stringify({ sessionId, name: call.name, args: call.args || {} }) });
                responses.push({ id: call.id, name: call.name, response: result.ok ? { ok: true, route: result.action?.route } : { ok: false, error: result.error?.code } });
              } catch {
                responses.push({ id: call.id, name: call.name, response: { ok: false, error: 'TOOL_FAILED' } });
              }
            }
            live.sendToolResponse({ functionResponses: responses });
          }
        },
        onerror: (error) => events.push(`error:${error?.message || error}`),
        onclose: (close) => events.push(`close:${close?.code || ''}`)
      }
    });
    await sleep(800);
    live.sendClientContent({ turns: 'Open the Safiy project.', turnComplete: true });
    await sleep(14000);
    results.checks.liveSetup = events.includes('setup');
    results.checks.liveAudio = audioBytes > 0;
    results.checks.liveToolCall = toolCalls.some((call) => call.name === 'openProject');
    results.checks.liveTranscript = transcript.length > 0;
    results.live = { events, transcript: transcript.trim(), audioBytes, toolCalls, usage: usageMetadata };
    const usage = usageDelta();
    lastTotals = usageTotals(usageMetadata);
    const turn = await api('/api/live/turn', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        turnId: `real-live-${Date.now()}`,
        locale: 'en',
        userText: 'Open the Safiy project.',
        assistantText: transcript.replace(/^Nupa:\s*/gm, '').trim(),
        reservationId: liveToken.reservationId,
        usage
      })
    });
    results.checks.liveTurnPersisted = turn.duplicate === false;
    results.costs.liveTurnUsdMicros = turn.costUsdMicros;
  } catch (error) {
    results.checks.liveError = String(error?.message || error);
  } finally {
    try { live?.close(); } catch {}
  }
}

const view = await api(`/api/session/${encodeURIComponent(sessionId)}`);
results.checks.sharedContext = (view.session.messages || []).length >= 4;
results.session = { id: sessionId, messages: view.session.messages?.length || 0, summary: Boolean(view.session.summary) };
results.passed = Object.values(results.checks).filter((value) => value === true).length;
results.failed = Object.values(results.checks).filter((value) => value === false).length;
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, process.env.SMOKE_RESULT_FILE || 'results/real-smoke.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.failed) process.exitCode = 1;
