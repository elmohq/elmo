/**
 * /admin/targets — the model-target catalog (§8).
 *
 * Lists every instance catalog row grouped/sorted by model, with per-row
 * enable/disable, edit, and delete, plus an add dialog. Each row's status chip
 * joins the provider credential state (unconfigured → amber "credentials
 * missing") so a broken provider is visible before a run fails. Demo renders
 * read-only; the server enforces instance-admin regardless.
 */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Switch } from "@workspace/ui/components/switch";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/dialog";
import { IconCircleCheck, IconCircleX, IconPlus, IconPencil, IconTrash } from "@tabler/icons-react";
import { iconForModel, labelForModel } from "@/components/filter-bar";
import { KNOWN_MODELS } from "@workspace/lib/providers/models";
import {
	createModelTargetFn,
	deleteModelTargetFn,
	listModelTargetsFn,
	listProviderCredentialsFn,
	updateModelTargetFn,
} from "@/server/instance-config";

export const Route = createFileRoute("/_authed/admin/targets")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [{ title: `Targets · ${appName}` }, { name: "description", content: "The model-target catalog." }],
		};
	},
	component: TargetsPage,
});

type Target = Awaited<ReturnType<typeof listModelTargetsFn>>[number];
type CredStatus = Awaited<ReturnType<typeof listProviderCredentialsFn>>[number];

/** Same set `validateScrapeTargets` / the server require a version slug for. */
// Client mirror of providers/config.ts VERSION_REQUIRED_PROVIDERS (the server
// source of truth) — kept local so this route doesn't pull the provider
// registry into the client bundle. Keep in sync if that set changes.
const VERSION_REQUIRED_PROVIDERS = new Set(["openai-api", "anthropic-api", "mistral-api", "openrouter"]);

const ENTITLEMENT_OPTIONS = [
	{ value: "none", label: "None" },
	{ value: "webSearchApiTargets", label: "Web search API targets" },
	{ value: "custom", label: "Custom" },
] as const;

