export function createCalendarAdapter({ auth, calendarId }) {
  if (!calendarId) throw new Error('Google Calendar adapter requires a calendar id');
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

  async function getCalendar() {
    const data = await auth.json(base);
    return { summary: data.summary || null, timeZone: data.timeZone || null, accessRole: data.accessRole || null };
  }

  async function freeBusy(timeMin, timeMax) {
    const data = await auth.json('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] })
    });
    return data.calendars?.[calendarId]?.busy || [];
  }

  async function createEvent({ summary, description, start, end, timeZone = 'America/Toronto', withMeet = true }) {
    const body = {
      summary,
      description,
      start: { dateTime: start, timeZone },
      end: { dateTime: end, timeZone },
      ...(withMeet ? {
        conferenceData: {
          createRequest: {
            requestId: `ainour-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      } : {})
    };
    const data = await auth.json(`${base}/events?conferenceDataVersion=1&sendUpdates=none`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return {
      id: data.id,
      htmlLink: data.htmlLink || null,
      meetLink: data.hangoutLink || data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri || null,
      start: data.start,
      end: data.end
    };
  }

  async function reschedule(id, start, end, timeZone = 'America/Toronto') {
    return auth.json(`${base}/events/${encodeURIComponent(id)}?sendUpdates=none`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ start: { dateTime: start, timeZone }, end: { dateTime: end, timeZone } })
    });
  }

  async function cancel(id) {
    const response = await auth.request(`${base}/events/${encodeURIComponent(id)}?sendUpdates=none`, { method: 'DELETE' });
    if (![200, 204, 404, 410].includes(response.status)) {
      throw new Error(`Calendar cancel failed with HTTP ${response.status}`);
    }
    return true;
  }

  async function listUpcoming(limit = 10) {
    const timeMin = new Date().toISOString();
    const data = await auth.json(`${base}/events?singleEvents=true&orderBy=startTime&maxResults=${limit}&timeMin=${encodeURIComponent(timeMin)}`);
    return data.items || [];
  }

  return { getCalendar, freeBusy, createEvent, reschedule, cancel, listUpcoming };
}
