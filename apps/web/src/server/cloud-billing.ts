import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
	changeCloudSubscriptionPlan,
	CloudBillingControlError,
	getSerializedCloudBillingView,
	MAX_SELF_SERVE_CLAUDE_ADDON_PROMPT_SLOTS,
	setCloudClaudeAddonPromptSlots,
	validateCloudInitialCheckout,
} from "@workspace/cloud/billing-control";
import { CLOUD_PLAN_CATALOG, SELF_SERVE_CLOUD_PLAN_IDS } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { member, organizationBillingSubscriptions } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession } from "@/lib/auth/helpers";
import { auth, requireCloudBillingRuntime } from "@/lib/auth/server";
import { getDeployment } from "@/lib/config/server";

const selfServePlanSchema = z.enum(SELF_SERVE_CLOUD_PLAN_IDS);
const intervalSchema = z.enum(["month", "year"]);
const relativeReturnPathSchema = z
	.string()
	.max(2_000)
	.refine((value) => value.startsWith("/") && !value.startsWith("//"), "Use an application-relative path");

type BillingAction = "view" | "manage";

function requireCloudDeployment(): void {
	if (getDeployment().mode !== "cloud") throw new Error("Cloud billing is not available in this deployment");
}

async function requireWorkspaceBillingAccess(
	userId: string,
	organizationId: string,
	action: BillingAction,
): Promise<{ role: string; planId: string | null; stripeCustomerId: string | null; canManage: boolean }> {
	const [access] = await db
		.select({
			role: member.role,
			planId: organizationBillingSubscriptions.basePlanKey,
			stripeCustomerId: organizationBillingSubscriptions.stripeCustomerId,
		})
		.from(member)
		.leftJoin(
			organizationBillingSubscriptions,
			eq(organizationBillingSubscriptions.organizationId, member.organizationId),
		)
		.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
		.limit(1);
	if (!access) throw new Error("Forbidden: No access to this organization");
	const canManage = access.role === "admin" || access.role === "owner";
	if (action === "manage" && !canManage) throw new Error("Forbidden: Organization admin access required");
	if (action === "manage" && access.planId === "custom") {
		throw new CloudBillingControlError("custom-plan-read-only", "Custom plans are managed by Elmo support.");
	}
	return { ...access, canManage };
}

const plans = SELF_SERVE_CLOUD_PLAN_IDS.map((planId) => {
	const plan = CLOUD_PLAN_CATALOG[planId];
	if (plan.billing.kind !== "self-serve") throw new Error(`${planId} must be self-serve`);
	return {
		id: plan.id,
		displayName: plan.displayName,
		currency: plan.billing.currency,
		monthlyAmountCents: plan.billing.monthly.unitAmountCents,
		annualAmountCents: plan.billing.annual.unitAmountCents,
		entitlements: plan.entitlements.value,
	};
});

export type WorkspaceBillingData = Awaited<ReturnType<typeof getSerializedCloudBillingView>> & {
	permissions: { role: string; canManage: boolean; selfServe: boolean };
	plans: typeof plans;
};

export const getWorkspaceBillingFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string().min(1) }))
	.handler(async ({ data }): Promise<WorkspaceBillingData> => {
		requireCloudDeployment();
		const session = await requireAuthSession();
		const access = await requireWorkspaceBillingAccess(session.user.id, data.organizationId, "view");
		const billing = await getSerializedCloudBillingView({ organizationId: data.organizationId });
		return {
			...billing,
			permissions: {
				role: access.role,
				canManage: access.canManage,
				selfServe: access.planId !== "custom",
			},
			plans,
		};
	});

type StripeBillingApi = typeof auth.api & {
	upgradeSubscription(input: {
		body: {
			plan: string;
			annual: boolean;
			referenceId: string;
			customerType: "organization";
			successUrl: string;
			cancelUrl: string;
			disableRedirect: true;
		};
		headers: Headers;
	}): Promise<{ url: string; redirect: boolean }>;
};

function billingApi(): StripeBillingApi {
	return auth.api as StripeBillingApi;
}

