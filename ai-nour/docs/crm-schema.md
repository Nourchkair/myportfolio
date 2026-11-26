# Proposed CRM schema — Phase 3 approval package

Status: **proposed for approval; not applied to the live Google Sheet.** The local D1 workflow is implemented and validated with synthetic data. No production headers or records have been written.

Design rules:

- One record per entity; link with stable UUIDs instead of repeating names, emails, or booking details.
- Store only data needed to answer an inquiry, obtain consent, book an appointment, and prove delivery.
- Do not store email bodies, full conversation transcripts, free-text notes, marketing segments, or inferred personal data in the CRM.
- Visitor-provided budget/timeline values are optional and never inferred from browsing.
- Consent evidence is a short reference (form version, timestamp, channel), not a transcript copy.
- Dates are ISO 8601 UTC in the sheet; timezone is stored separately for display.
- The sheet is private to the administrator account and is not a public portfolio asset.

## 1. Contacts

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `contact_id` | UUID string | Yes | Stable identifier used by inquiries and appointments. |
| `full_name` | String, 120 | Yes | Name used in replies and confirmations. |
| `email` | Email string, 254 | Conditional | Required for any email acknowledgement, confirmation, reminder, or cancellation. Normalized lowercase; unique per owner. |
| `phone` | E.164 string, 40 | No | Only if the visitor provides it for human follow-up. |
| `organization` | String, 160 | No | Visitor-provided company or institution. |
| `role` | String, 120 | No | Visitor-provided role, only if relevant to the inquiry. |
| `locale` | Enum `en`, `fr` | No | Preferred reply language; defaults to `en`. |
| `timezone` | IANA string, 64 | Conditional | Required before creating an appointment; used for confirmation/reminder display. |
| `source` | Enum `portfolio`, `referral`, `event`, `other` | Yes | How the contact first arrived. |
| `created_at` | Datetime UTC | Yes | Record creation. |
| `updated_at` | Datetime UTC | Yes | Last material change. |

Do not add: `consent_status` (derived from Consent), `notes` (unbounded personal data), or a second copy of the email in Inquiries/Appointments.

## 2. Inquiries

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `inquiry_id` | UUID string | Yes | Stable identifier used by appointments and email jobs. |
| `contact_id` | UUID string | Yes | FK to Contacts. |
| `received_at` | Datetime UTC | Yes | When the inquiry arrived. |
| `channel` | Enum `portfolio`, `email`, `referral`, `event`, `other` | Yes | Source channel. |
| `inquiry_type` | Enum `general`, `consulting`, `recruitment`, `partnership`, `media`, `other` | Yes | Routing category. |
| `summary` | String, 1200 | Yes | Visitor-provided purpose of the inquiry. |
| `requested_service` | String, 160 | No | Visitor-provided service interest. |
| `budget_range` | String, 80 | No | Visitor-provided only; never inferred. |
| `timeline` | String, 120 | No | Visitor-provided only; never inferred. |
| `status` | Enum `new`, `reviewing`, `qualified`, `closed`, `spam` | Yes | Human workflow state. |
| `consent_id` | UUID string | No | Primary consent record supporting the inquiry. |
| `source_url` | String, 240 | No | Portfolio route or referrer; strip query strings that may contain personal data. |
| `client_request_id` | String, 80 | No | Duplicate-submission key; unique per owner when present. |
| `created_at` | Datetime UTC | Yes | Record creation. |
| `updated_at` | Datetime UTC | Yes | Last material change. |

Do not add: `owner` (single operator in private beta), `notes`, duplicate contact fields, or a pipeline stage in this tab.

## 3. Consent

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `consent_id` | UUID string | Yes | Stable identifier referenced by an inquiry or follow-up. |
| `contact_id` | UUID string | Yes | FK to Contacts. |
| `scope` | Enum `store`, `contact`, `email`, `followup` | Yes | Specific permission granted. |
| `status` | Enum `granted`, `withdrawn` | Yes | Current state of that scope. |
| `captured_at` | Datetime UTC | Yes | When consent was captured. |
| `expires_at` | Datetime UTC | No | Only if a time limit was agreed. |
| `source` | Enum `portfolio`, `email`, `verbal`, `other` | Yes | How consent was captured. |
| `evidence` | String, 240 | No | Short reference such as form version and route; never a transcript copy. |
| `created_at` | Datetime UTC | Yes | Record creation. |
| `updated_at` | Datetime UTC | Yes | Last change, especially withdrawal. |

Email sends require an active `email` consent scope. `contact` consent is required before any human follow-up. Marketing is not a launch scope.

