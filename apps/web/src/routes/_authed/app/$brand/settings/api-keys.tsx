/**
 * /app/$brand/settings/api-keys — issue and revoke the workspace's API keys.
 *
 * The role check here is UX only. The security boundary is in the server
 * functions, and behind them the api-key plugin's own membership check — this
 * page just avoids showing a form that would be refused.
 */
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useState } from "react";
import type { ApiScope } from "@/lib/api/scopes";
import { trackEvent } from "@/lib/posthog";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";
import { type ApiKeysPageData, createApiKeyFn, listApiKeysFn, revokeApiKeyFn } from "@/server/api-keys";

export const Route = createFileRoute("/_authed/app/$brand/settings/api-keys")({
	loader: async ({ params }): Promise<ApiKeysPageData> => listApiKeysFn({ data: { brandId: params.brand } }),
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("API keys", { appName, brandName }) },
				{ name: "description", content: "Issue and revoke API keys for this workspace." },
			],
		};
	},
	component: ApiKeysSettingsPage,
});

/** Presets, so the common cases don't mean ticking eleven boxes. */
function preset(name: "read" | "all", scopes: readonly ApiScope[]): ApiScope[] {
	return name === "all" ? [...scopes] : scopes.filter((scope) => scope.endsWith(":read"));
}

function formatDate(value: string | null): string {
	return value ? new Date(value).toLocaleDateString() : "—";
}

function scopeGroups(scopes: readonly ApiScope[]): Map<string, ApiScope[]> {
	const groups = new Map<string, ApiScope[]>();
	for (const scope of scopes) {
		const resource = scope.split(":")[0];
		groups.set(resource, [...(groups.get(resource) ?? []), scope]);
	}
	return groups;
}

function ApiKeysSettingsPage() {
	const { brand: brandId } = Route.useParams();
	const { keys, brands, allScopes, expiryOptions, canManage, organization } = Route.useLoaderData();
	const router = useRouter();

	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<ApiScope[]>(() => preset("read", allScopes));
	const [restrictBrands, setRestrictBrands] = useState(false);
	const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
	const [expiresInDays, setExpiresInDays] = useState<string>("never");
	const [creating, setCreating] = useState(false);
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
					brandId,
					name,
					scopes,
					// Null, not an empty array: unrestricted is the absence of a
					// restriction. The server rejects `[]` rather than reading it as
					// "all", so an empty picker surfaces as an error rather than a key
					// that quietly reaches everything.
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
		setError(null);
		try {
			await revokeApiKeyFn({ data: { brandId, keyId } });
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke the API key");
		}
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">API keys</h1>
				<p className="text-muted-foreground">
					Keys act as {organization.name}, not as you, so they keep working after you change teams. Any workspace admin
					can revoke one.
				</p>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{issuedKey && (
				<Alert>
					<AlertDescription className="space-y-2">
						<p className="font-medium">Copy this key now — it is not shown again.</p>
						<code className="block break-all rounded bg-muted p-2 font-mono text-sm">{issuedKey}</code>
						<Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(issuedKey)}>
							Copy
						</Button>
					</AlertDescription>
				</Alert>
			)}

			{canManage && (
				<form onSubmit={handleCreate} className="space-y-4 rounded-md border p-4">
					<h2 className="text-lg font-semibold">Create a key</h2>

					<div className="flex flex-wrap items-end gap-3">
						<div className="flex flex-col gap-2">
							<Label htmlFor="key-name">Name</Label>
							<Input
								id="key-name"
								placeholder="Reporting pipeline"
								value={name}
								onChange={(event) => setName(event.target.value)}
								required
								className="w-64"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="key-expiry">Expires</Label>
							<Select
								items={{
									never: "Never",
									...Object.fromEntries(expiryOptions.map((days) => [String(days), `In ${days} days`])),
								}}
								value={expiresInDays}
								onValueChange={(value) => setExpiresInDays(value ?? "never")}
							>
								<SelectTrigger id="key-expiry" className="w-40">
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

					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<Label>Scopes</Label>
							<Button type="button" variant="outline" size="sm" onClick={() => setScopes(preset("read", allScopes))}>
								Read only
							</Button>
							<Button type="button" variant="outline" size="sm" onClick={() => setScopes(preset("all", allScopes))}>
								Full access
							</Button>
						</div>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{[...scopeGroups(allScopes)].map(([resource, group]) => (
								<div key={resource} className="space-y-1 rounded border p-2">
									<p className="text-sm font-medium capitalize">{resource}</p>
									{group.map((scope) => (
										<div key={scope} className="flex items-center gap-2 text-sm">
											<Checkbox
												id={`scope-${scope}`}
												checked={scopes.includes(scope)}
												onCheckedChange={() => setScopes((current) => toggle(current, scope))}
											/>
											<Label htmlFor={`scope-${scope}`} className="font-normal">
												{scope.split(":")[1]}
											</Label>
										</div>
									))}
								</div>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex items-center gap-2 text-sm">
							<Checkbox
								id="restrict-brands"
								checked={restrictBrands}
								onCheckedChange={(next) => setRestrictBrands(next === true)}
							/>
							<Label htmlFor="restrict-brands" className="font-normal">
								Restrict this key to specific brands
							</Label>
						</div>
						{restrictBrands && (
							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
								{brands.map((brand) => (
									<div key={brand.id} className="flex items-center gap-2 text-sm">
										<Checkbox
											id={`brand-${brand.id}`}
											checked={selectedBrands.includes(brand.id)}
											onCheckedChange={() => setSelectedBrands((current) => toggle(current, brand.id))}
										/>
										<Label htmlFor={`brand-${brand.id}`} className="font-normal">
											{brand.name}
										</Label>
									</div>
								))}
							</div>
						)}
					</div>

					<Button type="submit" disabled={creating || scopes.length === 0}>
						{creating ? "Creating..." : "Create key"}
					</Button>
				</form>
			)}

			<div className="space-y-3">
				<h2 className="text-lg font-semibold">Keys</h2>
				{keys.length === 0 ? (
					<p className="text-sm text-muted-foreground">No API keys yet.</p>
				) : (
					<div className="divide-y rounded-md border">
						{keys.map((key) => (
							<div key={key.id} className="flex items-start justify-between gap-3 p-3">
								<div className="min-w-0 space-y-1">
									<p className="truncate font-medium">{key.name ?? "Untitled key"}</p>
									<p className="font-mono text-sm text-muted-foreground">{key.start ? `${key.start}…` : "—"}</p>
									<div className="flex flex-wrap gap-1">
										{key.scopes.map((scope) => (
											<Badge key={scope} variant="secondary">
												{scope}
											</Badge>
										))}
									</div>
									<p className="text-sm text-muted-foreground">
										{key.brandIds ? `Limited to ${key.brandIds.join(", ")}` : "All brands in this workspace"} · created{" "}
										{formatDate(key.createdAt)} · last used {formatDate(key.lastUsedAt)}
										{key.expiresAt ? ` · expires ${formatDate(key.expiresAt)}` : ""}
									</p>
								</div>
								{canManage && (
									<Button type="button" variant="outline" size="sm" onClick={() => handleRevoke(key.id)}>
										Revoke
									</Button>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
