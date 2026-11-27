import { ProviderError } from '../errors.js';

function usageSummary(metadata = {}) {
  const details = (items) => Object.fromEntries((items || []).map((item) => [String(item.modality || '').toLowerCase(), Number(item.tokenCount || 0)]));
  const promptDetails = details(metadata.promptTokensDetails);
  const responseDetails = details(metadata.responseTokensDetails);
  return {
    prompt: Number(metadata.promptTokenCount || 0),
    output: Number(metadata.candidatesTokenCount || 0),
    total: Number(metadata.totalTokenCount || 0),
    promptText: promptDetails.text || 0,
    promptAudio: promptDetails.audio || 0,
    outputAudio: responseDetails.audio || 0,
    promptDetails,
    responseDetails
  };
}

export function createGeminiTextProvider({
  apiKey,
  model,
  baseUrl = 'https://generativelanguage.googleapis.com',
  fetchImpl = fetch,
  timeoutMs = 30_000
}) {
  if (!apiKey) throw new Error('Gemini text provider requires an API key');

  async function callOnce(body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(
        `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
      if (!response.ok) {
        const status = response.status;
        throw new ProviderError(
          'GEMINI_TEXT_HTTP_ERROR',
          `Gemini text request failed with HTTP ${status}`,
          { status, retryable: status === 429 || status >= 500 }
        );
      }
      const candidate = json.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const outputText = parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('');
      const toolCalls = parts
        .filter((part) => part.functionCall)
        .map((part) => ({
          id: part.functionCall.id || null,
          name: part.functionCall.name,
          args: part.functionCall.args || {}
        }));
      return {
        text: outputText,
        parts,
        toolCalls,
        usage: usageSummary(json.usageMetadata),
        finishReason: candidate?.finishReason || null,
        model
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new ProviderError('GEMINI_TEXT_TIMEOUT', 'Gemini text request timed out', { status: 504, retryable: true });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function generate({ systemInstruction, contents, tools, temperature = 0.4, maxOutputTokens = 500 }) {
    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature,
        topP: 0.95,
        maxOutputTokens
      },
      ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {})
    };

    try {
      return await callOnce(body);
    } catch (error) {
      if (error instanceof ProviderError && error.retryable) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        return await callOnce(body);
      }
      throw error;
    }
  }

  return { name: 'gemini', model, generate };
}
