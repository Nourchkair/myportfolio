import { json, readJson } from '../http/json.js';
import { requireAdmin, sha256Hex } from '../auth/secure.js';
import { BOOLEAN_FLAGS, readFlags, setBooleanFlag, setPersona } from '../controls/flags.js';
import { getCorpusMeta, listChunks, search } from '../knowledge/retrieval.js';
import { badRequest, forbidden } from '../http/errors.js';

export function registerAdminRoutes(router, services) {
  const { db, config, cost, google, email, crm, crmSheets } = services;

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
      },
      security: {
        betaAccessRequired: config.betaAccessRequired,
        adminEnabled: config.adminEnabled
      },
      email: {
        provider: config.email.provider,
        sendEnabled: config.email.sendEnabled,
        from: config.email.resendFrom,
        webhookConfigured: Boolean(config.email.webhookSecret),
        internalNotifications: Boolean(config.email.internalTo)
      },
      limits: {
        dailyCapUsdMicros: budget.dailyCapUsdMicros,
        cumulativeCapUsdMicros: budget.cumulativeCapUsdMicros,
        liveSessionSeconds: Number(await db.getControl('live_session_seconds')) || config.limits.liveSessionSeconds,
        maxLiveSessionSeconds: config.limits.maxLiveSessionSeconds
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

  router.get('/api/admin/limits', async ({ request }) => {
    requireAdmin(request, config);
    const budget = await cost.budget();
    return json({
      dailyCapUsdMicros: budget.dailyCapUsdMicros,
      cumulativeCapUsdMicros: budget.cumulativeCapUsdMicros,
      maxDailyCapUsdMicros: config.caps.dailyUsdMicros,
      maxCumulativeCapUsdMicros: config.caps.cumulativeUsdMicros,
      liveSessionSeconds: Number(await db.getControl('live_session_seconds')) || config.limits.liveSessionSeconds,
      maxLiveSessionSeconds: config.limits.maxLiveSessionSeconds
    });
  });

  router.patch('/api/admin/limits', async ({ request }) => {
    requireAdmin(request, config);
    const body = await readJson(request);
    const now = Date.now();
    const updates = {};
    if (body.dailyCapUsdMicros !== undefined) {
      const value = Number(body.dailyCapUsdMicros);
      if (!Number.isFinite(value) || value < 100_000 || value > config.caps.dailyUsdMicros) throw badRequest('Daily cap must be between $0.10 and the approved daily maximum');
      updates.daily_spend_cap_usd_micros = Math.round(value);
    }
    if (body.cumulativeCapUsdMicros !== undefined) {
      const value = Number(body.cumulativeCapUsdMicros);
      if (!Number.isFinite(value) || value < 100_000 || value > config.caps.cumulativeUsdMicros) throw badRequest('Cumulative cap must be between $0.10 and the approved cumulative maximum');
      updates.cumulative_spend_cap_usd_micros = Math.round(value);
    }
    if (body.liveSessionSeconds !== undefined) {
      const value = Number(body.liveSessionSeconds);
      if (!Number.isFinite(value) || value < 60 || value > config.limits.maxLiveSessionSeconds) throw badRequest('Live session duration must be between 60 and the configured maximum');
      updates.live_session_seconds = Math.round(value);
    }
    if (!Object.keys(updates).length) throw badRequest('Provide a spending cap or Live session duration');
    for (const [key, value] of Object.entries(updates)) await db.setControl(key, String(value), now);
    await db.audit({ actor: 'admin-token', action: 'limits.update', detail: updates, now });
    const budget = await cost.budget();
    return json({
      dailyCapUsdMicros: budget.dailyCapUsdMicros,
      cumulativeCapUsdMicros: budget.cumulativeCapUsdMicros,
      liveSessionSeconds: Number(await db.getControl('live_session_seconds')) || config.limits.liveSessionSeconds,
      maxLiveSessionSeconds: config.limits.maxLiveSessionSeconds
    });
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
    const overrides = await db.listKnowledgeOverrides();
    const published = overrides
      .filter((item) => item.status === 'published')
      .map((item) => ({
        id: item.chunk_id,
        type: 'override',
        title: item.title || 'Published knowledge override',
        text: item.text || '',
        route: null,
        tags: (() => { try { return JSON.parse(item.tags_json || '[]'); } catch { return []; } })(),
        keywords: []
      }));
    return json({
      corpus: getCorpusMeta(),
      chunks: listChunks(),
      overrides,
      search: query ? search(query, { limit: 8, extraChunks: published }) : []
    });
  });

  router.post('/api/admin/knowledge/overrides', async ({ request }) => {
    requireAdmin(request, config);
    const body = await readJson(request);
    const chunkId = String(body.chunkId || '').trim();
    const title = String(body.title || '').trim();
    const text = String(body.text || '').trim();
    const status = body.status === 'published' ? 'published' : 'draft';
    if (!/^[a-z0-9:_-]{3,100}$/i.test(chunkId)) throw badRequest('A valid chunk id is required');
    if (!title || title.length > 160) throw badRequest('A title of up to 160 characters is required');
    if (text.length < 20 || text.length > 4000) throw badRequest('Override text must be between 20 and 4000 characters');
    const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag).slice(0, 60)).slice(0, 12) : [];
    const now = Date.now();
    await db.upsertKnowledgeOverride({ chunkId, title, text, tags, status, now });
    await db.audit({ actor: 'admin-token', action: 'knowledge.override', detail: { chunkId, status }, now });
    return json({ overrides: await db.listKnowledgeOverrides() });
  });

  router.delete('/api/admin/knowledge/overrides/:id', async ({ request, params }) => {
    requireAdmin(request, config);
    const removed = await db.deleteKnowledgeOverride(params.id);
    if (!removed) throw badRequest('Knowledge override not found');
    await db.audit({ actor: 'admin-token', action: 'knowledge.override.delete', detail: { chunkId: params.id }, now: Date.now() });
    return json({ overrides: await db.listKnowledgeOverrides() });
  });

  router.get('/api/admin/beta-testers', async ({ request }) => {
    requireAdmin(request, config);
    return json({
      betaAccessRequired: config.betaAccessRequired,
      testers: await db.listBetaTesters(200)
    });
  });

  router.post('/api/admin/beta-testers', async ({ request }) => {
    requireAdmin(request, config);
    const body = await readJson(request);
    const label = String(body.label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label) throw badRequest('A label is required');
    const raw = `ainour_beta_${[...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    const id = crypto.randomUUID();
    const now = Date.now();
    const tester = await db.createBetaTester({
      id,
      label,
      keyPrefix: `${raw.slice(0, 18)}…`,
      keyHash: await sha256Hex(raw),
      now
    });
    await db.audit({ actor: 'admin-token', action: 'beta.tester.create', detail: { id, label }, now });
    return json({ tester, key: raw }, 201);
  });

  router.post('/api/admin/beta-testers/:id/revoke', async ({ request, params }) => {
    requireAdmin(request, config);
    const now = Date.now();
    const revoked = await db.revokeBetaTester(params.id, now);
    if (!revoked) throw badRequest('Beta tester not found or already revoked');
    await db.audit({ actor: 'admin-token', action: 'beta.tester.revoke', detail: { id: params.id }, now });
    return json({ tester: await db.getBetaTester(params.id) });
  });

  router.post('/api/admin/crm/sync', async ({ request }) => {
    requireAdmin(request, config);
    const now = Date.now();
    const result = await crmSheets.sync({ now });
    await db.audit({ actor: 'admin-token', action: 'crm.sheets.sync', detail: { ok: result.ok, totals: result.totals }, now });
    return json(result);
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

  router.get('/api/admin/inquiries', async ({ request }) => {
    requireAdmin(request, config);
    return json({ inquiries: await db.listInquiries({ ownerHash: null, limit: 100 }) });
  });

  router.get('/api/admin/appointments', async ({ request }) => {
    requireAdmin(request, config);
    return json({ appointments: await db.listBookings(100) });
  });

  router.get('/api/admin/email', async ({ request }) => {
    requireAdmin(request, config);
    return json({
      jobs: await db.listEmailJobs(100),
      provider: config.email.provider,
      sendEnabled: config.email.sendEnabled,
      webhookConfigured: Boolean(config.email.webhookSecret)
    });
  });

  router.post('/api/admin/email/:id/retry', async ({ request, params }) => {
    requireAdmin(request, config);
    const changed = await db.retryEmailJob({ id: params.id, now: Date.now() });
    if (!changed) throw badRequest('Email job is not in a retryable state');
    await db.audit({ actor: 'admin-token', action: 'email.retry', detail: { id: params.id }, now: Date.now() });
    return json({ ok: true, id: params.id });
  });

  router.post('/api/admin/email/reminders', async ({ request }) => {
    requireAdmin(request, config);
    const queued = await email.scheduleReminders({ db, now: Date.now() });
    await db.audit({ actor: 'admin-token', action: 'email.reminders', detail: { queued: queued.length }, now: Date.now() });
    return json({ ok: true, queued });
  });

  router.post('/api/admin/appointments/:id/cancel', async ({ request, params }) => {
    requireAdmin(request, config);
    const bookings = await db.listBookings(200);
    const booking = bookings.find((item) => item.id === params.id);
    if (!booking) throw badRequest('Appointment not found');
    const flags = await readFlags(db);
    const result = await crm.cancel({ ownerHash: booking.owner_hash, id: params.id, flags, now: Date.now() });
    await db.audit({ actor: 'admin-token', action: 'appointment.cancel', detail: { id: params.id }, now: Date.now() });
    return json(result);
  });

  router.post('/api/admin/email/process', async ({ request }) => {
    requireAdmin(request, config);
    const results = await email.processQueued({ db, limit: 10, now: Date.now() });
    await db.audit({ actor: 'admin-token', action: 'email.process', detail: { results }, now: Date.now() });
    return json({ results, sendEnabled: config.email.sendEnabled, provider: email.provider });
  });
}
