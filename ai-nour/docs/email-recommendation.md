# Automated email — Phase 4 approval and configuration package

Status: **Resend Free approved as the preferred transactional provider, subject to account/domain setup and approval. No DNS records were changed and no real email was sent.**

## Verified Resend Free limits (26 November 2026)

| Limit | Free plan | Implication |
| --- | --- | --- |
| Fixed price | **$0/month**, no card, no trial | Keeps the $0 fixed-cost constraint. |
| Transactional volume | **3,000 emails/month** | Enough for private beta. |
| Daily limit | **100 emails/day**, UTC calendar day, sent + received combined | Hard stop; Resend returns `429 daily_quota_exceeded` and does not queue. |
| Recipients | Each To/Cc/Bcc address counts as one email | Keep one recipient per job; no bulk recipient lists. |
| Domains | 3 verified domains | One is enough: `mail.nourchkair.com`. |
| Webhooks | 1 endpoint | One endpoint can subscribe to all needed delivery events. |
| Data retention | 30 days | Do not rely on Resend as the long-term delivery log. |
| Rate limit | 10 requests/second per team | The Worker processes small batches sequentially. |
| Overage | Not available | Sending stops at the cap; no surprise bill. |

Sources: Resend pricing and domain documentation, checked 26 November 2026.

## Recommended architecture

- **Resend Free** for automated transactional email.
- **Gmail drafts** remains a human-review fallback, not the production sender.
- `EMAIL_SEND_ENABLED=false` until the domain is verified and the user approves a test send.
- The Worker queues every email in D1 before attempting delivery, so a provider outage does not lose the notification.
- Delivery is idempotent at two layers: a unique local `dedupe_key`, and Resend's `Idempotency-Key` header (24-hour provider window).

## Proposed sending identity

```text
From:      AI Nour <appointments@mail.nourchkair.com>
Reply-To:  nourchkair@gmail.com (optional; set only if replies should leave the sending subdomain)
Domain:    mail.nourchkair.com
Return-Path: send.mail.nourchkair.com (Resend default; configurable only when the domain is added)
```

The verified domain is the subdomain, not the root. If `mail.nourchkair.com` is verified, the From address must be at that subdomain. Do not send as `@nourchkair.com` from this domain.

## Account configuration required from you

1. Create or sign in to a Resend account using Nour's email. Do not add a card or upgrade.
2. Confirm the account is on the **Free** plan.
3. Add domain **`mail.nourchkair.com`** (not the root domain).
4. Choose the region closest to most recipients. For Ottawa, the default **`us-east-1`** is appropriate unless Resend recommends otherwise.
5. Keep the default Return-Path `send` unless it conflicts with an existing record. A custom return path must be chosen when the domain is created and cannot be changed later.
6. Open **Domains → mail.nourchkair.com → Records** and copy every record exactly as Resend displays it. Resend may show TXT + MX records or CNAME records depending on when the domain is created. Do not use proxied Cloudflare CNAMEs.
7. Verify the domain. Usually 15 minutes; allow up to 72 hours.
8. Create an API key named `ai-nour-production` with **sending access only**. Copy it once into the Worker secret store; never commit it or send it in chat.
9. Create one webhook:
   - Endpoint: `https://api.nourchkair.com/api/webhooks/resend` (production Worker hostname; local tests use a tunnel or skip webhooks).
   - Events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`.
   - Copy the `whsec_…` signing secret into the Worker secret store.
10. Confirm the internal notification address for new inquiries and appointment changes.

## DNS records to add

The exact values below are the standard Resend pattern. **The Resend Records tab is authoritative**; copy its values rather than reconstructing them. DNS changes require explicit approval and are not applied by this work.

| Purpose | Type | Name (Cloudflare) | Value / priority | Required |
| --- | --- | --- | --- | --- |
| DKIM | TXT | `resend._domainkey.mail` | `p=<DKIM public key from Resend>` | Yes |
| SPF (older domain layout) | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | Yes if shown |
| Return-Path feedback (older layout) | MX | `send.mail` | `10 feedback-smtp.us-east-1.amazonses.com` | Yes if shown |
| SPF (newer CNAME layout) | CNAME | `send.mail` | Value from Resend Records tab | If Resend shows CNAMEs |
| Fallback sending (newer layout) | CNAME | `rsend.mail` or Resend-provided sibling | Value from Resend Records tab | If shown |
| DMARC | TXT | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:dmarc@nourchkair.com; adkim=r; aspf=r; fo=1` | Recommended |
| Optional root DMARC | TXT | `_dmarc` | Existing policy; do not duplicate conflicting records | Only if no policy exists |

Notes:

