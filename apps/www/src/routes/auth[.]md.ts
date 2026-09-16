import { createFileRoute } from "@tanstack/react-router";
import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { canonicalUrl, SITE_NAME } from "@/lib/seo";

const authDocument = `# auth.md

${SITE_NAME} tracks how AI answer engines mention and cite brands. Its data is reachable over a REST
API and an MCP server, both of which require a credential. This document tells an agent how to get one.

## Audience

Every ${SITE_NAME} deployment is a separate tenant and issues its own credentials; there is no shared
identity across deployments. The hosted deployment lives at \`${CLOUD_APP_URL}\`, and self-hosted
instances serve the same paths on their own origin. Substitute that origin for \`${CLOUD_APP_URL}\`
everywhere below. This marketing site holds no protected resources and issues no credentials.

## Protected resources

| Resource | Endpoint | Credential |
| --- | --- | --- |
| REST API | \`${CLOUD_APP_URL}/api/v1\` | Organization API key |
| MCP server | \`${CLOUD_APP_URL}/api/mcp\` | OAuth 2.1 access token, or an organization API key |

## Method 1 — OAuth 2.1 with dynamic client registration

Preferred for MCP clients acting on behalf of a person. No human has to copy a secret, and access
follows that person's existing organization membership.

1. Fetch \`${CLOUD_APP_URL}/.well-known/oauth-protected-resource\` to learn the resource identifier
   and its authorization server. An unauthenticated request to the MCP endpoint also returns the
   same pointer in a \`WWW-Authenticate\` header.
2. Fetch \`${CLOUD_APP_URL}/.well-known/oauth-authorization-server\` for the issuer and its endpoints.
3. Register a client at the \`registration_endpoint\` (RFC 7591), or present a client ID metadata
   document — the authorization server advertises \`client_id_metadata_document_supported\`.
4. Run the authorization code flow with PKCE against the \`authorization_endpoint\`, then exchange the
   code at the \`token_endpoint\`. A human approves the grant in a browser. Request
   \`offline_access\` if the agent needs to refresh without them.
5. Send the access token as \`Authorization: Bearer <token>\`.

Tokens carry the granted user's organizations and permissions; there is no way to widen reach by
asking for a broader scope.

## Method 2 — organization API key

Preferred for unattended agents and server-to-server work. A key belongs to an organization rather
than to a person, so it survives staff changes.

An organization owner or admin issues one from **Settings → API Keys** in the ${SITE_NAME} app. Keys
are created read-only or read-write, can be restricted to selected brands, and can be given an expiry
date. Self-hosted operators can also configure instance-wide admin keys through the
\`ADMIN_API_KEYS\` environment variable.

An agent cannot mint its own key: issuing one requires an authenticated human with admin rights.
Ask the operator for a key scoped to the narrowest set of brands and permissions the task needs.

Send it the same way:

\`\`\`http
Authorization: Bearer elmo_...
\`\`\`

## Handling failures

- \`401\` — the credential is missing, malformed, expired, or revoked. Re-run the flow above; do not
  retry the same credential.
- \`403\` — the credential is valid but lacks the scope or brand access for that request. Ask the
  operator to widen the key rather than retrying.
- \`429\` — rate limited. Respect the returned limit and back off.

## Revocation

Organization admins can delete an API key at any time from **Settings → API Keys**, and OAuth grants
can be revoked at the authorization server's \`revocation_endpoint\`. Treat either as permanent and
stop using the credential.

## More

- API reference: ${canonicalUrl("/docs/api")}
- MCP server guide: ${canonicalUrl("/docs/api/mcp")}
- OpenAPI description: ${canonicalUrl("/api/openapi.json")}
`;

export const Route = createFileRoute("/auth.md")({
	server: {
		handlers: {
			GET: async () =>
				new Response(authDocument, {
					headers: {
						"Content-Type": "text/markdown; charset=utf-8",
						"Access-Control-Allow-Origin": "*",
					},
				}),
		},
	},
});
