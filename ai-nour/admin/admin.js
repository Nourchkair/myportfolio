const state = {
  status: null,
  flags: null,
  cost: null,
  active: 'overview'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (micros) => `$${(Number(micros || 0) / 1_000_000).toFixed(4)}`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const time = (value) => value ? new Date(Number(value)).toLocaleString() : '—';

function showError(message) {
  const node = $('#error');
  node.textContent = message;
  node.classList.toggle('hidden', !message);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(body?.error?.message || body?.error || `HTTP ${response.status}`);
  return body;
}

function cards(items) {
  return items.map((item) => `<div class="card"><div class="label">${esc(item.label)}</div><div class="value">${esc(item.value)}</div>${item.sub ? `<div class="sub">${esc(item.sub)}</div>` : ''}</div>`).join('');
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderOverview() {
  const s = state.status;
  if (!s) return;
  $('#overview-cards').innerHTML = cards([
    { label: 'Environment', value: s.environment, sub: s.version },
    { label: 'Text model', value: s.models.text, sub: s.providers.text },
    { label: 'Live model', value: s.models.live, sub: `voice ${s.models.voice}` },
    { label: 'Daily spend (USD)', value: money(s.budget.dailyUsdMicros), sub: `cap ${money(s.budget.dailyCapUsdMicros)}` },
    { label: 'Cumulative spend (USD)', value: money(s.budget.cumulativeUsdMicros), sub: `cap ${money(s.budget.cumulativeCapUsdMicros)}` },
    { label: 'Knowledge corpus', value: `${s.corpus.chunks} chunks`, sub: s.corpus.contentHash },
    { label: 'Google', value: s.google.configured ? 'configured' : 'not configured', sub: `sheets ${s.google.spreadsheet ? 'yes' : 'no'} · calendar ${s.google.calendar ? 'yes' : 'no'}` },
    { label: 'Sessions', value: String(s.counts.sessions), sub: 'recent shown in Sessions' }
  ]);
  const flags = s.flags;
  $('#overview-flags').innerHTML = `<h3>Active controls</h3>${table(['Flag', 'Value'], Object.entries(flags).filter(([key]) => key !== 'persona').map(([key, value]) => [esc(key), value ? 'on' : 'off']))}`;
}

function renderControls() {
  const flags = state.flags;
  if (!flags) return;
  const keys = ['assistant_enabled', 'text_enabled', 'live_enabled', 'prototype_enabled', 'google_writes_enabled'];
  $('#flag-controls').innerHTML = keys.map((key) => `<label><span>${esc(key)}${key === 'google_writes_enabled' ? ' <span class="muted">(leave off in the prototype)</span>' : ''}</span><input type="checkbox" data-flag="${esc(key)}" ${flags[key] ? 'checked' : ''}></label>`).join('');
}

async function saveFlags() {
  const flags = Object.fromEntries($$('#flag-controls input[data-flag]').map((input) => [input.dataset.flag, input.checked]));
  const result = await api('/api/admin/flags', { method: 'PATCH', body: JSON.stringify({ flags }) });
  state.flags = result.flags;
  state.status.flags = result.flags;
  $('#flags-result').textContent = 'Controls saved.';
  renderOverview();
}

function renderPersona() {
  if (!state.flags) return;
  $('#persona').value = state.flags.persona || '';
}

async function savePersona() {
  const persona = $('#persona').value;
  const result = await api('/api/admin/persona', { method: 'PATCH', body: JSON.stringify({ persona }) });
  state.flags.persona = result.persona;
  $('#persona-result').textContent = 'Personality saved.';
}

function renderCost(data) {
  const budget = data.budget;
  $('#cost-summary').innerHTML = cards([
    { label: 'Daily (USD)', value: money(budget.dailyUsdMicros), sub: `cap ${money(budget.dailyCapUsdMicros)}` },
    { label: 'Cumulative (USD)', value: money(budget.cumulativeUsdMicros), sub: `cap ${money(budget.cumulativeCapUsdMicros)}` },
    { label: 'Remaining', value: money(budget.cumulativeRemainingUsdMicros), sub: budget.allowed ? 'within budget' : 'cap reached' }
  ]);
  $('#cost-events').innerHTML = table(
    ['Time', 'Provider', 'Model', 'Capability', 'In', 'Out', 'USD'],
    (data.events || []).map((event) => [
      time(event.created_at), esc(event.provider), esc(event.model || '—'), esc(event.capability),
      esc(event.input_tokens), esc(event.output_tokens), money(event.usd_micros)
    ])
  );
}

async function loadSessions() {
  const data = await api('/api/admin/sessions');
  $('#session-list').innerHTML = table(
    ['Session', 'Locale', 'Turns', 'Messages', 'Updated', ''],
    (data.sessions || []).map((session) => [
      `<code>${esc(session.id)}</code>`, esc(session.locale), esc(session.turnCount), esc(session.messageCount), time(session.updatedAt),
      `<button data-session="${esc(session.id)}">View</button>`
    ])
  );
  $$('#session-list button[data-session]').forEach((button) => button.addEventListener('click', async () => {
    const result = await api(`/api/admin/sessions/${encodeURIComponent(button.dataset.session)}`);
    $('#session-detail').textContent = JSON.stringify(result, null, 2);
  }));
}

async function loadKnowledge() {
  const data = await api('/api/admin/knowledge');
  $('#knowledge-meta').innerHTML = cards([
    { label: 'Chunks', value: String(data.corpus.chunks), sub: data.corpus.contentHash },
    { label: 'Overrides', value: String(data.overrides?.length || 0), sub: 'draft only; not applied to retrieval yet' }
  ]);
  $('#knowledge-overrides').innerHTML = table(
    ['Chunk', 'Title', 'Status', 'Updated'],
    (data.overrides || []).map((item) => [`<code>${esc(item.chunk_id)}</code>`, esc(item.title || '—'), esc(item.status), time(item.updated_at)])
  );
  window.__knowledgeData = data;
}

async function searchKnowledge() {
  const q = $('#knowledge-query').value.trim();
  if (!q) return;
  const data = await api(`/api/admin/knowledge?q=${encodeURIComponent(q)}`);
  $('#knowledge-results').innerHTML = table(
    ['Score', 'Chunk', 'Title', 'Route'],
    (data.search || []).map((result) => [esc(result.score), `<code>${esc(result.id)}</code>`, esc(result.title), esc(result.route)])
  );
}

async function loadIntegrations() {
  const data = await api('/api/admin/integrations');
  const g = data.google || {};
  const section = (name, item) => ({
    label: name,
    value: item?.ok ? 'OK' : 'FAILED',
    sub: item?.ok
      ? [item.title, item.summary, item.draftCount !== undefined ? `${item.draftCount} drafts` : '', item.knowledgeFolder ? 'folders found' : ''].filter(Boolean).join(' · ')
      : (item?.error || 'not configured')
  });
  $('#integration-status').innerHTML = cards([
    { label: 'OAuth token', value: g.token?.ok ? 'OK' : 'FAILED', sub: g.token?.ok ? `${g.token.scopes?.length || 0} scopes` : (g.token?.error || '') },
    section('Sheets', g.sheets),
    section('Calendar', g.calendar),
    section('Drive', g.drive),
    section('Gmail', g.gmail)
  ]);
  const allow = Boolean(state.status?.google?.allowSyntheticWrites);
  $('#synthetic-test').disabled = !allow;
  $('#synthetic-test').title = allow ? 'Runs and cleans up synthetic Google objects' : 'Disabled by ALLOW_SYNTHETIC_WRITES';
}

async function runSynthetic() {
  $('#synthetic-result').textContent = 'Running synthetic test…';
  try {
    const result = await api('/api/admin/integrations/synthetic', { method: 'POST', body: '{}' });
    $('#synthetic-result').textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    $('#synthetic-result').textContent = String(error.message || error);
  }
}

async function loadCRM() {
  const [crm, bookings, inquiries, emails] = await Promise.all([
    api('/api/admin/crm'),
    api('/api/admin/bookings'),
    api('/api/admin/inquiries'),
    api('/api/admin/email')
  ]);
  const counts = crm.crm?.counts || {};
  $('#crm-summary').innerHTML = cards([
    { label: 'CRM', value: crm.crm?.title || 'not configured', sub: `${crm.crm?.tabs?.length || 0} tabs` },
    ...Object.entries(counts).map(([tab, count]) => ({ label: tab, value: String(count), sub: 'records' })),
    { label: 'Inquiries (D1)', value: String(inquiries.inquiries?.length || 0), sub: 'synthetic/local' },
    { label: 'Email jobs', value: String(emails.jobs?.length || 0), sub: `${emails.provider} · ${emails.sendEnabled ? 'send enabled' : 'dry-run'}` }
  ]);
  $('#inquiry-list').innerHTML = table(
    ['Created', 'Type', 'Status', 'Summary', 'Contact', 'Owner'],
    (inquiries.inquiries || []).map((item) => [
      time(item.created_at), esc(item.inquiry_type), esc(item.status), esc(String(item.summary).slice(0, 90)),
      `<code>${esc(String(item.contact_id).slice(0, 8))}…</code>`, `<code>${esc(String(item.owner_hash).slice(0, 8))}…</code>`
    ])
  );
  $('#booking-list').innerHTML = table(
    ['Slot', 'Status', 'Meet link', 'Owner hash', 'Created'],
    (bookings.bookings || []).map((booking) => [
      esc(`${new Date(Number(booking.start_utc)).toLocaleString()} → ${new Date(Number(booking.end_utc)).toLocaleTimeString()}`),
      esc(booking.status), booking.meet_link ? '<span class="muted">present</span>' : '—', `<code>${esc(String(booking.owner_hash).slice(0, 12))}…</code>`, time(booking.created_at)
    ])
  );
  $('#email-jobs').innerHTML = table(
    ['Created', 'Kind', 'To', 'Status', 'Provider'],
    (emails.jobs || []).map((job) => [time(job.created_at), esc(job.kind), esc(job.to_email), esc(job.status), esc(job.provider)])
  );
}

async function processEmail() {
  $('#email-result').textContent = 'Processing queued jobs…';
  try {
    const result = await api('/api/admin/email/process', { method: 'POST', body: '{}' });
    $('#email-result').textContent = `${result.results?.length || 0} jobs processed · send enabled: ${result.sendEnabled}`;
    await loadCRM();
  } catch (error) {
    $('#email-result').textContent = String(error.message || error);
  }
}

async function loadAudit() {
  const data = await api('/api/admin/audit');
  $('#audit-list').innerHTML = table(
    ['Time', 'Actor', 'Action', 'Detail'],
    (data.audit || []).map((item) => [time(item.created_at), esc(item.actor), esc(item.action), `<code>${esc(item.detail)}</code>`])
  );
  $('#ops-list').innerHTML = table(
    ['Time', 'Level', 'Event', 'Detail'],
    (data.events || []).map((item) => [time(item.created_at), esc(item.level), esc(item.event), `<code>${esc(item.detail)}</code>`])
  );
}

async function loadTab(tab) {
  showError('');
  state.active = tab;
  $$('nav button').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  $$('.panel').forEach((panel) => panel.classList.add('hidden'));
  $(`#tab-${tab}`).classList.remove('hidden');
  $('#page-title').textContent = $(`nav button[data-tab="${tab}"]`).textContent;
  try {
    if (tab === 'overview') {
      state.status = await api('/api/admin/status');
      state.flags = state.status.flags;
      renderOverview();
    } else if (tab === 'controls') {
      if (!state.flags) state.flags = (await api('/api/admin/flags')).flags;
      renderControls();
    } else if (tab === 'persona') {
      if (!state.flags) state.flags = (await api('/api/admin/flags')).flags;
      renderPersona();
    } else if (tab === 'cost') {
      renderCost(await api('/api/admin/cost'));
    } else if (tab === 'sessions') {
      await loadSessions();
    } else if (tab === 'knowledge') {
      await loadKnowledge();
    } else if (tab === 'integrations') {
      await loadIntegrations();
    } else if (tab === 'crm') {
      await loadCRM();
    } else if (tab === 'audit') {
      await loadAudit();
    }
  } catch (error) {
    showError(String(error.message || error));
  }
}

$$('nav button').forEach((button) => button.addEventListener('click', () => loadTab(button.dataset.tab)));
$('#refresh').addEventListener('click', () => loadTab(state.active));
$('#save-flags').addEventListener('click', () => saveFlags().catch((error) => showError(error.message)));
$('#save-persona').addEventListener('click', () => savePersona().catch((error) => showError(error.message)));
$('#knowledge-search').addEventListener('click', () => searchKnowledge().catch((error) => showError(error.message)));
$('#refresh-integrations').addEventListener('click', () => loadIntegrations().catch((error) => showError(error.message)));
$('#synthetic-test').addEventListener('click', () => runSynthetic());
$('#process-email').addEventListener('click', () => processEmail());

api('/api/admin/status').then((status) => {
  state.status = status;
  state.flags = status.flags;
  $('#worker-note').textContent = `${status.environment} · ${status.version} · ${status.models.text} / ${status.models.live}`;
  renderOverview();
}).catch((error) => showError(String(error.message || error)));

loadTab('overview');
