export function createRouter() {
  const routes = [];

  const add = (method, pattern, handler) => {
    const parts = pattern.split('/').filter(Boolean);
    routes.push({ method, parts, handler });
  };

  const match = (method, pathname) => {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of routes) {
      if (route.method !== method || route.parts.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.parts.length; i++) {
        const expected = route.parts[i];
        if (expected.startsWith(':')) {
          params[expected.slice(1)] = decodeURIComponent(parts[i]);
        } else if (expected !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  };

  return {
    get: (pattern, handler) => add('GET', pattern, handler),
    post: (pattern, handler) => add('POST', pattern, handler),
    patch: (pattern, handler) => add('PATCH', pattern, handler),
    put: (pattern, handler) => add('PUT', pattern, handler),
    delete: (pattern, handler) => add('DELETE', pattern, handler),
    match
  };
}
