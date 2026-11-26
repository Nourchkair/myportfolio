import { json } from '../http/json.js';

export function registerHealthRoutes(router, services) {
  router.get('/api/health', async () => {
    let d1 = false;
    let error = null;
    try {
      d1 = await services.db.health();
    } catch (caught) {
      error = 'd1_unavailable';
    }
    return json({
      ok: d1,
      service: 'ai-nour-phase1-dev',
      version: services.config.version,
      d1,
      error,
      textProvider: services.config.textProvider,
      liveProvider: services.config.liveProvider,
      time: new Date().toISOString()
    }, d1 ? 200 : 503);
  });
}
