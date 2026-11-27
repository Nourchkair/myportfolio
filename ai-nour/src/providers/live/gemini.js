import { ProviderError } from '../errors.js';

function normalizeModel(model) {
  return String(model || '').replace(/^models\//, '');
}

export function createGeminiLiveProvider({
  apiKey,
  model,
  baseUrl = 'https://generativelanguage.googleapis.com',
  fetchImpl = fetch,
  timeoutMs = 20_000
}) {
  if (!apiKey) throw new Error('Gemini Live provider requires an API key');

  async function mintToken({
    systemInstruction,
    tools = [],
    voice = 'Aoede',
    uses = 1,
    expireMs = 10 * 60_000,
    newSessionExpireMs = 2 * 60_000
  }) {
    const now = Date.now();
    const body = {
      expireTime: new Date(now + expireMs).toISOString(),
      newSessionExpireTime: new Date(now + newSessionExpireMs).toISOString(),
      uses,
      bidiGenerateContentSetup: {
        model: `models/${normalizeModel(model)}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
          }
        },
        systemInstruction: { role: 'user', parts: [{ text: systemInstruction }] },
        tools: tools.length ? [{ functionDeclarations: tools }] : undefined,
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(
        `${baseUrl}/v1alpha/auth_tokens?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );
      const text = await response.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!response.ok || !json.name) {
        throw new ProviderError(
          'GEMINI_LIVE_TOKEN_ERROR',
          `Gemini Live token request failed with HTTP ${response.status}`,
          { status: response.status, retryable: response.status === 429 || response.status >= 500 }
        );
      }
      return {
        token: json.name,
        model: normalizeModel(model),
        expiresAt: new Date(now + expireMs).toISOString(),
        newSessionExpiresAt: new Date(now + newSessionExpireMs).toISOString()
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new ProviderError('GEMINI_LIVE_TIMEOUT', 'Gemini Live token request timed out', { status: 504, retryable: true });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return { name: 'gemini', model: normalizeModel(model), mintToken };
}
