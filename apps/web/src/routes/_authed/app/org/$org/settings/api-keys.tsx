/**
 * The one place keys are issued and revoked, for admins and members alike. The
 * role checks here are UX only — the boundary is in the server functions and
 * the api-key plugin's own membership check. This page just avoids offering
 * what would be refused.
 */
import { IconAlertTriangle, IconCircleCheck, IconKey, IconPlus, IconX } from "@tabler/icons-react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { orgLinkParams } from "@workspace/lib/app-urls";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardTitle } from "@workspace/ui/components/card";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
	useComboboxAnchor,
} from "@workspace/ui/components/combobox";
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
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
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

type Brand = ApiKeysPageData["brands"][number];

/** `brand` is what a brand's own settings link here with: a new key starts out
 * narrowed to it. */
type ApiKeysSearch = { brand?: string };

export const Route = createFileRoute("/_authed/app/org/$org/settings/api-keys")({
	validateSearch: (search: Record<string, unknown>): ApiKeysSearch => ({
		brand: typeof search.brand === "string" && search.brand ? search.brand : undefined,
	}),
	loader: ({ context }): Promise<ApiKeysPageData> =>
		listApiKeysFn({ data: { organizationId: context.organization.id } }),
	staticData: { crumb: "API Keys" },
	head: pageHead({ description: "Issue and revoke API keys for this organization." }),
	component: ApiKeysSettingsPage,
});

const ACCESS_LABELS: Record<ApiKeyAccess, string> = {
	read: "Read",
	write: "Read/Write",
};

function formatDate(value: string | null, empty = "—"): string {
	return value
		? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
		: empty;
}

/** Revoked, past its expiry, or orphaned by its issuer leaving: any of them and
 * it no longer authenticates anything. */
function isActive(key: ApiKeySummary): boolean {
	if (!key.enabled || !key.issuerIsMember) return false;
	return !(key.expiresAt && new Date(key.expiresAt).getTime() < Date.now());
}

/** Why it stopped authenticating: the act somebody took if there was one, the
 * expiry that overtook it otherwise. */
function inactiveReason(key: ApiKeySummary): string {
	if (!key.enabled) return "Revoked";
	if (!key.issuerIsMember) return "Issuer left";
	return `Expired ${formatDate(key.expiresAt)}`;
}

function ApiKeysSettingsPage() {
	const { keys, brands, expiryOptions, canManage: isKeyAdmin, organization } = Route.useLoaderData();
	const search = Route.useSearch();
	const readOnly = useDeploymentFeatures()?.readOnly ?? false;
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

	const linkedBrand = brands.some((brand) => brand.id === search.brand) ? search.brand : undefined;
	const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
	const active = keys.filter(isActive);
	const inactive = keys.filter((key) => !isActive(key));
	// Every member may issue a key for one brand, so there is something to issue
	// as long as the organization has a brand or the viewer is an admin.
	const openCreate = !readOnly && (isKeyAdmin || brands.length > 0) ? () => setCreatingOpen(true) : undefined;

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
						You can issue keys for a single brand and revoke the keys you issued. Keys for several or all brands, and
						revoking someone else's, are for organization admins.
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
						description={emptyDescription({ canCreate: Boolean(openCreate), readOnly })}
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

			<Dialog open={creatingOpen} onOpenChange={setCreatingOpen}>
				<DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
					<DialogHeader className="shrink-0">
						<DialogTitle>Create a key</DialogTitle>
					</DialogHeader>
					<CreateKeyForm
						organizationId={organization.id}
						brands={brands}
						canManage={isKeyAdmin}
						initialBrandId={linkedBrand}
						expiryOptions={expiryOptions}
						onCreated={handleCreated}
						onCancel={() => setCreatingOpen(false)}
					/>
				</DialogContent>
			</Dialog>

			<RevokeKeyDialog organizationId={organization.id} target={revokeTarget} onClose={() => setRevokeTarget(null)} />
		</div>
	);
}

function emptyDescription({ canCreate, readOnly }: { canCreate: boolean; readOnly: boolean }): string {
	if (readOnly) return "Keys can't be issued in demo mode.";
	if (canCreate) return "Issue one to call the REST API or connect an MCP client.";
	return "Add a brand first, then issue a key for it.";
}

