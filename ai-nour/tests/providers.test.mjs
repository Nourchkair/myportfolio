import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiTextProvider } from '../src/providers/text/gemini.js';
import { createGeminiLiveProvider } from '../src/providers/live/gemini.js';
import { createMockTextProvider } from '../src/providers/text/mock.js';

test('Gemini text adapter sends system, contents and tools and parses usage', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Grounded answer.' }, { functionCall: { name: 'openProject', args: { projectId: 'safiy' } } }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }] }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const provider = createGeminiTextProvider({ apiKey: 'fake-key', model: 'gemini-test', fetchImpl });
  const result = await provider.generate({
    systemInstruction: 'system',
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    tools: [{ name: 'openProject', description: 'open', parameters: { type: 'OBJECT', properties: {} } }]
  });
  assert.match(captured.url, /gemini-test:generateContent/);
  assert.equal(captured.body.systemInstruction.parts[0].text, 'system');
  assert.equal(captured.body.contents[0].parts[0].text, 'hello');
  assert.equal(captured.body.tools[0].functionDeclarations[0].name, 'openProject');
  assert.equal(result.text, 'Grounded answer.');
  assert.equal(result.toolCalls[0].name, 'openProject');
  assert.equal(result.usage.prompt, 100);
  assert.equal(result.usage.promptText, 100);
});

test('Gemini text adapter retries a retryable HTTP failure once', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: {} }), { status: 200 });
  };
  const provider = createGeminiTextProvider({ apiKey: 'fake-key', model: 'gemini-test', fetchImpl });
  const result = await provider.generate({ systemInstruction: 's', contents: [{ role: 'user', parts: [{ text: 'x' }] }] });
  assert.equal(calls, 2);
  assert.equal(result.text, 'ok');
});

test('Gemini Live adapter wraps tool declarations and uses the auth_tokens endpoint', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ name: 'auth_tokens/test-token' }), { status: 200 });
  };
  const provider = createGeminiLiveProvider({ apiKey: 'fake-key', model: 'gemini-3.8-live', fetchImpl });
  const result = await provider.mintToken({
    systemInstruction: 'system',
    tools: [{ name: 'openProject', description: 'open', parameters: { type: 'OBJECT', properties: {} } }],
    voice: 'Aoede'
  });
  assert.match(captured.url, /\/v1alpha\/auth_tokens/);
  assert.equal(captured.body.bidiGenerateContentSetup.model, 'models/gemini-3.8-live');
  assert.equal(captured.body.bidiGenerateContentSetup.tools[0].functionDeclarations[0].name, 'openProject');
  assert.equal(captured.body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Aoede');
  assert.equal(result.token, 'auth_tokens/test-token');
});

test('mock text provider returns deterministic grounded answers and a navigation call', async () => {
  const provider = createMockTextProvider();
  const normal = await provider.generate({ contents: [{ role: 'user', parts: [{ text: 'What does Safiy do?' }] }] });
  assert.match(normal.text, /Safiy/);
  const tool = await provider.generate({ contents: [{ role: 'user', parts: [{ text: 'Open the Safiy project' }] }] });
  assert.equal(tool.toolCalls[0].name, 'openProject');
  assert.equal(tool.toolCalls[0].args.projectId, 'safiy');
});
