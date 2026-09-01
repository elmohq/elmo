/**
 * The role check here is UX only — the boundary is in the server functions and
 * the api-key plugin's own membership check. This page just avoids showing a
 * form that would be refused.
 */
import { IconAlertTriangle, IconBook, IconCheck, IconCircleCheck, IconCopy, IconKey } from "@tabler/icons-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { API_DOCS_URL, MCP_DOCS_URL } from "@workspace/config/constants";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
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
import { type ReactNode, useEffect, useState } from "react";
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

function preset(name: "read" | "all", scopes: readonly ApiScope[]): ApiScope[] {
	return name === "all" ? [...scopes] : scopes.filter((scope) => scope.endsWith(":read"));
}

function formatDate(value: string | null): string {
	return value
		? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
		: "—";
}

function scopeGroups(scopes: readonly ApiScope[]): Map<string, ApiScope[]> {
	const groups = new Map<string, ApiScope[]>();
	for (const scope of scopes) {
		const resource = scope.split(":")[0];
		groups.set(resource, [...(groups.get(resource) ?? []), scope]);
	}
	return groups;
}

/** Scopes are lowercase on the wire; the labels built from them aren't. */
function titleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function ApiKeysSettingsPage() {
	const { keys, brands, allScopes, expiryOptions, canManage, organization } = Route.useLoaderData();
	const organizationId = organization.id;
	const router = useRouter();

	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<ApiScope[]>(() => preset("read", allScopes));
	const [restrictBrands, setRestrictBrands] = useState(false);
	const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
	const [expiresInDays, setExpiresInDays] = useState<string>("never");
	const [creating, setCreating] = useState(false);
	const [revokeTarget, setRevokeTarget] = useState<ApiKeySummary | null>(null);
	const [revoking, setRevoking] = useState(false);
	/** Kept apart from `error`: the dialog's backdrop covers the page-level alert. */
	const [revokeError, setRevokeError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	/** Shown once and never again — only the hash is stored. */
	const [issuedKey, setIssuedKey] = useState<string | null>(null);

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
	}

	async function handleCreate(event: React.FormEvent) {
		event.preventDefault();
		setError(null);
		setIssuedKey(null);
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
			setIssuedKey(key);
			setName("");
			setScopes(preset("read", allScopes));
			setRestrictBrands(false);
			setSelectedBrands([]);
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create the API key");
		} finally {
			setCreating(false);
		}
	}

	async function handleRevoke(keyId: string) {
		setRevokeError(null);
		setRevoking(true);
		try {
			await revokeApiKeyFn({ data: { organizationId, keyId } });
			setRevokeTarget(null);
			await router.invalidate();
		} catch (err) {
			setRevokeError(err instanceof Error ? err.message : "Failed to revoke the API key");
		} finally {
			setRevoking(false);
		}
	}

	const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));

	return (
		<div className="max-w-5xl space-y-8">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-3xl font-bold">API Keys</h1>
					<p className="max-w-2xl text-muted-foreground">
						Keys act as {organization.name}, not as you, so they keep working after you change teams. Any organization
						admin can revoke one.
					</p>
				</div>
				<a
					href={API_DOCS_URL}
					target="_blank"
					rel="noreferrer"
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					<IconBook className="size-4" />
					API docs
				</a>
			</header>

			{error && (
				<Alert variant="destructive">
					<IconAlertTriangle />
					<AlertTitle>Something went wrong</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{issuedKey && <IssuedKeyCard value={issuedKey} />}

			{canManage ? (
				<form onSubmit={handleCreate}>
					<Card>
						<CardHeader className="border-b">
							<CardTitle>Create a key</CardTitle>
							<CardDescription>
								Name it for wherever it will run, and grant it only what that place needs.
							</CardDescription>
						</CardHeader>

						<CardContent className="space-y-6">
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
								scopes={scopes}
								onToggle={(scope) => setScopes((current) => toggle(current, scope))}
								onPreset={(which) => setScopes(preset(which, allScopes))}
							/>

							<Separator />

							<section className="space-y-3">
								<SectionHeading
									title="Brand access"
									description={`Unrestricted keys reach every brand in ${organization.name}, including ones added later.`}
								/>
								<label
									htmlFor="restrict-brands"
									className="flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50"
								>
									<Checkbox
										id="restrict-brands"
										checked={restrictBrands}
										onCheckedChange={(next) => setRestrictBrands(next === true)}
									/>
									<span className="text-sm font-medium">Restrict this key to specific brands</span>
								</label>
								{restrictBrands &&
									(brands.length === 0 ? (
										<p className="text-sm text-muted-foreground">
											This organization has no brands yet, so there is nothing to narrow the key to.
										</p>
									) : (
										<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
											{brands.map((brand) => (
												<label
													key={brand.id}
													htmlFor={`brand-${brand.id}`}
													className="flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50"
												>
													<Checkbox
														id={`brand-${brand.id}`}
														checked={selectedBrands.includes(brand.id)}
														onCheckedChange={() => setSelectedBrands((current) => toggle(current, brand.id))}
													/>
													<span className="min-w-0 flex-1 truncate text-sm font-medium">{brand.name}</span>
												</label>
											))}
										</div>
									))}
							</section>
						</CardContent>

						<CardFooter className="flex-wrap justify-between gap-3 border-t">
							<p className="text-sm text-muted-foreground">
								{scopes.length === 0
									? "Pick at least one scope — a key that grants nothing can't be created."
									: "The key is shown once, right after it is created."}
							</p>
							<Button type="submit" disabled={creating || scopes.length === 0}>
								{creating ? <Spinner /> : <IconKey className="size-4" />}
								{creating ? "Creating…" : "Create key"}
							</Button>
						</CardFooter>
					</Card>
				</form>
			) : (
				<Alert>
					<IconAlertTriangle />
					<AlertTitle>Read-only view</AlertTitle>
					<AlertDescription>Only organization admins can issue or revoke keys.</AlertDescription>
				</Alert>
			)}

			<section className="space-y-3">
				<div className="flex items-baseline justify-between gap-3">
					<h2 className="text-lg font-semibold">Keys</h2>
					{keys.length > 0 && (
						<span className="text-sm text-muted-foreground tabular-nums">
							{keys.length} key{keys.length === 1 ? "" : "s"}
						</span>
					)}
				</div>

				{keys.length === 0 ? (
					<EmptyKeys canManage={canManage} />
				) : (
					<Card className="gap-0 py-0">
						<ul className="divide-y">
							{keys.map((key) => (
								<KeyRow
									key={key.id}
									apiKey={key}
									brandNames={brandNames}
									canManage={canManage}
									onRevoke={() => {
										setRevokeError(null);
										setRevokeTarget(key);
									}}
								/>
							))}
						</ul>
					</Card>
				)}
			</section>

			<Dialog
				open={revokeTarget !== null}
				onOpenChange={(open) => {
					if (!open && !revoking) setRevokeTarget(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke {revokeTarget?.name ?? "this key"}?</DialogTitle>
						<DialogDescription>
							Anything authenticating with this key stops working immediately, and it can't be restored — you would have
							to issue a new one.
						</DialogDescription>
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

function SectionHeading({ title, description, action }: { title: string; description: ReactNode; action?: ReactNode }) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="space-y-1">
				<p className="text-sm font-medium">{title}</p>
				<p className="max-w-xl text-sm text-muted-foreground">{description}</p>
			</div>
			{action}
		</div>
	);
}

/**
 * One bordered group per resource, so a grant reads as "prompts: read, write"
 * rather than as ten checkboxes that all have to be matched back to a prefix.
 */
function ScopePicker({
	allScopes,
	scopes,
	onToggle,
	onPreset,
}: {
	allScopes: readonly ApiScope[];
	scopes: ApiScope[];
	onToggle: (scope: ApiScope) => void;
	onPreset: (which: "read" | "all") => void;
}) {
	return (
		<section className="space-y-3">
			<SectionHeading
				title="Scopes"
				description={
					<>
						Scopes gate both the REST API and MCP connections. Not every scope maps to an MCP tool —{" "}
						<a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
							the MCP docs
						</a>{" "}
						say which ones do.
					</>
				}
				action={
					<div className="flex items-center gap-2">
						<Badge variant="secondary" className="tabular-nums">
							{scopes.length}/{allScopes.length}
						</Badge>
						<Button type="button" variant="outline" size="sm" onClick={() => onPreset("read")}>
							Read only
						</Button>
						<Button type="button" variant="outline" size="sm" onClick={() => onPreset("all")}>
							Full access
						</Button>
					</div>
				}
			/>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{[...scopeGroups(allScopes)].map(([resource, group]) => {
					const picked = group.filter((scope) => scopes.includes(scope)).length;
					return (
						<fieldset key={resource} className="rounded-md border">
							{/* Out of flow, so it names the group without notching the border;
							    the visible header repeats it alongside the tally. */}
							<legend className="sr-only">{titleCase(resource)}</legend>
							<div
								aria-hidden="true"
								className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2"
							>
								<span className="text-sm font-medium">{titleCase(resource)}</span>
								<span className="text-xs text-muted-foreground tabular-nums">
									{picked}/{group.length}
								</span>
							</div>
							<div className="p-1.5">
								{group.map((scope) => (
									<label
										key={scope}
										htmlFor={`scope-${scope}`}
										className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-sm transition-colors hover:bg-accent/50"
									>
										<Checkbox
											id={`scope-${scope}`}
											checked={scopes.includes(scope)}
											onCheckedChange={() => onToggle(scope)}
										/>
										{titleCase(scope.split(":")[1])}
									</label>
								))}
							</div>
						</fieldset>
					);
				})}
			</div>
		</section>
	);
}

/** The one moment the secret exists in the browser, so it gets its own panel. */
function IssuedKeyCard({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2_000);
		return () => clearTimeout(timer);
	}, [copied]);

	return (
		<Card className="gap-4 border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
					<IconCircleCheck className="size-5" />
					Key created
				</CardTitle>
				<CardDescription>Copy it now — only a hash is stored, so it is never shown again.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-wrap items-center gap-2">
				<code className="min-w-0 flex-1 break-all rounded-md border bg-background px-3 py-2 font-mono text-sm">
					{value}
				</code>
				<Button
					type="button"
					variant="outline"
					onClick={() => {
						navigator.clipboard.writeText(value);
						setCopied(true);
					}}
				>
					{copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
					{copied ? "Copied" : "Copy"}
				</Button>
			</CardContent>
		</Card>
	);
}

function KeyStatusBadge({ apiKey }: { apiKey: ApiKeySummary }) {
	if (!apiKey.enabled) return <Badge variant="outline">Disabled</Badge>;
	if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() < Date.now()) {
		return <Badge variant="destructive">Expired</Badge>;
	}
	return (
		<Badge variant="secondary">
			<span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
			Active
		</Badge>
	);
}

function KeyFact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex gap-1.5">
			<dt>{label}</dt>
			<dd className="text-foreground">{value}</dd>
		</div>
	);
}

