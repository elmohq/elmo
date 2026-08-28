/**
 * /app/new - Create a new brand.
 *
 * Attaches a new brand to one of the current user's organizations and seeds
 * the brand row with the supplied name + website. Gated by the
 * canCreateBrands deployment feature (local, cloud) at both the loader
 * (redirect to /app) and the server function.
 *
 * Where the plan meters platforms, a second step asks which ones to track:
 * this is the flow every cloud brand goes through, so accepting the defaults
 * silently would mean a brand's first cycle runs on platforms nobody chose.
 *
 * A workspace that has spent its plan's brands is told so here, before anything
 * is filled in — the write guard would otherwise reject the finished form, and
 * a limit is not something to discover at the end of a wizard.
 */

import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { checkBrandCreate, type WriteDenialCode } from "@workspace/lib/entitlements";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { inArray } from "drizzle-orm";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { PlatformSelectionStep } from "@/components/platform-selection-step";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { getDeployment } from "@/lib/config/server";
import { trackEvent } from "@/lib/posthog";
import { buildTitle, getAppName } from "@/lib/route-head";
import { createBrandInOrgFn } from "@/server/brands";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

type NewBrandOrganization = {
	id: string;
	name: string;
	/** Why this workspace can't take another brand; null when it can. */
	blocked: { code: WriteDenialCode; message: string } | null;
	/** A brand to hang the (brand-scoped) billing link on; null when the org has none. */
	billingBrandId: string | null;
};

/** The oldest brand of each org, which is as good a billing entry point as any. */
async function billingBrandByOrg(orgIds: string[]): Promise<Map<string, string>> {
	if (orgIds.length === 0) return new Map();
	const rows = await db
		.select({ id: brands.id, organizationId: brands.organizationId })
		.from(brands)
		.where(inArray(brands.organizationId, orgIds))
		.orderBy(brands.createdAt);
	const byOrg = new Map<string, string>();
	for (const row of rows) if (!byOrg.has(row.organizationId)) byOrg.set(row.organizationId, row.id);
	return byOrg;
}

const getNewBrandOptions = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ canCreateBrands: boolean; organizations: NewBrandOrganization[] }> => {
		if (!getDeployment().features.canCreateBrands) {
			return { canCreateBrands: false, organizations: [] };
		}
		const session = await requireAuthSession();
		const orgs = await listUserOrganizations(session.user.id);
		const decisions = await checkBrandCreate(orgs.map((org) => org.id));
		const blocked = orgs.filter((org) => decisions.get(org.id)?.allowed === false);
		const billingBrands = await billingBrandByOrg(blocked.map((org) => org.id));

		return {
			canCreateBrands: true,
			organizations: orgs.map((org) => {
				const decision = decisions.get(org.id);
				return {
					id: org.id,
					name: org.name,
					blocked: decision && !decision.allowed ? { code: decision.code, message: decision.message } : null,
					billingBrandId: billingBrands.get(org.id) ?? null,
				};
			}),
		};
	},
);

export const Route = createFileRoute("/_authed/app/new")({
	loader: async (): Promise<{ organizations: NewBrandOrganization[] }> => {
		const { canCreateBrands, organizations } = await getNewBrandOptions();
		if (!canCreateBrands) {
			throw redirect({ to: "/app" });
		}
		return { organizations };
	},
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("Create a new brand", { appName }) },
				{ name: "description", content: "Set up a brand to start tracking." },
			],
		};
	},
	component: NewBrandPage,
});

interface WorkspaceSelectProps {
	organizations: NewBrandOrganization[];
	value: string;
	onChange: (organizationId: string) => void;
	disabled?: boolean;
}

