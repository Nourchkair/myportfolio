export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status: Number(status),
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
    const sha256 = async (value) => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    };
    const owner = request.headers.get('x-owner-token') || '';
    const hasOwner = owner.length >= 16 && owner.length <= 256;
    const isAdmin = Boolean(env.ADMIN_TOKEN) &&
      request.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;
    const enabled = async () => {
      const row = await env.DB.prepare("SELECT value FROM controls WHERE key='assistant_enabled'").first();
      return row?.value !== 'false';
    };
    const body = async () => {
      try { return await request.json(); } catch { return null; }
    };

    if (url.pathname === '/health') {
      try {
        const r = await env.DB.prepare('SELECT 1 AS ok').first();
        return json({
          ok: r?.ok === 1,
          service: 'ai-nour-phase0a-dev',
          d1: true,
          assistantEnabled: await enabled(),
          time: new Date().toISOString()
        });
      } catch {
        return json({ ok: false, d1: false }, 503);
      }
    }

    if (url.pathname === '/idempotency') {
      const key = url.searchParams.get('key') || '';
      if (!key) return json({ error: 'missing key' }, 400);
      await env.DB.prepare(
        "INSERT INTO action_ledger(action_key,action_type,status,payload,created_at) VALUES(?, 'test', 'succeeded', '{}', ?) ON CONFLICT(action_key) DO NOTHING"
      ).bind(key, Date.now()).run();
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM action_ledger WHERE action_key=?').bind(key).first();
      return json({ key, rows: row?.n, duplicateProtected: row?.n === 1 });
    }

    if (url.pathname === '/session') {
      if (request.method === 'POST') {
        if (!hasOwner) return json({ error: 'missing or invalid owner token' }, 400);
        if (!(await enabled())) return json({ error: 'assistant disabled' }, 503);
        const id = crypto.randomUUID();
        const expires = Date.now() + 30 * 60 * 1000;
        await env.DB.prepare('INSERT INTO sessions(id,owner_hash,state,expires_at) VALUES(?,?,?,?)')
          .bind(id, await sha256(owner), JSON.stringify({ turn: 0 }), expires).run();
        return json({ id, expiresAt: expires }, 201);
      }
      if (!hasOwner) return json({ error: 'missing or invalid owner token' }, 400);
      const id = url.searchParams.get('id') || '';
      if (!id) return json({ error: 'missing id' }, 400);
      const row = await env.DB.prepare('SELECT owner_hash,state,expires_at FROM sessions WHERE id=?').bind(id).first();
      if (!row || row.expires_at < Date.now() || row.owner_hash !== await sha256(owner)) {
        return json({ error: 'not found or expired' }, 404);
      }
      return json({ id, state: JSON.parse(row.state), expiresAt: row.expires_at });
    }

    if (url.pathname === '/booking' && request.method === 'POST') {
      if (!hasOwner) return json({ error: 'missing or invalid owner token' }, 400);
      if (!(await enabled())) return json({ error: 'assistant disabled' }, 503);
      const input = await body();
      const start = Number(input?.startUtc);
      const end = Number(input?.endUtc);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return json({ error: 'invalid booking window' }, 400);
      }
      const slotKey = String(input?.slotKey || `${start}-${end}`).slice(0, 128);
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          "INSERT INTO bookings(id,owner_hash,slot_key,start_utc,end_utc,status,calendar_event_id,created_at) VALUES(?,?,?,?,?,'reserved',NULL,?)"
        ).bind(id, await sha256(owner), slotKey, start, end, Date.now()).run();
      } catch (error) {
        if (String(error?.message || error).includes('UNIQUE')) {
          return json({ error: 'slot_taken' }, 409);
        }
        throw error;
      }
      return json({ id, status: 'reserved' }, 201);
    }

    if (url.pathname === '/booking/cancel' && request.method === 'POST') {
      if (!hasOwner) return json({ error: 'missing or invalid owner token' }, 400);
      const input = await body();
      if (!input?.id) return json({ error: 'missing id' }, 400);
      const result = await env.DB.prepare(
        "UPDATE bookings SET status='cancelled' WHERE id=? AND owner_hash=? AND status='reserved'"
      ).bind(input.id, await sha256(owner)).run();
      if (!result.meta?.changes) return json({ error: 'not found' }, 404);
      return json({ id: input.id, status: 'cancelled' });
    }

    if (url.pathname === '/control') {
      if (!env.ADMIN_TOKEN) return json({ error: 'admin token not configured' }, 503);
      if (!isAdmin) return json({ error: 'unauthorized' }, 401);
      if (request.method === 'GET') return json({ enabled: await enabled() });
      if (request.method === 'POST') {
        const input = await body();
        if (typeof input?.enabled !== 'boolean') return json({ error: 'enabled must be boolean' }, 400);
        await env.DB.prepare(
          "INSERT INTO controls(key,value,updated_at) VALUES('assistant_enabled',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at"
        ).bind(String(input.enabled), Date.now()).run();
        return json({ enabled: input.enabled });
      }
      return json({ error: 'method not allowed' }, 405);
    }

    if (url.pathname === '/spend') {
      if (!env.ADMIN_TOKEN) return json({ error: 'admin token not configured' }, 503);
      if (!isAdmin) return json({ error: 'unauthorized' }, 401);
      if (request.method !== 'GET' && request.method !== 'POST') {
        return json({ error: 'method not allowed' }, 405);
      }
      const cap = Number(env.DAILY_SPEND_CAP_USD_MICROS || 1_000_000);
      let at = Date.now();
      if (request.method === 'POST') {
        const input = await body();
        const usdMicros = Number(input?.usdMicros);
        if (!Number.isInteger(usdMicros) || usdMicros < 0 || usdMicros > 100_000_000) {
          return json({ error: 'invalid usdMicros' }, 400);
        }
        at = Number(input?.at || Date.now());
        if (!Number.isFinite(at)) return json({ error: 'invalid at' }, 400);
        await env.DB.prepare(
          'INSERT INTO cost_events(provider,capability,usd_micros,created_at) VALUES(?,?,?,?)'
        ).bind(String(input?.provider || 'unknown'), String(input?.capability || 'unknown'), usdMicros, at).run();
      } else {
        at = Number(url.searchParams.get('at') || Date.now());
      }
      const dayStart = Math.floor(at / 86_400_000) * 86_400_000;
      const row = await env.DB.prepare(
        'SELECT COALESCE(SUM(usd_micros),0) AS total FROM cost_events WHERE created_at >= ? AND created_at < ?'
      ).bind(dayStart, dayStart + 86_400_000).first();
      const total = Number(row?.total || 0);
      const allowed = total <= cap;
      return json({ totalUsdMicros: total, capUsdMicros: cap, allowed }, allowed ? 200 : 402);
    }

    if (url.pathname === '/rate') {
      const bucket = url.searchParams.get('bucket') || 'default';
      const limit = 3;
      const now = Date.now();
      const windowMs = 60_000;
      const row = await env.DB.prepare('SELECT count,window_start FROM rate_limits WHERE bucket=?').bind(bucket).first();
      let count = 1;
      let start = now;
      if (row && now - row.window_start < windowMs) {
        count = Number(row.count || 0) + 1;
        start = Number(row.window_start) || now;
      }
      await env.DB.prepare(
        'INSERT INTO rate_limits(bucket,count,window_start) VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=excluded.count,window_start=excluded.window_start'
      ).bind(bucket, count, start).run();
      const allowed = count <= limit;
      return json({ bucket, count, limit, allowed }, allowed ? 200 : 429);
    }

    if (url.pathname === '/error') {
      const input = await body();
      if (input === null) return json({ error: 'invalid JSON' }, 400);
      return json({ ok: true });
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const now = Date.now();
    const expired = await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
    const staleRates = await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86_400_000).run();
    const detail = JSON.stringify({
      expiredSessions: expired.meta?.changes || 0,
      staleRateBuckets: staleRates.meta?.changes || 0
    });
    await env.DB.prepare(
      "INSERT INTO ops_events(level,event,detail,created_at) VALUES('info','scheduled.tick',?,?)"
    ).bind(detail, now).run();
  }
};
