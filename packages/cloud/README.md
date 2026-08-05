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
| `STRIPE_SECRET_KEY` | Stripe server API key for prices, customers, Checkout, subscriptions, and Billing Portal |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the Better Auth Stripe webhook endpoint |
| `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | Dedicated Billing Portal configuration with subscription updates disabled |

The canonical list of every cloud-required variable (Stripe, database, etc.) lives in `packages/config/src/env-registry.ts`; env validation fails cloud startup when any of them is missing.

## Resend setup

1. Create an API key in the [Resend dashboard](https://resend.com) and set it as `RESEND_API_KEY`.
2. Verify the sending domain: add the SPF and DKIM DNS records Resend shows for the domain (e.g. `updates.example.com`).
3. Set `RESEND_FROM_EMAIL` to a display-name form on that verified domain, e.g. `Elmo <notifications@updates.example.com>`.

Email templates are code — `packages/cloud/src/email-templates.ts` — not Resend-hosted templates; there is nothing to configure template-side in Resend.

## Google OAuth setup

1. In the Google Cloud console, create an OAuth client of type **Web application**.
2. Authorized redirect URI: `${APP_URL}/api/auth/callback/google`.
3. Authorized JavaScript origin: `${APP_URL}`.
4. Set the resulting client ID and secret as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## Stripe billing setup

Use `createCloudBillingRuntime()` from `@workspace/cloud/billing`, add its `plugin` to Better Auth, and run `validateStartup()` before accepting traffic. Catalog validation resolves every stable lookup key and fails when an active price has the wrong amount, currency, or interval. Create a dedicated Billing Portal configuration that has subscription updates disabled and set its ID as `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`; startup also rejects an inactive or unsafe configuration. Configure Stripe to deliver events to `${APP_URL}/api/auth/stripe/webhook` with the signing secret in `STRIPE_WEBHOOK_SECRET`.

Webhook delivery is the billing authority. The handler stores every signed event before processing it, retrieves the current subscription from Stripe, and atomically replaces the organization projection. Better Auth subscription callbacks must not write that projection because callback failures are swallowed by the plugin; `onEvent` failures propagate and cause Stripe to retry.

Operator-created custom subscriptions may use prices outside the public catalog only when their Stripe subscription metadata contains both `elmo_plan_id=custom` and `elmo_billing_source=operator`. All line items on such a subscription are projected as custom; an active versioned organization entitlement override is still required before the resolver grants access. Self-serve Checkout overwrites both reserved metadata keys, so client-provided metadata cannot opt into a custom contract.

## Behavior notes

- Email/password sign-in requires a verified email. The verification email is sent on signup, unverified sign-in attempts re-send it, and clicking the link signs the user in automatically.
- Google-provided emails arrive verified, so OAuth users are never blocked by verification.
- Team invitations expire after 48 hours (better-auth default). Untouched invitations simply lapse; there is no decline step.
- Disposable-email domains are rejected at signup (both email/password and OAuth) via the `disposable-email-domains` package; the blocklist updates through normal dependency bumps.
