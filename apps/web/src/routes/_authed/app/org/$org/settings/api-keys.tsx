/**
 * The role check here is UX only — the boundary is in the server functions and
 * the api-key plugin's own membership check. This page just avoids showing a
 * form that would be refused.
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
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import {
	type ApiKeyAccess,
	type ApiKeysPageData,
	createApiKeyFn,
	listApiKeysFn,
	revokeApiKeyFn,
} from "@/server/api-keys";

export const Route = createFileRoute("/_authed/app/org/$org/settings/api-keys")({
	loader: ({ context }): Promise<ApiKeysPageData> =>
		listApiKeysFn({ data: { organizationId: context.organization.id } }),
	staticData: { crumb: "API keys" },
	head: pageHead({ description: "Issue and revoke API keys for this organization." }),
	component: ApiKeysSettingsPage,
});

const ACCESS_LABELS: Record<ApiKeyAccess, string> = {
	read: "Read-only",
	write: "Read and write",
};

function accessLabel(scopes: readonly string[]): string {
	if (scopes.includes("write")) return ACCESS_LABELS.write;
	if (scopes.includes("read")) return ACCESS_LABELS.read;
	return "No access";
}

function formatDate(value: string | null): string {
	return value ? new Date(value).toLocaleDateString() : "—";
}

function ApiKeysSettingsPage() {
	const { keys, brands, expiryOptions, canManage, organization } = Route.useLoaderData();
	const organizationId = organization.id;
	const router = useRouter();

	const [name, setName] = useState("");
	const [access, setAccess] = useState<ApiKeyAccess>("read");
	const [restrictBrands, setRestrictBrands] = useState(false);
	const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
	const [expiresInDays, setExpiresInDays] = useState<string>("never");
	const [creating, setCreating] = useState(false);
	const [revoking, setRevoking] = useState<string | null>(null);
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
					access,
					// Null, not `[]`: unrestricted is the absence of a restriction. The
					// server rejects `[]` rather than reading it as "all".
					brandIds: restrictBrands ? selectedBrands : null,
					expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
				},
			});
			trackEvent("api_key_created", { access, restricted: restrictBrands });
			setIssuedKey(key);
			setName("");
			setAccess("read");
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
		if (!window.confirm("Revoke this API key? Integrations using it will stop working immediately.")) return;
		setError(null);
		setRevoking(keyId);
		try {
			await revokeApiKeyFn({ data: { organizationId, keyId } });
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke the API key");
		} finally {
			setRevoking(null);
		}
	}

	const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">API keys</h1>
				<p className="text-muted-foreground">
					Keys act as {organization.name}, not as you, so they keep working after you change teams. Any organization
					admin can revoke one.
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
							<Label htmlFor="key-access">Access</Label>
							<Select
								items={ACCESS_LABELS}
								value={access}
								onValueChange={(value) => setAccess((value ?? "read") as ApiKeyAccess)}
							>
								<SelectTrigger id="key-access" className="w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(ACCESS_LABELS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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

					<p className="text-sm text-muted-foreground">
						Access gates both the REST API and MCP connections. Either way a key reaches only this organization, and the
						operations that spend provider budget or destroy tracked history need an instance admin key no key issued
						here can be given.
					</p>

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

					<Button type="submit" disabled={creating}>
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
										<Badge variant="secondary">{accessLabel(key.scopes)}</Badge>
									</div>
									<p className="text-sm text-muted-foreground">
										{key.brandIds
											? `Limited to ${key.brandIds.map((id) => brandNames.get(id) ?? id).join(", ")}`
											: "All brands in this organization"}{" "}
										· created {formatDate(key.createdAt)} · last used {formatDate(key.lastUsedAt)}
										{key.expiresAt ? ` · expires ${formatDate(key.expiresAt)}` : ""}
									</p>
								</div>
								{canManage && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={revoking !== null}
										onClick={() => handleRevoke(key.id)}
									>
										{revoking === key.id ? "Revoking..." : "Revoke"}
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
