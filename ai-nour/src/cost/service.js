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
    const stored = async (key) => {
      if (typeof db.getControl !== 'function') return NaN;
      try { return Number(await db.getControl(key)); } catch { return NaN; }
    };
    const [dailySpent, cumulativeSpent, heldDaily, heldTotal, dailyCapStored, cumulativeCapStored] = await Promise.all([
      db.getCostSince(dayStart),
      db.getCostTotal(),
      db.sumHeldLiveTokens({ since: dayStart, now }),
      db.sumHeldLiveTokens({ since: 0, now }),
      stored('daily_spend_cap_usd_micros'),
      stored('cumulative_spend_cap_usd_micros')
    ]);
    const dailyCap = Math.min(config.caps.dailyUsdMicros, Number.isFinite(dailyCapStored) && dailyCapStored > 0 ? dailyCapStored : config.caps.dailyUsdMicros);
    const cumulativeCap = Math.min(config.caps.cumulativeUsdMicros, Number.isFinite(cumulativeCapStored) && cumulativeCapStored > 0 ? cumulativeCapStored : config.caps.cumulativeUsdMicros);
    const daily = dailySpent + heldDaily;
    const cumulative = cumulativeSpent + heldTotal;
    const dailyRemaining = Math.max(0, dailyCap - daily);
    const cumulativeRemaining = Math.max(0, cumulativeCap - cumulative);
    return {
      dailyUsdMicros: daily,
      cumulativeUsdMicros: cumulative,
      dailySpentUsdMicros: dailySpent,
      cumulativeSpentUsdMicros: cumulativeSpent,
      heldLiveReservationsUsdMicros: heldTotal,
      dailyCapUsdMicros: dailyCap,
      cumulativeCapUsdMicros: cumulativeCap,
      dailyRemainingUsdMicros: dailyRemaining,
      cumulativeRemainingUsdMicros: cumulativeRemaining,
      allowed: daily < dailyCap && cumulative < cumulativeCap
    };
  }

  async function assertBudget(now = Date.now()) {
    const state = await budget(now);
    if (!state.allowed) {
      throw new AppError(402, 'BUDGET_EXCEEDED', 'The Nupa evaluation budget has been reached', {
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

  async function settleExpiredLiveTokens({ now = Date.now(), limit = 100 } = {}) {
    if (typeof db.listExpiredLiveTokens !== 'function') return { settled: 0, usdMicros: 0 };
    const rows = await db.listExpiredLiveTokens({ now, limit });
    let usdMicros = 0;
    let settled = 0;
    for (const row of rows) {
      const amount = Number(row.reserved_usd_micros || 0);
      const changed = await db.markLiveTokenExpired({ id: row.id, now });
      if (!changed) continue;
      await record({
        requestId: `live-settle:${row.id}`,
        model: config.liveModel || 'gemini-live',
        capability: 'live_unreported',
        inputTokens: 0,
        outputTokens: 0,
        usdMicros: amount,
        now
      });
      settled++;
      usdMicros += amount;
    }
    return { settled, usdMicros };
  }

  async function recordLive({ requestId, model, usage, capability = 'live_voice', now = Date.now(), reservationId = null, ownerHash = null, sessionId = null }) {
    const actual = liveCostMicros(usage, config.rates);
    const inputTokens = Number(usage.textInput ?? 0) + Number(usage.audioInput ?? 0);
    const outputTokens = Number(usage.audioOutput ?? 0);
    let charge = actual;
    if (reservationId) {
      const reservation = await db.getLiveTokenReservation(reservationId);
      if (!reservation || reservation.owner_hash !== ownerHash || reservation.session_id !== sessionId) {
        throw new AppError(409, 'LIVE_RESERVATION_INVALID', 'The Live token reservation is invalid for this session');
      }
      if (reservation.status !== 'held') return 0;
      charge = Math.max(actual, Number(reservation.reserved_usd_micros || 0));
      const reconciled = await db.reconcileLiveToken({ id: reservationId, reportedUsdMicros: actual, now });
      if (!reconciled) return 0;
    }
    await record({ requestId, model, capability, inputTokens, outputTokens, usdMicros: charge, now });
    return charge;
  }

  return {
    budget,
    assertBudget,
    record,
    recordText,
    recordLive,
    settleExpiredLiveTokens,
    textCostMicros: (usage) => textCostMicros(usage, config.rates),
    liveCostMicros: (usage) => liveCostMicros(usage, config.rates),
    list: (limit) => db.listCostEvents(limit)
  };
}
