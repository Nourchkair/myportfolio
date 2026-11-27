const SITE_URL = 'https://nourchkair.com';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function cleanLine(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function when(startUtc, timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone || 'America/Toronto'
    }).format(new Date(startUtc));
  } catch {
    return new Date(startUtc).toUTCString();
  }
}

function layout({ heading, intro, rows = [], body = [], footer = [] }) {
  const rowHtml = rows.length
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:18px 0">${rows.map(([label, value]) => `<tr><td style="padding:7px 0;color:#7d8a91;font-size:12px;letter-spacing:.08em;text-transform:uppercase;width:34%">${escapeHtml(label)}</td><td style="padding:7px 0;color:#eef4f6;font-size:14px">${escapeHtml(value)}</td></tr>`).join('')}</table>`
    : '';
  const bodyHtml = body.map((paragraph) => `<p style="margin:0 0 12px;color:#c8d1d5;font-size:15px;line-height:1.65">${escapeHtml(paragraph)}</p>`).join('');
  const footerHtml = footer.length
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #26343d;color:#7d8a91;font-size:12px;line-height:1.6">${footer.map((line) => `<p style="margin:0 0 4px">${escapeHtml(line)}</p>`).join('')}</div>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#080d11;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif"><div style="max-width:600px;margin:0 auto;padding:28px 20px 40px"><div style="border:1px solid #26343d;background:#0d151b;border-radius:18px;padding:26px 24px"><p style="margin:0 0 6px;color:#ffd2a1;font-size:11px;letter-spacing:.16em;text-transform:uppercase">AI Nour</p><h1 style="margin:0 0 14px;color:#ffffff;font-size:24px;line-height:1.25;letter-spacing:-.02em">${escapeHtml(heading)}</h1><p style="margin:0 0 12px;color:#c8d1d5;font-size:15px;line-height:1.65">${escapeHtml(intro)}</p>${bodyHtml}${rowHtml}${footerHtml}</div><p style="margin:16px 0 0;color:#66737a;font-size:11px;text-align:center">AI Nour is an AI representation of Nour Chkair, not the person.</p></div></body></html>`;
}

function plain(lines) {
  return lines.filter((line) => line !== undefined).join('\n').trim();
}

export function inquiryAcknowledgement({ contact, inquiry }) {
  const name = cleanLine(contact.full_name, 120);
  const summary = cleanLine(inquiry.summary, 1200);
  return {
    subject: 'AI Nour — inquiry received',
    text: plain([
      `Hello ${name},`,
      '',
      'Thank you for contacting Nour through AI Nour. Your inquiry has been recorded for review.',
      '',
      `Summary: ${summary}`,
      '',
      'This is an automated acknowledgement. AI Nour is an AI representation of Nour Chkair, not the person. A reply will come from Nour or a human assistant.',
      '',
      SITE_URL
    ]),
    html: layout({
      heading: 'Inquiry received',
      intro: `Hello ${name}, thank you for contacting Nour through AI Nour. Your inquiry has been recorded for review.`,
      rows: [['Summary', summary]],
      footer: ['This is an automated acknowledgement.', 'AI Nour is an AI representation of Nour Chkair, not the person.']
    })
  };
}

export function internalInquiry({ contact, inquiry }) {
  const name = cleanLine(contact.full_name, 120);
  return {
    subject: `AI Nour — new ${cleanLine(inquiry.inquiry_type, 40)} inquiry`,
    text: plain([
      'New inquiry recorded by AI Nour.',
      '',
      `Name: ${name}`,
      `Email: ${contact.email || 'not provided'}`,
      `Type: ${inquiry.inquiry_type}`,
      `Summary: ${cleanLine(inquiry.summary, 1200)}`,
      `Requested service: ${cleanLine(inquiry.requested_service, 160) || 'not provided'}`,
      `Timeline: ${cleanLine(inquiry.timeline, 120) || 'not provided'}`,
      `Inquiry: ${inquiry.id}`,
      '',
      'Open the private admin dashboard to review the record.'
    ]),
    html: layout({
      heading: 'New inquiry',
      intro: 'AI Nour recorded a new inquiry for review.',
      rows: [
        ['Name', name],
        ['Email', contact.email || 'not provided'],
        ['Type', inquiry.inquiry_type],
        ['Summary', cleanLine(inquiry.summary, 1200)],
        ['Requested service', inquiry.requested_service || 'not provided'],
        ['Timeline', inquiry.timeline || 'not provided'],
        ['Inquiry', inquiry.id]
      ],
      footer: ['Internal notification. Do not forward personal data.']
    })
  };
}

