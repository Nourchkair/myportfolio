import { AppError } from '../http/errors.js';

function micros(tokens, ratePerMillion) {
  const value = Number(tokens) || 0;
  if (value <= 0) return 0;
  return Math.ceil((value / 1_000_000) * ratePerMillion * 1_000_000);
}

export function textCostMicros(usage = {}, rates) {
  const input = Number(usage.prompt ?? usage.promptTokenCount ?? usage.inputTokens ?? 0);
  const output = Number(usage.output ?? usage.candidatesTokenCount ?? usage.outputTokens ?? 0);
  return micros(input, rates.textInputPerMillion) + micros(output, rates.textOutputPerMillion);
}

export function liveCostMicros(usage = {}, rates) {
  const textInput = Number(usage.textInput ?? usage.promptTextTokens ?? 0);
  const audioInput = Number(usage.audioInput ?? usage.promptAudioTokens ?? 0);
  const audioOutput = Number(usage.audioOutput ?? usage.responseAudioTokens ?? 0);
  return micros(textInput, rates.liveTextInputPerMillion)
    + micros(audioInput, rates.liveAudioInputPerMillion)
    + micros(audioOutput, rates.liveAudioOutputPerMillion);
}

export function createCostService({ db, config }) {
  async function budget(now = Date.now()) {
    const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
    const daily = await db.getCostSince(dayStart);
    const cumulative = await db.getCostTotal();
    const dailyRemaining = Math.max(0, config.caps.dailyUsdMicros - daily);
    const cumulativeRemaining = Math.max(0, config.caps.cumulativeUsdMicros - cumulative);
    return {
      dailyUsdMicros: daily,
      cumulativeUsdMicros: cumulative,
      dailyCapUsdMicros: config.caps.dailyUsdMicros,
      cumulativeCapUsdMicros: config.caps.cumulativeUsdMicros,
      dailyRemainingUsdMicros: dailyRemaining,
      cumulativeRemainingUsdMicros: cumulativeRemaining,
      allowed: daily < config.caps.dailyUsdMicros && cumulative < config.caps.cumulativeUsdMicros
    };
  }

  async function assertBudget(now = Date.now()) {
    const state = await budget(now);
    if (!state.allowed) {
      throw new AppError(402, 'BUDGET_EXCEEDED', 'The AI Nour evaluation budget has been reached', {
        dailyUsdMicros: state.dailyUsdMicros,
        dailyCapUsdMicros: state.dailyCapUsdMicros,
        cumulativeUsdMicros: state.cumulativeUsdMicros,
        cumulativeCapUsdMicros: state.cumulativeCapUsdMicros
      });
    }
    return state;
  }

  async function record({ requestId, provider = 'gemini', model, capability, inputTokens = 0, outputTokens = 0, usdMicros, now = Date.now() }) {
    if (!usdMicros || usdMicros <= 0) return 0;
    await db.recordCost({
      requestId,
      provider,
      model,
      capability,
      inputTokens,
      outputTokens,
      usdMicros,
      createdAt: now
    });
    return usdMicros;
  }

  async function recordText({ requestId, model, usage, capability = 'text_chat', now = Date.now() }) {
    const usdMicros = textCostMicros(usage, config.rates);
    const inputTokens = Number(usage.prompt ?? usage.promptTokenCount ?? 0);
    const outputTokens = Number(usage.output ?? usage.candidatesTokenCount ?? 0);
    await record({ requestId, model, capability, inputTokens, outputTokens, usdMicros, now });
    return usdMicros;
  }

  async function recordLive({ requestId, model, usage, capability = 'live_voice', now = Date.now() }) {
    const usdMicros = liveCostMicros(usage, config.rates);
    const inputTokens = Number(usage.textInput ?? 0) + Number(usage.audioInput ?? 0);
    const outputTokens = Number(usage.audioOutput ?? 0);
    await record({ requestId, model, capability, inputTokens, outputTokens, usdMicros, now });
    return usdMicros;
  }

  return {
    budget,
    assertBudget,
    record,
    recordText,
    recordLive,
    textCostMicros: (usage) => textCostMicros(usage, config.rates),
    liveCostMicros: (usage) => liveCostMicros(usage, config.rates),
    list: (limit) => db.listCostEvents(limit)
  };
}
