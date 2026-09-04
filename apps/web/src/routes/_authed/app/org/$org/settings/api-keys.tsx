/**
 * The role check here is UX only — the boundary is in the server functions and
 * the api-key plugin's own membership check. This page just avoids showing a
 * form that would be refused.
 */
import { IconAlertTriangle, IconBan, IconCircleCheck, IconKey, IconPlus } from "@tabler/icons-react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { orgLinkParams } from "@workspace/lib/app-urls";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { useOrganization } from "@/hooks/use-organizations";
import type { ApiScope } from "@/lib/api/scopes";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import {
	type ApiKeySummary,
	type ApiKeysPageData,
	createApiKeyFn,
	listApiKeysFn,
	revokeApiKeyFn,
} from "@/server/api-keys";

export const Route = createFileRoute("/_authed/app/org/$org/settings/api-keys")({
	loader: ({ context }): Promise<ApiKeysPageData> =>
		listApiKeysFn({ data: { organizationId: context.organization.id } }),
	staticData: { crumb: "API Keys" },
	head: pageHead({ description: "Issue and revoke API keys for this organization." }),
	component: ApiKeysSettingsPage,
});

/** Every action the scope list uses, in the order the picker shows them. */
const SCOPE_ACTIONS = ["read", "write", "delete"] as const;

type ScopeMode = "read" | "all" | "custom";

function preset(name: "read" | "all", scopes: readonly ApiScope[]): ApiScope[] {
	return name === "all" ? [...scopes] : scopes.filter((scope) => scope.endsWith(":read"));
}

function formatDate(value: string | null, empty = "—"): string {
	return value
		? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
		: empty;
}

function scopeGroups(scopes: readonly ApiScope[]): Map<string, ApiScope[]> {
	const groups = new Map<string, ApiScope[]>();
	for (const scope of scopes) {
		const resource = scope.split(":")[0];
		groups.set(resource, [...(groups.get(resource) ?? []), scope]);
	}
	return groups;
}

function titleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function toggle<T>(list: T[], value: T): T[] {
	return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Disabled or past its expiry: either way it no longer authenticates anything. */
function isActive(key: ApiKeySummary): boolean {
	if (!key.enabled) return false;
	return !(key.expiresAt && new Date(key.expiresAt).getTime() < Date.now());
}

function ApiKeysSettingsPage() {
	const { keys, brands, allScopes, expiryOptions, canManage, organization } = Route.useLoaderData();
	const linkParams = orgLinkParams(useOrganization());
	const router = useRouter();

	const [creatingOpen, setCreatingOpen] = useState(false);
	const [revokeTarget, setRevokeTarget] = useState<ApiKeySummary | null>(null);
	const [revoking, setRevoking] = useState(false);
	const [revokeError, setRevokeError] = useState<string | null>(null);
	/** Shown once and never again — only the hash is stored. */
	const [issuedKey, setIssuedKey] = useState<string | null>(null);

	async function handleCreated(key: string) {
		setIssuedKey(key);
		setCreatingOpen(false);
		await router.invalidate();
	}

	async function handleRevoke(keyId: string) {
		setRevokeError(null);
		setRevoking(true);
		try {
			await revokeApiKeyFn({ data: { organizationId: organization.id, keyId } });
			setRevokeTarget(null);
			await router.invalidate();
		} catch (err) {
			setRevokeError(err instanceof Error ? err.message : "Failed to revoke the API key");
		} finally {
			setRevoking(false);
		}
	}

	const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
	const active = keys.filter(isActive);
	const inactive = keys.filter((key) => !isActive(key));

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

			{!canManage && (
				<Alert>
					<IconAlertTriangle />
					<AlertTitle>Read-only view</AlertTitle>
					<AlertDescription>Only organization admins can issue or revoke keys.</AlertDescription>
				</Alert>
			)}

			<section className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-lg font-semibold">Active</h2>
					{canManage && (
						<Button type="button" size="sm" onClick={() => setCreatingOpen(true)}>
							<IconPlus className="size-4" />
							New key
						</Button>
					)}
				</div>

				{active.length === 0 ? (
					<EmptyKeys canManage={canManage} hasInactive={inactive.length > 0} onCreate={() => setCreatingOpen(true)} />
				) : (
					<KeyTable
						keys={active}
						allScopes={allScopes}
						brandNames={brandNames}
						onRevoke={
							canManage
								? (key) => {
										setRevokeError(null);
										setRevokeTarget(key);
									}
								: undefined
						}
					/>
				)}
			</section>

			{inactive.length > 0 && (
				<section className="space-y-3">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold text-muted-foreground">Inactive</h2>
						<p className="text-sm text-muted-foreground">Revoked or expired — they no longer authenticate anything.</p>
					</div>
					<KeyTable keys={inactive} allScopes={allScopes} brandNames={brandNames} inactive />
				</section>
			)}

			<Dialog open={creatingOpen} onOpenChange={setCreatingOpen}>
				<DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
					<DialogHeader className="shrink-0">
						<DialogTitle>Create a key</DialogTitle>
					</DialogHeader>
					<CreateKeyForm
						organizationId={organization.id}
						brands={brands}
						allScopes={allScopes}
						expiryOptions={expiryOptions}
						onCreated={handleCreated}
						onCancel={() => setCreatingOpen(false)}
					/>
				</DialogContent>
			</Dialog>

			<Dialog
				open={revokeTarget !== null}
				onOpenChange={(open) => {
					if (!open && !revoking) setRevokeTarget(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke “{revokeTarget?.name ?? "Untitled key"}”?</DialogTitle>
						<DialogDescription>This key will immediately and permanently have its access revoked.</DialogDescription>
					</DialogHeader>
					{revokeError && (
						<Alert variant="destructive">
							<IconAlertTriangle />
							<AlertDescription>{revokeError}</AlertDescription>
						</Alert>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" disabled={revoking} onClick={() => setRevokeTarget(null)}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={revoking}
							onClick={() => revokeTarget && handleRevoke(revokeTarget.id)}
						>
							{revoking ? <Spinner /> : null}
							{revoking ? "Revoking…" : "Revoke key"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function CreateKeyForm({
	organizationId,
	brands,
	allScopes,
	expiryOptions,
	onCreated,
	onCancel,
}: {
	organizationId: string;
	brands: ApiKeysPageData["brands"];
	allScopes: readonly ApiScope[];
	expiryOptions: readonly number[];
	onCreated: (key: string) => void;
	onCancel: () => void;
}) {
	const [name, setName] = useState("");
	const [scopeMode, setScopeMode] = useState<ScopeMode>("read");
	const [customScopes, setCustomScopes] = useState<ApiScope[]>(() => preset("read", allScopes));
	const [restrictBrands, setRestrictBrands] = useState(false);
	const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
	const [expiresInDays, setExpiresInDays] = useState<string>("never");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const scopes = scopeMode === "custom" ? customScopes : preset(scopeMode, allScopes);

	// Switching to Custom starts from whatever the preset was showing, so the
	// tab reads as "keep this, but let me edit it".
	function changeScopeMode(next: ScopeMode) {
		if (next === "custom") setCustomScopes(scopes);
		setScopeMode(next);
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setError(null);
		setCreating(true);
		try {
			const { key } = await createApiKeyFn({
				data: {
					organizationId,
					name,
					scopes,
					// Null, not `[]`: unrestricted is the absence of a restriction. The
					// server rejects `[]` rather than reading it as "all".
					brandIds: restrictBrands ? selectedBrands : null,
					expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
				},
			});
			trackEvent("api_key_created", { scopes: scopes.length, restricted: restrictBrands });
			onCreated(key);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create the API key");
		} finally {
			setCreating(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
			<div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-1">
				{error && (
					<Alert variant="destructive">
						<IconAlertTriangle />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
					<div className="space-y-2">
						<Label htmlFor="key-name">Name</Label>
						<Input
							id="key-name"
							placeholder="Reporting pipeline"
							value={name}
							onChange={(event) => setName(event.target.value)}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="key-expiry">Expires</Label>
						<Select
							items={{
								never: "Never",
								...Object.fromEntries(expiryOptions.map((days) => [String(days), `In ${days} days`])),
							}}
							value={expiresInDays}
							onValueChange={(value) => setExpiresInDays(value ?? "never")}
						>
							<SelectTrigger id="key-expiry" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="never">Never</SelectItem>
								{expiryOptions.map((days) => (
									<SelectItem key={days} value={String(days)}>
										In {days} days
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<Separator />

				<ScopePicker
					allScopes={allScopes}
					mode={scopeMode}
					scopes={scopes}
					onMode={changeScopeMode}
					onToggle={(scope) => setCustomScopes((current) => toggle(current, scope))}
				/>

				<Separator />

				<BrandPicker
					brands={brands}
					restricted={restrictBrands}
					selected={selectedBrands}
					onRestricted={setRestrictBrands}
					onToggle={(brandId) => setSelectedBrands((current) => toggle(current, brandId))}
				/>
			</div>

			<DialogFooter className="shrink-0 items-center border-t pt-4">
				{scopes.length === 0 && <p className="mr-auto text-sm text-muted-foreground">Pick at least one scope.</p>}
				<Button type="button" variant="outline" disabled={creating} onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={creating || scopes.length === 0}>
					{creating ? <Spinner /> : <IconKey className="size-4" />}
					{creating ? "Creating…" : "Create key"}
				</Button>
			</DialogFooter>
		</form>
	);
}

function ScopePicker({
	allScopes,
	mode,
	scopes,
	onMode,
	onToggle,
}: {
	allScopes: readonly ApiScope[];
	mode: ScopeMode;
	scopes: ApiScope[];
	onMode: (mode: ScopeMode) => void;
	onToggle: (scope: ApiScope) => void;
}) {
	return (
		<section className="space-y-3">
			<p className="text-sm font-medium">Scopes</p>
			<Tabs value={mode} onValueChange={(value) => onMode(value as ScopeMode)}>
				<TabsList>
					<TabsTrigger value="read">Read only</TabsTrigger>
					<TabsTrigger value="all">Full access</TabsTrigger>
					<TabsTrigger value="custom">Custom</TabsTrigger>
				</TabsList>
				<TabsContent value="read" className="pt-1 text-sm text-muted-foreground">
					Reads everything the API exposes and changes nothing.
				</TabsContent>
				<TabsContent value="all" className="pt-1 text-sm text-muted-foreground">
					Everything a read-only key can do, plus creating, editing and deleting.
				</TabsContent>
				<TabsContent value="custom" className="pt-1">
					<ScopeMatrix allScopes={allScopes} scopes={scopes} onToggle={onToggle} />
				</TabsContent>
			</Tabs>
		</section>
	);
}

function ScopeMatrix({
	allScopes,
	scopes,
	onToggle,
}: {
	allScopes: readonly ApiScope[];
	scopes: ApiScope[];
	onToggle: (scope: ApiScope) => void;
}) {
	// Only the actions some resource actually grants get a column; today nothing
	// is deletable but competitors.
	const actions = SCOPE_ACTIONS.filter((action) => allScopes.some((scope) => scope.endsWith(`:${action}`)));

	return (
		<div className="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead>Resource</TableHead>
						{actions.map((action) => (
							<TableHead key={action} className="w-24 text-center">
								{titleCase(action)}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{[...scopeGroups(allScopes)].map(([resource, group]) => (
						<TableRow key={resource}>
							<TableCell className="font-medium">{titleCase(resource)}</TableCell>
							{actions.map((action) => {
								const scope = group.find((candidate) => candidate === `${resource}:${action}`);
								return (
									<TableCell key={action}>
										<div className="flex justify-center">
											{scope ? (
												<Checkbox
													aria-label={`${titleCase(resource)} ${action}`}
													checked={scopes.includes(scope)}
													onCheckedChange={() => onToggle(scope)}
												/>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</div>
									</TableCell>
								);
							})}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function BrandPicker({
	brands,
	restricted,
	selected,
	onRestricted,
	onToggle,
}: {
	brands: ApiKeysPageData["brands"];
	restricted: boolean;
	selected: string[];
	onRestricted: (restricted: boolean) => void;
	onToggle: (brandId: string) => void;
}) {
	return (
		<section className="space-y-3">
			<p className="text-sm font-medium">Brand access</p>
			<Tabs value={restricted ? "custom" : "all"} onValueChange={(value) => onRestricted(value === "custom")}>
				<TabsList>
					<TabsTrigger value="all">All brands</TabsTrigger>
					<TabsTrigger value="custom">Specific brands</TabsTrigger>
				</TabsList>
				<TabsContent value="all" className="pt-1 text-sm text-muted-foreground">
					Reaches every brand in this organization, including ones added later.
				</TabsContent>
				<TabsContent value="custom" className="pt-1">
					{brands.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							This organization has no brands yet, so there is nothing to narrow the key to.
						</p>
					) : (
						<div className="grid gap-2 sm:grid-cols-2">
							{brands.map((brand) => (
								<label
									key={brand.id}
									htmlFor={`brand-${brand.id}`}
									className="flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50"
								>
									<Checkbox
										id={`brand-${brand.id}`}
										checked={selected.includes(brand.id)}
										onCheckedChange={() => onToggle(brand.id)}
									/>
									<span className="min-w-0 flex-1 truncate text-sm font-medium">{brand.name}</span>
								</label>
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>
		</section>
	);
}

function IssuedKeyCard({ value }: { value: string }) {
	return (
		<Card className="gap-4 border-emerald-500/40 bg-emerald-50/60">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-emerald-700">
					<IconCircleCheck className="size-5" />
					Key created
				</CardTitle>
				<CardDescription>Copy it now — only a hash is stored, so it is never shown again.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-wrap items-center gap-2">
				<code className="min-w-0 flex-1 break-all rounded-md border bg-background px-3 py-2 font-mono text-sm">
					{value}
				</code>
				<CopyButton value={value} />
			</CardContent>
		</Card>
	);
}

function ScopeCell({ scopes, allScopes }: { scopes: ApiScope[]; allScopes: readonly ApiScope[] }) {
	if (scopes.length === 0) return <span className="text-muted-foreground">None</span>;
	if (scopes.length === allScopes.length) return <Badge variant="secondary">Full access</Badge>;
	if (scopes.length === preset("read", allScopes).length && scopes.every((scope) => scope.endsWith(":read"))) {
		return <Badge variant="secondary">Read only</Badge>;
	}

	return (
		<div className="flex flex-wrap gap-1">
			{[...scopeGroups(scopes)].map(([resource, group]) => (
				<Badge key={resource} variant="secondary" className="font-mono font-normal">
					{resource}:{group.map((scope) => scope.split(":")[1]).join(",")}
				</Badge>
			))}
		</div>
	);
}

function KeyTable({
	keys,
	allScopes,
	brandNames,
	inactive = false,
	onRevoke,
}: {
	keys: ApiKeySummary[];
	allScopes: readonly ApiScope[];
	brandNames: Map<string, string>;
	inactive?: boolean;
	onRevoke?: (key: ApiKeySummary) => void;
}) {
	return (
		<Card className={cn("gap-0 overflow-hidden py-0", inactive && "bg-muted/40 text-muted-foreground")}>
			{/* Fixed widths so the two tables line up as one grid when stacked. */}
			<Table className="min-w-[58rem] table-fixed [&_td]:px-4 [&_th]:px-4">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-[21%]">Name</TableHead>
						<TableHead className="w-[9%]">Key</TableHead>
						<TableHead className="w-[22%]">Scopes</TableHead>
						<TableHead className="w-[11%]">Brands</TableHead>
						<TableHead className="w-[9.5%]">Created</TableHead>
						<TableHead className="w-[9.5%]">Last used</TableHead>
						<TableHead className="w-[10%]">Expires</TableHead>
						<TableHead className="w-[8%] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{keys.map((key) => (
						<TableRow key={key.id}>
							<TableCell className={cn("font-medium", !inactive && "text-foreground")}>
								<div className="flex items-center gap-2">
									<span className="truncate">{key.name ?? "Untitled key"}</span>
									{inactive && (
										<Badge variant="outline" className="font-normal">
											{key.enabled ? "Expired" : "Revoked"}
										</Badge>
									)}
								</div>
							</TableCell>
							<TableCell>
								{key.start ? (
									<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
										{key.start}…
									</code>
								) : (
									"—"
								)}
							</TableCell>
							<TableCell>
								<ScopeCell scopes={key.scopes} allScopes={allScopes} />
							</TableCell>
							<TableCell className="truncate">
								{key.brandIds ? key.brandIds.map((id) => brandNames.get(id) ?? id).join(", ") : "All brands"}
							</TableCell>
							<TableCell className="whitespace-nowrap">{formatDate(key.createdAt)}</TableCell>
							<TableCell className="whitespace-nowrap">{formatDate(key.lastUsedAt, "Never")}</TableCell>
							<TableCell className="whitespace-nowrap">{formatDate(key.expiresAt, "Never")}</TableCell>
							<TableCell className="text-right">{onRevoke && <RevokeButton onClick={() => onRevoke(key)} />}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
}

/** Icon-only: one row per key, and the action is rare enough that a column of
 * outlined buttons was louder than the keys themselves. */
function RevokeButton({ onClick }: { onClick: () => void }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
						onClick={onClick}
					>
						<IconBan className="size-4" />
						<span className="sr-only">Revoke</span>
					</Button>
				}
			/>
			<TooltipContent>Revoke key</TooltipContent>
		</Tooltip>
	);
}

function EmptyKeys({
	canManage,
	hasInactive,
	onCreate,
}: {
	canManage: boolean;
	hasInactive: boolean;
	onCreate: () => void;
}) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-12 text-center">
			<span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<IconKey className="size-5" />
			</span>
			<div className="space-y-1">
				<p className="font-medium">{hasInactive ? "No active API keys" : "No API keys yet"}</p>
				<p className="max-w-sm text-sm text-muted-foreground">
					{canManage
						? "Issue one to call the REST API or connect an MCP client."
						: "An organization admin can issue one."}
				</p>
			</div>
			{canManage && (
				<Button type="button" onClick={onCreate}>
					<IconPlus className="size-4" />
					{hasInactive ? "Create a key" : "Create your first key"}
				</Button>
			)}
		</div>
	);
}
