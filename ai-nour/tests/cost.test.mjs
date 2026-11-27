import test from 'node:test';
import assert from 'node:assert/strict';
import { textCostMicros, liveCostMicros, boundLiveUsage, createCostService } from '../src/cost/service.js';

const rates = {
  textInputPerMillion: 0.10,
  textOutputPerMillion: 0.40,
  liveTextInputPerMillion: 0.75,
  liveAudioInputPerMillion: 3.00,
  liveAudioOutputPerMillion: 12.00
};

test('text cost uses published per-million rates', () => {
  assert.equal(textCostMicros({ prompt: 1_000_000, output: 1_000_000 }, rates), 500_000);
  assert.equal(textCostMicros({ prompt: 1_000, output: 500 }, rates), 300);
});

test('live cost separates text input, audio input and audio output', () => {
  assert.equal(liveCostMicros({ textInput: 1_000_000, audioInput: 0, audioOutput: 0 }, rates), 750_000);
  assert.equal(liveCostMicros({ textInput: 0, audioInput: 1_000_000, audioOutput: 1_000_000 }, rates), 15_000_000);
});

test('Live usage is bounded by the session duration, not by the monetary reservation', () => {
  const normal = boundLiveUsage({ textInput: 1000, audioInput: 500, audioOutput: 1500, thoughtsTokenCount: 100 }, 60);
  assert.equal(normal.clamped, false);
  assert.equal(normal.usage.audioOutput, 1500);
  const absurd = boundLiveUsage({ textInput: 10_000_000, audioInput: 1_000_000, audioOutput: 1_000_000, thoughtsTokenCount: 1_000_000 }, 60);
  assert.equal(absurd.clamped, true);
  assert.equal(absurd.usage.audioInput, 40 * 60 + 1000);
  assert.equal(absurd.usage.audioOutput, 60 * 60 + 1000);
  assert.equal(absurd.usage.textInput, 60 * 60 + 20_000);
  assert.equal(absurd.usage.thoughtsTokenCount, 60 * 60 + 1000);
});

test('Live cost includes thinking/text output at the text output rate', () => {
  const ratesWithTextOutput = { ...rates, liveTextOutputPerMillion: 4.50 };
  assert.equal(liveCostMicros({ audioOutput: 56, thoughtsTokenCount: 62 }, ratesWithTextOutput), 672 + 279);
  assert.equal(liveCostMicros({ textInput: 100, thoughtsTokenCount: 10 }, ratesWithTextOutput), 75 + 45);
});

test('budget blocks when daily or cumulative caps are reached', async () => {
  const db = {
    getCostSince: async () => 1_000_000,
    getCostTotal: async () => 1_000_000,
    recordCost: async () => {},
    listCostEvents: async () => [],
    sumHeldLiveTokens: async () => 0
  };
  const config = { caps: { dailyUsdMicros: 1_000_000, cumulativeUsdMicros: 7_000_000 }, rates };
  const cost = createCostService({ db, config });
  await assert.rejects(() => cost.assertBudget(1000), (error) => error.code === 'BUDGET_EXCEEDED');
  const budget = await cost.budget(1000);
  assert.equal(budget.allowed, false);
  assert.equal(budget.dailyRemainingUsdMicros, 0);
});

test('cost service records text usage with a stable request id', async () => {
  const rows = [];
  const db = {
    getCostSince: async () => 0,
    getCostTotal: async () => 0,
    recordCost: async (row) => rows.push(row),
    listCostEvents: async () => [],
    sumHeldLiveTokens: async () => 0
  };
  const config = { caps: { dailyUsdMicros: 1_000_000, cumulativeUsdMicros: 7_000_000 }, rates };
  const cost = createCostService({ db, config });
  const micros = await cost.recordText({ requestId: 'req-1', model: 'mock', usage: { prompt: 1000, output: 500 } });
  assert.equal(micros, 300);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestId, 'req-1');
  assert.equal(rows[0].usdMicros, 300);
});


test('held Live reservations count toward the budget', async () => {
  const db = {
    getCostSince: async () => 0,
    getCostTotal: async () => 0,
    recordCost: async () => {},
    listCostEvents: async () => [],
    sumHeldLiveTokens: async ({ since }) => since > 0 ? 600_000 : 600_000
  };
  const config = { caps: { dailyUsdMicros: 1_000_000, cumulativeUsdMicros: 7_000_000 }, rates };
  const cost = createCostService({ db, config });
  const budget = await cost.budget(1000);
  assert.equal(budget.heldLiveReservationsUsdMicros, 600_000);
  assert.equal(budget.dailyUsdMicros, 600_000);
  assert.equal(budget.allowed, true);
});

test('expired Live reservations are charged as unreported usage and settled once', async () => {
  const events = [];
  const settled = new Set();
  const db = {
    getCostSince: async () => 0,
    getCostTotal: async () => 0,
    recordCost: async (row) => events.push(row),
    listCostEvents: async () => [],
    sumHeldLiveTokens: async () => 0,
    listExpiredLiveTokens: async () => [{ id: 'live-1', reserved_usd_micros: 80_000 }],
    markLiveTokenExpired: async ({ id }) => {
      if (settled.has(id)) return false;
      settled.add(id);
      return true;
    }
  };
  const config = {
    caps: { dailyUsdMicros: 1_000_000, cumulativeUsdMicros: 7_000_000 },
    rates,
    liveModel: 'gemini-3.8-live'
  };
  const cost = createCostService({ db, config });
  const first = await cost.settleExpiredLiveTokens({ now: 5000 });
  assert.equal(first.settled, 1);
  assert.equal(first.usdMicros, 80_000);
  assert.equal(events[0].capability, 'live_unreported');
  assert.equal(events[0].usdMicros, 80_000);
  const second = await cost.settleExpiredLiveTokens({ now: 6000 });
  assert.equal(second.settled, 0);
});
