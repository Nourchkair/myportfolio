import { AppError, budgetExhausted, liveSessionLimit } from '../http/errors.js';

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

export const LIVE_USAGE_LIMITS = {
  audioInputPerSecond: 40,
  audioOutputPerSecond: 60,
  textInputPerSecond: 60,
  thoughtsPerSecond: 60,
  tokenBuffer: 1000,
  textBuffer: 20000
};

export function boundLiveUsage(usage = {}, durationSeconds = 300) {
  const seconds = Math.max(60, Number(durationSeconds) || 300);
  const clamp = (value, perSecond, buffer) => Math.min(
    Math.max(0, Number(value) || 0),
    Math.ceil(seconds * perSecond) + buffer
  );
  const bound = {
    textInput: clamp(usage.textInput ?? usage.promptTextTokens, LIVE_USAGE_LIMITS.textInputPerSecond, LIVE_USAGE_LIMITS.textBuffer),
    audioInput: clamp(usage.audioInput ?? usage.promptAudioTokens, LIVE_USAGE_LIMITS.audioInputPerSecond, LIVE_USAGE_LIMITS.tokenBuffer),
    audioOutput: clamp(usage.audioOutput ?? usage.responseAudioTokens, LIVE_USAGE_LIMITS.audioOutputPerSecond, LIVE_USAGE_LIMITS.tokenBuffer),
    thoughtsTokenCount: clamp(usage.textOutput ?? usage.thoughtsTokens ?? usage.thoughtsTokenCount, LIVE_USAGE_LIMITS.thoughtsPerSecond, LIVE_USAGE_LIMITS.tokenBuffer)
  };
  const clamped = Number(usage.textInput ?? usage.promptTextTokens ?? 0) > bound.textInput
    || Number(usage.audioInput ?? usage.promptAudioTokens ?? 0) > bound.audioInput
    || Number(usage.audioOutput ?? usage.responseAudioTokens ?? 0) > bound.audioOutput
    || Number(usage.textOutput ?? usage.thoughtsTokens ?? usage.thoughtsTokenCount ?? 0) > bound.thoughtsTokenCount;
  return { usage: bound, clamped };
}

export function liveCostMicros(usage = {}, rates) {
  const textInput = Number(usage.textInput ?? usage.promptTextTokens ?? 0);
  const audioInput = Number(usage.audioInput ?? usage.promptAudioTokens ?? 0);
  const audioOutput = Number(usage.audioOutput ?? usage.responseAudioTokens ?? 0);
  const textOutput = Number(usage.textOutput ?? usage.thoughtsTokens ?? usage.thoughtsTokenCount ?? 0);
  return micros(textInput, rates.liveTextInputPerMillion)
    + micros(audioInput, rates.liveAudioInputPerMillion)
    + micros(audioOutput, rates.liveAudioOutputPerMillion)
    + micros(textOutput, rates.liveTextOutputPerMillion || 0);
}