export const startCloudCheckoutFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			organizationId: z.string().min(1),
			planId: selfServePlanSchema,
			interval: intervalSchema,
			successPath: relativeReturnPathSchema,
			cancelPath: relativeReturnPathSchema,
		}),
	)
	.handler(async ({ data }): Promise<CloudCheckoutResult> => {
		requireCloudDeployment();
		const session = await requireAuthSession();
		await requireWorkspaceBillingAccess(session.user.id, data.organizationId, "manage");
		const violations = await validateCloudInitialCheckout({
			organizationId: data.organizationId,
			planId: data.planId,
		});
		if (violations.length > 0) {
			return {
				accepted: false,
				code: "configuration-over-capacity",
				message: "The workspace configuration exceeds the requested billing plan.",
				violations,
			};
		}
		requireCloudBillingRuntime();
		const result = await billingApi().upgradeSubscription({
			body: {
				plan: data.planId,
				annual: data.interval === "year",
				referenceId: data.organizationId,
				customerType: "organization",
				successUrl: data.successPath,
				cancelUrl: data.cancelPath,
				disableRedirect: true,
			},
			headers: getRequestHeaders(),
		});
		return { accepted: true, url: result.url };
	});

export type CloudCheckoutResult =
	| { accepted: true; url: string }
	| {
			accepted: false;
			code: "configuration-over-capacity";
			message: string;
			violations: CloudBillingControlError["violations"];
	  };

export type CloudBillingMutationResult =
	| { accepted: true; stripeSubscriptionId: string }
	| {
			accepted: false;
			code: CloudBillingControlError["code"];
			message: string;
			violations: CloudBillingControlError["violations"];
	  };

function serializeControlError(error: unknown): CloudBillingMutationResult {
	if (!(error instanceof CloudBillingControlError)) throw error;
	return { accepted: false, code: error.code, message: error.message, violations: error.violations };
}

export const changeCloudPlanFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			organizationId: z.string().min(1),
			planId: selfServePlanSchema,
			interval: intervalSchema,
			mutationId: z.uuid(),
		}),
	)
	.handler(async ({ data }): Promise<CloudBillingMutationResult> => {
		requireCloudDeployment();
		const session = await requireAuthSession();
		try {
			await requireWorkspaceBillingAccess(session.user.id, data.organizationId, "manage");
			return await changeCloudSubscriptionPlan({
				...data,
				stripeClient: requireCloudBillingRuntime().stripeClient,
			});
		} catch (error) {
			return serializeControlError(error);
		}
	});

export const setCloudClaudeAddonFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			organizationId: z.string().min(1),
			quantity: z.number().int().min(0).max(MAX_SELF_SERVE_CLAUDE_ADDON_PROMPT_SLOTS),
			mutationId: z.uuid(),
		}),
	)
	.handler(async ({ data }): Promise<CloudBillingMutationResult> => {
		requireCloudDeployment();
		const session = await requireAuthSession();
		try {
			await requireWorkspaceBillingAccess(session.user.id, data.organizationId, "manage");
			return await setCloudClaudeAddonPromptSlots({
				...data,
				stripeClient: requireCloudBillingRuntime().stripeClient,
			});
		} catch (error) {
			return serializeControlError(error);
		}
	});

export const createCloudBillingPortalFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			organizationId: z.string().min(1),
			returnPath: relativeReturnPathSchema,
		}),
	)
	.handler(async ({ data }): Promise<{ url: string }> => {
		requireCloudDeployment();
		const session = await requireAuthSession();
		const access = await requireWorkspaceBillingAccess(session.user.id, data.organizationId, "manage");
		if (!access.stripeCustomerId) throw new Error("This workspace does not have a Stripe customer");
		const runtime = requireCloudBillingRuntime();
		const appUrl = process.env.APP_URL ?? process.env.VITE_APP_URL;
		if (!appUrl) throw new Error("APP_URL or VITE_APP_URL must be set");
		const portal = await runtime.stripeClient.billingPortal.sessions.create({
			customer: access.stripeCustomerId,
			configuration: runtime.billingPortalConfigurationId,
			return_url: new URL(data.returnPath, appUrl).toString(),
		});
		return { url: portal.url };
	});
