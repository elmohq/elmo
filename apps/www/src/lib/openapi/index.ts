import { createOpenAPI } from "fumadocs-openapi/server";
import spec from "@workspace/api-spec";

export const openapi = createOpenAPI({
	input: () => ({ "elmo-api": spec as Record<string, unknown> }),
});