function KeyRow({
	apiKey,
	brandNames,
	canManage,
	onRevoke,
}: {
	apiKey: ApiKeySummary;
	brandNames: Map<string, string>;
	canManage: boolean;
	onRevoke: () => void;
}) {
	return (
		<li className="flex items-start gap-3 p-4">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
				<IconKey className="size-4" />
			</span>

			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate font-medium">{apiKey.name ?? "Untitled key"}</p>
					<KeyStatusBadge apiKey={apiKey} />
					{apiKey.start && (
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
							{apiKey.start}…
						</code>
					)}
				</div>

				<div className="flex flex-wrap gap-1">
					{[...scopeGroups(apiKey.scopes)].map(([resource, group]) => (
						<Badge key={resource} variant="secondary" className="font-mono font-normal">
							{resource}:{group.map((scope) => scope.split(":")[1]).join(",")}
						</Badge>
					))}
					{apiKey.scopes.length === 0 && <span className="text-xs text-muted-foreground">No scopes</span>}
				</div>

				<dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
					<KeyFact
						label="Brands"
						value={
							apiKey.brandIds
								? apiKey.brandIds.map((id) => brandNames.get(id) ?? id).join(", ")
								: "All in this organization"
						}
					/>
					<KeyFact label="Created" value={formatDate(apiKey.createdAt)} />
					<KeyFact label="Last used" value={formatDate(apiKey.lastUsedAt)} />
					{apiKey.expiresAt && <KeyFact label="Expires" value={formatDate(apiKey.expiresAt)} />}
				</dl>
			</div>

			{canManage && (
				<Button type="button" variant="outline" size="sm" onClick={onRevoke}>
					Revoke
				</Button>
			)}
		</li>
	);
}

function EmptyKeys({ canManage }: { canManage: boolean }) {
	return (
		<div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-12 text-center">
			<span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<IconKey className="size-5" />
			</span>
			<p className="font-medium">No API keys yet</p>
			<p className="max-w-sm text-sm text-muted-foreground">
				{canManage
					? "Create one above to call the REST API or connect an MCP client."
					: "An organization admin can issue one."}
			</p>
		</div>
	);
}
