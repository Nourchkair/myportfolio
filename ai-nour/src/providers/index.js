import { createGeminiTextProvider } from './text/gemini.js';
import { createMockTextProvider } from './text/mock.js';
import { createGeminiLiveProvider } from './live/gemini.js';
import { createMockLiveProvider } from './live/mock.js';

export function createTextProvider(config) {
  if (config.textProvider === 'mock') return createMockTextProvider({ model: config.textModel });
  if (config.textProvider === 'gemini') {
    return createGeminiTextProvider({
      apiKey: config.gemini.apiKey,
      model: config.textModel,
      baseUrl: config.gemini.baseUrl
    });
  }
  throw new Error(`Unsupported text provider: ${config.textProvider}`);
}

export function createLiveProvider(config) {
  if (config.liveProvider === 'mock') return createMockLiveProvider({ model: config.liveModel });
  if (config.liveProvider === 'gemini') {
    return createGeminiLiveProvider({
      apiKey: config.gemini.apiKey,
      model: config.liveModel,
      baseUrl: config.gemini.baseUrl
    });
  }
  throw new Error(`Unsupported live provider: ${config.liveProvider}`);
}
