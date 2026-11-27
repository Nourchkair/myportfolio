export function createSheetsAdapter({ auth, spreadsheetId }) {
  if (!spreadsheetId) throw new Error('Google Sheets adapter requires a spreadsheet id');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;

  async function meta() {
    const data = await auth.json(`${base}?fields=properties.title,sheets.properties`);
    return {
      title: data.properties?.title || null,
      tabs: (data.sheets || []).map((sheet) => ({ title: sheet.properties?.title, sheetId: sheet.properties?.sheetId })).filter((sheet) => sheet.title)
    };
  }

  async function values(range) {
    const data = await auth.json(`${base}/values/${encodeURIComponent(range)}`);
    return data.values || [];
  }

  async function append(tab, row) {
    return auth.json(`${base}/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ majorDimension: 'ROWS', values: [row] })
    });
  }

  async function update(range, rows) {
    return auth.json(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ majorDimension: 'ROWS', values: rows })
    });
  }

  async function batchUpdate(requests) {
    return auth.json(`${base}:batchUpdate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests })
    });
  }

  async function addSheet(title) {
    const data = await batchUpdate([{ addSheet: { properties: { title, gridProperties: { rowCount: 50, columnCount: 16 } } } }]);
    return data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
  }

  async function deleteSheet(sheetId) {
    await batchUpdate([{ deleteSheet: { sheetId } }]);
    return true;
  }

  async function crmSummary() {
    const info = await meta();
    const counts = {};
    for (const tab of info.tabs) {
      const rows = await values(`${tab.title}!A2:A500`);
      counts[tab.title] = rows.filter((row) => String(row[0] || '').trim()).length;
    }
    return { title: info.title, tabs: info.tabs.map((tab) => tab.title), counts };
  }

  async function syntheticRoundTrip() {
    const title = `_Phase1_${Date.now()}`;
    const sheetId = await addSheet(title);
    try {
      const headers = ['record_id', 'status', 'summary'];
      await update(`${title}!A1:C1`, [headers]);
      await append(title, ['P1-SYNTHETIC-1', 'New', 'Synthetic Phase 1 test']);
      const rows = await values(`${title}!A1:C5`);
      const recordPresent = rows.some((row) => row[0] === 'P1-SYNTHETIC-1');
      const cleanedUp = await deleteSheet(sheetId);
      return {
        ok: sheetId !== null && recordPresent && cleanedUp,
        created: sheetId !== null,
        rows: rows.length,
        recordPresent,
        cleanedUp
      };
    } catch (error) {
      if (sheetId !== null) await deleteSheet(sheetId).catch(() => false);
      throw error;
    }
  }

  return { meta, values, append, update, batchUpdate, addSheet, deleteSheet, crmSummary, syntheticRoundTrip };
}
