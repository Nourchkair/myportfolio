import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { createCostService } from './cost/service.js';
import { createTextProvider, createLiveProvider } from './providers/index.js';
import * as retrieval from './knowledge/retrieval.js';
import { createRouter } from './http/router.js';
import { json, clientKey, requestId as makeRequestId } from './http/json.js';
import { AppError } from './http/errors.js';
import { ProviderError } from './providers/errors.js';
import { IntegrationError } from './integrations/errors.js';
import { createGoogleServices } from './integrations/google/index.js';
import { createEmailService } from './integrations/email/index.js';
import { createCrmService } from './services/crm.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerCrmRoutes } from './routes/crm.js';
import { registerEmailRoutes } from './routes/email.js';

function corsHeaders(request, config) {
  const origin = request.headers.get('origin');
  if (!origin || !config.allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type,x-prototype-key,x-owner-token,authorization',
    'access-control-max-age': '600',
    vary: 'Origin'
  };
}

function withRequestId(response, requestId, extra = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  headers.set('x-request-id', requestId);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function createApp(env) {
  const config = loadConfig(env);
  const db = createDb(env.DB);
  const google = createGoogleServices(config);
  const emailService = createEmailService({ config, gmail: google.gmail });
  const services = {
    config,
    db,
    textProvider: createTextProvider(config),
    liveProvider: createLiveProvider(config),
    cost: createCostService({ db, config }),
    retrieval,
    google,
    email: emailService,
    crm: createCrmService({ db, config, google, email: emailService }),
    clientKey
  };
  const router = createRouter();
  registerHealthRoutes(router, services);
  registerSessionRoutes(router, services);
  registerAdminRoutes(router, services);
  registerCrmRoutes(router, services);
  registerEmailRoutes(router, services);

  async function fetch(request, ctx) {
    const requestId = makeRequestId();
    const url = new URL(request.url);
    const started = Date.now();

    if (url.pathname.startsWith('/api/')) {
      const cors = corsHeaders(request, config);
      if (request.method === 'OPTIONS') {
        return withRequestId(new Response(null, { status: 204 }), requestId, cors);
      }
      const matched = router.match(request.method, url.pathname);
      if (!matched) return withRequestId(json({ error: { code: 'NOT_FOUND', message: 'API route not found' } }, 404), requestId, cors);
      try {
        const response = await matched.handler({
          request,
          url,
          params: matched.params,
          env,
          services,
          requestId,
          now: started,
          ctx
        });
        return withRequestId(response, requestId, cors);
      } catch (error) {
        if (error instanceof AppError) {
          return withRequestId(json({ error: { code: error.code, message: error.message, details: error.details } }, error.status), requestId, cors);
        }
        if (error instanceof ProviderError) {
          try {
            await db.logEvent({
              level: 'error',
              event: 'provider.error',
              detail: { code: error.code, status: error.status, requestId },
              now: started
            });
          } catch {}
          return withRequestId(json({ error: { code: error.code, message: error.message } }, error.status), requestId, cors);
        }
        if (error instanceof IntegrationError) {
          return withRequestId(json({ error: { code: error.code, message: error.message, details: error.details } }, error.status || 502), requestId, cors);
        }
        try {
          await db.logEvent({
            level: 'error',
            event: 'api.error',
            detail: { message: String(error?.message || error).slice(0, 240), requestId, path: url.pathname },
            now: started
          });
        } catch {}
        return withRequestId(json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500), requestId, cors);
      }
    }

    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      return withRequestId(response, requestId);
    }
    return withRequestId(new Response('AI Nour prototype API', { status: 200, headers: { 'content-type': 'text/plain' } }), requestId);
  }

  async function scheduled(event, ctx) {
    const now = Date.now();
    try {
      const result = await db.cleanup({ now, rateWindowMs: config.limits.rateLimitWindowMs });
      const reminders = await emailService.scheduleReminders({ db, now });
      const emails = await emailService.processQueued({ db, limit: 20, now });
      const liveSettlement = await services.cost.settleExpiredLiveTokens({ now });
      await db.logEvent({
        level: 'info',
        event: 'scheduled.cleanup',
        detail: { ...result, reminders: reminders.length, emails: emails.length, liveSettlement },
        now
      });
    } catch (error) {
      try {
        await db.logEvent({
          level: 'error',
          event: 'scheduled.error',
          detail: { message: String(error?.message || error).slice(0, 240) },
          now
        });
      } catch {}
    }
  }

  return { fetch, scheduled, services };
}
