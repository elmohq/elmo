import { createServerFn } from "@tanstack/react-start";
import { resolveOrganizationEntitlements } from "@workspace/lib/cloud/entitlements";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { PromptEditorCapacity } from "@/components/prompts-list-editor";
import { requireAuthSession, requireBrandOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";

export const getPromptEditorCapacityFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string().min(1) }))
	.handler(async ({ data }): Promise<PromptEditorCapacity> => {
		const session = await requireAuthSession();
		const organization = await requireBrandOrganization(session.user.id, data.brandId);
		const deployment = getDeployment();
		if (deployment.mode !== "cloud") return { scope: "editor", limit: MAX_PROMPTS };

		const resolved = await resolveOrganizationEntitlements({ mode: "cloud", organizationId: organization.id });
		const [{ value: usedOutsideEditor = 0 } = { value: 0 }] = await db
			.select({ value: count() })
			.from(prompts)
			.innerJoin(brands, eq(prompts.brandId, brands.id))
			.where(and(eq(brands.organizationId, organization.id), ne(brands.id, data.brandId), eq(prompts.enabled, true)));

		return {
			scope: "organization-enabled",
			limit: resolved.mode === "cloud" && resolved.access === "allowed" ? resolved.entitlements.promptSlots : 0,
			usedOutsideEditor,
		};
	});
