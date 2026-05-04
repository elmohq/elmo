import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { openapiPlugin, openapiSource } from "fumadocs-openapi/server";
import { openapi } from "@/lib/openapi";

export const source = loader(
	{
		docs: docs.toFumadocsSource(),
		openapi: await openapiSource(openapi, {
			baseDir: "api",
			groupBy: "tag",
			meta: true,
		}),
	},
	{
		baseUrl: "/docs",
		plugins: [openapiPlugin()],
	},
);
