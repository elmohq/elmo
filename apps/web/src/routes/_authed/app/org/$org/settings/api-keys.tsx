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
import { useIsTruncated } from "@/hooks/use-is-truncated";
import { useOrganization } from "@/hooks/use-organizations";
import { API_SCOPES } from "@/lib/api/scopes";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import {
	type ApiKeyAccess,
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

const ACCESS_LABELS: Record<ApiKeyAccess, string> = {
	read: "Read-only",
	write: "Read and write",
};

function formatDate(value: string | null, empty = "—"): string {
	return value
		? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
		: empty;
}

function toggle<T>(list: T[], value: T): T[] {
	return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Disabled or past its expiry: either way it no longer authenticates anything. */
function isActive(key: ApiKeySummary): boolean {
	if (!key.enabled) return false;
	return !(key.expiresAt && new Date(key.expiresAt).getTime() < Date.now());
}

/** Why it stopped authenticating: the act somebody took if there was one, the
 * expiry that overtook it otherwise. */
function inactiveReason(key: ApiKeySummary): string {
	return key.enabled ? `Expired ${formatDate(key.expiresAt)}` : "Revoked";
}

function ApiKeysSettingsPage() {
	const { keys, brands, expiryOptions, canManage, organization } = Route.useLoaderData();
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
					<KeyTable keys={inactive} brandNames={brandNames} inactive />
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
	expiryOptions,
	onCreated,
	onCancel,
}: {
	organizationId: string;
	brands: ApiKeysPageData["brands"];
	expiryOptions: readonly number[];
	onCreated: (key: string) => void;
	onCancel: () => void;
}) {
	const [name, setName] = useState("");
	const [access, setAccess] = useState<ApiKeyAccess>("read");
	const [restrictBrands, setRestrictBrands] = useState(false);
	const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
	const [expiresInDays, setExpiresInDays] = useState<string>("never");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setError(null);
		setCreating(true);
		try {
			const { key } = await createApiKeyFn({
				data: {
					organizationId,
					name,
					access,
					// Null, not `[]`: unrestricted is the absence of a restriction. The
					// server rejects `[]` rather than reading it as "all".
					brandIds: restrictBrands ? selectedBrands : null,
					expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
				},
			});
			trackEvent("api_key_created", { access, restricted: restrictBrands });
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

				<AccessPicker access={access} onAccess={setAccess} />

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
				<Button type="button" variant="outline" disabled={creating} onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={creating}>
					{creating ? <Spinner /> : <IconKey className="size-4" />}
					{creating ? "Creating…" : "Create key"}
				</Button>
			</DialogFooter>
		</form>
	);
}

function AccessPicker({ access, onAccess }: { access: ApiKeyAccess; onAccess: (access: ApiKeyAccess) => void }) {
	return (
		<section className="space-y-3">
			<p className="text-sm font-medium">Access</p>
			<Tabs value={access} onValueChange={(value) => onAccess((value ?? "read") as ApiKeyAccess)}>
				<TabsList>
					<TabsTrigger value="read">{ACCESS_LABELS.read}</TabsTrigger>
					<TabsTrigger value="write">{ACCESS_LABELS.write}</TabsTrigger>
				</TabsList>
				<TabsContent value="read" className="pt-1 text-sm text-muted-foreground">
					Reads everything the API exposes and changes nothing.
				</TabsContent>
				<TabsContent value="write" className="pt-1 text-sm text-muted-foreground">
					Everything a read-only key can do, plus creating, editing and deleting.
				</TabsContent>
			</Tabs>
			<p className="text-sm text-muted-foreground">
				Access gates both the REST API and MCP connections. Either way a key reaches only this organization, and the
				operations that spend provider budget or destroy tracked history need an instance admin key no key issued here
				can be given.
			</p>
		</section>
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

/** One pill per grant, always in scope order rather than the order the key
 * happens to hold them in. */
function AccessCell({ scopes }: { scopes: readonly string[] }) {
	const held = API_SCOPES.filter((scope) => scopes.includes(scope));
	if (held.length === 0) return <span className="text-muted-foreground">No access</span>;

	return (
		<div className="flex flex-wrap gap-1">
			{held.map((scope) => (
				<Badge key={scope} variant="secondary" className="capitalize">
					{scope}
				</Badge>
			))}
		</div>
	);
}

function KeyTable({
	keys,
	brandNames,
	inactive = false,
	onRevoke,
}: {
	keys: ApiKeySummary[];
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
						<TableHead className="w-[22%]">Name</TableHead>
						<TableHead className="w-[10%]">Key</TableHead>
						<TableHead className="w-[14%]">Access</TableHead>
						<TableHead className="w-[12%]">Brands</TableHead>
						<TableHead className="w-[10%]">Created</TableHead>
						<TableHead className="w-[10%]">Last used</TableHead>
						<TableHead className="w-[15%]">{inactive ? "Reason" : "Expires"}</TableHead>
						<TableHead className="w-[7%] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{keys.map((key) => (
						<TableRow key={key.id}>
							<TableCell className={cn("truncate font-medium", !inactive && "text-foreground")}>
								{key.name ?? "Untitled key"}
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
								<AccessCell scopes={key.scopes} />
							</TableCell>
							<TableCell>
								<BrandsCell names={key.brandIds?.map((id) => brandNames.get(id) ?? id) ?? null} />
							</TableCell>
							<TableCell className="whitespace-nowrap">{formatDate(key.createdAt)}</TableCell>
							<TableCell className="whitespace-nowrap">{formatDate(key.lastUsedAt, "Never")}</TableCell>
							<TableCell>
								{inactive ? (
									inactiveReason(key)
								) : (
									<span className="whitespace-nowrap">{formatDate(key.expiresAt, "Never")}</span>
								)}
							</TableCell>
							<TableCell className="text-right">{onRevoke && <RevokeButton onClick={() => onRevoke(key)} />}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
}

/** A key narrowed to several brands names more of them than the column can
 * hold, so the ones it clips are a hover away rather than lost. */
function BrandsCell({ names }: { names: string[] | null }) {
	const { ref, truncated } = useIsTruncated<HTMLSpanElement>();
	const label = names ? names.join(", ") : "All brands";

	return (
		<Tooltip disabled={!truncated}>
			<TooltipTrigger render={<span ref={ref} className="block truncate" />}>{label}</TooltipTrigger>
			<TooltipContent className="max-w-xs">{label}</TooltipContent>
		</Tooltip>
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
