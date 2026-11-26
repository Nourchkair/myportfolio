import { badRequest, conflict, tooMany } from '../http/errors.js';
import {
  appendTurn,
  buildConversationBrief,
  buildSystemPrompt,
  createSessionForOwner,
  detectLocale,
  getOwnedSession,
  historyContents,
  summarizeIfNeeded
} from '../sessions/manager.js';
import { executeToolCalls, getToolDeclarations } from '../tools/registry.js';

function cleanText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) throw badRequest('Message cannot be empty');
  if (text.length > max) throw badRequest(`Message exceeds ${max} characters`);
  return text;
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

  const rate = await db.checkRateLimit({
    bucket: `chat:${clientHash}`,
    limit: config.limits.chatRateLimit,
    windowMs: config.limits.rateLimitWindowMs,
    now
  });
  if (!rate.allowed) throw tooMany('Too many chat requests. Please wait before trying again.');

  const budgetBefore = await cost.assertBudget(now);

  const session = body.sessionId
    ? await getOwnedSession({ db, sessionId: body.sessionId, ownerHash, now })
    : await createSessionForOwner({ db, ownerHash, locale, now, ttlMs: config.limits.sessionTtlMs });

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
  const context = retrieval.buildContext(message, { limit: 4, maxChars: 3200 });
  const systemInstruction = buildSystemPrompt({
    persona: flags.persona,
    context: context.text,
    brief,
    locale,
    mode: 'text'
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
      temperature: 0.45,
      maxOutputTokens: 520
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

    const executed = executeToolCalls(response.toolCalls);
    for (const item of executed) if (item.action) actions.push(item.action);
    contents.push({ role: 'model', parts: response.parts || response.toolCalls.map((call) => ({ functionCall: { name: call.name, args: call.args } })) });
    contents.push({
      role: 'user',
      parts: executed.map((item) => ({
        functionResponse: {
          name: item.call.name,
          ...(item.call.id ? { id: item.call.id } : {}),
          response: item.ok
            ? { ok: true, route: item.action?.route || null }
            : { ok: false, error: item.error.code }
        }
      }))
    });
  }

  let reply = String(response?.text || '').trim();
  const uniqueActions = dedupeActions(actions);
  if (!reply && uniqueActions.length) {
    reply = locale === 'fr' ? 'Je vous ouvre cela.' : "I'm opening that for you.";
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
    meta: { actions: uniqueActions, model: response?.model || config.textModel, source: 'text' },
    usage: totalUsage,
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
    budgetBefore: { allowed: budgetBefore.allowed }
  };
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

  await cost.assertBudget(now);

  const locale = body.locale === 'fr' || body.locale === 'en' ? body.locale : 'auto';
  const session = body.sessionId
    ? await getOwnedSession({ db, sessionId: body.sessionId, ownerHash, now })
    : await createSessionForOwner({ db, ownerHash, locale, now, ttlMs: config.limits.sessionTtlMs });
  const messages = await db.listMessages(session.id, 14);
  const brief = buildConversationBrief({ session, messages, maxMessages: 6 });
  const detected = locale === 'auto' ? detectLocale(messages.filter((m) => m.role === 'user').at(-1)?.content || '', 'auto') : locale;
  const systemInstruction = buildSystemPrompt({
    persona: flags.persona,
    brief,
    locale: detected,
    mode: 'live'
  });
  const tools = getToolDeclarations();
  const liveTools = [{ functionDeclarations: tools }];
  const voice = config.liveVoice;
  const token = await provider.mintToken({ systemInstruction, tools, voice });

  await db.logEvent({
    level: 'info',
    event: 'live.token.issued',
    detail: { sessionId: session.id, model: config.liveModel },
    now
  });

  return {
    sessionId: session.id,
    token: token.token,
    model: token.model,
    expiresAt: token.expiresAt,
    newSessionExpiresAt: token.newSessionExpiresAt,
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
  const usdMicros = await cost.recordLive({
    requestId: `${requestId}:live`,
    model: config.liveModel,
    usage,
    now
  });
  await appendTurn({
    db,
    session,
    userText,
    assistantText,
    locale,
    meta: { source: 'live', usage },
    usage: { prompt: Number(usage.textInput || 0) + Number(usage.audioInput || 0), output: Number(usage.audioOutput || 0) },
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