export function appointmentConfirmation({ contact, booking }) {
  const name = cleanLine(contact.full_name, 120);
  const start = when(booking.startUtc, booking.timezone);
  const meet = booking.meetLink || '';
  return {
    subject: 'AI Nour — appointment confirmed',
    text: plain([
      `Hello ${name},`,
      '',
      `Your AI Nour appointment is confirmed for ${start} (${booking.timezone || 'America/Toronto'}).`,
      meet ? `Google Meet: ${meet}` : 'A Google Meet link will follow.',
      '',
      'If you need to reschedule or cancel, reply to this message.',
      '',
      'AI Nour is an AI representation of Nour Chkair, not the person.'
    ]),
    html: layout({
      heading: 'Appointment confirmed',
      intro: `Hello ${name}, your AI Nour appointment is confirmed.`,
      rows: [['When', `${start} (${booking.timezone || 'America/Toronto'})`], ...(meet ? [['Google Meet', meet]] : [])],
      footer: ['If you need to reschedule or cancel, reply to this message.', 'AI Nour is an AI representation of Nour Chkair, not the person.']
    })
  };
}

export function appointmentRescheduled({ contact, booking }) {
  const name = cleanLine(contact.full_name, 120);
  const start = when(booking.startUtc, booking.timezone);
  const meet = booking.meetLink || '';
  return {
    subject: 'AI Nour — appointment rescheduled',
    text: plain([
      `Hello ${name},`,
      '',
      `Your AI Nour appointment has been moved to ${start} (${booking.timezone || 'America/Toronto'}).`,
      meet ? `Google Meet: ${meet}` : 'A Google Meet link will follow.',
      '',
      'AI Nour is an AI representation of Nour Chkair, not the person.'
    ]),
    html: layout({
      heading: 'Appointment rescheduled',
      intro: `Hello ${name}, your appointment has been moved.`,
      rows: [['New time', `${start} (${booking.timezone || 'America/Toronto'})`], ...(meet ? [['Google Meet', meet]] : [])],
      footer: ['AI Nour is an AI representation of Nour Chkair, not the person.']
    })
  };
}

export function appointmentCancelled({ contact, booking }) {
  const name = cleanLine(contact.full_name, 120);
  return {
    subject: 'AI Nour — appointment cancelled',
    text: plain([
      `Hello ${name},`,
      '',
      'Your AI Nour appointment has been cancelled.',
      'Reply if you would like to rebook.',
      '',
      'AI Nour is an AI representation of Nour Chkair, not the person.'
    ]),
    html: layout({
      heading: 'Appointment cancelled',
      intro: `Hello ${name}, your AI Nour appointment has been cancelled. Reply if you would like to rebook.`,
      footer: ['AI Nour is an AI representation of Nour Chkair, not the person.']
    })
  };
}

export function appointmentReminder({ contact, booking, leadHours }) {
  const name = cleanLine(contact.full_name, 120);
  const start = when(booking.startUtc, booking.timezone);
  const meet = booking.meetLink || '';
  return {
    subject: `AI Nour — appointment reminder (${leadHours} hours)`,
    text: plain([
      `Hello ${name},`,
      '',
      `A reminder that your AI Nour appointment is coming up in about ${leadHours} hour${leadHours === 1 ? '' : 's'}: ${start} (${booking.timezone || 'America/Toronto'}).`,
      meet ? `Google Meet: ${meet}` : '',
      '',
      'If you need to reschedule or cancel, reply to this message.',
      '',
      'AI Nour is an AI representation of Nour Chkair, not the person.'
    ]),
    html: layout({
      heading: `Appointment in ${leadHours} hour${leadHours === 1 ? '' : 's'}`,
      intro: `Hello ${name}, your AI Nour appointment is coming up.`,
      rows: [['When', `${start} (${booking.timezone || 'America/Toronto'})`], ...(meet ? [['Google Meet', meet]] : [])],
      footer: ['If you need to reschedule or cancel, reply to this message.', 'AI Nour is an AI representation of Nour Chkair, not the person.']
    })
  };
}

export function internalAppointment({ contact, booking, event }) {
  const name = cleanLine(contact.full_name, 120);
  const start = when(booking.startUtc, booking.timezone);
  return {
    subject: `AI Nour — appointment ${event}`,
    text: plain([
      `Appointment ${event}.`,
      '',
      `Name: ${name}`,
      `Email: ${contact.email || 'not provided'}`,
      `When: ${start} (${booking.timezone || 'America/Toronto'})`,
      `Meet: ${booking.meetLink || 'not created'}`,
      `Appointment: ${booking.id}`
    ]),
    html: layout({
      heading: `Appointment ${event}`,
      intro: 'An appointment changed in AI Nour.',
      rows: [
        ['Name', name],
        ['Email', contact.email || 'not provided'],
        ['When', `${start} (${booking.timezone || 'America/Toronto'})`],
        ['Meet', booking.meetLink || 'not created'],
        ['Appointment', booking.id]
      ],
      footer: ['Internal notification. Do not forward personal data.']
    })
  };
}
