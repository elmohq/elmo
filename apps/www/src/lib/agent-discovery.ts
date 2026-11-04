import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { canonicalUrl, SITE_NAME, SITE_URL } from "@/lib/seo";

export const protectedResourceMetadata = {
	resource: SITE_URL,
	authorization_servers: [`${CLOUD_APP_URL}/api/auth`],
	scopes_supported: ["openid", "profile", "email", "offline_access"],
	bearer_methods_supported: ["header"],
	resource_documentation: canonicalUrl("/auth.md"),
};

export const poppyManifest = {
	protocol_version: "0.1",
	organization: { name: SITE_NAME, domain: "elmohq.com" },
	web: {},
};

export const discoveryHeaders = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Origin": "*",
} as const;
