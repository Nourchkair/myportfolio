import test from 'node:test';
import assert from 'node:assert/strict';
import { textCostMicros, liveCostMicros, createCostService } from '../src/cost/service.js';

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

test('budget blocks when daily or cumulative caps are reached', async () => {
  const db = {
    getCostSince: async () => 1_000_000,
    getCostTotal: async () => 1_000_000,
    recordCost: async () => {},
    listCostEvents: async () => []
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
    listCostEvents: async () => []
  };
  const config = { caps: { dailyUsdMicros: 1_000_000, cumulativeUsdMicros: 7_000_000 }, rates };
  const cost = createCostService({ db, config });
  const micros = await cost.recordText({ requestId: 'req-1', model: 'mock', usage: { prompt: 1000, output: 500 } });
  assert.equal(micros, 300);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestId, 'req-1');
  assert.equal(rows[0].usdMicros, 300);
});
