import { generateFiles } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, "../../../packages/api-spec/src/openapi.json");
const spec = JSON.parse(readFileSync(specPath, "utf-8"));

const openapi = createOpenAPI({
	input: () => ({ "elmo-api": spec }),
});

await generateFiles({
	input: openapi,
	output: resolve(__dirname, "../content/docs/api-reference"),
	per: "operation",
	groupBy: "tag",
});
