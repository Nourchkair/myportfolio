# OAuth production-readiness plan

Status: **draft for approval. Do not publish or submit verification yet.**

## Current app

- Google Cloud project: `ai-nour`.
- OAuth app: External / **Testing**.
- Current scopes: `spreadsheets`, `calendar.events`, `calendar.readonly`, `drive.file`, `gmail.compose`.
- Current development redirect: local OAuth helper.
- Refresh token is stored server-side in `.dev.vars`; it is never sent to the browser.
- Testing-mode refresh tokens can expire after 7 days.

## Recommended production scope set

| Capability | Scope | Classification | Notes |
| --- | --- | --- | --- |
| Sheets CRM | `https://www.googleapis.com/auth/spreadsheets` | Sensitive | Read/write approved spreadsheet only |
| Calendar events | `https://www.googleapis.com/auth/calendar.events` | Sensitive | Create/reschedule/cancel approved calendar |
| Calendar availability | `https://www.googleapis.com/auth/calendar.readonly` | Sensitive | Free/busy only where possible |
| Drive backups/files | `https://www.googleapis.com/auth/drive.file` | Recommended/narrow | App-created/authorized files only |
| Admin login | `openid`, `email`, `profile` | Basic | Separate OAuth client; email allowlist |

**Recommendation:** do **not** request Gmail scopes for the production automated-email path. Use Resend Free for transactional confirmations, reminders, and acknowledgements. Keep Gmail drafts as a development/human-review fallback only if the restricted `gmail.compose` scope and its security assessment are explicitly approved.

If Gmail drafts are required in production, `gmail.compose` is a **restricted** scope and triggers OAuth verification plus a third-party security assessment. `gmail.send` is only **sensitive**, but it cannot create drafts and does not resolve Google’s agent/MCP policy requirement.

## Redirect URIs to register

| Purpose | URI | Status |
| --- | --- | --- |
| Local admin OAuth | `http://127.0.0.1:8791/auth/google/callback` | To add to the admin OAuth client |
| Production admin OAuth | `https://admin.nourchkair.com/auth/google/callback` | Proposed; private/Access-protected |
| Production API consent | `https://api.nourchkair.com/oauth/google/callback` | Proposed; Worker/custom domain required |
| Local API consent | `http://localhost:8787/oauth/google/callback` | Existing Phase 0A helper |

The static Pages site cannot receive an OAuth code. A Worker or a small serverless callback endpoint is required for production consent and token exchange. Do not expose the client secret in the static site.

## Publishing and verification checklist

1. Complete Google Auth Platform branding: app name, support email, homepage, privacy policy URL, terms URL, authorized domains.
2. Add the production redirect URIs above.
3. Provide scope justifications:
   - Sheets: approved CRM spreadsheet.
   - Calendar: free/busy, booking, reschedule, cancel, unique Meet.
   - Drive: encrypted backups and app-created knowledge files.
4. Record a short demo video if Google requests one for sensitive scopes.
5. Submit for verification only after the privacy/terms pages are live and the production domain is approved.
6. If Gmail scopes are requested, budget for the restricted-scope security assessment; otherwise omit them.
7. Publish the app out of Testing mode.
8. Reauthorize once with `access_type=offline` and `prompt=consent` to obtain a durable refresh token.
9. Store the refresh token as a Worker secret, never in the repository or browser.
10. Add refresh-token failure monitoring and a reauthorization runbook.

## Long-term refresh-token reliability

- Testing mode is not acceptable for production; tokens may expire after 7 days.
- Use a published app and a stable OAuth client.
- Refresh tokens can still be revoked by the user or Google; handle `invalid_grant` by marking the integration degraded and prompting for reauthorization.
- Keep the token server-side; rotate only through an approved operational procedure.
- Do not use the same OAuth client for both the public AI agent and the private admin login; separate clients make revocation and policy review cleaner.

## Privacy and terms pages

Draft pages are prepared at:

- `ai-nour/oauth/privacy.html`
- `ai-nour/oauth/terms.html`

They are **not deployed or linked** until approved. Proposed public URLs:

- `https://nourchkair.com/privacy.html`
- `https://nourchkair.com/terms.html`

## Approval gates

- Approve the final scope set.
- Approve Resend as the automated-email provider and the sending subdomain.
- Approve production redirect URIs and admin hostname.
- Approve privacy/terms copy and retention periods.
- Approve OAuth verification submission and any security assessment cost.
