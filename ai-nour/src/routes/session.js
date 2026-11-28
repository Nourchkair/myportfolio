import { json, readJson } from '../http/json.js';
import { generateOwnerToken, requireOwnerHash, requirePrototypeKey } from '../auth/secure.js';
import { requireAssistant, requireLive, requireText, readFlags } from '../controls/flags.js';
import { createSessionForOwner, getOwnedSession, requireCurrentConsent, sessionView } from '../sessions/manager.js';
import { handleChat, handleLiveToken, handleLiveTurn } from '../services/conversation.js';
import { getCorpusMeta, listChunks } from '../knowledge/retrieval.js';
import { getToolDeclarations } from '../tools/registry.js';
import { executeToolCall } from '../tools/registry.js';
import { normalizePortfolioContext } from '../knowledge/context.js';
import { normalizeConsent } from '../privacy/consent.js';
import { badRequest, tooMany } from '../http/errors.js';
import { sha256Hex } from '../auth/secure.js';

export function registerSessionRoutes(router, services) {
  const { db, config, textProvider, liveProvider, cost } = services;

  router.get('/api/meta', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    const flags = await readFlags(db);
    return json({
      version: config.version,
      models: { text: config.textModel, live: config.liveModel, voice: config.liveVoice },
      locales: ['auto', 'en', 'fr'],
      corpus: getCorpusMeta(),
      flags: {
        assistant_enabled: flags.assistant_enabled,
        text_enabled: flags.text_enabled,
        live_enabled: flags.live_enabled
      },
      tools: getToolDeclarations().map((tool) => tool.name)
    });
  });

  router.post('/api/owner', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    const clientHash = await sha256Hex(services.clientKey(request));
    const rate = await db.checkRateLimit({
      bucket: `owner:${clientHash}`,
      limit: config.limits.ownerRateLimit,
      windowMs: config.limits.rateLimitWindowMs,
      now: Date.now()
    });
    if (!rate.allowed) throw tooMany('Too many anonymous sessions were requested. Please try again later.');
    const globalRate = await db.checkRateLimit({
      bucket: 'owner:global',
      limit: config.limits.globalOwnerRateLimit,
      windowMs: config.limits.rateLimitWindowMs,
      now: Date.now()
    });
    if (!globalRate.allowed) throw tooMany('Nupa is receiving too many session requests right now. Please try again shortly.');
    return json({ ownerToken: generateOwnerToken(32) });
  });

  router.post('/api/session', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    await requireAssistant(db);
    const clientHash = await sha256Hex(services.clientKey(request));
    const rate = await db.checkRateLimit({ bucket: `session-create:${clientHash}`, limit: config.limits.sessionRateLimit, windowMs: config.limits.rateLimitWindowMs, now: Date.now() });
    if (!rate.allowed) throw tooMany('Too many new sessions. Please wait before trying again.');
    const globalRate = await db.checkRateLimit({ bucket: 'session-create:global', limit: config.limits.globalSessionRateLimit, windowMs: config.limits.rateLimitWindowMs, now: Date.now() });
    if (!globalRate.allowed) throw tooMany('Nupa is receiving too many new sessions right now. Please try again shortly.');
    const body = await readJson(request);
    const locale = body.locale === 'fr' || body.locale === 'en' ? body.locale : 'auto';
    const consent = normalizeConsent(body.consent);
    if ((config.betaAccessRequired || config.publicAccess) && !consent) {
      throw badRequest('Confirm that you are 18 or older and agree to the current Terms and Privacy Policy', 'CONSENT_REQUIRED');
    }
    const session = await createSessionForOwner({
      db,
      ownerHash,
      locale,
      state: consent ? { consent } : {},
      now: Date.now(),
      ttlMs: config.limits.sessionTtlMs
    });
    return json({ session: sessionView(session, []) }, 201);
  });

  router.post('/api/session/:id/consent', async ({ request, params }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    await requireAssistant(db);
    const body = await readJson(request);
    const consent = normalizeConsent(body.consent);
    if (!consent) throw badRequest('Confirm that you are 18 or older and agree to the current Terms and Privacy Policy', 'CONSENT_REQUIRED');
    const session = await getOwnedSession({ db, sessionId: params.id, ownerHash, now: Date.now() });
    const now = Date.now();
    const state = { ...(session.state || {}), consent: { ...consent, recordedAt: now } };
    await db.updateSession({
      id: session.id,
      summary: session.summary,
      state,
      turnCount: session.turnCount,
      now,
      expiresAt: session.expiresAt
    });
    return json({ session: sessionView({ ...session, state }, []) });
  });

  router.get('/api/session/:id', async ({ request, params }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    await requireAssistant(db);
    const clientHash = await sha256Hex(services.clientKey(request));
    const rate = await db.checkRateLimit({ bucket: `session-read:${clientHash}`, limit: config.limits.sessionReadRateLimit, windowMs: config.limits.rateLimitWindowMs, now: Date.now() });
    if (!rate.allowed) throw tooMany('Too many session reads. Please wait before trying again.');
    const globalRate = await db.checkRateLimit({ bucket: 'session-read:global', limit: config.limits.globalSessionReadRateLimit, windowMs: config.limits.rateLimitWindowMs, now: Date.now() });
    if (!globalRate.allowed) throw tooMany('Nupa is receiving too many session reads right now. Please try again shortly.');
    const session = await getOwnedSession({ db, sessionId: params.id, ownerHash, now: Date.now() });
    requireCurrentConsent(session, config);
    const messages = await db.listMessages(session.id, 100);
    const flags = await readFlags(db);
    return json({
      session: sessionView(session, messages),
      flags: {
        assistant_enabled: flags.assistant_enabled,
        text_enabled: flags.text_enabled,
        live_enabled: flags.live_enabled
      }
    });
  });

  router.post('/api/chat', async ({ request, requestId }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    const flags = await requireText(db);
    const body = await readJson(request);
    const clientHash = await sha256Hex(services.clientKey(request));
    const result = await handleChat({
      db,
      config,
      provider: textProvider,
      cost,
      retrieval: services.retrieval,
      flags,
      ownerHash,
      clientHash,
      body,
      now: Date.now(),
      requestId
    });
    return json(result);
  });

  router.post('/api/live/token', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    const flags = await requireLive(db);
    const body = await readJson(request);
    const clientHash = await sha256Hex(services.clientKey(request));
    const result = await handleLiveToken({
      db,
      config,
      provider: liveProvider,
      cost,
      flags,
      ownerHash,
      clientHash,
      body,
      now: Date.now()
    });
    return json(result);
  });

  router.post('/api/live/turn', async ({ request, requestId }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    await requireAssistant(db);
    const body = await readJson(request);
    const result = await handleLiveTurn({
      db,
      config,
      cost,
      ownerHash,
      body,
      now: Date.now(),
      requestId
    });
    return json(result);
  });

  router.post('/api/live/end', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    const body = await readJson(request);
    if (!body.sessionId) throw badRequest('sessionId is required');
    const now = Date.now();
    await getOwnedSession({ db, sessionId: body.sessionId, ownerHash, now });
    const settled = await cost.endLive({
      reservationId: body.reservationId || null,
      ownerHash,
      sessionId: body.sessionId,
      now
    });
    // An explicit end is a visitor-controlled stop: release the concurrency
    // lease immediately so the visitor can start a new session without waiting
    // for the old token to expire. The browser also drops the token on end.
    const leaseReleased = await db.deleteLiveSessionLease(body.sessionId, body.reservationId || null).catch(() => false);
    return json({ ok: true, ...settled, leaseReleased });
  });

  router.post('/api/tools/execute', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    await requireAssistant(db);
    const clientHash = await sha256Hex(services.clientKey(request));
    const rate = await db.checkRateLimit({
      bucket: `tool:${clientHash}`,
      limit: config.limits.toolRateLimit,
      windowMs: config.limits.rateLimitWindowMs,
      now: Date.now()
    });
    if (!rate.allowed) throw tooMany('Too many interface actions. Please wait before trying again.');
    const globalRate = await db.checkRateLimit({
      bucket: 'tool:global',
      limit: config.limits.globalToolRateLimit,
      windowMs: config.limits.rateLimitWindowMs,
      now: Date.now()
    });
    if (!globalRate.allowed) throw tooMany('Nupa is receiving too many interface actions right now. Please try again shortly.');
    const body = await readJson(request);
    if (!body.sessionId) throw badRequest('sessionId is required');
    if (!body.name) throw badRequest('Tool name is required');
    const toolSession = await getOwnedSession({ db, sessionId: body.sessionId, ownerHash, now: Date.now() });
    requireCurrentConsent(toolSession, config);
    const toolStarted = Date.now();
    const result = await executeToolCall(body.name, body.args || {}, {
      db,
      retrieval: services.retrieval,
      textProvider,
      config,
      cost,
      portfolioContext: normalizePortfolioContext(body.portfolioContext)
    });
    if (result.ok) {
      await db.logEvent({
        level: 'info',
        event: 'tool.executed',
        detail: { sessionId: body.sessionId, tool: body.name, route: result.action?.route || null },
        now: toolStarted
      });
    }
    return json(result);
  });

  router.get('/api/knowledge/search', async ({ request, url }) => {
    await requirePrototypeKey(request, config, db);
    const query = url.searchParams.get('q') || '';
    if (!query.trim()) throw badRequest('q is required');
    return json({ query, results: services.retrieval.search(query, { limit: 5 }) });
  });

  router.get('/api/knowledge/chunks', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    return json({ chunks: listChunks() });
  });
}
