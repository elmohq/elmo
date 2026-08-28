import type { InferPageType } from "fumadocs-core/source";
import type { source } from "@/lib/source";

export async function getLLMText(page: InferPageType<typeof source>) {
	if (page.type === "openapi") {
		return JSON.stringify(page.data.getSchema(), null, 2);
	}

	const processed = await page.data.getText("processed");

	return `# ${page.data.title} (${page.url})

${processed}`;
}
