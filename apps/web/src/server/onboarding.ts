/**
 * Exports server functions only: any other export would drag server-only code
 * into the client bundle. Plain functions belong in ./onboarding-core.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	type AnalyzeBrandStatus,
	cancelAnalyzeBrand,
	enqueueAnalyzeBrand,
	getAnalyzeBrandStatus,
} from "@/lib/analyze-brand-job";
import { requireBrandSession } from "@/lib/auth/helpers";
import { saveWizardOnboarding, wizardOnboardingInputSchema } from "@/server/onboarding-core";

/**
 * A background job because analysis routinely runs about a minute, past
 * reverse-proxy read timeouts. The client polls `getAnalyzeBrandStatusFn`.
 */
export const startAnalyzeBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string().min(1),
			website: z.string().min(1),
			brandName: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await enqueueAnalyzeBrand(data);
		return { ok: true };
	});

/** POST so no cache can hold on to an early `pending`. */
export const getAnalyzeBrandStatusFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string().min(1) }))
	.handler(async ({ data }): Promise<AnalyzeBrandStatus> => {
		await requireBrandSession(data.brandId);
		return getAnalyzeBrandStatus(data.brandId);
	});

export const cancelAnalyzeBrandFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string().min(1) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await cancelAnalyzeBrand(data.brandId);
		return { ok: true };
	});

export const updateOnboardedBrandFn = createServerFn({ method: "POST" })
	.validator(wizardOnboardingInputSchema)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return saveWizardOnboarding(data);
	});
