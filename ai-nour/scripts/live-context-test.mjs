import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.dev.vars'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const base = process.env.PHASE1_WORKER_URL || 'http://127.0.0.1:8789';
const owner = `v2-live-context-${crypto.randomUUID()}`;
const headers = { 'x-prototype-key': env.PROTOTYPE_ACCESS_KEY, 'x-owner-token': owner, 'content-type': 'application/json' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

async function api(pathname, options = {}) {
  const response = await fetch(base + pathname, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body;
}

async function admin(pathname, method, body) {
  const response = await fetch(base + pathname, {
    method,
    headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const originalLimits = await admin('/api/admin/limits', 'GET');
await admin('/api/admin/limits', 'PATCH', { liveSessionSeconds: 120 });
const session = await api('/api/session', { method: 'POST', body: JSON.stringify({ locale: 'en' }) });
const sessionId = session.session.id;
const token = await api('/api/live/token', {
  method: 'POST',
  body: JSON.stringify({
    sessionId,
    locale: 'en',
    portfolioContext: {
      section: 'projects',
      projectId: 'acquisition',
      projectView: 'flow',
      nodeId: 'demo',
      route: '/projects/acquisition/flow/demo',
      view: 'project',
      navigationSource: 'visitor',
      presentation: { active: false }
    }
  })
});
check('short Live token minted for context test', Boolean(token.token) && token.sessionSeconds === 120, { sessionSeconds: token.sessionSeconds });

const events = [];
let transcript = '';
let audioBytes = 0;
let usageMetadata = null;
let responseDuringContextUpdate = false;
let live;
try {
  const ai = new GoogleGenAI({ apiKey: token.token, httpOptions: { apiVersion: 'v1alpha' } });
  live = await ai.live.connect({
    model: token.model,
    config: token.config,
    callbacks: {
      onopen: () => events.push('open'),
      onmessage: async (message) => {
        if (message.setupComplete) events.push('setup');
        if (message.serverContent?.inputTranscription?.text) transcript += `\nYou: ${message.serverContent.inputTranscription.text}`;
        if (message.serverContent?.outputTranscription?.text) {
          transcript += `\nAI Nour: ${message.serverContent.outputTranscription.text}`;
          responseDuringContextUpdate = responseDuringContextUpdate || !events.includes('user-question-sent');
        }
        for (const part of message.serverContent?.modelTurn?.parts || []) {
          if (part.inlineData?.data) {
            audioBytes += Buffer.from(part.inlineData.data, 'base64').length;
            responseDuringContextUpdate = responseDuringContextUpdate || !events.includes('user-question-sent');
          }
        }
        if (message.serverContent?.turnComplete) events.push('turnComplete');
        if (message.usageMetadata) usageMetadata = message.usageMetadata;
        if (message.toolCall?.functionCalls?.length) {
          events.push('toolCall');
          const responses = [];
          for (const call of message.toolCall.functionCalls) {
            const result = await api('/api/tools/execute', {
              method: 'POST',
              body: JSON.stringify({
                sessionId,
                name: call.name,
                args: call.args || {},
                portfolioContext: {
                  section: 'projects',
                  projectId: 'acquisition',
                  projectView: 'flow',
                  nodeId: 'demo',
                  route: '/projects/acquisition/flow/demo',
                  view: 'project'
                }
              })
            });
            responses.push({ id: call.id, name: call.name, response: result.modelResponse || { ok: result.ok } });
          }
          live.sendToolResponse({ functionResponses: responses });
        }
      },
      onerror: (error) => events.push(`error:${error?.message || error}`),
      onclose: (close) => events.push(`close:${close?.code || ''}`)
    }
  });
  await sleep(800);
  const contextText = [
    '[Context update — not a visitor message]',
    'Section: projects',
    'Project: Customer Acquisition (acquisition)',
    'Project view: flow',
    'Selected step: AI-powered demonstrations (demo)',
    'Route: /projects/acquisition/flow/demo',
    'Navigation source: visitor',
    'Presentation: not active'
  ].join('\n');
  live.sendClientContent({ turns: contextText, turnComplete: false });
  await sleep(1800);
  check('context update did not produce a spoken response', !responseDuringContextUpdate && audioBytes === 0, { responseDuringContextUpdate, audioBytes, events });
  events.push('user-question-sent');
  live.sendClientContent({ turns: 'What is this step, and how does it connect to the next one?', turnComplete: true });
  await sleep(12000);
  check('Live setup completed', events.includes('setup'), { events });
  check('context-aware answer produced audio', audioBytes > 0, { audioBytes });
  check('context-aware answer produced a transcript', transcript.trim().length > 0, { transcript: transcript.trim() });
  check('answer references the current step', /demonstration|demo|prospect|personalized|customi[sz]ed/i.test(transcript), { transcript: transcript.trim() });
} finally {
  try { live?.close(); } catch {}
  const usage = usageMetadata || {};
  const promptDetails = Object.fromEntries((usage.promptTokensDetails || []).map((item) => [String(item.modality || '').toLowerCase(), Number(item.tokenCount || 0)]));
  const responseDetails = Object.fromEntries((usage.responseTokensDetails || []).map((item) => [String(item.modality || '').toLowerCase(), Number(item.tokenCount || 0)]));
  const response = await api('/api/live/turn', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      turnId: `v2-live-context-${Date.now()}`,
      locale: 'en',
      userText: 'What is this step, and how does it connect to the next one?',
      assistantText: transcript.replace(/^AI Nour:\s*/gm, '').trim() || 'No transcript captured.',
      reservationId: token.reservationId,
      usage: {
        textInput: promptDetails.text || 0,
        audioInput: promptDetails.audio || 0,
        audioOutput: responseDetails.audio || 0
      }
    })
  });
  await admin('/api/admin/limits', 'PATCH', { liveSessionSeconds: originalLimits.body?.liveSessionSeconds || 600 });
  const output = {
    generatedAt: new Date().toISOString(),
    mode: 'real-gemini-live/context-update-and-page-awareness',
    sessionId,
    voice: token.config?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
    events,
    transcript: transcript.trim(),
    audioBytes,
    usage: usageMetadata,
    liveTurnCostUsdMicros: response.costUsdMicros,
    passed: results.filter((item) => item.pass).length,
    failed: results.filter((item) => !item.pass).length,
    total: results.length,
    results
  };
  fs.writeFileSync(path.join(root, 'results/v2-live-context.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  if (output.failed) process.exitCode = 1;
}
