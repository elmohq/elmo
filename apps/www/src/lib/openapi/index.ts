import spec from "@workspace/api-spec";
import { CLOUD_APP_URL } from "@workspace/config/referrals";
import type { OpenAPIV3_2 } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";

/**
 * These pages document the hosted product, so they name its host outright — the
 * relative server in the spec would resolve against this marketing site, which
 * serves no API. An instance serving its own spec fills the host in from the
 * request instead.
 */
export const hostedSpec = {
	...spec,
	servers: [{ url: `${CLOUD_APP_URL}/api/v1`, description: "Elmo Cloud" }],
};

export const openapi = createOpenAPI({
	// fumadocs-openapi v11 replaced the `() => SchemaMap` factory with a record
	// of `name -> string | Document | (() => Awaitable<...>)`.
	input: { "elmo-api": hostedSpec as OpenAPIV3_2.Document },
});