export function createCostService({ db, config }) {
  async function budget(now = Date.now()) {
    const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
    const stored = async (key) => {
      if (typeof db.getControl !== 'function') return NaN;
      try { return Number(await db.getControl(key)); } catch { return NaN; }
    };
    const [dailySpent, cumulativeSpent, heldDaily, heldTotal, heldTextDaily, heldTextTotal, dailyCapStored, cumulativeCapStored] = await Promise.all([
      db.getCostSince(dayStart),
      db.getCostTotal(),
      db.sumHeldLiveTokens({ since: dayStart, now }),
      db.sumHeldLiveTokens({ since: 0, now }),
      typeof db.sumHeldSpendReservations === 'function' ? db.sumHeldSpendReservations({ since: dayStart }) : 0,
      typeof db.sumHeldSpendReservations === 'function' ? db.sumHeldSpendReservations({ since: 0 }) : 0,
      stored('daily_spend_cap_usd_micros'),
      stored('cumulative_spend_cap_usd_micros')
    ]);
    const dailyCap = Math.min(config.caps.dailyUsdMicros, Number.isFinite(dailyCapStored) && dailyCapStored > 0 ? dailyCapStored : config.caps.dailyUsdMicros);
    const cumulativeCap = Math.min(config.caps.cumulativeUsdMicros, Number.isFinite(cumulativeCapStored) && cumulativeCapStored > 0 ? cumulativeCapStored : config.caps.cumulativeUsdMicros);
    const heldReservations = heldDaily + heldTextDaily;
    const heldTotalReservations = heldTotal + heldTextTotal;
    const daily = dailySpent + heldReservations;
    const cumulative = cumulativeSpent + heldTotalReservations;
    const dailyRemaining = Math.max(0, dailyCap - daily);
    const cumulativeRemaining = Math.max(0, cumulativeCap - cumulative);
    return {
      dailyUsdMicros: daily,
      cumulativeUsdMicros: cumulative,
      dailySpentUsdMicros: dailySpent,
      cumulativeSpentUsdMicros: cumulativeSpent,
      heldLiveReservationsUsdMicros: heldDaily,
      heldSpendReservationsUsdMicros: heldTextDaily,
      heldReservationsUsdMicros: heldTotalReservations,
      dailyCapUsdMicros: dailyCap,
      cumulativeCapUsdMicros: cumulativeCap,
      dailyRemainingUsdMicros: dailyRemaining,
      cumulativeRemainingUsdMicros: cumulativeRemaining,
      allowed: daily < dailyCap && cumulative < cumulativeCap
    };
  }

  async function assertBudget(now = Date.now(), neededUsdMicros = 0) {
    const state = await budget(now);
    const scope = state.dailyRemainingUsdMicros < neededUsdMicros
      ? 'daily'
      : state.cumulativeRemainingUsdMicros < neededUsdMicros ? 'cumulative' : null;
    if (!state.allowed || scope) {
      const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
      const effectiveScope = scope || (state.cumulativeRemainingUsdMicros <= 0 ? 'cumulative' : 'daily');
      throw new AppError(402, 'BUDGET_EXCEEDED',
        effectiveScope === 'cumulative'
          ? 'The overall Nupa evaluation allowance has been used'
          : 'The remaining daily Nupa allowance is not enough for another request',
        { scope: effectiveScope, resetsAt: effectiveScope === 'cumulative' ? null : dayStart + 86_400_000 }
      );
    }
    return state;
  }

  async function reserveText({ ownerHash, sessionId = null, now = Date.now() }) {
    const state = await assertBudget(now, config.limits.textReservationUsdMicros);
    const id = crypto.randomUUID();
    const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
    const created = await db.createSpendReservation({
      id,
      kind: 'text',
      ownerHash,
      sessionId,
      reservedUsdMicros: config.limits.textReservationUsdMicros,
      now,
      expiresAt: now + config.limits.spendReservationHoldMs,
      dayStart,
      dailyCapUsdMicros: state.dailyCapUsdMicros,
      cumulativeCapUsdMicros: state.cumulativeCapUsdMicros
    });
    if (!created) {
      const after = await budget(now);
      throw budgetExhausted({
        scope: after.cumulativeRemainingUsdMicros < config.limits.textReservationUsdMicros ? 'cumulative' : 'daily',
        resetsAt: dayStart + 86_400_000,
        message: 'The remaining Nupa allowance cannot cover another text request'
      });
    }
    return { id, reservedUsdMicros: config.limits.textReservationUsdMicros };
  }

  async function reconcileText({ id, reportedUsdMicros = 0, now = Date.now() }) {
    if (!id) return false;
    return db.reconcileSpendReservation({ id, reportedUsdMicros, now });
  }

  async function failText({ id, now = Date.now() }) {
    if (!id) return false;
    return db.failSpendReservation({ id, now });
  }

  async function reserveLive({ ownerHash, sessionId, reservedUsdMicros, now = Date.now(), expiresAt }) {
    const state = await budget(now);
    const reservationId = crypto.randomUUID();
    const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
    const created = await db.createLiveTokenReservation({
      id: reservationId,
      ownerHash,
      sessionId,
      reservedUsdMicros,
      now,
      expiresAt,
      dayStart,
      dailyCapUsdMicros: state.dailyCapUsdMicros,
      cumulativeCapUsdMicros: state.cumulativeCapUsdMicros,
      maxConcurrent: config.limits.maxConcurrentLiveSessions,
      maxPerOwner: config.limits.maxLiveSessionsPerOwner
    });
    if (!created) {
      const [after, concurrent, ownerConcurrent] = await Promise.all([
        budget(now),
        db.countHeldLiveTokens({ now }),
        db.countHeldLiveTokensForOwner({ ownerHash, now })
      ]);
      if (concurrent >= config.limits.maxConcurrentLiveSessions || ownerConcurrent >= config.limits.maxLiveSessionsPerOwner) {
        throw liveSessionLimit('Another Nupa voice session is still active or cooling down. Text chat remains available; try voice again in a few minutes.');
      }
      throw budgetExhausted({
        scope: after.cumulativeRemainingUsdMicros < reservedUsdMicros ? 'cumulative' : 'daily',
        resetsAt: dayStart + 86_400_000,
        message: 'The remaining allowance cannot cover another Live voice session'
      });
    }
    return { ...state, reservationId };
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
      const reserved = Number(row.reserved_usd_micros || 0);
      const reported = Number(row.reported_usd_micros || 0);
      const amount = Math.max(0, reserved - reported);
      const changed = await db.markLiveTokenExpired({ id: row.id, now });
      if (!changed) continue;
      if (amount > 0) {
        await record({
          requestId: `live-settle:${row.id}`,
          model: config.liveModel || 'gemini-live',
          capability: 'live_unreported',
          inputTokens: 0,
          outputTokens: 0,
          usdMicros: amount,
          now
        });
        usdMicros += amount;
      }
      settled++;
    }
    return { settled, usdMicros };
  }

  async function settleExpiredTextReservations({ now = Date.now(), limit = 100 } = {}) {
    if (typeof db.listExpiredSpendReservations !== 'function') return { settled: 0, usdMicros: 0 };
    const rows = await db.listExpiredSpendReservations({ now, limit });
    let usdMicros = 0;
    let settled = 0;
    for (const row of rows) {
      const amount = Number(row.reserved_usd_micros || 0);
      const changed = await db.markSpendReservationExpired({ id: row.id, now });
      if (!changed) continue;
      await record({
        requestId: `text-settle:${row.id}`,
        model: config.textModel || 'gemini-text',
        capability: 'text_unreported',
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
    let reservation = null;
    if (reservationId) {
      reservation = await db.getLiveTokenReservation(reservationId);
      if (!reservation || reservation.owner_hash !== ownerHash || reservation.session_id !== sessionId) {
        throw new AppError(409, 'LIVE_RESERVATION_INVALID', 'The Live token reservation is invalid for this session');
      }
      if (reservation.status !== 'held') return 0;
    }
    const durationSeconds = reservation
      ? Math.max(60, (Number(reservation.expires_at || now) - Number(reservation.created_at || now)) / 1000)
      : 300;
    const bounded = boundLiveUsage(usage, durationSeconds);
    const actual = liveCostMicros(bounded.usage, config.rates);
    const inputTokens = bounded.usage.textInput + bounded.usage.audioInput;
    const outputTokens = bounded.usage.audioOutput + bounded.usage.thoughtsTokenCount;
    if (bounded.clamped) {
      await db.logEvent({
        level: 'warning',
        event: 'live.usage.clamped',
        detail: {
          reservationId,
          sessionId,
          durationSeconds,
          reported: {
            textInput: Number(usage.textInput ?? 0),
            audioInput: Number(usage.audioInput ?? 0),
            audioOutput: Number(usage.audioOutput ?? 0),
            thoughts: Number(usage.thoughtsTokenCount ?? 0)
          },
          accepted: bounded.usage
        },
        now
      }).catch(() => {});
    }
    if (reservation) {
      const added = await db.addLiveTokenReportedUsage({ id: reservationId, usdMicros: actual, now });
      if (!added) return 0;
    }
    await record({ requestId, model, capability, inputTokens, outputTokens, usdMicros: actual, now });
    return actual;
  }

  async function endLive({ reservationId, ownerHash, sessionId, now = Date.now() }) {
    if (!reservationId) return { released: false, unreportedUsdMicros: 0 };
    const reservation = await db.getLiveTokenReservation(reservationId);
    if (!reservation || reservation.owner_hash !== ownerHash || reservation.session_id !== sessionId) {
      throw new AppError(409, 'LIVE_RESERVATION_INVALID', 'The Live token reservation is invalid for this session');
    }
    if (reservation.status !== 'held') return { released: false, unreportedUsdMicros: 0 };
    const reserved = Number(reservation.reserved_usd_micros || 0);
    const reported = Number(reservation.reported_usd_micros || 0);
    const unreported = Math.max(0, reserved - reported);
    if (unreported > 0) {
      await record({
        requestId: `live-end:${reservationId}`,
        model: config.liveModel || 'gemini-live',
        capability: 'live_unreported',
        inputTokens: 0,
        outputTokens: 0,
        usdMicros: unreported,
        now
      });
    }
    await db.releaseLiveToken({ id: reservationId, now });
    return { ended: true, released: true, unreportedUsdMicros: unreported };
  }

  return {
    budget,
    assertBudget,
    reserveText,
    reconcileText,
    failText,
    reserveLive,
    record,
    recordText,
    recordLive,
    endLive,
    settleExpiredLiveTokens,
    settleExpiredTextReservations,
    textCostMicros: (usage) => textCostMicros(usage, config.rates),
    liveCostMicros: (usage) => liveCostMicros(usage, config.rates),
    list: (limit) => db.listCostEvents(limit)
  };
}
