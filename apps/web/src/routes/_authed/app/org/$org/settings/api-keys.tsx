/**
 * The role check here is UX only — the boundary is in the server functions and
 * the api-key plugin's own membership check. This page just avoids showing a
 * form that would be refused.
 */
import { IconAlertTriangle, IconPlus } from "@tabler/icons-react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { orgLinkParams } from "@workspace/lib/app-urls";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import { CreateKeyDialog, EmptyKeys, IssuedKeyCard, isActive, KeyTable, RevokeKeyDialog } from "@/components/api-keys";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useOrganization } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";
import { type ApiKeySummary, type ApiKeysPageData, listApiKeysFn } from "@/server/api-keys";

export const Route = createFileRoute("/_authed/app/org/$org/settings/api-keys")({
	loader: ({ context }): Promise<ApiKeysPageData> =>
		listApiKeysFn({ data: { organizationId: context.organization.id } }),
	staticData: { crumb: "API Keys" },
	head: pageHead({ description: "Issue and revoke API keys for this organization." }),
	component: ApiKeysSettingsPage,
});

function ApiKeysSettingsPage() {
	const { keys, brands, expiryOptions, canManage: isKeyAdmin, organization } = Route.useLoaderData();
	const readOnly = useDeploymentFeatures()?.readOnly ?? false;
	const canManage = isKeyAdmin && !readOnly;
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

	const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
	const active = keys.filter(isActive);
	const inactive = keys.filter((key) => !isActive(key));
	const openCreate = canManage ? () => setCreatingOpen(true) : undefined;

	return (
		<div className="max-w-6xl space-y-8">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">API Keys</h1>
				<p className="max-w-2xl text-muted-foreground">
					Keys authenticate the{" "}
					<Link to="/app/org/$org/settings/api" params={linkParams} className="underline underline-offset-4">
						REST API
					</Link>{" "}
					and{" "}
					<Link to="/app/org/$org/settings/mcp" params={linkParams} className="underline underline-offset-4">
						MCP
					</Link>{" "}
					connections for this organization.
				</p>
			</header>

			{issuedKey && <IssuedKeyCard value={issuedKey} />}

			<DemoModeAlert>API access is disabled in demo mode.</DemoModeAlert>

			{!isKeyAdmin && !readOnly && (
				<Alert className="border-yellow-200 bg-yellow-50 text-yellow-800">
					<IconAlertTriangle />
					<AlertTitle>Limited Access</AlertTitle>
					<AlertDescription className="text-yellow-700">
						Only organization admins can issue or revoke keys.
					</AlertDescription>
				</Alert>
			)}

			<section className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-lg font-semibold">Active</h2>
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
						description={emptyDescription({ canManage, readOnly })}
						onCreate={openCreate}
					/>
				) : (
					<KeyTable keys={active} brandNames={brandNames} onRevoke={readOnly ? undefined : setRevokeTarget} />
				)}
			</section>

			{inactive.length > 0 && (
				<section className="space-y-3">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold text-muted-foreground">Inactive</h2>
						<p className="text-sm text-muted-foreground">
							Revoked, expired, or issued by someone who has left — they no longer authenticate anything.
						</p>
					</div>
					<KeyTable keys={inactive} brandNames={brandNames} inactive />
				</section>
			)}

			<CreateKeyDialog
				open={creatingOpen}
				onOpenChange={setCreatingOpen}
				organizationId={organization.id}
				brands={brands}
				expiryOptions={expiryOptions}
				onCreated={handleCreated}
			/>

			<RevokeKeyDialog organizationId={organization.id} target={revokeTarget} onClose={() => setRevokeTarget(null)} />
		</div>
	);
}

function emptyDescription({ canManage, readOnly }: { canManage: boolean; readOnly: boolean }): string {
	if (readOnly) return "Keys can't be issued in demo mode.";
	if (canManage) return "Issue one to call the REST API or connect an MCP client.";
	return "An organization admin can issue one.";
}