/** One workspace is the norm; only ask when the answer isn't already decided. */
function WorkspaceSelect({ organizations, value, onChange, disabled }: WorkspaceSelectProps) {
	if (organizations.length <= 1) return null;
	return (
		<div className="space-y-2">
			<Label htmlFor="organization">Workspace</Label>
			{/* `items` lets the trigger show the workspace name rather than its id. */}
			<Select
				items={organizations.map((org) => ({ value: org.id, label: org.name }))}
				value={value}
				onValueChange={(next) => next && onChange(next)}
				disabled={disabled}
			>
				<SelectTrigger id="organization" className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{organizations.map((org) => (
						<SelectItem key={org.id} value={org.id}>
							{org.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function NewBrandPage() {
	const { organizations } = Route.useLoaderData();
	const [step, setStep] = useState<"details" | "platforms">("details");
	const [details, setDetails] = useState({ brandName: "", website: "" });
	const [platformState, setPlatformState] = useState<NonNullable<OnboardingPlatformState> | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	// Start on a workspace that can actually take a brand, so a user who belongs
	// to a full one and an empty one isn't shown a wall they can walk around.
	const [organizationId, setOrganizationId] = useState(
		(organizations.find((org) => !org.blocked) ?? organizations[0])?.id ?? "",
	);
	const navigate = useNavigate();
	const router = useRouter();
	const activeOrg = organizations.find((org) => org.id === organizationId);

	const createBrand = async (brandName: string, website: string, enabledModels: string[] | null) => {
		setIsLoading(true);
		setError("");

		try {
			const { brandId } = await createBrandInOrgFn({
				data: {
					brandName,
					website,
					organizationId: organizationId || undefined,
					...(enabledModels && enabledModels.length > 0 && { enabledModels }),
				},
			});
			trackEvent("brand_created", { has_website: Boolean(website) });

			await router.invalidate();
			await navigate({ to: "/app/$brand", params: { brand: brandId } });
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	const handleDetailsSubmit = async (formData: FormData) => {
		const brandName = (formData.get("brandName") as string)?.trim() ?? "";
		const website = (formData.get("website") as string)?.trim() ?? "";
		setError("");

		// Checked before the platform step rather than after it, so a typo in the
		// URL doesn't cost the user their platform picks.
		const validation = validateWebsiteUrl(website);
		if (!validation.isValid) {
			setError(validation.error);
			return;
		}

		setIsLoading(true);
		try {
			const state = organizationId ? await getOnboardingPlatformStateFn({ data: { organizationId } }) : null;
			if (!state) {
				await createBrand(brandName, website, null);
				return;
			}
			setDetails({ brandName, website });
			setPlatformState(state);
			setSelected(new Set(state.defaultSelected));
			setStep("platforms");
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	if (activeOrg?.blocked) {
		const { code, message } = activeOrg.blocked;
		return (
			<FullPageCard
				title={code === "no-active-plan" ? "This workspace has no plan" : "You've used every brand on your plan"}
				subtitle={message}
				showBackButton
			>
				<div className="space-y-4">
					<WorkspaceSelect organizations={organizations} value={organizationId} onChange={setOrganizationId} />
					{activeOrg.billingBrandId ? (
						<Link
							to="/app/$brand/settings/billing"
							params={{ brand: activeOrg.billingBrandId }}
							className={buttonVariants({ className: "w-full" })}
						>
							Go to billing
						</Link>
					) : (
						<Link to="/choose-plan" search={{ org: activeOrg.id }} className={buttonVariants({ className: "w-full" })}>
							Choose a plan
						</Link>
					)}
				</div>
			</FullPageCard>
		);
	}

	if (step === "platforms" && platformState) {
		return (
			<FullPageCard title={`Create ${details.brandName}`} subtitle="Choose which AI platforms to track">
				<PlatformSelectionStep
					state={platformState}
					selected={selected}
					onSelectedChange={setSelected}
					disabled={isLoading}
					error={error}
					onBack={() => setStep("details")}
					onSubmit={() => createBrand(details.brandName, details.website, [...selected])}
					submitLabel={isLoading ? "Creating..." : "Create brand"}
				/>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="Create a new brand" subtitle="Set up a brand to start tracking" showBackButton>
			<form action={handleDetailsSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="brandName">Brand name</Label>
					<Input
						id="brandName"
						name="brandName"
						type="text"
						placeholder="Acme"
						required
						disabled={isLoading}
						defaultValue={details.brandName}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="website">Website</Label>
					<Input
						id="website"
						name="website"
						type="text"
						placeholder="example.com"
						required
						disabled={isLoading}
						defaultValue={details.website}
					/>
				</div>

				<WorkspaceSelect
					organizations={organizations}
					value={organizationId}
					onChange={setOrganizationId}
					disabled={isLoading}
				/>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "Creating..." : "Continue"}
				</Button>
			</form>
		</FullPageCard>
	);
}
