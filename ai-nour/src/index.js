import { createApp } from './app.js';

export default {
  async fetch(request, env, ctx) {
    const app = createApp(env);
    return app.fetch(request, ctx);
  },
  async scheduled(event, env, ctx) {
    const app = createApp(env);
    return app.scheduled(event, ctx);
  }
};
