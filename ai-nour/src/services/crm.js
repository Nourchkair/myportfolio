import { AppError } from '../http/errors.js';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../http/errors.js';
import {
  appointmentCancelled,
  appointmentConfirmation,
  appointmentRescheduled,
  inquiryAcknowledgement,
  internalAppointment,
  internalInquiry
} from '../integrations/email/templates.js';

const INQUIRY_TYPES = new Set(['general', 'consulting', 'recruitment', 'partnership', 'media', 'other']);
const TIMEZONE_MAX = 64;

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeEmail(value) {
  const address = clean(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw badRequest('A valid email address is required');
  return address;
}

function timeMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) throw badRequest('A valid date/time is required');
  return parsed;
}

function bookingView(row) {
  if (!row) return null;
  return {
    id: row.id,
    inquiryId: row.inquiry_id || null,
    contactId: row.contact_id || null,
    startUtc: Number(row.start_utc),
    endUtc: Number(row.end_utc),
    timezone: row.timezone || 'America/Toronto',
    status: row.status,
    calendarEventId: row.calendar_event_id || null,
    meetLink: row.meet_link || null,
    statusDetail: row.status_detail || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

export function createCrmService({ db, config, google, email }) {
  function requireWrites() {
    if (!config.crmWritesEnabled) throw forbidden('CRM writes are disabled in this prototype');
  }

  async function hasEmailConsent(contactId) {
    const consents = await db.listConsents(contactId);
    return consents.some((item) => item.scope === 'email' && item.status === 'granted');
  }

  async function enqueue({ kind, to, template, dedupeKey, inquiryId = null, appointmentId = null, now }) {
    if (!to || !template) return null;
    return email.enqueue({
      db,
      kind,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
      dedupeKey,
      inquiryId,
      appointmentId,
      now
    });
  }

  async function visitorEmail({ contact, kind, template, dedupeKey, inquiryId = null, appointmentId = null, now }) {
    if (!contact?.email) return null;
    if (!(await hasEmailConsent(contact.id))) return null;
    return enqueue({ kind, to: contact.email, template, dedupeKey, inquiryId, appointmentId, now });
  }

  async function internalEmail({ kind, template, dedupeKey, inquiryId = null, appointmentId = null, now }) {
    if (!config.email.internalTo) return null;
    return enqueue({ kind, to: config.email.internalTo, template, dedupeKey, inquiryId, appointmentId, now });
  }

  async function createInquiry({ ownerHash, body, now = Date.now() }) {
    requireWrites();
    const fullName = clean(body.fullName || body.name, 120);
    const address = normalizeEmail(body.email);
    const summary = clean(body.summary, 1200);
    const type = INQUIRY_TYPES.has(body.inquiryType) ? body.inquiryType : 'general';
    const consent = body.consent || {};
    if (!fullName) throw badRequest('Full name is required');
    if (!summary) throw badRequest('Inquiry summary is required');
    if (consent.store !== true || consent.contact !== true) {
      throw badRequest('Consent to store the inquiry and contact the visitor is required');
    }
    const clientRequestId = clean(body.clientRequestId, 80) || null;
    if (clientRequestId) {
      const existing = await db.findInquiryByClientRequest(ownerHash, clientRequestId);
      if (existing) return { duplicate: true, inquiry: existing, contact: await db.getContact(existing.contact_id) };
    }

    let contact = await db.findContactByEmail(ownerHash, address);
    if (!contact) {
      contact = await db.createContact({
        id: crypto.randomUUID(),
        ownerHash,
        fullName,
        email: address,
        phone: clean(body.phone, 40) || null,
        organization: clean(body.organization, 160) || null,
        role: clean(body.role, 120) || null,
        locale: body.locale === 'fr' ? 'fr' : 'en',
        timezone: clean(body.timezone, TIMEZONE_MAX) || null,
        source: clean(body.source, 40) || 'portfolio',
        consentStatus: 'granted',
        now
      });
    }

    const scopes = ['store', 'contact', 'email', 'followup'];
    let firstConsentId = null;
    for (const scope of scopes) {
      if (consent[scope] !== true) continue;
      const id = crypto.randomUUID();
      if (!firstConsentId) firstConsentId = id;
      await db.createConsent({
        id,
        contactId: contact.id,
        scope,
        status: 'granted',
        capturedAt: now,
        source: 'portfolio',
        evidence: clean(body.consentEvidence, 240) || null
      });
    }

    const inquiry = await db.createInquiry({
      id: crypto.randomUUID(),
      ownerHash,
      contactId: contact.id,
      inquiryType: type,
      summary,
      requestedService: clean(body.requestedService, 160) || null,
      budgetRange: clean(body.budgetRange, 80) || null,
      timeline: clean(body.timeline, 120) || null,
      source: clean(body.source, 40) || 'portfolio',
      sourceUrl: clean(body.sourceUrl, 240) || null,
      consentId: firstConsentId,
      clientRequestId,
      now
    });

    const acknowledgement = inquiryAcknowledgement({ contact, inquiry });
    await visitorEmail({
      contact,
      kind: 'inquiry_acknowledgement',
      template: acknowledgement,
      dedupeKey: `inquiry-ack:${inquiry.id}`,
      inquiryId: inquiry.id,
      now
    });
    await internalEmail({
      kind: 'inquiry_internal',
      template: internalInquiry({ contact, inquiry }),
      dedupeKey: `inquiry-internal:${inquiry.id}`,
      inquiryId: inquiry.id,
      now
    });

    return { inquiry, contact, duplicate: false };
  }

  async function availability({ fromUtc, toUtc, timezone = 'America/Toronto', now = Date.now() }) {
    const from = fromUtc ? timeMs(fromUtc) : now;
    const to = toUtc ? timeMs(toUtc) : now + 7 * 86_400_000;
    if (to <= from) throw badRequest('Availability window is invalid');
    if (to - from > 30 * 86_400_000) throw badRequest('Availability window is too large');
    const busy = (await db.listOverlappingBookings(from, to)).map((row) => ({
      startUtc: Number(row.start_utc),
      endUtc: Number(row.end_utc),
      status: row.status,
      source: 'd1'
    }));
    let calendarWarning = null;
    if (google?.configured) {
      try {
        const blocks = await google.calendar.freeBusy(new Date(from).toISOString(), new Date(to).toISOString());
        busy.push(...blocks.map((block) => ({
          startUtc: Date.parse(block.start),
          endUtc: Date.parse(block.end),
          status: 'busy',
          source: 'google_calendar'
        })));
      } catch (error) {
        calendarWarning = error?.code || 'CALENDAR_UNAVAILABLE';
      }
    }
    return { fromUtc: from, toUtc: to, timezone: clean(timezone, TIMEZONE_MAX) || 'America/Toronto', busy, calendarWarning };
  }

  async function createAppointment({ ownerHash, body, flags, now = Date.now() }) {
    requireWrites();
    const inquiry = await db.getInquiry(body.inquiryId);
    if (!inquiry || inquiry.owner_hash !== ownerHash) throw notFound('Inquiry not found');
    const contact = await db.getContact(inquiry.contact_id);
    if (!contact) throw notFound('Contact not found');
    const startUtc = timeMs(body.startUtc);
    const endUtc = timeMs(body.endUtc);
    if (endUtc <= startUtc) throw badRequest('Appointment window is invalid');
    if (endUtc - startUtc > 4 * 3_600_000) throw badRequest('Appointment is too long');
    const timezone = clean(body.timezone, TIMEZONE_MAX) || 'America/Toronto';
    const idempotencyKey = clean(body.idempotencyKey, 100);
    if (!idempotencyKey) throw badRequest('idempotencyKey is required');
    const existing = await db.findBookingByOwnerIdempotency(ownerHash, idempotencyKey);
    if (existing) return { duplicate: true, booking: bookingView(existing) };

    const overlap = await db.listOverlappingBookings(startUtc, endUtc);
    if (overlap.length) throw conflict('That time is no longer available');

    const calendarWrites = Boolean(flags.google_writes_enabled && google?.configured);
    if (calendarWrites) {
      try {
        const busy = await google.calendar.freeBusy(new Date(startUtc).toISOString(), new Date(endUtc).toISOString());
        if (busy.length) throw conflict('That time is no longer available');
      } catch (error) {
        if (error instanceof AppError) throw error;
        // Calendar availability failure is recoverable; the D1 lock is still authoritative.
      }
    }

    const slotKey = `${startUtc}-${endUtc}`;
    const created = await db.createBooking({
      id: crypto.randomUUID(),
      ownerHash,
      slotKey,
      startUtc,
      endUtc,
      inquiryId: inquiry.id,
      contactId: contact.id,
      timezone,
      idempotencyKey,
      now
    });
    if (!created.ok) {
      if (created.code === 'IDEMPOTENCY_TAKEN') {
        const duplicate = await db.findBookingByOwnerIdempotency(ownerHash, idempotencyKey);
        return { duplicate: true, booking: bookingView(duplicate) };
      }
      throw conflict('That time is no longer available');
    }

    let booking = await db.getBookingForOwner(created.id, ownerHash);
    if (!calendarWrites) {
      return { booking: bookingView(booking), calendarPending: true, reason: 'google_writes_disabled' };
    }

    try {
      const event = await google.calendar.createEvent({
        summary: `AI Nour — ${contact.full_name}`,
        description: 'Appointment requested through AI Nour. AI Nour is an AI representation, not Nour Chkair.',
        start: new Date(startUtc).toISOString(),
        end: new Date(endUtc).toISOString(),
        timeZone: timezone,
        withMeet: true
      });
      booking = await db.updateBookingCalendar({
        id: booking.id,
        status: 'confirmed',
        calendarEventId: event.id,
        meetLink: event.meetLink,
        statusDetail: 'calendar_confirmed',
        now
      });
      const view = bookingView(booking);
      const mail = appointmentConfirmation({ contact, booking: view });
      const emailJob = await visitorEmail({
        contact,
        kind: 'appointment_confirmation',
        template: mail,
        dedupeKey: `appointment-confirmation:${booking.id}`,
        inquiryId: inquiry.id,
        appointmentId: booking.id,
        now
      });
      await internalEmail({
        kind: 'appointment_internal',
        template: internalAppointment({ contact, booking: view, event: 'confirmed' }),
        dedupeKey: `appointment-internal:${booking.id}:confirmed`,
        inquiryId: inquiry.id,
        appointmentId: booking.id,
        now
      });
      return { booking: view, calendarPending: false, emailJobId: emailJob?.id || null };
    } catch (error) {
      booking = await db.updateBookingCalendar({
        id: booking.id,
        status: 'calendar_pending',
        calendarEventId: null,
        meetLink: null,
        statusDetail: error?.code || 'CALENDAR_FAILED',
        now
      });
      const view = bookingView(booking);
      await internalEmail({
        kind: 'appointment_internal',
        template: internalAppointment({ contact, booking: view, event: 'calendar_pending' }),
        dedupeKey: `appointment-internal:${booking.id}:calendar_pending`,
        inquiryId: inquiry.id,
        appointmentId: booking.id,
        now
      });
      return {
        booking: view,
        calendarPending: true,
        recoverable: true,
        recovery: `/api/crm/appointments/${booking.id}/reconcile`,
        warning: error?.code || 'CALENDAR_FAILED'
      };
    }
  }

  async function reschedule({ ownerHash, id, body, flags, now = Date.now() }) {
    requireWrites();
    const booking = await db.getBookingForOwner(id, ownerHash);
    if (!booking) throw notFound('Appointment not found');
    if (booking.status === 'cancelled') throw conflict('Appointment is already cancelled');
    const startUtc = timeMs(body.startUtc);
    const endUtc = timeMs(body.endUtc);
    if (endUtc <= startUtc) throw badRequest('Appointment window is invalid');
    const overlap = (await db.listOverlappingBookings(startUtc, endUtc)).filter((row) => row.id !== id);
    if (overlap.length) throw conflict('That time is no longer available');
    const timezone = clean(body.timezone, TIMEZONE_MAX) || booking.timezone || 'America/Toronto';
    const calendarWrites = Boolean(flags.google_writes_enabled && google?.configured && booking.calendar_event_id);

    if (calendarWrites) {
      try {
        await google.calendar.reschedule(booking.calendar_event_id, new Date(startUtc).toISOString(), new Date(endUtc).toISOString(), timezone);
      } catch (error) {
        await db.logEvent({
          level: 'error',
          event: 'google.calendar.reschedule_failed',
          detail: { bookingId: id, message: String(error?.message || error).slice(0, 240) },
          now
        }).catch(() => {});
        throw new AppError(502, 'CALENDAR_RESCHEDULE_FAILED', 'The calendar could not be rescheduled; the existing appointment is unchanged', {
          bookingId: id,
          recoverable: true
        });
      }
    }

    const result = await db.rescheduleBooking({
      id,
      startUtc,
      endUtc,
      slotKey: `${startUtc}-${endUtc}`,
      timezone,
      calendarEventId: booking.calendar_event_id,
      meetLink: booking.meet_link,
      status: booking.status === 'calendar_pending' ? 'calendar_pending' : 'confirmed',
      statusDetail: 'rescheduled',
      now
    });
    if (!result.ok) {
      if (calendarWrites) {
        await google.calendar.reschedule(booking.calendar_event_id, new Date(booking.start_utc).toISOString(), new Date(booking.end_utc).toISOString(), booking.timezone || 'America/Toronto').catch(() => {});
      }
      throw conflict('That time is no longer available');
    }
    const contact = (await db.getContact(booking.contact_id)) || { id: null, full_name: 'there', email: null };
    const view = bookingView(result.booking);
    await db.cancelEmailJobsForAppointment({
      appointmentId: id,
      kinds: ['appointment_reminder_24h', 'appointment_reminder_1h'],
      now
    });
    await visitorEmail({
      contact,
      kind: 'appointment_rescheduled',
      template: appointmentRescheduled({ contact, booking: view }),
      dedupeKey: `appointment-rescheduled:${id}:${view.startUtc}`,
      inquiryId: booking.inquiry_id,
      appointmentId: id,
      now
    });
    await internalEmail({
      kind: 'appointment_internal',
      template: internalAppointment({ contact, booking: view, event: 'rescheduled' }),
      dedupeKey: `appointment-internal:${id}:rescheduled:${view.startUtc}`,
      inquiryId: booking.inquiry_id,
      appointmentId: id,
      now
    });
    return { booking: view };
  }

  async function cancel({ ownerHash, id, flags, now = Date.now() }) {
    requireWrites();
    const booking = await db.getBookingForOwner(id, ownerHash);
    if (!booking) throw notFound('Appointment not found');
    if (booking.status === 'cancelled') return { duplicate: true, booking: bookingView(booking) };
    const calendarWrites = Boolean(flags.google_writes_enabled && google?.configured && booking.calendar_event_id);
    if (calendarWrites) {
      try {
        await google.calendar.cancel(booking.calendar_event_id);
      } catch (error) {
        throw new AppError(502, 'CALENDAR_CANCEL_FAILED', 'The calendar event could not be cancelled; the appointment is unchanged', {
          bookingId: id,
          recoverable: true
        });
      }
    }
    const changed = await db.cancelBooking({ id, ownerHash, now });
    const updated = await db.getBookingForOwner(id, ownerHash);
    if (!changed) {
      if (updated?.status === 'cancelled') return { duplicate: true, booking: bookingView(updated) };
      throw conflict('The appointment could not be cancelled in its current state');
    }
    const contact = (await db.getContact(booking.contact_id)) || { id: null, full_name: 'there', email: null };
    const view = bookingView(updated);
    await db.cancelEmailJobsForAppointment({
      appointmentId: id,
      kinds: ['appointment_confirmation', 'appointment_reminder_24h', 'appointment_reminder_1h', 'appointment_rescheduled'],
      now
    });
    await visitorEmail({
      contact,
      kind: 'appointment_cancelled',
      template: appointmentCancelled({ contact, booking: view }),
      dedupeKey: `appointment-cancelled:${id}`,
      inquiryId: booking.inquiry_id,
      appointmentId: id,
      now
    });
    await internalEmail({
      kind: 'appointment_internal',
      template: internalAppointment({ contact, booking: view, event: 'cancelled' }),
      dedupeKey: `appointment-internal:${id}:cancelled`,
      inquiryId: booking.inquiry_id,
      appointmentId: id,
      now
    });
    return { booking: view };
  }

  async function reconcile({ ownerHash, id, flags, now = Date.now() }) {
    requireWrites();
    const booking = await db.getBookingForOwner(id, ownerHash);
    if (!booking) throw notFound('Appointment not found');
    if (booking.status !== 'calendar_pending') return { booking: bookingView(booking), reconciled: false };
    if (!flags.google_writes_enabled || !google?.configured) throw unavailable('Google writes are disabled');
    const contact = (await db.getContact(booking.contact_id)) || { id: null, full_name: 'there', email: null };
    try {
      const event = await google.calendar.createEvent({
        summary: `AI Nour — ${contact?.full_name || 'Appointment'}`,
        description: 'Appointment requested through AI Nour. AI Nour is an AI representation, not Nour Chkair.',
        start: new Date(booking.start_utc).toISOString(),
        end: new Date(booking.end_utc).toISOString(),
        timeZone: booking.timezone || 'America/Toronto',
        withMeet: true
      });
      const updated = await db.updateBookingCalendar({
        id,
        status: 'confirmed',
        calendarEventId: event.id,
        meetLink: event.meetLink,
        statusDetail: 'calendar_reconciled',
        now
      });
      const view = bookingView(updated);
      await visitorEmail({
        contact,
        kind: 'appointment_confirmation',
        template: appointmentConfirmation({ contact, booking: view }),
        dedupeKey: `appointment-confirmation:${id}`,
        inquiryId: booking.inquiry_id,
        appointmentId: id,
        now
      });
      await internalEmail({
        kind: 'appointment_internal',
        template: internalAppointment({ contact, booking: view, event: 'reconciled' }),
        dedupeKey: `appointment-internal:${id}:reconciled`,
        inquiryId: booking.inquiry_id,
        appointmentId: id,
        now
      });
      return { booking: view, reconciled: true };
    } catch (error) {
      throw new AppError(502, 'CALENDAR_RECONCILE_FAILED', 'The calendar event still could not be created', { bookingId: id });
    }
  }

  return {
    createInquiry,
    availability,
    createAppointment,
    reschedule,
    cancel,
    reconcile,
    listInquiries: (ownerHash) => db.listInquiries({ ownerHash }),
    listAppointments: (ownerHash) => db.listBookingsForOwner(ownerHash).then((rows) => rows.map(bookingView))
  };
}