- Names above omit the root because Cloudflare appends `nourchkair.com`. Verify the resulting host is exactly `resend._domainkey.mail.nourchkair.com`, `send.mail.nourchkair.com`, etc.
- The MX value depends on the Resend region. Use the value shown in the dashboard.
- Newer Resend domains may show two CNAMEs instead of TXT+MX. Both must verify, and Cloudflare proxying must be **DNS only**.
- Do not add `include:amazonses.com` to the root SPF record; Resend authenticates the Return-Path subdomain.
- Start DMARC at `p=none` for observation. Move to `quarantine`/`reject` only after reviewing reports and confirming all senders align.
- Do not create a second DMARC record at the same name.

## Worker configuration after approval

Secrets (set with `wrangler secret put`, never in Git):

```text
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
```

Non-secret variables:

```text
EMAIL_PROVIDER=resend
EMAIL_SEND_ENABLED=true
RESEND_FROM=AI Nour <appointments@mail.nourchkair.com>
EMAIL_INTERNAL_TO=nourchkair@gmail.com
EMAIL_MAX_ATTEMPTS=5
EMAIL_RETRY_BASE_SECONDS=60
```

`EMAIL_SEND_ENABLED` must remain `false` until the domain is verified and a test send is explicitly approved. With it false, jobs are recorded as `dry_run`; no network call is made to Resend.

## Implemented email lifecycle

| Message | Trigger | Recipient | Dedupe key |
| --- | --- | --- | --- |
| Inquiry acknowledgement | Inquiry created with email consent | Visitor | `inquiry-ack:<inquiry_id>` |
| Internal inquiry notification | Inquiry created | Administrator | `inquiry-internal:<inquiry_id>` |
| Appointment confirmation | Calendar event confirmed/reconciled | Visitor | `appointment-confirmation:<booking_id>` |
| Internal appointment notification | Confirm, reschedule, cancel, calendar pending | Administrator | `appointment-internal:<booking_id>:<event>` |
| Reschedule confirmation | Reschedule committed | Visitor | `appointment-rescheduled:<booking_id>:<start_utc>` |
| Cancellation confirmation | Cancellation committed | Visitor | `appointment-cancelled:<booking_id>` |
| 24-hour reminder | Confirmed booking enters 23–25h window | Visitor | `appointment-reminder:24h:<booking_id>:<start_utc>` |
| 1-hour reminder | Confirmed booking enters 30–90m window | Visitor | `appointment-reminder:1h:<booking_id>:<start_utc>` |

Visitor email requires an active `email` consent scope. Internal notifications go only to the configured administrator address and contain the inquiry summary needed to act; no email body is copied into the CRM sheet.

## Retry, delivery tracking and duplicate protection

- `email_jobs` stores `dedupe_key`, `attempts`, `max_attempts`, `next_attempt_at`, `provider_message_id`, delivery timestamps, and status.
- A unique index on `dedupe_key` prevents duplicate local jobs.
- Resend receives `Idempotency-Key: <dedupe_key>` on every send; keys are unique per message and valid for 24 hours.
- Failed attempts use exponential backoff (`EMAIL_RETRY_BASE_SECONDS × 2^(attempt-1)`, capped at 6 hours), then `dead_letter` after `EMAIL_MAX_ATTEMPTS`.
- A job stuck in `sending` for more than 10 minutes is returned to `queued` by scheduled cleanup.
- Resend webhooks are verified as Svix signatures over the raw body, with a 5-minute replay window and constant-time comparison. Duplicate `svix-id` events are ignored.
- `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, and `email.failed` update the local job.
- Rescheduling or cancelling an appointment cancels queued reminders for the old slot.
- Admin can requeue a failed/dead-letter/cancelled job; every retry is audited.

## Gmail fallback

- `EMAIL_PROVIDER=gmail-draft` creates drafts only; no send.
- Gmail draft creation requires `gmail.compose`, a **restricted** scope, which triggers OAuth verification and a third-party security assessment.
- Google’s Workspace AI Tools Addendum requires Google MCP for AI-agent access from **1 February 2027** and human confirmation for sensitive actions such as sending email. The Gmail MCP server creates drafts; it does not provide an autonomous send tool.
- Gmail drafts should remain an internal human-review path and should not share the production operational OAuth client.
- No Gmail scope is required for the Resend production path.

## Private-beta fallback

Private beta does not require Resend credentials. With `EMAIL_SEND_ENABLED=false`, the Worker records every email job and processes it as `dry_run`; no Resend key, domain, or webhook is needed. The admin can inspect the queue, retries, and statuses. Enabling real delivery is a separate approved step.

## Approval gates

1. Approve Resend Free and the `mail.nourchkair.com` sending identity.
2. Approve the DNS records and apply them in Cloudflare; do not apply automatically.
3. Provide the Resend API key and webhook signing secret through the secret store.
4. Approve one test message to a controlled address before enabling `EMAIL_SEND_ENABLED`.
5. Approve the internal notification address and reply-to behavior.
