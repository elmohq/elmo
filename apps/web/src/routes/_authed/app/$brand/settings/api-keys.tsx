/**
 * /app/$brand/settings/api-keys - API key management page
 *
 * Lets a user mint and revoke better-auth API keys for the elmo REST API
 * (`/api/v1`). Keys created here always act on the owning user's behalf and
 * are never admin keys — instance-admin access only comes from the
 * `ADMIN_API_KEYS` env var, not the dashboard. A key's access is the brands
 * of the orgs the owner belongs to, optionally narrowed at creation time to
 * a chosen subset (stored as `metadata.brandIds`). Keys are account-wide
 * (not scoped to the current brand) unless narrowed this way — this page's
 * brand context has nothing to do with what the key can reach.
 */

import { IconCopy, IconTrash } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@workspace/lib/auth/client";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { useCallback, useEffect, useState } from "react";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";
import { getBrands } from "@/server/brands";

export const Route = createFileRoute("/_authed/app/$brand/settings/api-keys")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("API Keys", { appName, brandName }) },
				{ name: "description", content: "Manage API keys for the elmo REST API." },
			],
		};
	},
	component: ApiKeysSettings,
});

/** Shape returned by `authClient.apiKey.list()` — secrets are never included. */
interface ApiKeySummary {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	createdAt: string | Date;
	lastRequest: string | Date | null;
	expiresAt: string | Date | null;
	enabled: boolean;
	/**
	 * Extra metadata stored with the key. better-auth normally returns this
	 * already parsed (the DB column is transformed on read), but we defensively
	 * handle a raw JSON string too in case that ever changes.
	 */
	metadata?: Record<string, unknown> | string | null;
}

/** Minimal brand shape this page needs — id + name from `getBrands()`. */
interface BrandOption {
	id: string;
	name: string;
}

const EXPIRATION_OPTIONS = [
	{ value: "never", label: "Never", seconds: undefined },
	{ value: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
	{ value: "90d", label: "90 days", seconds: 90 * 24 * 60 * 60 },
	{ value: "1y", label: "1 year", seconds: 365 * 24 * 60 * 60 },
] as const;

const BRAND_SCOPE_OPTIONS = [
	{ value: "all", label: "All my brands" },
	{ value: "specific", label: "Specific brands" },
] as const;

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	return new Date(value).toLocaleDateString();
}

/** Pulls `brandIds` out of a key's metadata, tolerating a JSON-string form. */
function getRestrictedBrandIds(metadata: ApiKeySummary["metadata"]): string[] | null {
	if (!metadata) return null;
	let parsed: Record<string, unknown>;
	if (typeof metadata === "string") {
		try {
			parsed = JSON.parse(metadata);
		} catch {
			return null;
		}
	} else {
		parsed = metadata;
	}
	const brandIds = parsed.brandIds;
	return Array.isArray(brandIds) && brandIds.every((id) => typeof id === "string") && brandIds.length > 0
		? (brandIds as string[])
		: null;
}

/** Renders a key's brand restriction: brand names if we have them loaded, else a count. */
function formatBrandScope(metadata: ApiKeySummary["metadata"], brands: BrandOption[]): string {
	const brandIds = getRestrictedBrandIds(metadata);
	if (!brandIds) return "All";
	if (brands.length === 0) return `${brandIds.length} brand${brandIds.length === 1 ? "" : "s"}`;
	const names = brandIds.map((id) => brands.find((b) => b.id === id)?.name ?? id);
	return names.join(", ");
}

