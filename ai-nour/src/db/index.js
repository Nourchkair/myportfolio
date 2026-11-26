function parseState(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerHash: row.owner_hash,
    locale: row.locale,
    summary: row.summary || '',
    state: parseState(row.state_json),
    turnCount: Number(row.turn_count || 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    expiresAt: Number(row.expires_at),
    messageCount: row.message_count === undefined ? undefined : Number(row.message_count)
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    locale: row.locale,
    createdAt: Number(row.created_at),
    tokenCount: row.token_count === null ? null : Number(row.token_count),
    meta: parseState(row.meta_json)
  };
}

export function createDb(d1) {
  if (!d1) throw new Error('D1 binding is required');

  async function health() {
    const row = await d1.prepare('SELECT 1 AS ok').first();
    return row?.ok === 1;
  }

  async function createSession({ id, ownerHash, locale = 'auto', state = {}, now, expiresAt }) {
    await d1.prepare(
      'INSERT INTO sessions(id,owner_hash,locale,summary,state_json,turn_count,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)'
    ).bind(id, ownerHash, locale, '', JSON.stringify(state), 0, now, now, expiresAt).run();
    return getSession(id);
  }

  async function getSession(id) {
    const row = await d1.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first();
    return mapSession(row);
  }

  async function getSessionForOwner(id, ownerHash, now = Date.now()) {
    const row = await d1.prepare(
      'SELECT * FROM sessions WHERE id=? AND owner_hash=? AND expires_at>?'
    ).bind(id, ownerHash, now).first();
    return mapSession(row);
  }

  async function updateSession({ id, summary = '', state = {}, turnCount = 0, now, expiresAt }) {
    await d1.prepare(
      'UPDATE sessions SET summary=?, state_json=?, turn_count=?, updated_at=?, expires_at=? WHERE id=?'
    ).bind(summary, JSON.stringify(state), turnCount, now, expiresAt, id).run();
  }

  async function updateSessionSummary(id, summary, now) {
    await d1.prepare('UPDATE sessions SET summary=?, updated_at=? WHERE id=?').bind(summary, now, id).run();
  }

  async function appendMessage({ id, sessionId, role, content, locale = null, createdAt, tokenCount = null, meta = {} }) {
    await d1.prepare(
      'INSERT INTO session_messages(id,session_id,role,content,locale,created_at,token_count,meta_json) VALUES(?,?,?,?,?,?,?,?)'
    ).bind(id, sessionId, role, content, locale, createdAt, tokenCount, JSON.stringify(meta)).run();
  }

  async function listMessages(sessionId, limit = 50) {
    const result = await d1.prepare(
      'SELECT * FROM session_messages WHERE session_id=? ORDER BY created_at DESC, id DESC LIMIT ?'
    ).bind(sessionId, limit).all();
    return (result.results || []).map(mapMessage).reverse();
  }

  async function listSessions(limit = 50) {
    const result = await d1.prepare(
      'SELECT s.*, (SELECT COUNT(*) FROM session_messages m WHERE m.session_id=s.id) AS message_count FROM sessions s ORDER BY s.updated_at DESC LIMIT ?'
    ).bind(limit).all();
    return (result.results || []).map(mapSession);
  }

  async function deleteExpiredSessions(now) {
    const result = await d1.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
    return result.meta?.changes || 0;
  }

  async function getControls() {
    const result = await d1.prepare('SELECT key,value FROM controls').all();
    return Object.fromEntries((result.results || []).map((row) => [row.key, row.value]));
  }

  async function getControl(key) {
    const row = await d1.prepare('SELECT value FROM controls WHERE key=?').bind(key).first();
    return row?.value;
  }

  async function setControl(key, value, now) {
    await d1.prepare(
      'INSERT INTO controls(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at'
    ).bind(key, String(value), now).run();
  }

  async function getCostSince(since) {
    const row = await d1.prepare(
      'SELECT COALESCE(SUM(usd_micros),0) AS total FROM cost_events WHERE created_at>=?'
    ).bind(since).first();
    return Number(row?.total || 0);
  }

  async function getCostTotal() {
    const row = await d1.prepare('SELECT COALESCE(SUM(usd_micros),0) AS total FROM cost_events').first();
    return Number(row?.total || 0);
  }

  async function recordCost({ requestId: rid, provider, model, capability, inputTokens = 0, outputTokens = 0, usdMicros, createdAt }) {
    await d1.prepare(
      'INSERT OR IGNORE INTO cost_events(request_id,provider,model,capability,input_tokens,output_tokens,usd_micros,created_at) VALUES(?,?,?,?,?,?,?,?)'
    ).bind(rid, provider, model || null, capability, inputTokens, outputTokens, usdMicros, createdAt).run();
  }

  async function listCostEvents(limit = 50) {
    const result = await d1.prepare('SELECT * FROM cost_events ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return result.results || [];
  }

  async function checkRateLimit({ bucket, limit, windowMs, now }) {
    const row = await d1.prepare(`
      INSERT INTO rate_limits(bucket,count,window_start) VALUES(?1,1,?2)
      ON CONFLICT(bucket) DO UPDATE SET
        count = CASE WHEN ?2 - rate_limits.window_start >= ?3 THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN ?2 - rate_limits.window_start >= ?3 THEN ?2 ELSE rate_limits.window_start END
      RETURNING count, window_start
    `).bind(bucket, now, windowMs).first();
    const count = Number(row?.count || 1);
    const windowStart = Number(row?.window_start || now);
    return {
      allowed: count <= limit,
      count,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: windowStart + windowMs
    };
  }

  async function logEvent({ level = 'info', event, detail = {}, now }) {
    await d1.prepare(
      'INSERT INTO ops_events(level,event,detail,created_at) VALUES(?,?,?,?)'
    ).bind(level, event, JSON.stringify(detail), now).run();
  }

  async function listOpsEvents(limit = 50) {
    const result = await d1.prepare('SELECT * FROM ops_events ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return result.results || [];
  }

  async function createBooking({ id, ownerHash, slotKey, startUtc, endUtc, now, inquiryId = null, contactId = null, timezone = null, idempotencyKey = null }) {
    try {
      await d1.prepare(
        "INSERT INTO bookings(id,owner_hash,slot_key,start_utc,end_utc,status,calendar_event_id,meet_link,created_at,updated_at,inquiry_id,contact_id,timezone,idempotency_key) VALUES(?,?,?,?,?,'reserved',NULL,NULL,?,?,?,?,?,?)"
      ).bind(id, ownerHash, slotKey, startUtc, endUtc, now, now, inquiryId, contactId, timezone, idempotencyKey).run();
      return { ok: true, id };
    } catch (error) {
      const message = String(error?.message || error);
      if (message.includes('idempotency')) return { ok: false, code: 'IDEMPOTENCY_TAKEN' };
      if (message.includes('UNIQUE')) return { ok: false, code: 'SLOT_TAKEN' };
      throw error;
    }
  }

  async function cancelBooking({ id, ownerHash, now }) {
    const result = await d1.prepare(
      "UPDATE bookings SET status='cancelled', updated_at=? WHERE id=? AND owner_hash=? AND status!='cancelled'"
    ).bind(now, id, ownerHash).run();
    return (result.meta?.changes || 0) > 0;
  }

  async function listBookings(limit = 50) {
    const result = await d1.prepare('SELECT * FROM bookings ORDER BY start_utc DESC LIMIT ?').bind(limit).all();
    return result.results || [];
  }

  async function claimAction({ key, type = 'action', now }) {
    const result = await d1.prepare(
      "INSERT INTO action_ledger(action_key,action_type,status,payload,created_at) VALUES(?,?,'claimed','{}',?) ON CONFLICT(action_key) DO NOTHING"
    ).bind(key, type, now).run();
    return (result.meta?.changes || 0) === 1;
  }

  async function audit({ actor, action, detail = {}, now }) {
    await d1.prepare(
      'INSERT INTO admin_audit(actor,action,detail,created_at) VALUES(?,?,?,?)'
    ).bind(actor, action, JSON.stringify(detail), now).run();
  }

  async function listAudit(limit = 50) {
    const result = await d1.prepare('SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return result.results || [];
  }

  async function listKnowledgeOverrides() {
    const result = await d1.prepare('SELECT * FROM knowledge_overrides ORDER BY updated_at DESC').all();
    return result.results || [];
  }

  async function upsertKnowledgeOverride({ chunkId, title, text, tags, status, now }) {
    await d1.prepare(`
      INSERT INTO knowledge_overrides(chunk_id,title,text,tags_json,status,updated_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        title=excluded.title, text=excluded.text, tags_json=excluded.tags_json,
        status=excluded.status, updated_at=excluded.updated_at
    `).bind(chunkId, title || null, text || null, JSON.stringify(tags || []), status || 'draft', now).run();
  }

  async function createContact({ id, ownerHash, fullName, email = null, phone = null, organization = null, role = null, locale = 'en', timezone = null, source = 'portfolio', consentStatus = 'none', now }) {
    await d1.prepare(
      'INSERT INTO contacts(id,owner_hash,full_name,email,phone,organization,role,locale,timezone,source,consent_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, ownerHash, fullName, email, phone, organization, role, locale, timezone, source, consentStatus, now, now).run();
    return getContact(id);
  }

  async function getContact(id) {
    return d1.prepare('SELECT * FROM contacts WHERE id=?').bind(id).first();
  }

  async function findContactByEmail(ownerHash, email) {
    if (!email) return null;
    return d1.prepare('SELECT * FROM contacts WHERE owner_hash=? AND lower(email)=lower(?) ORDER BY created_at DESC LIMIT 1').bind(ownerHash, email).first();
  }

  async function createConsent({ id, contactId, scope, status = 'granted', capturedAt, expiresAt = null, source = 'portfolio', evidence = null }) {
    await d1.prepare(
      'INSERT INTO consents(id,contact_id,scope,status,captured_at,expires_at,source,evidence) VALUES(?,?,?,?,?,?,?,?)'
    ).bind(id, contactId, scope, status, capturedAt, expiresAt, source, evidence).run();
  }

  async function listConsents(contactId) {
    const result = await d1.prepare('SELECT * FROM consents WHERE contact_id=? ORDER BY captured_at DESC').bind(contactId).all();
    return result.results || [];
  }

  async function createInquiry({ id, ownerHash, contactId, inquiryType = 'general', summary, requestedService = null, budgetRange = null, timeline = null, status = 'new', source = 'portfolio', sourceUrl = null, consentId = null, clientRequestId = null, now }) {
    await d1.prepare(
      'INSERT INTO inquiries(id,owner_hash,contact_id,inquiry_type,summary,requested_service,budget_range,timeline,status,source,source_url,consent_id,client_request_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, ownerHash, contactId, inquiryType, summary, requestedService, budgetRange, timeline, status, source, sourceUrl, consentId, clientRequestId, now, now).run();
    return getInquiry(id);
  }

  async function getInquiry(id) {
    return d1.prepare('SELECT * FROM inquiries WHERE id=?').bind(id).first();
  }

  async function findInquiryByClientRequest(ownerHash, clientRequestId) {
    if (!clientRequestId) return null;
    return d1.prepare('SELECT * FROM inquiries WHERE owner_hash=? AND client_request_id=? LIMIT 1').bind(ownerHash, clientRequestId).first();
  }

  async function listInquiries({ ownerHash = null, limit = 50 } = {}) {
    const result = ownerHash
      ? await d1.prepare('SELECT * FROM inquiries WHERE owner_hash=? ORDER BY created_at DESC LIMIT ?').bind(ownerHash, limit).all()
      : await d1.prepare('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return result.results || [];
  }

  async function getBookingForOwner(id, ownerHash) {
    return d1.prepare('SELECT * FROM bookings WHERE id=? AND owner_hash=?').bind(id, ownerHash).first();
  }

  async function findBookingByOwnerIdempotency(ownerHash, idempotencyKey) {
    if (!idempotencyKey) return null;
    return d1.prepare('SELECT * FROM bookings WHERE owner_hash=? AND idempotency_key=? LIMIT 1').bind(ownerHash, idempotencyKey).first();
  }

  async function listOverlappingBookings(startUtc, endUtc) {
    const result = await d1.prepare(
      "SELECT * FROM bookings WHERE status IN ('reserved','confirmed','calendar_pending') AND start_utc < ? AND end_utc > ? ORDER BY start_utc"
    ).bind(endUtc, startUtc).all();
    return result.results || [];
  }

  async function listBookingsForOwner(ownerHash, limit = 50) {
    const result = await d1.prepare('SELECT * FROM bookings WHERE owner_hash=? ORDER BY start_utc DESC LIMIT ?').bind(ownerHash, limit).all();
    return result.results || [];
  }

  async function updateBookingCalendar({ id, status, calendarEventId = null, meetLink = null, statusDetail = null, now }) {
    await d1.prepare(
      'UPDATE bookings SET status=?, calendar_event_id=?, meet_link=?, status_detail=?, updated_at=? WHERE id=?'
    ).bind(status, calendarEventId, meetLink, statusDetail, now, id).run();
    return d1.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();
  }

  async function rescheduleBooking({ id, startUtc, endUtc, slotKey, timezone, calendarEventId = null, meetLink = null, status = 'reserved', statusDetail = null, now }) {
    try {
      await d1.prepare(
        'UPDATE bookings SET start_utc=?, end_utc=?, slot_key=?, timezone=?, calendar_event_id=?, meet_link=?, status=?, status_detail=?, updated_at=? WHERE id=?'
      ).bind(startUtc, endUtc, slotKey, timezone, calendarEventId, meetLink, status, statusDetail, now, id).run();
      return { ok: true, booking: await d1.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first() };
    } catch (error) {
      if (String(error?.message || error).includes('UNIQUE')) return { ok: false, code: 'SLOT_TAKEN' };
      throw error;
    }
  }

  async function addEmailJob({ id, kind, toEmail, subject, body, status = 'queued', provider = 'resend', inquiryId = null, appointmentId = null, now }) {
    await d1.prepare(
      'INSERT INTO email_jobs(id,kind,to_email,subject,body,status,provider,inquiry_id,appointment_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, kind, toEmail, subject, body, status, provider, inquiryId, appointmentId, now, now).run();
  }

  async function listEmailJobs(limit = 50) {
    const result = await d1.prepare('SELECT * FROM email_jobs ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return result.results || [];
  }

  async function updateEmailJob({ id, status, sentAt = null, error = null, now }) {
    await d1.prepare('UPDATE email_jobs SET status=?, sent_at=?, error=?, updated_at=? WHERE id=?').bind(status, sentAt, error, now, id).run();
  }

  async function createLiveTokenReservation({ id, ownerHash, sessionId, reservedUsdMicros, now, expiresAt }) {
    await d1.prepare(
      "INSERT INTO live_tokens(id,owner_hash,session_id,reserved_usd_micros,status,created_at,expires_at) VALUES(?,?,?,?,'held',?,?)"
    ).bind(id, ownerHash, sessionId, reservedUsdMicros, now, expiresAt).run();
  }

  async function getLiveTokenReservation(id) {
    return d1.prepare('SELECT * FROM live_tokens WHERE id=?').bind(id).first();
  }

  async function reconcileLiveToken({ id, reportedUsdMicros, now }) {
    const result = await d1.prepare(
      "UPDATE live_tokens SET status='reconciled', reported_usd_micros=?, reconciled_at=? WHERE id=? AND status='held'"
    ).bind(reportedUsdMicros, now, id).run();
    return (result.meta?.changes || 0) > 0;
  }

  async function failLiveToken({ id, now }) {
    await d1.prepare("UPDATE live_tokens SET status='failed', reconciled_at=? WHERE id=? AND status='held'").bind(now, id).run();
  }

  async function sumHeldLiveTokens({ since = 0, now } = {}) {
    const row = await d1.prepare(
      "SELECT COALESCE(SUM(reserved_usd_micros),0) AS total FROM live_tokens WHERE status='held' AND created_at>=? AND expires_at>?"
    ).bind(since, now).first();
    return Number(row?.total || 0);
  }

  async function cleanup({ now, rateWindowMs }) {
    const expiredSessions = await deleteExpiredSessions(now);
    const staleRates = await d1.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - rateWindowMs).run();
    const oldEvents = await d1.prepare('DELETE FROM ops_events WHERE created_at < ?').bind(now - 30 * 86_400_000).run();
    return {
      expiredSessions,
      staleRateBuckets: staleRates.meta?.changes || 0,
      oldOpsEvents: oldEvents.meta?.changes || 0
    };
  }

  return {
    raw: d1,
    health,
    createSession,
    getSession,
    getSessionForOwner,
    updateSession,
    updateSessionSummary,
    appendMessage,
    listMessages,
    listSessions,
    deleteExpiredSessions,
    getControls,
    getControl,
    setControl,
    getCostSince,
    getCostTotal,
    recordCost,
    listCostEvents,
    checkRateLimit,
    logEvent,
    listOpsEvents,
    claimAction,
    createContact,
    getContact,
    findContactByEmail,
    createConsent,
    listConsents,
    createInquiry,
    getInquiry,
    findInquiryByClientRequest,
    listInquiries,
    createBooking,
    getBookingForOwner,
    findBookingByOwnerIdempotency,
    listOverlappingBookings,
    listBookingsForOwner,
    updateBookingCalendar,
    rescheduleBooking,
    addEmailJob,
    listEmailJobs,
    updateEmailJob,
    createLiveTokenReservation,
    getLiveTokenReservation,
    reconcileLiveToken,
    failLiveToken,
    sumHeldLiveTokens,
    cancelBooking,
    listBookings,
    audit,
    listAudit,
    listKnowledgeOverrides,
    upsertKnowledgeOverride,
    cleanup
  };
}
