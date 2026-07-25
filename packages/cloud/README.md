# @workspace/cloud

Deployment factory and auth/email integrations for the managed Elmo Cloud offering (`DEPLOYMENT_MODE=cloud`).

## Required environment variables

The auth and email features in this package need:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_FROM_EMAIL` | Sender address, e.g. `Elmo <notifications@updates.example.com>` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for social sign-in |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

The worker additionally needs the Infisical variables below. The web app does not — see the Infisical section for why.

| Variable | Purpose |
| --- | --- |
| `INFISICAL_CLIENT_ID` | Infisical machine identity client ID |
| `INFISICAL_CLIENT_SECRET` | Infisical machine identity client secret |
| `INFISICAL_PROJECT_ID` | Project containing provider credentials |
| `INFISICAL_ENVIRONMENT` | Environment slug containing provider credentials |
| `INFISICAL_SECRET_PATH` | Optional credentials path; defaults to `/` |
| `INFISICAL_SITE_URL` | Optional Infisical site URL; defaults to the US cloud |

The canonical list of every cloud-required variable (Stripe, database, etc.) lives in `packages/config/src/env-registry.ts`; env validation fails cloud startup when any of them is missing.

## Resend setup

1. Create an API key in the [Resend dashboard](https://resend.com) and set it as `RESEND_API_KEY`.
2. Verify the sending domain: add the SPF and DKIM DNS records Resend shows for the domain (e.g. `updates.example.com`).
3. Set `RESEND_FROM_EMAIL` to a display-name form on that verified domain, e.g. `Elmo <notifications@updates.example.com>`.

Email templates are code — `packages/cloud/src/email-templates.ts` — not Resend-hosted templates; there is nothing to configure template-side in Resend.

## Infisical setup

Provider credentials live in one Infisical folder, named exactly as the canonical environment variables (`OPENAI_API_KEY`, `OXYLABS_USERNAME`, `OXYLABS_PASSWORD`, …). The two runtimes read that folder differently.

**Worker** — a long-lived VM, so it authenticates once with the SDK and refreshes every minute. Rotating a credential in Infisical reaches it without a deploy.

1. Create a machine identity with Universal Auth and read access to the provider-credential path — that path only, since the loader is not recursive.
2. Set the Infisical variables above on the worker.

A refresh that fails, or that returns no provider credentials at all, keeps the last known-good values and logs an error; the worker refuses to start if the very first load fails.

**Web app** — runs on Vercel serverless. Use Infisical's [Vercel secret sync](https://infisical.com/docs/integrations/secret-syncs/vercel) to push the same folder into the project's environment variables, and the app reads them from `process.env`.

1. Add a Vercel app connection in Infisical, then a secret sync from the provider-credential folder to the Vercel project.
2. Enable auto-sync, and redeploy after a rotation — Vercel bakes environment variables in at deploy time.

Reading Infisical at runtime instead would put an authentication round trip on every cold start and Infisical's availability in front of the whole site, to serve credentials the request path barely uses.

Infisical is only used by `DEPLOYMENT_MODE=cloud`. Self-hosted deployments use encrypted database credentials or environment variables.

## Google OAuth setup

1. In the Google Cloud console, create an OAuth client of type **Web application**.
2. Authorized redirect URI: `${APP_URL}/api/auth/callback/google`.
3. Authorized JavaScript origin: `${APP_URL}`.
4. Set the resulting client ID and secret as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## Behavior notes

- Email/password sign-in requires a verified email. The verification email is sent on signup, unverified sign-in attempts re-send it, and clicking the link signs the user in automatically.
- Google-provided emails arrive verified, so OAuth users are never blocked by verification.
- Team invitations expire after 48 hours (better-auth default). Untouched invitations simply lapse; there is no decline step.
- Disposable-email domains are rejected at signup (both email/password and OAuth) via the `disposable-email-domains` package; the blocklist updates through normal dependency bumps.
