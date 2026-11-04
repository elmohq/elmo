import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { canonicalUrl, SITE_NAME } from "@/lib/seo";

const MCP = `${CLOUD_APP_URL}/api/mcp`;
const REST = `${CLOUD_APP_URL}/api/v1`;
const AUTH_SERVER = `${CLOUD_APP_URL}/api/auth`;

/** Laid out as the steps of https://github.com/workos/auth.md, filled with the
 * flows this service actually runs. */
export const authDocument = `# auth.md

You are an agent. ${SITE_NAME} tracks how AI answer engines mention and cite brands, and its data sits
behind a REST API and an MCP server that both require a credential. Follow the steps in order:
discover → pick a method → register → claim → exchange → use the access_token → handle revocation.

Every ${SITE_NAME} deployment is a separate tenant with its own credentials. The hosted deployment is
\`${CLOUD_APP_URL}\`; a self-hosted instance serves the same paths on its own origin, so substitute it
everywhere below. This marketing site holds no protected resources and issues no credentials.

| Resource | Endpoint | Credential |
| --- | --- | --- |
| REST API | \`${REST}\` | Organization API key |
| MCP server | \`${MCP}\` | OAuth 2.1 access_token, or an organization API key |

## Step 1 — Discover

An unauthenticated request to the MCP server answers \`401\` with a \`WWW-Authenticate\` header that
points at the Protected Resource Metadata (RFC 9728):

\`\`\`http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="${CLOUD_APP_URL}/.well-known/oauth-protected-resource"
\`\`\`

1. Fetch \`${CLOUD_APP_URL}/.well-known/oauth-protected-resource\`. Its \`resource\` is \`${MCP}\` and
   its \`authorization_servers\` lists \`${AUTH_SERVER}\`.
2. Fetch the authorization server metadata (RFC 8414) at
   \`${CLOUD_APP_URL}/.well-known/oauth-authorization-server\` for the \`issuer\`,
   \`authorization_endpoint\`, \`token_endpoint\`, \`registration_endpoint\`, and \`revocation_endpoint\`.

The REST API answers \`401\` without a \`WWW-Authenticate\` challenge; it takes API keys only.

This service does not publish an \`agent_auth\` block: there is no \`identity_endpoint\`, and the
\`anonymous\`, \`identity_assertion\` (ID-JAG), and \`service_auth\` registration types are not supported.
Use one of the two methods below.

## Step 2 — Pick a method

1. **You are an MCP client acting for a person who can open a browser** → OAuth 2.1 (Method A).
   Access follows that person's existing organization membership.
2. **You run unattended, or you call the REST API** → an organization API key (Method B). A key
   belongs to an organization rather than a person, so it survives staff changes.

## Step 3 — Register

**Method A.** Register a public client at the \`registration_endpoint\` (RFC 7591 dynamic client
registration; no initial access token is needed), or skip registration by using a client ID metadata
document as your \`client_id\` — the authorization server advertises
\`client_id_metadata_document_supported\`.

**Method B.** An agent cannot register for a key itself. An organization owner or admin issues one
from **Settings → API Keys** in the ${SITE_NAME} app, read-only or read-write, optionally limited to
selected brands and given an expiry date. Ask for the narrowest brands and permissions the task
needs. Self-hosted operators can also configure instance-wide admin keys with the
\`ADMIN_API_KEYS\` environment variable.

## Step 4 — Claim

A human always confirms access; there is no unclaimed or anonymous phase.

**Method A.** Start the authorization code flow with PKCE (\`S256\`) at the \`authorization_endpoint\`,
passing \`resource=${MCP}\`. Hand the URL to the user: they sign in to ${SITE_NAME} (or sign up) and
approve the grant on the consent page, and the authorization server redirects to your
\`redirect_uri\` with a \`code\`. Request \`offline_access\` if you need to refresh without them.

**Method B.** The admin who issues the key is the claim. They hand you the key once; it cannot be
shown again.

## Step 5 — Exchange

**Method A.** Exchange the \`code\` at the \`token_endpoint\`:

\`\`\`http
POST /api/auth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<code>
&redirect_uri=<redirect_uri>
&client_id=<client_id>
&code_verifier=<code_verifier>
&resource=${MCP}
\`\`\`

The response is a standard OAuth token response with an \`access_token\` and, when you asked for
\`offline_access\`, a \`refresh_token\`. DPoP-bound tokens are supported. Tokens carry the user's
organizations and permissions; asking for a broader scope does not widen them.

**Method B.** Nothing to exchange: the API key is used directly.

## Step 6 — Use the access_token

\`\`\`http
POST /api/mcp
Authorization: Bearer <access_token or elmo_... key>
\`\`\`

The REST API at \`${REST}\` takes the API key the same way. When an access_token expires, use the
\`refresh_token\` grant at the \`token_endpoint\`; if that fails, restart at Step 4.

API reference: ${canonicalUrl("/docs/api")}. MCP server guide: ${canonicalUrl("/docs/api/mcp")}. OpenAPI
description: ${canonicalUrl("/api/openapi.json")}.

## Errors

| Code | Where | What to do |
| --- | --- | --- |
| \`401\` | REST API, MCP server | Credential missing, malformed, expired, or revoked. Refresh once (Method A); otherwise restart at Step 1. Do not retry the same credential. |
| \`403\` \`insufficient_scope\` / \`forbidden\` | REST API | The credential is valid but lacks the scope or brand access. Ask the operator for a wider key rather than retrying. |
| \`429\` | REST API, MCP server | Wait \`Retry-After\` seconds. On the REST API, \`RateLimit-Policy\` and \`RateLimit\` headers describe the quota. |
| \`invalid_grant\` | \`token_endpoint\` | Code or refresh_token expired, reused, or revoked. Restart at Step 4. |
| \`invalid_client\` | \`token_endpoint\` | \`client_id\` not recognized. Register again (Step 3). |
| \`invalid_request\` | \`authorization_endpoint\`, \`token_endpoint\` | A required parameter such as the PKCE \`code_challenge\` is missing. Fix the request. |
| \`access_denied\` | \`redirect_uri\` | The user declined the grant. Do not retry without asking them. |

The MCP server reports failures as JSON-RPC errors. REST errors share one body, \`{ "error", "message", "code" }\`. Retry \`5xx\` with exponential backoff;
do not retry a \`4xx\` with the same payload.

## Revocation

- **OAuth grants**: POST \`token=<token>\` (form-encoded) to the \`revocation_endpoint\` (RFC 7009). A
  token also stops working as soon as its user is banned or its client is disabled.
- **API keys**: organization admins revoke keys from **Settings → API Keys**.

Treat either as permanent: on a \`401\` for a credential that used to work, refresh once (Method A),
then restart at Step 1.
`;
