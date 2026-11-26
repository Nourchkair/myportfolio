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
import { registerHealthRoutes } from './routes/health.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerAdminRoutes } from './routes/admin.js';

function withRequestId(response, requestId) {
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function createApp(env) {
  const config = loadConfig(env);
  const db = createDb(env.DB);
  const services = {
    config,
    db,
    textProvider: createTextProvider(config),
    liveProvider: createLiveProvider(config),
    cost: createCostService({ db, config }),
    retrieval,
    google: createGoogleServices(config),
    clientKey
  };
  const router = createRouter();
  registerHealthRoutes(router, services);
  registerSessionRoutes(router, services);
  registerAdminRoutes(router, services);

  async function fetch(request, ctx) {
    const requestId = makeRequestId();
    const url = new URL(request.url);
    const started = Date.now();

    if (url.pathname.startsWith('/api/')) {
      const matched = router.match(request.method, url.pathname);
      if (!matched) return withRequestId(json({ error: { code: 'NOT_FOUND', message: 'API route not found' } }, 404), requestId);
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
        return withRequestId(response, requestId);
      } catch (error) {
        if (error instanceof AppError) {
          return withRequestId(json({ error: { code: error.code, message: error.message, details: error.details } }, error.status), requestId);
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
          return withRequestId(json({ error: { code: error.code, message: error.message } }, error.status), requestId);
        }
        if (error instanceof IntegrationError) {
          return withRequestId(json({ error: { code: error.code, message: error.message, details: error.details } }, error.status || 502), requestId);
        }
        try {
          await db.logEvent({
            level: 'error',
            event: 'api.error',
            detail: { message: String(error?.message || error).slice(0, 240), requestId, path: url.pathname },
            now: started
          });
        } catch {}
        return withRequestId(json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500), requestId);
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
      await db.logEvent({
        level: 'info',
        event: 'scheduled.cleanup',
        detail: result,
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
