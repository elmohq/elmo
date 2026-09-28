import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { promptCatalogQuerySchema } from "@/lib/prompt-catalog";
import { loadPromptCatalogPage, type PromptCatalogPage } from "@/server/prompt-catalog-load";

export const getPromptCatalogPageFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }).merge(promptCatalogQuerySchema))
	.handler(async ({ data }): Promise<PromptCatalogPage> => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);
		const { brandId, ...search } = data;
		return loadPromptCatalogPage(brandId, search);
	});
