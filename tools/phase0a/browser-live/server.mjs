import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Modality } from '@google/genai';
import { loadEnv, requireEnv } from '../env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = requireEnv(loadEnv(), ['GEMINI_API_KEY', 'GEMINI_LIVE_MODEL']);
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
const facts = [
  "You are AI Nour, a concise, warm, commercially minded AI representation of Nour Chkair.",
  'Nour is based in Ottawa and works across commercial strategy, sales and technology.',
  'His public projects are Customer Acquisition, Dispatch, AI Customer Communications, B.R.A.I.N. and Safiy.',
  'Safiy is a contextual AI assistant that captures conversations and workplace knowledge.',
  "Speak in the first person about yourself and in the third person about Nour's actual experience.",
  'Do not invent facts. Keep spoken answers to one or two sentences. Respond in the language of the visitor.'
].join(' ');
const liveConfig = {
  responseModalities: [Modality.AUDIO],
  systemInstruction: facts,
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  tools: [{
    functionDeclarations: [{
      name: 'openProject',
      description: 'Open a public portfolio project by id.',
      parameters: {
        type: 'OBJECT',
        properties: { projectId: { type: 'STRING' } },
        required: ['projectId']
      }
    }]
  }]
};

async function mintToken() {
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 10 * 60_000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 2 * 60_000).toISOString(),
      liveConnectConstraints: { model: env.GEMINI_LIVE_MODEL, config: liveConfig }
    }
  });
  return token.name;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ ok: true, model: env.GEMINI_LIVE_MODEL }));
      return;
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      const token = await mintToken();
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ token, model: env.GEMINI_LIVE_MODEL, config: liveConfig }));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(fs.readFileSync(path.join(here, 'index.html')));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  } catch (error) {
    console.error('browser_live_error', String(error?.message || error).slice(0, 300));
    response.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: 'token_or_server_error' }));
  }
});

server.listen(8790, '127.0.0.1', () => {
  console.log('browser_live_ready http://localhost:8790');
  console.log('The permanent Gemini key stays in this process; the browser receives one-use tokens only.');
});