function TargetsPage() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const readOnly = context.clientConfig?.features.readOnly ?? false;

	const [targets, setTargets] = useState<Target[] | null>(null);
	const [credentials, setCredentials] = useState<CredStatus[]>([]);
	const [error, setError] = useState<string | null>(null);

	const load = async () => {
		try {
			const [t, c] = await Promise.all([listModelTargetsFn(), listProviderCredentialsFn()]);
			setTargets(t);
			setCredentials(c);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load targets");
		}
	};

	useEffect(() => {
		load();
	}, []);

	const credByProvider = useMemo(() => new Map(credentials.map((c) => [c.provider, c])), [credentials]);

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-destructive">Error</CardTitle>
				</CardHeader>
				<CardContent>{error}</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Targets</h1>
					<p className="text-muted-foreground">
						The catalog of model targets the fleet can run. A target is skipped (not failed) until its provider has
						working credentials.
					</p>
				</div>
				<TargetFormDialog
					providers={credentials.map((c) => c.provider)}
					readOnly={readOnly}
					onSaved={load}
					trigger={
						<Button className="cursor-pointer" disabled={readOnly}>
							<IconPlus className="h-4 w-4 mr-1" />
							Add target
						</Button>
					}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Catalog</CardTitle>
					<CardDescription>
						{targets ? `${targets.length} target${targets.length === 1 ? "" : "s"}` : "Loading…"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!targets ? (
						<div className="space-y-3">
							{[0, 1, 2, 3].map((n) => (
								<Skeleton key={n} className="h-12 w-full" />
							))}
						</div>
					) : targets.length === 0 ? (
						<p className="text-sm text-muted-foreground py-6 text-center">
							No targets configured yet. The worker seeds the catalog on first boot, or add one above.
						</p>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Model</TableHead>
										<TableHead>Provider</TableHead>
										<TableHead>Version</TableHead>
										<TableHead>Web search</TableHead>
										<TableHead className="text-right">Priority</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Enabled</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{targets.map((target) => (
										<TargetRow
											key={target.id}
											target={target}
											credential={credByProvider.get(target.provider)}
											providers={credentials.map((c) => c.provider)}
											readOnly={readOnly}
											onSaved={load}
										/>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function StatusChip({ target, credential }: { target: Target; credential: CredStatus | undefined }) {
	if (!target.enabled) {
		return (
			<Badge variant="outline" className="font-normal text-muted-foreground">
				Disabled
			</Badge>
		);
	}
	// Providers with no storable credentials aren't listed — nothing to be unready.
	if (credential && credential.source === "unconfigured") {
		return (
			<Badge
				className="font-normal border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
				variant="outline"
			>
				Credentials missing
			</Badge>
		);
	}
	return (
		<Badge
			className="font-normal border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
			variant="outline"
		>
			Ready
		</Badge>
	);
}

function TargetRow({
	target,
	credential,
	providers,
	readOnly,
	onSaved,
}: {
	target: Target;
	credential: CredStatus | undefined;
	providers: string[];
	readOnly: boolean;
	onSaved: () => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);

	const toggleEnabled = async (enabled: boolean) => {
		if (readOnly) return;
		setBusy(true);
		try {
			await updateModelTargetFn({ data: { id: target.id, enabled } });
			await onSaved();
		} catch {
			// Reload to resync the switch with server truth on failure.
			await onSaved();
		} finally {
			setBusy(false);
		}
	};

	return (
		<TableRow>
			<TableCell>
				<div className="flex items-center gap-2">
					{iconForModel(target.model, "h-4 w-4")}
					<span className="font-medium">{labelForModel(target.model)}</span>
				</div>
			</TableCell>
			<TableCell className="font-mono text-xs">{target.provider}</TableCell>
			<TableCell className="font-mono text-xs">{target.version ?? "—"}</TableCell>
			<TableCell>
				{target.webSearch ? (
					<IconCircleCheck className="h-4 w-4 text-emerald-600" />
				) : (
					<IconCircleX className="h-4 w-4 text-muted-foreground" />
				)}
			</TableCell>
			<TableCell className="text-right tabular-nums">{target.priority}</TableCell>
			<TableCell>
				<StatusChip target={target} credential={credential} />
			</TableCell>
			<TableCell>
				<Switch
					checked={target.enabled}
					onCheckedChange={toggleEnabled}
					disabled={busy || readOnly}
					className="cursor-pointer"
				/>
			</TableCell>
			<TableCell>
				<div className="flex items-center justify-end gap-1">
					<TargetFormDialog
						target={target}
						providers={providers}
						readOnly={readOnly}
						onSaved={onSaved}
						trigger={
							<Button variant="outline" size="sm" className="cursor-pointer" disabled={readOnly}>
								<IconPencil className="h-4 w-4" />
							</Button>
						}
					/>
					<DeleteTargetDialog target={target} readOnly={readOnly} onSaved={onSaved} />
				</div>
			</TableCell>
		</TableRow>
	);
}

interface TargetForm {
	model: string;
	provider: string;
	version: string;
	webSearch: boolean;
	priority: string;
	requiredEntitlement: string;
}

function emptyForm(providers: string[]): TargetForm {
	return {
		model: "",
		provider: providers[0] ?? "",
		version: "",
		webSearch: false,
		priority: "0",
		requiredEntitlement: "none",
	};
}

function targetToForm(target: Target): TargetForm {
	return {
		model: target.model,
		provider: target.provider,
		version: target.version ?? "",
		webSearch: target.webSearch,
		priority: String(target.priority),
		requiredEntitlement: target.requiredEntitlement ?? "none",
	};
}

/** Add (no `target`) or edit (with `target`) a catalog row through one form. */
function TargetFormDialog({
	target,
	providers,
	readOnly,
	onSaved,
	trigger,
}: {
	target?: Target;
	providers: string[];
	readOnly: boolean;
	onSaved: () => Promise<void>;
	trigger: ReactNode;
}) {
	const isEdit = target !== undefined;
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState<TargetForm>(() => (target ? targetToForm(target) : emptyForm(providers)));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setForm(target ? targetToForm(target) : emptyForm(providers));
			setError(null);
		}
	}, [open, target, providers]);

	const versionRequired = VERSION_REQUIRED_PROVIDERS.has(form.provider);
	const priorityValid = Number.isInteger(Number.parseInt(form.priority, 10));
	const canSubmit =
		form.model.trim().length > 0 &&
		form.provider.length > 0 &&
		(!versionRequired || form.version.trim().length > 0) &&
		priorityValid;

	const submit = async () => {
		if (readOnly) return;
		setBusy(true);
		setError(null);
		const payload = {
			model: form.model.trim(),
			provider: form.provider,
			version: form.version.trim() || null,
			webSearch: form.webSearch,
			priority: Number.parseInt(form.priority, 10),
			requiredEntitlement:
				form.requiredEntitlement === "none" ? null : (form.requiredEntitlement as "webSearchApiTargets" | "custom"),
		};
		try {
			if (isEdit) {
				await updateModelTargetFn({ data: { id: target.id, ...payload } });
			} else {
				await createModelTargetFn({ data: { ...payload, enabled: true } });
			}
			await onSaved();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save target");
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Edit target" : "Add target"}</DialogTitle>
					<DialogDescription>
						{isEdit ? "Update this catalog row's implementation facts." : "Add a model implementation to the catalog."}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="target-model">Model</Label>
							<Input
								id="target-model"
								list="known-models"
								value={form.model}
								onChange={(e) => setForm({ ...form, model: e.target.value })}
								placeholder="chatgpt"
								disabled={busy}
							/>
							<datalist id="known-models">
								{Object.keys(KNOWN_MODELS).map((model) => (
									<option key={model} value={model} />
								))}
							</datalist>
						</div>
						<div className="space-y-2">
							<Label htmlFor="target-provider">Provider</Label>
							<Select
								value={form.provider}
								onValueChange={(value) => setForm({ ...form, provider: value })}
								disabled={busy}
							>
								<SelectTrigger id="target-provider">
									<SelectValue placeholder="Select provider" />
								</SelectTrigger>
								<SelectContent>
									{providers.map((provider) => (
										<SelectItem key={provider} value={provider}>
											{provider}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="target-version">
							Version{versionRequired && <span className="text-destructive"> *</span>}
						</Label>
						<Input
							id="target-version"
							value={form.version}
							onChange={(e) => setForm({ ...form, version: e.target.value })}
							placeholder={versionRequired ? "Required — the model identifier" : "Optional"}
							disabled={busy}
							className="font-mono text-sm"
						/>
					</div>

					<label className="flex items-center gap-2 text-sm cursor-pointer">
						<Checkbox
							checked={form.webSearch}
							onCheckedChange={(checked) => setForm({ ...form, webSearch: checked === true })}
							disabled={busy}
						/>
						Web search
					</label>

					<details className="rounded-md border p-3">
						<summary className="cursor-pointer text-sm font-medium">Advanced</summary>
						<div className="grid grid-cols-2 gap-4 pt-3">
							<div className="space-y-2">
								<Label htmlFor="target-priority">Priority</Label>
								<Input
									id="target-priority"
									type="number"
									value={form.priority}
									onChange={(e) => setForm({ ...form, priority: e.target.value })}
									disabled={busy}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="target-entitlement">Required entitlement</Label>
								<Select
									value={form.requiredEntitlement}
									onValueChange={(value) => setForm({ ...form, requiredEntitlement: value })}
									disabled={busy}
								>
									<SelectTrigger id="target-entitlement">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ENTITLEMENT_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					</details>

					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)} disabled={busy} className="cursor-pointer">
						Cancel
					</Button>
					<Button onClick={submit} disabled={busy || readOnly || !canSubmit} className="cursor-pointer">
						{busy ? "Saving…" : isEdit ? "Save" : "Add target"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteTargetDialog({
	target,
	readOnly,
	onSaved,
}: {
	target: Target;
	readOnly: boolean;
	onSaved: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const remove = async () => {
		if (readOnly) return;
		setBusy(true);
		setError(null);
		try {
			await deleteModelTargetFn({ data: { id: target.id } });
			await onSaved();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete target");
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="cursor-pointer text-destructive hover:text-destructive"
					disabled={readOnly}
				>
					<IconTrash className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Delete target</DialogTitle>
					<DialogDescription>
						Remove{" "}
						<span className="font-mono">
							{target.model}:{target.provider}
						</span>{" "}
						from the catalog? This can't be undone.
					</DialogDescription>
				</DialogHeader>
				{error && <p className="text-sm text-destructive">{error}</p>}
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)} disabled={busy} className="cursor-pointer">
						Cancel
					</Button>
					<Button variant="destructive" onClick={remove} disabled={busy || readOnly} className="cursor-pointer">
						{busy ? "Deleting…" : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
