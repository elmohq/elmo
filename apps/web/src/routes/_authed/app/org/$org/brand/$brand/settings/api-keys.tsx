/**
 * The keys that reach this brand. Only keys issued for this brand alone are
 * managed here; a key spanning several brands is the organization's to revoke,
 * since revoking it from one brand's page would cut off the others.
 */
import { IconPlus } from "@tabler/icons-react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { orgLinkParams } from "@workspace/lib/app-urls";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import { CreateKeyDialog, EmptyKeys, IssuedKeyCard, isActive, KeyTable, RevokeKeyDialog } from "@/components/api-keys";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useOrganization } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";
import { type ApiKeySummary, type ApiKeysPageData, listApiKeysFn } from "@/server/api-keys";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/api-keys")({
	loader: async ({ context }): Promise<ApiKeysPageData & { brandId: string }> => ({
		...(await listApiKeysFn({ data: { organizationId: context.organization.id } })),
		brandId: context.brandId,
	}),
	staticData: { crumb: "API Keys" },
	head: pageHead({ description: "Issue and revoke API keys for this brand." }),
	component: BrandApiKeysPage,
});

function BrandApiKeysPage() {
	const { keys, brands, brandId, expiryOptions, canIssueForBrand, organization } = Route.useLoaderData();
	const readOnly = useDeploymentFeatures()?.readOnly ?? false;
	const canIssue = canIssueForBrand && !readOnly;
	const linkParams = orgLinkParams(useOrganization());
	const router = useRouter();

	const [creatingOpen, setCreatingOpen] = useState(false);
	const [revokeTarget, setRevokeTarget] = useState<ApiKeySummary | null>(null);
	/** Shown once and never again — only the hash is stored. */
	const [issuedKey, setIssuedKey] = useState<string | null>(null);

	async function handleCreated(key: string) {
		setIssuedKey(key);
		setCreatingOpen(false);
		await router.invalidate();
	}

	const brand = brands.find((candidate) => candidate.id === brandId) ?? { id: brandId, name: "This brand" };
	const brandNames = new Map(brands.map((candidate) => [candidate.id, candidate.name]));
	const forThisBrand = keys.filter((key) => key.brandIds?.length === 1 && key.brandIds[0] === brandId);
	const shared = keys.filter(
		(key) => isActive(key) && (key.brandIds === null || (key.brandIds.length > 1 && key.brandIds.includes(brandId))),
	);
	const active = forThisBrand.filter(isActive);
	const inactive = forThisBrand.filter((key) => !isActive(key));
	const openCreate = canIssue ? () => setCreatingOpen(true) : undefined;

	return (
		<div className="max-w-6xl space-y-8">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">API Keys</h1>
				<p className="max-w-2xl text-muted-foreground">
					Keys issued here reach {brand.name} and nothing else. Keys for several or all brands are managed in{" "}
					<Link to="/app/org/$org/settings/api-keys" params={linkParams} className="underline underline-offset-4">
						organization settings
					</Link>
					.
				</p>
			</header>

			{issuedKey && <IssuedKeyCard value={issuedKey} />}

			<DemoModeAlert>API access is disabled in demo mode.</DemoModeAlert>

			<section className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-lg font-semibold">Keys for this brand</h2>
					{openCreate && (
						<Button type="button" size="sm" onClick={openCreate}>
							<IconPlus className="size-4" />
							Add Key
						</Button>
					)}
				</div>

				{active.length === 0 ? (
					<EmptyKeys
						hasInactive={inactive.length > 0}
						description={emptyDescription({ canIssue, readOnly, brandName: brand.name })}
						onCreate={openCreate}
					/>
				) : (
					<KeyTable
						keys={active}
						brandNames={brandNames}
						showBrands={false}
						onRevoke={readOnly ? undefined : setRevokeTarget}
					/>
				)}
			</section>

			{shared.length > 0 && (
				<section className="space-y-3">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold">Organization keys with access</h2>
						<p className="text-sm text-muted-foreground">
							These also reach other brands, so they're revoked from{" "}
							<Link to="/app/org/$org/settings/api-keys" params={linkParams} className="underline underline-offset-4">
								organization settings
							</Link>
							.
						</p>
					</div>
					<KeyTable keys={shared} brandNames={brandNames} />
				</section>
			)}

			{inactive.length > 0 && (
				<section className="space-y-3">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold text-muted-foreground">Inactive</h2>
						<p className="text-sm text-muted-foreground">
							Revoked, expired, or issued by someone who has left — they no longer authenticate anything.
						</p>
					</div>
					<KeyTable keys={inactive} brandNames={brandNames} showBrands={false} inactive />
				</section>
			)}

			<CreateKeyDialog
				open={creatingOpen}
				onOpenChange={setCreatingOpen}
				organizationId={organization.id}
				brands={brands}
				fixedBrand={brand}
				expiryOptions={expiryOptions}
				onCreated={handleCreated}
			/>

			<RevokeKeyDialog organizationId={organization.id} target={revokeTarget} onClose={() => setRevokeTarget(null)} />
		</div>
	);
}

function emptyDescription({
	canIssue,
	readOnly,
	brandName,
}: {
	canIssue: boolean;
	readOnly: boolean;
	brandName: string;
}): string {
	if (readOnly) return "Keys can't be issued in demo mode.";
	if (canIssue) return `Issue one to call the REST API or connect an MCP client to ${brandName}.`;
	return "An organization admin can issue one.";
}
