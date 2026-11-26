import { json, readJson } from '../http/json.js';
import { requireAdmin } from '../auth/secure.js';
import { BOOLEAN_FLAGS, readFlags, setBooleanFlag, setPersona } from '../controls/flags.js';
import { getCorpusMeta, listChunks, search } from '../knowledge/retrieval.js';
import { badRequest, forbidden } from '../http/errors.js';

export function registerAdminRoutes(router, services) {
  const { db, config, cost, google } = services;

  router.get('/api/admin/status', async ({ request }) => {
    requireAdmin(request, config);
    const [flags, budget, sessions, events] = await Promise.all([
      readFlags(db),
      cost.budget(),
      db.listSessions(10),
      db.listOpsEvents(10)
    ]);
    return json({
      ok: true,
      version: config.version,
      environment: config.appEnv,
      models: { text: config.textModel, live: config.liveModel, voice: config.liveVoice },
      providers: { text: config.textProvider, live: config.liveProvider },
      flags,
      budget,
      corpus: getCorpusMeta(),
      counts: { sessions: sessions.length, recentEvents: events.length },
      google: {
        configured: Boolean(config.google.configured),
        spreadsheet: Boolean(config.google.spreadsheetId),
        calendar: Boolean(config.google.calendarId),
        knowledgeFolder: Boolean(config.google.knowledgeFolderId),
        backupFolder: Boolean(config.google.backupFolderId),
        allowSyntheticWrites: config.google.allowSyntheticWrites
      }
    });
  });

  router.get('/api/admin/flags', async ({ request }) => {
    requireAdmin(request, config);
    return json({ flags: await readFlags(db), allowed: BOOLEAN_FLAGS });
  });

  router.patch('/api/admin/flags', async ({ request }) => {
    requireAdmin(request, config);
    const body = await readJson(request);
    const entries = body?.flags && typeof body.flags === 'object' ? Object.entries(body.flags) : [[body.key, body.value]];
    if (!entries.length || entries.some(([key]) => !BOOLEAN_FLAGS.includes(key))) {
      throw badRequest('Provide a known flag key and boolean value');
    }
    const now = Date.now();
    for (const [key, value] of entries) await setBooleanFlag(db, key, value, now);
    await db.audit({ actor: 'admin-token', action: 'flags.update', detail: Object.fromEntries(entries), now });
    return json({ flags: await readFlags(db) });
  });

  router.get('/api/admin/persona', async ({ request }) => {
    requireAdmin(request, config);
    const flags = await readFlags(db);
    return json({ persona: flags.persona });
  });

  router.patch('/api/admin/persona', async ({ request }) => {
    requireAdmin(request, config);
    const body = await readJson(request);
    await setPersona(db, body.persona, Date.now());
    await db.audit({ actor: 'admin-token', action: 'persona.update', detail: { length: String(body.persona || '').length }, now: Date.now() });
    return json({ persona: (await readFlags(db)).persona });
  });

  router.get('/api/admin/cost', async ({ request }) => {
    requireAdmin(request, config);
    return json({ budget: await cost.budget(), events: await cost.list(50) });
  });

  router.get('/api/admin/sessions', async ({ request }) => {
    requireAdmin(request, config);
    return json({ sessions: await db.listSessions(50) });
  });

  router.get('/api/admin/sessions/:id', async ({ request, params }) => {
    requireAdmin(request, config);
    const session = await db.getSession(params.id);
    if (!session) throw badRequest('Session not found');
    return json({ session, messages: await db.listMessages(session.id, 100) });
  });

  router.get('/api/admin/knowledge', async ({ request, url }) => {
    requireAdmin(request, config);
    const query = url.searchParams.get('q') || '';
    return json({
      corpus: getCorpusMeta(),
      chunks: listChunks(),
      overrides: await db.listKnowledgeOverrides(),
      search: query ? search(query, { limit: 8 }) : []
    });
  });

  router.get('/api/admin/bookings', async ({ request }) => {
    requireAdmin(request, config);
    return json({ bookings: await db.listBookings(50) });
  });

  router.get('/api/admin/integrations', async ({ request }) => {
    requireAdmin(request, config);
    return json({ google: await google.status() });
  });

  router.get('/api/admin/crm', async ({ request }) => {
    requireAdmin(request, config);
    if (!google.configured) return json({ configured: false, crm: null });
    return json({ configured: true, crm: await google.sheets.crmSummary() });
  });

  router.post('/api/admin/integrations/synthetic', async ({ request }) => {
    requireAdmin(request, config);
    if (!config.google.allowSyntheticWrites) throw forbidden('Synthetic Google writes are disabled');
    const result = await google.syntheticTest();
    await db.audit({ actor: 'admin-token', action: 'google.synthetic_test', detail: result, now: Date.now() });
    return json({ ok: Object.values(result).every((item) => item.ok), result });
  });

  router.get('/api/admin/audit', async ({ request }) => {
    requireAdmin(request, config);
    return json({ audit: await db.listAudit(50), events: await db.listOpsEvents(50) });
  });
}
