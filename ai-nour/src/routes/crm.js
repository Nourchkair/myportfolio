import { json, readJson } from '../http/json.js';
import { requireOwnerHash, requirePrototypeKey, sha256Hex } from '../auth/secure.js';
import { requireAssistant } from '../controls/flags.js';
import { createCrmService } from '../services/crm.js';
import { tooMany } from '../http/errors.js';

export function registerCrmRoutes(router, services) {
  const { db, config, google, email } = services;
  const crm = services.crm || createCrmService({ db, config, google, email });

  async function guard(request) {
    await requirePrototypeKey(request, config, db);
    const ownerHash = await requireOwnerHash(request);
    const flags = await requireAssistant(db);
    const clientHash = await sha256Hex(services.clientKey(request));
    const rate = await db.checkRateLimit({
      bucket: `crm:${clientHash}`,
      limit: 30,
      windowMs: config.limits.rateLimitWindowMs,
      now: Date.now()
    });
    if (!rate.allowed) throw tooMany('Too many CRM requests. Please wait and try again.');
    return { ownerHash, flags };
  }

  router.get('/api/crm/inquiries', async ({ request }) => {
    const { ownerHash } = await guard(request);
    return json({ inquiries: await crm.listInquiries(ownerHash) });
  });

  router.post('/api/crm/inquiries', async ({ request }) => {
    const { ownerHash } = await guard(request);
    const body = await readJson(request);
    const result = await crm.createInquiry({ ownerHash, body, now: Date.now() });
    return json(result, result.duplicate ? 200 : 201);
  });

  router.post('/api/crm/availability', async ({ request }) => {
    await guard(request);
    const body = await readJson(request);
    return json(await crm.availability({
      fromUtc: body.fromUtc,
      toUtc: body.toUtc,
      timezone: body.timezone,
      now: Date.now()
    }));
  });

  router.get('/api/crm/appointments', async ({ request }) => {
    const { ownerHash } = await guard(request);
    return json({ appointments: await crm.listAppointments(ownerHash) });
  });

  router.post('/api/crm/appointments', async ({ request }) => {
    const { ownerHash, flags } = await guard(request);
    const body = await readJson(request);
    const result = await crm.createAppointment({ ownerHash, body, flags, now: Date.now() });
    const status = result.duplicate ? 200 : result.calendarPending ? 202 : 201;
    return json(result, status);
  });

  router.post('/api/crm/appointments/:id/reschedule', async ({ request, params }) => {
    const { ownerHash, flags } = await guard(request);
    const body = await readJson(request);
    return json(await crm.reschedule({ ownerHash, id: params.id, body, flags, now: Date.now() }));
  });

  router.post('/api/crm/appointments/:id/cancel', async ({ request, params }) => {
    const { ownerHash, flags } = await guard(request);
    return json(await crm.cancel({ ownerHash, id: params.id, flags, now: Date.now() }));
  });

  router.post('/api/crm/appointments/:id/reconcile', async ({ request, params }) => {
    const { ownerHash, flags } = await guard(request);
    return json(await crm.reconcile({ ownerHash, id: params.id, flags, now: Date.now() }));
  });
}