function ApiKeysSettings() {
	const [keys, setKeys] = useState<ApiKeySummary[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");

	const [brands, setBrands] = useState<BrandOption[]>([]);

	const [createOpen, setCreateOpen] = useState(false);
	const [revokeTarget, setRevokeTarget] = useState<ApiKeySummary | null>(null);

	const loadKeys = useCallback(async () => {
		setIsLoading(true);
		setError("");
		const { data, error: listError } = await authClient.apiKey.list();
		if (listError) {
			setError(listError.message ?? "Failed to load API keys");
		} else {
			setKeys((data?.apiKeys as ApiKeySummary[] | undefined) ?? []);
		}
		setIsLoading(false);
	}, []);

	useEffect(() => {
		loadKeys();
	}, [loadKeys]);

	useEffect(() => {
		// Used for the create dialog's brand picker and to render brand names in
		// the table; failures here shouldn't block the key list itself.
		getBrands()
			.then((data) => setBrands(data.map((b) => ({ id: b.id, name: b.name }))))
			.catch(() => setBrands([]));
	}, []);

	const handleRevoke = useCallback(
		async (keyId: string) => {
			setError("");
			const { error: deleteError } = await authClient.apiKey.delete({ keyId });
			if (deleteError) {
				setError(deleteError.message ?? "Failed to revoke API key");
			} else {
				setRevokeTarget(null);
				await loadKeys();
			}
		},
		[loadKeys],
	);

	return (
		<div className="space-y-6 max-w-4xl">
			<div className="space-y-1">
				<h1 className="text-3xl font-bold">API Keys</h1>
				<p className="text-muted-foreground">
					API keys authenticate requests to the elmo REST API (<code className="font-mono text-xs">/api/v1</code>) as
					you. Keys created here act on your behalf and are limited to your brands (the brands of organizations you
					belong to) — they are never admin keys.
				</p>
				<p className="text-muted-foreground">
					Keys apply account-wide, not just to this brand, even though this page lives under a brand's settings, unless
					restricted to specific brands below.
				</p>
			</div>

			<div className="flex justify-end">
				<Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
					Create API key
				</Button>
			</div>

			{error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}

			{isLoading ? (
				<div className="space-y-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : keys.length === 0 ? (
				<div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
					<p className="font-medium text-foreground">No API keys yet</p>
					<p>Create one to start calling the elmo REST API.</p>
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Key</TableHead>
							<TableHead>Brands</TableHead>
							<TableHead>Created</TableHead>
							<TableHead>Last used</TableHead>
							<TableHead>Expires</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{keys.map((key) => (
							<TableRow key={key.id}>
								<TableCell className="font-medium">{key.name ?? "Unnamed key"}</TableCell>
								<TableCell className="font-mono text-xs text-muted-foreground">{key.start}…</TableCell>
								<TableCell
									className="text-sm text-muted-foreground max-w-48 truncate"
									title={formatBrandScope(key.metadata, brands)}
								>
									{formatBrandScope(key.metadata, brands)}
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">{formatDate(key.createdAt)}</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{key.lastRequest ? formatDate(key.lastRequest) : "Never used"}
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{key.expiresAt ? formatDate(key.expiresAt) : "Never"}
								</TableCell>
								<TableCell className="text-right">
									<Button
										variant="ghost"
										size="icon"
										className="cursor-pointer text-destructive hover:text-destructive"
										aria-label={`Revoke ${key.name ?? "API key"}`}
										onClick={() => setRevokeTarget(key)}
									>
										<IconTrash className="h-4 w-4" />
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			<CreateApiKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={loadKeys} brands={brands} />

			<Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke API key?</DialogTitle>
						<DialogDescription>
							{revokeTarget && (
								<>
									Any requests using &ldquo;{revokeTarget.name ?? "this key"}&rdquo; ({revokeTarget.start}…) will stop
									working immediately. This cannot be undone.
								</>
							)}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" className="cursor-pointer">
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="destructive"
							className="cursor-pointer"
							onClick={() => revokeTarget && handleRevoke(revokeTarget.id)}
						>
							Revoke
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function CreateApiKeyDialog({
	open,
	onOpenChange,
	onCreated,
	brands,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => Promise<void>;
	brands: BrandOption[];
}) {
	const [name, setName] = useState("");
	const [expiration, setExpiration] = useState<(typeof EXPIRATION_OPTIONS)[number]["value"]>("never");
	const [brandScope, setBrandScope] = useState<(typeof BRAND_SCOPE_OPTIONS)[number]["value"]>("all");
	const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const reset = useCallback(() => {
		setName("");
		setExpiration("never");
		setBrandScope("all");
		setSelectedBrandIds([]);
		setIsSubmitting(false);
		setError("");
		setCreatedKey(null);
		setCopied(false);
	}, []);

	const toggleBrand = useCallback((brandId: string, checked: boolean) => {
		setSelectedBrandIds((prev) => (checked ? [...prev, brandId] : prev.filter((id) => id !== brandId)));
	}, []);

	const needsBrandSelection = brandScope === "specific" && selectedBrandIds.length === 0;

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) {
				// Only refresh the list once the secret view has been dismissed —
				// the create call already happened, this is just closing the dialog.
				const hadCreatedKey = createdKey !== null;
				reset();
				onOpenChange(false);
				if (hadCreatedKey) {
					onCreated();
				}
			} else {
				onOpenChange(true);
			}
		},
		[createdKey, onCreated, onOpenChange, reset],
	);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (needsBrandSelection) return;
		setIsSubmitting(true);
		setError("");

		const expiresIn = EXPIRATION_OPTIONS.find((opt) => opt.value === expiration)?.seconds;
		const { data, error: createError } = await authClient.apiKey.create({
			name,
			...(expiresIn ? { expiresIn } : {}),
			...(selectedBrandIds.length > 0 ? { metadata: { brandIds: selectedBrandIds } } : {}),
		});

		if (createError) {
			setError(createError.message ?? "Failed to create API key");
			setIsSubmitting(false);
			return;
		}

		setCreatedKey(data?.key ?? null);
		setIsSubmitting(false);
	};

	const handleCopy = useCallback(() => {
		if (!createdKey) return;
		navigator.clipboard.writeText(createdKey);
		setCopied(true);
	}, [createdKey]);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				{createdKey ? (
					<>
						<DialogHeader>
							<DialogTitle>API key created</DialogTitle>
							<DialogDescription>Copy this key now — for security, it won't be shown again.</DialogDescription>
						</DialogHeader>
						<div className="flex items-center gap-2">
							<Input readOnly value={createdKey} className="font-mono text-xs" />
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="cursor-pointer shrink-0"
								onClick={handleCopy}
							>
								<IconCopy className="h-4 w-4" />
							</Button>
						</div>
						{copied && <p className="text-xs text-muted-foreground">Copied to clipboard.</p>}
						<DialogFooter>
							<Button className="cursor-pointer" onClick={() => handleOpenChange(false)}>
								Done
							</Button>
						</DialogFooter>
					</>
				) : (
					<form onSubmit={handleSubmit}>
						<DialogHeader>
							<DialogTitle>Create API key</DialogTitle>
							<DialogDescription>Give the key a name so you can recognize it later.</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-4">
							<div className="space-y-2">
								<Label htmlFor="api-key-name">Name</Label>
								<Input
									id="api-key-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g. CI pipeline"
									required
									disabled={isSubmitting}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="api-key-expiration">Expiration</Label>
								<Select value={expiration} onValueChange={(v) => setExpiration(v as typeof expiration)}>
									<SelectTrigger id="api-key-expiration" disabled={isSubmitting}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{EXPIRATION_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="api-key-brand-scope">Brand access</Label>
								<Select value={brandScope} onValueChange={(v) => setBrandScope(v as typeof brandScope)}>
									<SelectTrigger id="api-key-brand-scope" disabled={isSubmitting}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{BRAND_SCOPE_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{brandScope === "specific" && (
									<>
										<div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-2">
											{brands.length === 0 ? (
												<p className="text-xs text-muted-foreground p-1">No brands available.</p>
											) : (
												brands.map((brand) => (
													<div key={brand.id} className="flex items-center gap-2">
														<Checkbox
															id={`api-key-brand-${brand.id}`}
															checked={selectedBrandIds.includes(brand.id)}
															onCheckedChange={(checked) => toggleBrand(brand.id, checked === true)}
															disabled={isSubmitting}
														/>
														<Label htmlFor={`api-key-brand-${brand.id}`} className="font-normal cursor-pointer">
															{brand.name}
														</Label>
													</div>
												))
											)}
										</div>
										{needsBrandSelection && <p className="text-xs text-destructive">Select at least one brand.</p>}
									</>
								)}
							</div>
							{error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
						</div>
						<DialogFooter>
							<DialogClose asChild>
								<Button type="button" variant="outline" className="cursor-pointer" disabled={isSubmitting}>
									Cancel
								</Button>
							</DialogClose>
							<Button type="submit" className="cursor-pointer" disabled={isSubmitting || needsBrandSelection}>
								{isSubmitting ? "Creating..." : "Create key"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
