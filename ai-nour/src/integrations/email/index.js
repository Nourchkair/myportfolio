import { IntegrationError } from '../errors.js';

export function createEmailService({ config, gmail = null }) {
  const provider = config.email.provider;

  async function send({ to, subject, text, html = null }) {
    if (!config.email.sendEnabled) return { status: 'dry_run', provider };
    if (provider === 'resend') {
      if (!config.email.resendApiKey || !config.email.resendFrom) {
        throw new IntegrationError('RESEND_NOT_CONFIGURED', 'Resend is not configured');
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.email.resendApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          from: config.email.resendFrom,
          to: [to],
          subject,
          text,
          ...(html ? { html } : {})
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new IntegrationError('RESEND_SEND_FAILED', `Resend send failed with HTTP ${response.status}`);
      return { status: 'sent', provider, id: body.id || null };
    }
    if (provider === 'gmail-draft') {
      if (!gmail) throw new IntegrationError('GMAIL_NOT_CONFIGURED', 'Gmail draft provider is not configured');
      const draft = await gmail.createDraft({ to, subject, text, html });
      return { status: 'drafted', provider, id: draft.id };
    }
    throw new IntegrationError('EMAIL_PROVIDER_UNKNOWN', `Unknown email provider: ${provider}`);
  }

  async function processQueued({ db, limit = 10, now = Date.now() }) {
    const jobs = (await db.listEmailJobs(limit)).filter((job) => job.status === 'queued');
    const results = [];
    for (const job of jobs) {
      try {
        const result = await send({ to: job.to_email, subject: job.subject, text: job.body });
        await db.updateEmailJob({
          id: job.id,
          status: result.status,
          sentAt: result.status === 'sent' ? now : null,
          error: null,
          now
        });
        results.push({ id: job.id, status: result.status });
      } catch (error) {
        await db.updateEmailJob({ id: job.id, status: 'failed', sentAt: null, error: String(error?.code || error?.message || error).slice(0, 240), now });
        results.push({ id: job.id, status: 'failed', error: error?.code || 'EMAIL_FAILED' });
      }
    }
    return results;
  }

  return { send, processQueued, provider, sendEnabled: config.email.sendEnabled };
}
