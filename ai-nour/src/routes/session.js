import { json, readJson } from '../http/json.js';
import { requireOwnerHash, requirePrototypeKey } from '../auth/secure.js';
import { requireAssistant, requireLive, requireText, readFlags } from '../controls/flags.js';
import { createSessionForOwner, getOwnedSession, sessionView } from '../sessions/manager.js';
import { handleChat, handleLiveToken, handleLiveTurn } from '../services/conversation.js';
import { getCorpusMeta, listChunks } from '../knowledge/retrieval.js';
import { getToolDeclarations } from '../tools/registry.js';
import { executeToolCall } from '../tools/registry.js';
import { badRequest } from '../http/errors.js';
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

  router.post('/api/session', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    await requireAssistant(db);
    const body = await readJson(request);
    const locale = body.locale === 'fr' || body.locale === 'en' ? body.locale : 'auto';
    const session = await createSessionForOwner({
      db,
      ownerHash,
      locale,
      now: Date.now(),
      ttlMs: config.limits.sessionTtlMs
    });
    return json({ session: sessionView(session, []) }, 201);
  });

  router.get('/api/session/:id', async ({ request, params }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    await requireAssistant(db);
    const session = await getOwnedSession({ db, sessionId: params.id, ownerHash, now: Date.now() });
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

  router.post('/api/tools/execute', async ({ request }) => {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    await requireAssistant(db);
    const body = await readJson(request);
    if (!body.sessionId) throw badRequest('sessionId is required');
    if (!body.name) throw badRequest('Tool name is required');
    await getOwnedSession({ db, sessionId: body.sessionId, ownerHash, now: Date.now() });
    const result = executeToolCall(body.name, body.args || {});
    if (result.ok) {
      await db.logEvent({
        level: 'info',
        event: 'tool.executed',
        detail: { sessionId: body.sessionId, tool: body.name, route: result.action?.route || null },
        now: Date.now()
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
