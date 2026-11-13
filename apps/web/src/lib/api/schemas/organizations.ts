import * as z from "zod";
import { paginationSchema } from "./pagination";

export const organizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	brandCount: z.int(),
	createdAt: z.iso.datetime({ offset: true }),
});

export const organizationListSchema = z.object({
	data: z.array(organizationSchema),
	pagination: paginationSchema,
});

const billingPlanSchema = z.object({
	key: z.string().nullable(),
	name: z.string(),
	standing: z.enum(["active", "grace", "paused", "none"]),
	interval: z.enum(["monthly", "annual"]).nullable().optional(),
	periodEnd: z.iso.datetime({ offset: true }).nullish(),
	cancelAtPeriodEnd: z.boolean(),
	trackingActive: z.boolean(),
});

const planLimitsSchema = z.object({
	maxBrands: z.int().nullable(),
	maxPrompts: z.int().nullable(),
	modelPicks: z.int().nullable(),
	modelMenu: z.array(z.string()).nullable(),
	standardRunsPerDay: z.int().nullable(),
	premiumPool: z.int(),
	premiumRunsPerDay: z.int(),
});

export const organizationBillingSchema = z.object({
	organizationId: z.string(),
	billingEnabled: z.boolean(),
	plan: billingPlanSchema.nullable(),
	limits: planLimitsSchema.nullable(),
	usage: z.object({
		brands: z.int(),
		enabledPrompts: z.int(),
		premiumPairingsAssigned: z.int(),
	}),
});
