import { createGoogleAuth } from './auth.js';
import { createSheetsAdapter } from './sheets.js';
import { createCalendarAdapter } from './calendar.js';
import { createDriveAdapter } from './drive.js';
import { createGmailAdapter } from './gmail.js';
import { IntegrationError } from '../errors.js';

export function createGoogleServices(config, fetchImpl = fetch) {
  if (!config.google.configured) {
    return {
      configured: false,
      status: async () => ({ configured: false, ok: false }),
      syntheticTest: async () => { throw new IntegrationError('GOOGLE_NOT_CONFIGURED', 'Google integration is not configured'); }
    };
  }

  const auth = createGoogleAuth({
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    refreshToken: config.google.refreshToken,
    fetchImpl
  });
  const sheets = createSheetsAdapter({ auth, spreadsheetId: config.google.spreadsheetId });
  const calendar = createCalendarAdapter({ auth, calendarId: config.google.calendarId });
  const drive = createDriveAdapter({
    auth,
    knowledgeFolderId: config.google.knowledgeFolderId,
    backupFolderId: config.google.backupFolderId,
    backupKey: config.google.backupKey,
    fetchImpl
  });
  const gmail = createGmailAdapter({ auth });

  let statusCache = null;
  let statusAt = 0;

  async function status({ force = false } = {}) {
    if (!force && statusCache && Date.now() - statusAt < 60_000) return statusCache;
    const [token, sheetsResult, calendarResult, driveResult, gmailResult] = await Promise.allSettled([
      auth.tokenInfo(),
      sheets.meta(),
      calendar.getCalendar(),
      drive.status(),
      gmail.listDrafts(1)
    ]);
    const section = (result, extra = {}) => result.status === 'fulfilled'
      ? { ok: true, ...extra, ...(result.value || {}) }
      : { ok: false, error: result.reason?.code || 'INTEGRATION_ERROR' };
    statusCache = {
      configured: true,
      ok: token.status === 'fulfilled',
      token: token.status === 'fulfilled' ? { ok: true, scopes: token.value.scopes, expiresAt: token.value.expiresAt } : { ok: false, error: token.reason?.code || 'TOKEN_ERROR' },
      sheets: section(sheetsResult),
      calendar: section(calendarResult),
      drive: section(driveResult),
      gmail: gmailResult.status === 'fulfilled'
        ? { ok: true, draftCount: gmailResult.value.length }
        : { ok: false, error: gmailResult.reason?.code || 'INTEGRATION_ERROR' }
    };
    statusAt = Date.now();
    return statusCache;
  }

  async function syntheticTest() {
    const results = {};
    try {
      results.sheets = await sheets.syntheticRoundTrip();
    } catch (error) {
      results.sheets = { ok: false, error: error?.code || error?.message || 'SHEETS_TEST_FAILED' };
    }
    try {
      const start = new Date(Date.now() + 30 * 86_400_000);
      start.setUTCHours(15, 0, 0, 0);
      const end = new Date(start.getTime() + 15 * 60_000);
      const event = await calendar.createEvent({
        summary: 'AI Nour Phase 1 synthetic — delete me',
        description: 'Synthetic Phase 1 test. No attendees.',
        start: start.toISOString(),
        end: end.toISOString(),
        timeZone: 'America/Toronto',
        withMeet: true
      });
      let cancelled = false;
      if (event.id) cancelled = await calendar.cancel(event.id);
      results.calendar = { ok: Boolean(event.id && event.meetLink && cancelled), meetLinkPresent: Boolean(event.meetLink), cancelled };
    } catch (error) {
      results.calendar = { ok: false, error: error?.code || error?.message || 'CALENDAR_TEST_FAILED' };
    }
    try {
      results.drive = { ok: true, ...(await drive.backupRoundTripTest()) };
    } catch (error) {
      results.drive = { ok: false, error: error?.code || error?.message || 'DRIVE_TEST_FAILED' };
    }
    try {
      results.gmail = { ok: true, ...(await gmail.draftRoundTripTest()) };
    } catch (error) {
      results.gmail = { ok: false, error: error?.code || error?.message || 'GMAIL_TEST_FAILED' };
    }
    return results;
  }

  return { configured: true, auth, sheets, calendar, drive, gmail, status, syntheticTest };
}