## 4. Appointments

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `appointment_id` | UUID string | Yes | Stable identifier used by Google Calendar and email jobs. |
| `inquiry_id` | UUID string | Yes | FK to Inquiries. |
| `contact_id` | UUID string | Yes | FK to Contacts. |
| `start_utc` | Datetime UTC | Yes | Appointment start. |
| `end_utc` | Datetime UTC | Yes | Appointment end. |
| `timezone` | IANA string, 64 | Yes | Display timezone supplied by the visitor. |
| `calendar_event_id` | String | No | Google Calendar event id when the calendar write succeeds. |
| `meet_link` | URL string | No | Unique Google Meet link from the confirmed calendar event. Never reuse across appointments. |
| `status` | Enum `reserved`, `calendar_pending`, `confirmed`, `cancelled`, `completed`, `no_show` | Yes | Booking lifecycle. |
| `status_detail` | String, 80 | No | Short recovery/error code such as `calendar_pending`; never a raw provider error. |
| `idempotency_key` | String, 100 | Yes | Prevents duplicate bookings from double submissions or retries. |
| `created_at` | Datetime UTC | Yes | Record creation. |
| `updated_at` | Datetime UTC | Yes | Last status or time change. |

Do not add: `owner`, `notes`, duplicate email/name, or a second Meet link history. Reschedule history is in the Email Log and audit trail.

## 5. Email Log

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `email_id` | UUID string | Yes | Internal email job id. |
| `contact_id` | UUID string | Conditional | FK when the recipient is a visitor; absent for internal notifications. |
| `inquiry_id` | UUID string | No | Related inquiry. |
| `appointment_id` | UUID string | No | Related appointment. |
| `kind` | Enum | Yes | `inquiry_acknowledgement`, `inquiry_internal`, `appointment_confirmation`, `appointment_rescheduled`, `appointment_cancelled`, `appointment_reminder_24h`, `appointment_reminder_1h`, `appointment_internal`. |
| `recipient_email` | Email string | Yes | Exact envelope recipient for delivery tracking. |
| `status` | Enum | Yes | `queued`, `sending`, `sent`, `delivered`, `bounced`, `complained`, `failed`, `dead_letter`, `dry_run`, `drafted`, `cancelled`. |
| `provider` | Enum `resend`, `gmail-draft`, `mock` | Yes | Delivery path used. |
| `provider_message_id` | String | No | Resend/SMTP message id used by delivery webhooks. |
| `dedupe_key` | String, 256 | No | Internal duplicate-send guard; unique when present. |
| `attempts` | Integer | Yes | Number of delivery attempts. |
| `next_attempt_at` | Datetime UTC | No | Backoff schedule for retries. |
| `last_event_at` | Datetime UTC | No | Last provider event (sent, delivered, bounce, complaint). |
| `created_at` | Datetime UTC | Yes | Job creation. |
| `updated_at` | Datetime UTC | Yes | Last attempt or event. |

Do not add: email subject/body copies, open/click tracking, marketing consent, or raw webhook payloads. Bodies remain in D1 only as long as needed for retry/diagnostics; the sheet stores metadata.

## 6. Follow-ups (optional, not required for private beta)

Only create this tab if human follow-up is tracked in the Sheet. It is deliberately small.

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `followup_id` | UUID string | Yes | Stable identifier. |
| `inquiry_id` | UUID string | Yes | FK to Inquiries. |
| `contact_id` | UUID string | Yes | FK to Contacts. |
| `due_at` | Datetime UTC | Yes | When the human should follow up. |
| `channel` | Enum `email`, `phone`, `other` | Yes | Intended channel. |
| `purpose` | String, 160 | Yes | Short action description. |
| `status` | Enum `pending`, `done`, `skipped` | Yes | Human workflow state. |
| `completed_at` | Datetime UTC | No | When completed. |
| `created_at` | Datetime UTC | Yes | Record creation. |
| `updated_at` | Datetime UTC | Yes | Last change. |

## Explicitly deferred

The following are **not** proposed for private beta because they add data collection or maintenance without a validated workflow:

- **Pipeline/opportunity tab:** no multi-stage sales process is running; `Inquiries.status` covers the current workflow.
- **Owner field:** the private beta has one operator; adding owners would duplicate identity data.
- **Free-text notes:** unbounded personal data with no retention control.
- **Full email bodies or conversation transcripts:** already retained in D1 under a separate retention policy; duplicating them in Sheets increases exposure.
- **Marketing consent/segments:** no marketing email is being sent.
- **Open/click tracking:** not needed for transactional delivery and adds privacy surface.

## D1 mapping and application gate

| Sheet tab | Local D1 table | Current state |
| --- | --- | --- |
| Contacts | `contacts` | Implemented; synthetic only |
| Inquiries | `inquiries` | Implemented; synthetic only |
| Consent | `consents` | Implemented; synthetic only |
| Appointments | `bookings` | Implemented; synthetic only |
| Email Log | `email_jobs` + `email_webhook_events` | Implemented; synthetic/dry-run only |
| Follow-ups | None | Optional; not implemented |

Applying the headers to the live Google Sheet requires explicit approval. The application will not write production headers or records until that approval is recorded. The proposed header order is the field order in each table above.
