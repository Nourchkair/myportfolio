# Automated email recommendation

## Recommendation

Use **Resend Free** for automated transactional email (inquiry acknowledgements, appointment confirmations, reminders, reschedule/cancellation notices), and keep **Gmail drafts + human send** for conversational replies that need judgment.

This keeps fixed cost at **$0**, avoids Google’s restricted Gmail scope, and gives a straightforward transactional API.

## Resend Free — current facts (November 2026)

- $0/month, no credit card.
- 3,000 transactional emails/month.
- 100 emails/day (UTC calendar day).
- 3 verified domains.
- 3 inboxes, 1 webhook endpoint, 30-day data retention.
- Requires a verified sending domain with DNS records.
- Free plan cannot buy overage; sends stop at the cap.

Proposed sending subdomain: `mail.nourchkair.com` (or `notifications.nourchkair.com`). This keeps transactional reputation separate from the root domain. DNS changes require approval and would be applied in Cloudflare DNS.

## Gmail API assessment

- `gmail.send` is a **sensitive** scope: it can send, but cannot create drafts.
- `gmail.compose` is a **restricted** scope: drafts + send; it triggers OAuth verification and a third-party security assessment.
- Google’s official Gmail MCP server has no send tool; it creates drafts for human review.
- Google’s 2026 agent-access policy requires AI agents to use Workspace MCP/CLI from 1 February 2027 and requires human confirmation for sensitive actions such as sending email.
- Direct Gmail API sending therefore remains a policy risk for an autonomous agent, even though the API scope technically permits it.

## Implementation prepared in Phase 2

- `email_jobs` table with queued/sent/drafted/failed/dry-run states.
- `src/integrations/email/index.js` supports:
  - `resend` (HTTP API; disabled unless `EMAIL_SEND_ENABLED=true` and a Resend key/from address are configured).
  - `gmail-draft` (creates a draft; no send).
- Appointment confirmation, reschedule, cancellation, and inquiry acknowledgement jobs are enqueued by the CRM service.
- Admin `POST /api/admin/email/process` processes queued jobs. With the default `EMAIL_SEND_ENABLED=false`, jobs are marked `dry_run` and no email leaves the system.
- No real emails were sent in Phase 2.

## Required configuration after approval

```text
EMAIL_PROVIDER=resend
EMAIL_SEND_ENABLED=true
RESEND_API_KEY=<secret>
RESEND_FROM=AI Nour <appointments@mail.nourchkair.com>
```

DNS records (example, exact values from Resend):

- SPF TXT record for the sending subdomain.
- DKIM TXT/CNAME records.
- DMARC policy for the domain.
- Optional return-path subdomain.

## Safety rules

- Transactional only; no marketing without explicit opt-in and unsubscribe.
- Send only to addresses with a recorded consent/transactional basis.
- Use an idempotency key per job to prevent duplicate sends.
- Cap daily sends below the Resend Free limit.
- Keep `EMAIL_SEND_ENABLED=false` until the domain is verified and a test message has been approved.
- Do not put sensitive personal data in email bodies; link to a secure page instead.
- Log provider message IDs and failures without logging message bodies or secrets.

## Cost

Resend Free: **$0 fixed monthly cost**, within the 100/day limit. No subscription or paid upgrade is required for the expected AI Nour volume.
