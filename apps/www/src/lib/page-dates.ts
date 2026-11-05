import spec from "@workspace/api-spec";
import type { InferPageType } from "fumadocs-core/source";
import type { blogSource } from "@/lib/blog";
import type { source } from "@/lib/source";

export type DatedPage = InferPageType<typeof source> | InferPageType<typeof blogSource>;

export function newest(dates: (string | undefined)[]): string | undefined {
	return dates
		.filter((date): date is string => Boolean(date))
		.sort()
		.at(-1);
}

export function pageLastUpdated(page: DatedPage): string | undefined {
	if (page.type === "openapi") return spec.info["x-updated"];
	return "date" in page.data ? (page.data.updated ?? page.data.date) : page.data.updated;
}
