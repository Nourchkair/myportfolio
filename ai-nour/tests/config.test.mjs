import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('production defaults use a fifteen-minute Live session and conservative reservation', () => {
  const config = loadConfig({
    APP_ENV: 'test',
    PROTOTYPE_ACCESS_KEY: 'test-key',
    ADMIN_TOKEN: 'test-admin',
    GEMINI_API_KEY: 'test-gemini',
    LIVE_SESSION_SECONDS: '900',
    MAX_LIVE_SESSION_SECONDS: '900',
    LIVE_TOKEN_RESERVATION_PER_MINUTE_USD_MICROS: '30000',
    LIVE_TOKEN_HOLD_SECONDS: '1200'
  });
  assert.equal(config.limits.liveSessionSeconds, 900);
  assert.equal(config.limits.maxLiveSessionSeconds, 900);
  assert.equal(config.limits.liveTokenReservationPerMinuteUsdMicros, 30000);
  assert.equal(config.limits.liveTokenHoldMs, 1_200_000);
});

test('daily Live-token limit treats zero as unlimited', () => {
  const config = loadConfig({
    APP_ENV: 'test',
    PROTOTYPE_ACCESS_KEY: 'test-key',
    ADMIN_TOKEN: 'test-admin',
    GEMINI_API_KEY: 'test-gemini',
    MAX_LIVE_TOKENS_PER_DAY: '0'
  });
  assert.equal(config.limits.maxLiveTokensPerDay, 0);
});
