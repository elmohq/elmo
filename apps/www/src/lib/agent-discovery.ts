import { SITE_NAME } from "@/lib/seo";

export const poppyManifest = {
	protocol_version: "0.1",
	organization: { name: SITE_NAME, domain: "elmohq.com" },
	web: {},
};

export const discoveryHeaders = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Origin": "*",
} as const;
