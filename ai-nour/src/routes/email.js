import { json } from '../http/json.js';
import { badRequest, unauthorized } from '../http/errors.js';

export function registerEmailRoutes(router, services) {
  const { db, email } = services;

  router.post('/api/webhooks/resend', async ({ request }) => {
    const rawBody = await request.text();
    if (!rawBody || rawBody.length > 131_072) throw badRequest('Webhook payload is too large');
    let event;
    try {
      event = await email.verifyWebhook({ rawBody, headers: request.headers });
    } catch {
      throw unauthorized('Invalid Resend webhook signature');
    }
    const svixId = request.headers.get('svix-id') || '';
    if (!svixId || !event?.type) throw badRequest('Webhook payload is incomplete');
    const result = await email.recordEvent({ db, event, svixId, now: Date.now() });
    return json({ ok: true, ...result });
  });
}
