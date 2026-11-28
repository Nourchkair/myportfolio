import { badRequest, conflict, liveSessionLimit, tooMany } from '../http/errors.js';
import {
  appendTurn,
  buildConversationBrief,
  buildSystemPrompt,
  createSessionForOwner,
  detectLocale,
  getOwnedSession,
  historyContents,
  requireCurrentConsent,
  summarizeIfNeeded
} from '../sessions/manager.js';
import { executeToolCalls, getToolDeclarations } from '../tools/registry.js';
import { normalizePortfolioContext, contextInstruction } from '../knowledge/context.js';
import { buildGroundingContext, normalizeOverrides } from '../knowledge/grounding.js';
import { updateVisitorProfile } from '../sessions/visitor.js';
import { normalizeConsent } from '../privacy/consent.js';

function cleanText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) throw badRequest('Message cannot be empty');
  if (text.length > max) throw badRequest(`Message exceeds ${max} characters`);
  return text;
}

function plainText(value) {
  return String(value || '')
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/__(.*?)__/gs, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function aggregateUsage(total, usage) {
  if (!usage) return total;
  total.prompt += Number(usage.prompt || 0);
  total.output += Number(usage.output || 0);
  total.total += Number(usage.total || 0);
  total.promptText += Number(usage.promptText || 0);
  total.promptAudio += Number(usage.promptAudio || 0);
  total.outputAudio += Number(usage.outputAudio || 0);
  return total;
}

function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = JSON.stringify(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function handleChat({
  db,
  config,
  provider,
  cost,
  retrieval,
  flags,
  ownerHash,
  clientHash,
  body,
  now,
  requestId
}) {
  const message = cleanText(body.message, config.limits.maxMessageChars);
  const locale = detectLocale(message, body.locale || 'auto');
  const portfolioContext = normalizePortfolioContext(body.portfolioContext);

  const rate = await db.checkRateLimit({
    bucket: `chat:${clientHash}`,
    limit: config.limits.chatRateLimit,
    windowMs: config.limits.rateLimitWindowMs,
    now
  });
  if (!rate.allowed) throw tooMany('Too many chat requests. Please wait before trying again.');
  const globalRate = await db.checkRateLimit({
    bucket: 'chat:global',
    limit: config.limits.globalChatRateLimit,
    windowMs: config.limits.rateLimitWindowMs,
    now
  });
  if (!globalRate.allowed) throw tooMany('Nupa is receiving too many requests right now. Please try again shortly.');

  let session;
  let newConsent = null;
  if (body.sessionId) {
    session = await getOwnedSession({ db, sessionId: body.sessionId, ownerHash, now });
    requireCurrentConsent(session, config);
  } else {
    newConsent = normalizeConsent(body.consent);
    if ((config.betaAccessRequired || config.publicAccess) && !newConsent) throw badRequest('Confirm that you are 18 or older and agree to the current Terms and Privacy Policy', 'CONSENT_REQUIRED');
  }

  if (!session) {
    session = await createSessionForOwner({ db, ownerHash, locale, state: newConsent ? { consent: newConsent } : {}, now, ttlMs: config.limits.sessionTtlMs });
  }
  const reservation = await cost.reserveText({ ownerHash, sessionId: session.id, now });

  try {
  if (body.clientMessageId) {
    const claimed = await db.claimAction({
      key: `chat:${session.id}:${body.clientMessageId}`,
      type: 'chat_message',
      now
    });
    if (!claimed) throw conflict('This message was already processed');
  }

  const history = await historyContents({ db, sessionId: session.id, maxMessages: config.limits.maxHistoryMessages });
  const previousMessages = await db.listMessages(session.id, 20);
  const brief = buildConversationBrief({ session, messages: previousMessages, maxMessages: 6 });
  const overrides = normalizeOverrides(await db.listKnowledgeOverrides());
  const visitor = updateVisitorProfile(session.state?.visitor, { userText: message, context: portfolioContext, locale, now });
  const grounding = buildGroundingContext({ query: message, portfolioContext, overrides, mode: 'text' });
  const systemInstruction = buildSystemPrompt({
    persona: flags.persona,
    context: grounding.text,
    brief,
    locale,
    mode: 'text',
    portfolioContext: contextInstruction(portfolioContext),
    visitor
  });

  const contents = [...history, { role: 'user', parts: [{ text: message }] }];
  const actions = [];
  const totalUsage = { prompt: 0, output: 0, total: 0, promptText: 0, promptAudio: 0, outputAudio: 0 };
  let totalCostMicros = 0;
  let callIndex = 0;
  let response;

  for (let round = 0; round < 3; round++) {
    response = await provider.generate({
      systemInstruction,
      contents,
      tools: getToolDeclarations(),
      temperature: 0.7,
      maxOutputTokens: 900
    });
    callIndex++;
    totalCostMicros += await cost.recordText({
      requestId: `${requestId}:text:${callIndex}`,
      model: response.model || config.textModel,
      usage: response.usage,
      capability: round === 0 ? 'text_chat' : 'text_tool_followup',
      now
    });
    aggregateUsage(totalUsage, response.usage);

    if (!response.toolCalls?.length) break;

    const executed = await executeToolCalls(response.toolCalls, { db, retrieval, portfolioContext, textProvider: provider, config, cost });
    for (const item of executed) {
      if (item.actions?.length) actions.push(...item.actions);
      else if (item.action) actions.push(item.action);
    }
    contents.push({ role: 'model', parts: response.parts || response.toolCalls.map((call) => ({ functionCall: { name: call.name, args: call.args } })) });
    contents.push({
      role: 'user',
      parts: executed.map((item) => ({
        functionResponse: {
          name: item.call.name,
          ...(item.call.id ? { id: item.call.id } : {}),
          response: item.modelResponse || (item.ok ? { ok: true } : { ok: false, error: item.error?.code || 'TOOL_FAILED' })
        }
      }))
    });
  }

  let reply = plainText(response?.text || '');
  const uniqueActions = dedupeActions(actions);
  if (!reply && uniqueActions.length) {
    const presentation = uniqueActions.find((action) => action.type === 'presentationStart');
    const visual = uniqueActions.find((action) => action.type === 'highlightElement' || action.type === 'spotlightElement' || action.type === 'compareElements');
    if (presentation) {
      reply = locale === 'fr'
        ? `Commençons par ${presentation.label || 'ce projet'}. Je vais vous en montrer les étapes.`
        : `Let's start with ${presentation.label || 'this project'}. I'll show you the key steps.`;
    } else if (visual) {
      reply = locale === 'fr' ? 'Voici l’élément pertinent.' : 'Here is the relevant part.';
    } else {
      reply = locale === 'fr' ? 'Je vous ouvre cela.' : "I'm opening that for you.";
    }
  }
  if (!reply) {
    reply = locale === 'fr'
      ? "Je n'ai pas trouvé de réponse fiable dans le portfolio public."
      : "I couldn't find a reliable answer in the public portfolio.";
  }

  await appendTurn({
    db,
    session,
    userText: message,
    assistantText: reply,
    locale,
    meta: { actions: uniqueActions, model: response?.model || config.textModel, source: 'text', portfolioContext },
    usage: totalUsage,
    visitor,
    now,
    ttlMs: config.limits.sessionTtlMs
  });

  let summaryUpdated = false;
  try {
    const summary = await summarizeIfNeeded({
      db,
      session,
      provider,
      triggerMessages: config.limits.summaryTriggerMessages,
      now
    });
    if (summary) {
      summaryUpdated = true;
      totalCostMicros += await cost.recordText({
        requestId: `${requestId}:summary`,
        model: summary.model || config.textModel,
        usage: summary.usage,
        capability: 'conversation_summary',
        now
      });
    }
  } catch {
    // Summaries are best-effort and must never fail a visitor response.
  }

  await cost.reconcileText({ id: reservation.id, reportedUsdMicros: totalCostMicros, now }).catch(() => {});
  return {
    sessionId: session.id,
    locale,
    reply,
    actions: uniqueActions,
    usage: totalUsage,
    costUsdMicros: totalCostMicros,
    summaryUpdated,
    budget: await cost.budget(now),
    rateLimit: { remaining: rate.remaining, resetAt: rate.resetAt },
    budgetBefore: { allowed: true }
  };
  } catch (error) {
    await cost.failText({ id: reservation.id, now }).catch(() => {});
    throw error;
  }
}

export async function handleLiveToken({
  db,
  config,
  provider,
  cost,
  flags,
  ownerHash,
  clientHash,
  body,
  now
}) {
  const rate = await db.checkRateLimit({
    bucket: `live:${clientHash}`,
    limit: config.limits.liveRateLimit,
    windowMs: config.limits.rateLimitWindowMs,
    now
  });
  if (!rate.allowed) throw tooMany('Too many Live sessions. Please wait before trying again.');
  const globalRate = await db.checkRateLimit({
    bucket: 'live:global',
    limit: config.limits.globalLiveRateLimit,
    windowMs: config.limits.rateLimitWindowMs,
    now
  });
  if (!globalRate.allowed) throw tooMany('Nupa voice is receiving too many requests right now. Please try again shortly.');

  const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
  const tokensToday = await db.countLiveTokensSince(dayStart);
  if (config.limits.maxLiveTokensPerDay > 0 && tokensToday >= config.limits.maxLiveTokensPerDay) {
    throw liveSessionLimit('The daily voice session limit has been reached. Try again after the daily reset.', dayStart + 86_400_000);
  }

  const locale = body.locale === 'fr' || body.locale === 'en' ? body.locale : 'auto';
  let session;
  let newConsent = null;
  if (body.sessionId) {
    session = await getOwnedSession({ db, sessionId: body.sessionId, ownerHash, now });
    requireCurrentConsent(session, config);
  } else {
    newConsent = normalizeConsent(body.consent);
    if ((config.betaAccessRequired || config.publicAccess) && !newConsent) throw badRequest('Confirm that you are 18 or older and agree to the current Terms and Privacy Policy', 'CONSENT_REQUIRED');
  }

  const storedSeconds = Number(await db.getControl('live_session_seconds'));
  const requestedSeconds = Number.isFinite(storedSeconds) && storedSeconds > 0 ? storedSeconds : config.limits.liveSessionSeconds;
  const sessionSeconds = Math.min(config.limits.maxLiveSessionSeconds, Math.max(60, Math.round(requestedSeconds)));
  const reservationUsdMicros = Math.max(
    config.limits.liveTokenReservationUsdMicros,
    Math.ceil((sessionSeconds / 60) * config.limits.liveTokenReservationPerMinuteUsdMicros)
  );

  if (!session) {
    session = await createSessionForOwner({ db, ownerHash, locale, state: newConsent ? { consent: newConsent } : {}, now, ttlMs: config.limits.sessionTtlMs });
  }
  const reservation = await cost.reserveLive({
    ownerHash,
    sessionId: session.id,
    reservedUsdMicros: reservationUsdMicros,
    now,
    expiresAt: now + config.limits.liveTokenHoldMs
  });
  let lease;
  try {
    lease = await db.acquireLiveSessionLease({
      sessionId: session.id,
      ownerHash,
      tokenId: reservation.reservationId,
      now,
      expiresAt: now + sessionSeconds * 1000,
      maxConcurrent: config.limits.maxConcurrentLiveSessions,
      maxPerOwner: config.limits.maxLiveSessionsPerOwner
    });
  } catch (error) {
    await db.failLiveToken({ id: reservation.reservationId, now }).catch(() => {});
    throw error;
  }
  if (!lease) {
    await db.failLiveToken({ id: reservation.reservationId, now }).catch(() => {});
    throw liveSessionLimit('Another Nupa voice session is already active. Wait for it to end, then try again.');
  }
  const messages = await db.listMessages(session.id, 14);
  const portfolioContext = normalizePortfolioContext(body.portfolioContext);
  const brief = buildConversationBrief({ session, messages, maxMessages: 6 });
  const detected = locale === 'auto' ? detectLocale(messages.filter((m) => m.role === 'user').at(-1)?.content || '', 'auto') : locale;
  let visitor = session.state?.visitor || null;
  for (const item of messages.filter((message) => message.role === 'user').slice(-6)) {
    visitor = updateVisitorProfile(visitor, { userText: item.content, context: portfolioContext, locale: detected, now });
  }
  const overrides = normalizeOverrides(await db.listKnowledgeOverrides());
  const grounding = buildGroundingContext({ query: messages.filter((message) => message.role === 'user').at(-1)?.content || '', portfolioContext, overrides, mode: 'live' });
  const systemInstruction = buildSystemPrompt({
    persona: flags.persona,
    context: grounding.text,
    brief,
    locale: detected,
    mode: 'live',
    portfolioContext: contextInstruction(portfolioContext),
    visitor
  });
  const tools = getToolDeclarations();
  const liveTools = [{ functionDeclarations: tools }];
  const voice = config.liveVoice;
  const reservationId = reservation.reservationId;
  let token;
  try {
    token = await provider.mintToken({
      systemInstruction,
      tools,
      voice,
      expireMs: sessionSeconds * 1000,
      newSessionExpireMs: config.limits.liveTokenNewSessionTtlSeconds * 1000
    });
  } catch (error) {
    await db.failLiveToken({ id: reservationId, now }).catch(() => {});
    await db.deleteLiveSessionLease(session.id, reservationId).catch(() => {});
    throw error;
  }

  await db.logEvent({
    level: 'info',
    event: 'live.token.issued',
    detail: { sessionId: session.id, model: config.liveModel, reservationUsdMicros },
    now
  });

  return {
    sessionId: session.id,
    token: token.token,
    model: token.model,
    expiresAt: token.expiresAt,
    newSessionExpiresAt: token.newSessionExpiresAt,
    reservationId,
    reservationUsdMicros,
    sessionSeconds,
    config: {
      responseModalities: ['AUDIO'],
      systemInstruction,
      tools: liveTools,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
    },
    locale: detected,
    rateLimit: { remaining: rate.remaining, resetAt: rate.resetAt }
  };
}

export async function handleLiveTurn({
  db,
  config,
  cost,
  ownerHash,
  body,
  now,
  requestId
}) {
  const session = await getOwnedSession({ db, sessionId: body.sessionId, ownerHash, now });
  requireCurrentConsent(session, config);
  if (!body.reservationId) throw badRequest('reservationId is required');
  const userText = String(body.userText || '').replace(/\s+/g, ' ').trim().slice(0, config.limits.maxMessageChars);
  const assistantText = String(body.assistantText || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!userText && !assistantText) throw badRequest('A live turn needs at least one transcript');
  if (body.turnId) {
    const claimed = await db.claimAction({
      key: `live-turn:${session.id}:${body.turnId}`,
      type: 'live_turn',
      now
    });
    if (!claimed) return { duplicate: true, sessionId: session.id, costUsdMicros: 0 };
  }
  const usage = body.usage || {};
  const locale = body.locale === 'fr' || body.locale === 'en' ? body.locale : detectLocale(userText, session.locale);
  const visitor = updateVisitorProfile(session.state?.visitor, { userText, assistantText, locale, now });
  const usdMicros = await cost.recordLive({
    requestId: `${requestId}:live`,
    model: config.liveModel,
    usage,
    now,
    reservationId: body.reservationId || null,
    ownerHash,
    sessionId: session.id
  });
  await appendTurn({
    db,
    session,
    userText,
    assistantText,
    locale,
    meta: { source: 'live', usage },
    usage: { prompt: Number(usage.textInput || 0) + Number(usage.audioInput || 0), output: Number(usage.audioOutput || 0) },
    visitor,
    now,
    ttlMs: config.limits.sessionTtlMs
  });
  return {
    sessionId: session.id,
    locale,
    duplicate: false,
    costUsdMicros: usdMicros,
    budget: await cost.budget(now)
  };
}
