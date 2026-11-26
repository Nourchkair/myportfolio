# Proposed CRM schema — Phase 2

Status: **proposed, not applied.** No production headers or records have been written to the Google Sheet. This extends the Phase 0A proposal with inquiry idempotency, appointment linkage, timezone, Meet link and email/consent fields.

## Contacts

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| contact_id | string | yes | Stable UUID |
| full_name | string | yes | Display name |
| email | string | no | Normalized lowercase |
| phone | string | no | E.164 where possible |
| organization | string | no | |
| role | string | no | |
| locale | string | no | en/fr |
| timezone | string | no | IANA timezone |
| source | string | yes | portfolio, referral, event, other |
| consent_status | string | yes | none, partial, granted, withdrawn |
| created_at | datetime | yes | ISO 8601 UTC |
| updated_at | datetime | yes | ISO 8601 UTC |
| notes | string | no | No sensitive data |

## Inquiries

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| inquiry_id | string | yes | Stable UUID |
| contact_id | string | yes | FK to Contacts |
| received_at | datetime | yes | ISO 8601 UTC |
| channel | string | yes | portfolio, email, referral, event, other |
| inquiry_type | string | yes | general, consulting, recruitment, partnership, media, other |
| summary | string | yes | Short factual summary |
| requested_service | string | no | |
| budget_range | string | no | Visitor-provided only |
| timeline | string | no | Visitor-provided only |
| status | string | yes | new, reviewing, qualified, closed, spam |
| owner | string | no | Human owner |
| consent_id | string | no | FK to Consent |
| source_url | string | no | Portfolio route/referrer |
| client_request_id | string | no | Idempotency key |
| created_at | datetime | yes | ISO 8601 UTC |
| updated_at | datetime | yes | ISO 8601 UTC |
| notes | string | no | |

## Pipeline

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| opportunity_id | string | yes | Stable UUID |
| inquiry_id | string | yes | FK |
| contact_id | string | yes | FK |
| stage | string | yes | new, qualified, discovery, proposal, negotiation, won, lost, nurture |
| value_cad | number | no | Estimate only |
| probability | number | no | 0–100; human estimate |
| next_action | string | no | |
| next_action_at | datetime | no | ISO 8601 UTC |
| owner | string | no | |
| last_contact_at | datetime | no | ISO 8601 UTC |
| loss_reason | string | no | Only for Lost |
| created_at | datetime | yes | ISO 8601 UTC |
| updated_at | datetime | yes | ISO 8601 UTC |
| notes | string | no | |

## Appointments

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| appointment_id | string | yes | Stable UUID |
| inquiry_id | string | yes | FK |
| contact_id | string | yes | FK |
| start_utc | datetime | yes | ISO 8601 UTC |
| end_utc | datetime | yes | ISO 8601 UTC |
| timezone | string | yes | Visitor IANA timezone |
| calendar_event_id | string | no | Google Calendar event id |
| meet_link | string | no | Unique Google Meet link |
| status | string | yes | reserved, calendar_pending, confirmed, cancelled, completed, no_show |
| owner | string | no | Human owner |
| idempotency_key | string | yes | Unique booking intent |
| created_at | datetime | yes | ISO 8601 UTC |
| updated_at | datetime | yes | ISO 8601 UTC |
| notes | string | no | |

## Follow-ups

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| followup_id | string | yes | Stable UUID |
| inquiry_id | string | yes | FK |
| contact_id | string | yes | FK |
| due_at | datetime | yes | ISO 8601 UTC |
| channel | string | yes | email, phone, linkedin, other |
| purpose | string | yes | |
| status | string | yes | pending, drafted, sent, skipped, cancelled |
| owner | string | no | |
| sent_at | datetime | no | Human-confirmed send only |
| consent_id | string | no | FK |
| created_at | datetime | yes | ISO 8601 UTC |
| updated_at | datetime | yes | ISO 8601 UTC |
| notes | string | no | |

## Consent

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| consent_id | string | yes | Stable UUID |
| contact_id | string | yes | FK |
| scope | string | yes | store, contact, email, followup, marketing |
| status | string | yes | granted, withdrawn |
| captured_at | datetime | yes | ISO 8601 UTC |
| expires_at | datetime | no | ISO 8601 UTC |
| source | string | yes | portfolio, email, verbal, other |
| evidence | string | no | Short reference, not a transcript copy |
| created_at | datetime | yes | ISO 8601 UTC |
| updated_at | datetime | yes | ISO 8601 UTC |

## Approval

The schema is implemented in local D1 for synthetic workflow validation. Applying these headers to the live Google Sheet requires approval. The application will not write production headers or records until that approval is recorded.