function CreateKeyForm({
	organizationId,
	brands,
	canManage,
	initialBrandId,
	expiryOptions,
	onCreated,
	onCancel,
}: {
	organizationId: string;
	brands: Brand[];
	/** Admins choose any reach; everyone else issues for one brand. */
	canManage: boolean;
	/** The brand the viewer arrived from, which is the likeliest one wanted. */
	initialBrandId: string | undefined;
	expiryOptions: readonly number[];
	onCreated: (key: string) => void;
	onCancel: () => void;
}) {
	const [name, setName] = useState("");
	const [access, setAccess] = useState<ApiKeyAccess>("read");
	const [restrictBrands, setRestrictBrands] = useState(initialBrandId !== undefined);
	const [selectedBrands, setSelectedBrands] = useState<string[]>(initialBrandId ? [initialBrandId] : []);
	const [singleBrand, setSingleBrand] = useState<string | undefined>(initialBrandId ?? brands[0]?.id);
	const [expiresInDays, setExpiresInDays] = useState<string>("never");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function brandIds(): string[] | null {
		if (!canManage) return singleBrand ? [singleBrand] : [];
		// Null, not `[]`: unrestricted is the absence of a restriction. The server
		// rejects `[]` rather than reading it as "all".
		return restrictBrands ? selectedBrands : null;
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setError(null);
		setCreating(true);
		try {
			const reach = brandIds();
			const { key } = await createApiKeyFn({
				data: {
					organizationId,
					name,
					access,
					brandIds: reach,
					expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
				},
			});
			trackEvent("api_key_created", { access, restricted: reach !== null });
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

				{canManage ? (
					<BrandPicker
						brands={brands}
						restricted={restrictBrands}
						selected={selectedBrands}
						onRestricted={setRestrictBrands}
						onSelected={setSelectedBrands}
					/>
				) : (
					<SingleBrandPicker brands={brands} value={singleBrand} onChange={setSingleBrand} />
				)}
			</div>

			<DialogFooter className="shrink-0 items-center border-t pt-4">
				<Button type="button" variant="outline" disabled={creating} onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={creating}>
					{creating && <Spinner />}
					{creating ? "Creating…" : "Create"}
				</Button>
			</DialogFooter>
		</form>
	);
}

function SingleBrandPicker({
	brands,
	value,
	onChange,
}: {
	brands: Brand[];
	value: string | undefined;
	onChange: (brandId: string | undefined) => void;
}) {
	return (
		<section className="space-y-2">
			<Label htmlFor="key-brand">Brand</Label>
			<Select
				items={Object.fromEntries(brands.map((brand) => [brand.id, brand.name]))}
				value={value ?? null}
				onValueChange={(next) => onChange(next ?? undefined)}
			>
				<SelectTrigger id="key-brand" className="w-full">
					<SelectValue placeholder="Choose a brand" />
				</SelectTrigger>
				<SelectContent>
					{brands.map((brand) => (
						<SelectItem key={brand.id} value={brand.id}>
							{brand.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<p className="text-sm text-muted-foreground">
				The key reaches this brand only. An organization admin can issue keys for several brands.
			</p>
		</section>
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
			</Tabs>
		</section>
	);
}

function BrandPicker({
	brands,
	restricted,
	selected,
	onRestricted,
	onSelected,
}: {
	brands: Brand[];
	restricted: boolean;
	selected: string[];
	onRestricted: (restricted: boolean) => void;
	onSelected: (brandIds: string[]) => void;
}) {
	// Ids are what the key is issued against; the combobox filters and labels
	// them by name.
	const brandIds = brands.map((brand) => brand.id);
	const names = new Map(brands.map((brand) => [brand.id, brand.name]));
	const nameOf = (id: string) => names.get(id) ?? id;

	return (
		<section className="space-y-3">
			<p className="text-sm font-medium">Brand access</p>
			<Tabs value={restricted ? "custom" : "all"} onValueChange={(value) => onRestricted(value === "custom")}>
				<TabsList>
					<TabsTrigger value="all">All brands</TabsTrigger>
					<TabsTrigger value="custom">Specific brands</TabsTrigger>
				</TabsList>
				<TabsContent value="all" className="pt-1 text-sm text-muted-foreground">
					Every brand in this organization, including brands added later.
				</TabsContent>
				<TabsContent value="custom" className="pt-1">
					{brands.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							This organization has no brands yet, so there is nothing to narrow the key to.
						</p>
					) : (
						<BrandCombobox brandIds={brandIds} nameOf={nameOf} selected={selected} onSelected={onSelected} />
					)}
				</TabsContent>
			</Tabs>
		</section>
	);
}

function BrandCombobox({
	brandIds,
	nameOf,
	selected,
	onSelected,
}: {
	brandIds: string[];
	nameOf: (id: string) => string;
	selected: string[];
	onSelected: (brandIds: string[]) => void;
}) {
	const anchor = useComboboxAnchor();

	return (
		<Combobox
			multiple
			autoHighlight
			items={brandIds}
			value={selected}
			onValueChange={onSelected}
			itemToStringLabel={nameOf}
		>
			<ComboboxChips ref={anchor}>
				<ComboboxValue>
					{(ids: string[]) => (
						<>
							{ids.map((id) => (
								<ComboboxChip key={id}>{nameOf(id)}</ComboboxChip>
							))}
							<ComboboxChipsInput placeholder={ids.length === 0 ? "Search brands…" : undefined} />
						</>
					)}
				</ComboboxValue>
			</ComboboxChips>
			<ComboboxContent anchor={anchor}>
				<ComboboxEmpty>No brands found.</ComboboxEmpty>
				<ComboboxList>
					{(id: string) => (
						<ComboboxItem key={id} value={id}>
							{nameOf(id)}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}

function RevokeKeyDialog({
	organizationId,
	target,
	onClose,
}: {
	organizationId: string;
	target: ApiKeySummary | null;
	onClose: () => void;
}) {
	const router = useRouter();
	const [revoking, setRevoking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleRevoke(keyId: string) {
		setError(null);
		setRevoking(true);
		try {
			await revokeApiKeyFn({ data: { organizationId, keyId } });
			onClose();
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke the API key");
		} finally {
			setRevoking(false);
		}
	}

	return (
		<Dialog
			open={target !== null}
			onOpenChange={(open) => {
				if (open || revoking) return;
				setError(null);
				onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Revoke “{target?.name ?? "Untitled key"}”?</DialogTitle>
					<DialogDescription>This key will immediately and permanently have its access revoked.</DialogDescription>
				</DialogHeader>
				{error && (
					<Alert variant="destructive">
						<IconAlertTriangle />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<DialogFooter>
					<Button type="button" variant="outline" disabled={revoking} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={revoking}
						onClick={() => target && handleRevoke(target.id)}
					>
						{revoking ? <Spinner /> : null}
						{revoking ? "Revoking…" : "Revoke"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function IssuedKeyCard({ value }: { value: string }) {
	return (
		<Card className="flex-row flex-wrap items-center justify-between gap-3 border-emerald-500/40 bg-emerald-50/60 px-4 py-3">
			<CardTitle className="flex items-center gap-2 text-emerald-700">
				<IconCircleCheck className="size-5" />
				Key Created
			</CardTitle>
			<div className="flex min-w-0 items-center gap-2">
				<code className="truncate rounded-md border bg-background px-3 py-1.5 font-mono text-sm">{value}</code>
				<CopyButton value={value} />
			</div>
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
	/** Offered only on the keys the viewer may revoke. */
	onRevoke?: (key: ApiKeySummary) => void;
}) {
	return (
		<Card className={cn("gap-0 overflow-hidden py-0", inactive && "bg-muted/40 text-muted-foreground")}>
			{/* Fixed widths so the two tables line up as one grid when stacked. */}
			<Table className="min-w-[64rem] table-fixed [&_td]:px-4 [&_th]:px-4">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-[18%]">Name</TableHead>
						<TableHead className="w-[9%]">Key</TableHead>
						<TableHead className="w-[12%]">Access</TableHead>
						<TableHead className="w-[12%]">Brands</TableHead>
						<TableHead className="w-[12%]">Created by</TableHead>
						<TableHead className="w-[10%]">Created</TableHead>
						<TableHead className="w-[10%]">Last used</TableHead>
						<TableHead className="w-[12%]">{inactive ? "Reason" : "Expires"}</TableHead>
						<TableHead className="w-[5%] text-right">
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
								<KeyCell start={key.start} />
							</TableCell>
							<TableCell>
								<AccessCell scopes={key.scopes} />
							</TableCell>
							<TableCell>
								<TruncatedCell label={brandsLabel(key.brandIds, brandNames)} />
							</TableCell>
							<TableCell>
								{key.createdBy ? (
									<TruncatedCell label={key.createdBy.name} />
								) : (
									<span className="text-muted-foreground">—</span>
								)}
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
							<TableCell className="text-right">
								{onRevoke && key.canRevoke && <RevokeButton onClick={() => onRevoke(key)} />}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
}

function brandsLabel(brandIds: string[] | null, brandNames: Map<string, string>): string {
	if (brandIds === null) return "All brands";
	if (brandIds.length === 0) return "No brands";
	return brandIds.map((id) => brandNames.get(id) ?? id).join(", ");
}

/** Only the opening characters of a key are kept, so the cell says where the
 * rest went rather than leaving a bare stub. */
function KeyCell({ start }: { start: string | null }) {
	if (!start) return <span className="text-muted-foreground">—</span>;

	return (
		<Tooltip>
			<TooltipTrigger
				render={<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground" />}
			>
				{start}…
			</TooltipTrigger>
			<TooltipContent className="max-w-xs">
				You can't view a key after it's created. Create a new key if you need one.
			</TooltipContent>
		</Tooltip>
	);
}

/** A key narrowed to several brands names more of them than the column can
 * hold, so whatever it clips is a hover away rather than lost. */
function TruncatedCell({ label }: { label: string }) {
	const { ref, truncated } = useIsTruncated<HTMLSpanElement>();

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
						<IconX className="size-4" />
						<span className="sr-only">Revoke</span>
					</Button>
				}
			/>
			<TooltipContent>Revoke Key</TooltipContent>
		</Tooltip>
	);
}

function EmptyKeys({
	hasInactive,
	description,
	onCreate,
}: {
	hasInactive: boolean;
	description: string;
	/** Absent when the viewer can't issue a key here. */
	onCreate?: () => void;
}) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-12 text-center">
			<span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<IconKey className="size-5" />
			</span>
			<div className="space-y-1">
				<p className="font-medium">{hasInactive ? "No active API keys" : "No API keys yet"}</p>
				<p className="max-w-sm text-sm text-muted-foreground">{description}</p>
			</div>
			{onCreate && (
				<Button type="button" onClick={onCreate}>
					<IconPlus className="size-4" />
					{hasInactive ? "Create a key" : "Create your first key"}
				</Button>
			)}
		</div>
	);
}
