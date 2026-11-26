# Cloudflare Access setup — Phase 0A blocker and runbook

## Current state (26 Nov 2026)

- Zero Trust has never been activated on `Nourchkair@gmail.com's Account`.
- Access API returns `403 access.api.error.not_enabled`.
- No Access applications and no Google identity provider exist.
- No subscription was created. The account remains unchanged.
- The live wizard offers **Zero Trust Free at $0/seat/month (50-seat limit)**, but the checkout still requires:
  - a payment card on file,
  - acceptance of the Terms of Service and Privacy Policy,
  - authorization to charge the card for usage above the free allowance each month.

That card requirement conflicts with the approved `$0` fixed-cost and “do not activate billing” boundaries, so setup was stopped before submitting. See `results/access-blocker.json`.

## Approval gate

Do not activate until the account owner explicitly approves:

1. Adding or confirming a payment method for the Free plan.
2. The usage-based overage authorization that accompanies activation.

If that approval is not given, keep the server-side admin token (`/control`, `/spend`) for Phase 0A and defer Access.

## Runbook if approved

### 1. Create the Zero Trust organization

1. Open Zero Trust → Get started.
2. Choose **Zero Trust Free**.
3. Complete checkout with the approved card.
4. After activation, set a unique team name, for example `ai-nour-phase0a`, under **Zero Trust → Settings → Team name and domain**.
5. Record the resulting team domain: `https://<team-name>.cloudflareaccess.com`.

### 2. Create a dedicated Google identity provider

Use a **separate** OAuth client for Cloudflare Access; do not reuse the AI Nour Gemini/Sheets client.

1. In Google Cloud Console → Google Auth Platform → Clients, create a Web application client.
2. Name it `Cloudflare Access — AI Nour Phase 0A`.
3. Add the authorized redirect URI:
   `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
4. Select **Use this client for an AI-powered agent** only if this client is also used by an agent. For a pure human admin login, select the normal web-application option and keep it separate from the agent client.
5. In Cloudflare Zero Trust → Settings → Authentication, add Google as an identity provider with the client ID and secret.
6. Keep the Cloudflare Access policy restricted to the administrator email; do not allow the whole domain by default.

### 3. Protect the admin paths

Cloudflare supports self-hosted Access applications on `workers.dev` hostnames and individual paths. Do not change DNS.

Create self-hosted applications for:

| Application | Destination |
| --- | --- |
| AI Nour admin control | `ai-nour-phase0a-dev.phase0a.workers.dev/control` |
| AI Nour spend control | `ai-nour-phase0a-dev.phase0a.workers.dev/spend` |

Policy:

- Action: Allow.
- Include: the administrator’s exact email address.
- Session duration: 8 hours (or shorter).
- Require reauthentication for the control paths if the plan allows it.

Optionally protect the whole Worker later, but keep `/health` available for uptime checks.

### 4. Validation checklist

1. Unauthenticated `GET /control` returns an Access redirect, not `401` from the Worker.
2. Google login succeeds for the administrator.
3. A different Google account is denied.
4. The Access session expires and reauthentication is required.
5. `POST /control` still requires the Worker admin token as a second factor.
6. Access audit logs show the login and policy decision.
7. `/spend` is also protected.
8. No DNS records were changed.

### 5. Failure fallback

If Access cannot be enabled without billing, keep the isolated admin token and do not expose `/control` or `/spend` to the public internet. Put the admin surface behind a private network or remove it from the public Worker until Access is approved.

## References

- Cloudflare Workers + Access: <https://developers.cloudflare.com/workers/configuration/cloudflare-access/>
- Create a Zero Trust organization: <https://developers.cloudflare.com/learning-paths/clientless-access/initial-setup/create-zero-trust-org/>
- Google Workspace MCP / agent access: <https://developers.google.com/workspace/guides/configure-mcp-servers>
