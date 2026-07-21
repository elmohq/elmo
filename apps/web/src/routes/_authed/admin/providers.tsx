/**
 * /admin/providers — provider credential lifecycle (§8 / §6).
 *
 * One card per provider that has storable credential env vars. Credential
 * values are write-only: inputs start empty, the response only ever carries
 * presence + a 4-char hint. Demo hides this surface entirely (plan §13). The
 * server enforces instance-admin regardless.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { IconCircleCheck, IconCircleX } from "@tabler/icons-react";
import {
	deleteProviderCredentialFn,
	listProviderCredentialsFn,
	upsertProviderCredentialFn,
	verifyProviderCredentialFn,
} from "@/server/instance-config";

export const Route = createFileRoute("/_authed/admin/providers")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `Providers · ${appName}` },
				{ name: "description", content: "Provider credential configuration." },
			],
		};
	},
	component: ProvidersPage,
});

type CredStatus = Awaited<ReturnType<typeof listProviderCredentialsFn>>[number];
type VerifyResult = Awaited<ReturnType<typeof verifyProviderCredentialFn>>;

function ProvidersPage() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const readOnly = context.clientConfig?.features.readOnly ?? false;

	const [providers, setProviders] = useState<CredStatus[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = async () => {
		try {
			setProviders(await listProviderCredentialsFn());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load providers");
		}
	};

	useEffect(() => {
		// Credentials are hidden in the read-only demo; never fetch them there.
		if (!readOnly) load();
	}, [readOnly]);

	if (readOnly) {
		return (
			<div className="space-y-6 max-w-3xl">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Providers</h1>
					<p className="text-muted-foreground">Provider credentials.</p>
				</div>
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						Provider credentials aren&apos;t available in the demo.
					</CardContent>
				</Card>
			</div>
		);
	}

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
		<div className="space-y-6 max-w-3xl">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Providers</h1>
				<p className="text-muted-foreground">
					Configure API credentials per provider. A stored credential takes precedence over its environment variables
					for that provider; otherwise the environment is used.
				</p>
			</div>

			{!providers ? (
				<div className="space-y-4">
					{[0, 1, 2].map((n) => (
						<Skeleton key={n} className="h-48 w-full" />
					))}
				</div>
			) : (
				providers.map((provider) => <ProviderCard key={provider.provider} status={provider} onSaved={load} />)
			)}
		</div>
	);
}

function StatusLine({ status }: { status: CredStatus }) {
	if (status.source === "encrypted") {
		return (
			<span className="text-sm text-muted-foreground">
				Stored (encrypted){status.hint ? <span className="font-mono"> ····{status.hint}</span> : null}
			</span>
		);
	}
	if (status.source === "secret-ref") {
		return <span className="text-sm text-muted-foreground">Stored (secret reference)</span>;
	}
	if (status.source === "env") {
		return <span className="text-sm text-muted-foreground">Configured via environment</span>;
	}
	return <span className="text-sm text-amber-700 dark:text-amber-400">Unconfigured</span>;
}

function SourceBadge({ status }: { status: CredStatus }) {
	const map: Record<CredStatus["source"], { label: string; className: string }> = {
		env: { label: "Environment", className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400" },
		encrypted: {
			label: "Stored",
			className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
		},
		"secret-ref": {
			label: "Stored",
			className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
		},
		unconfigured: {
			label: "Unconfigured",
			className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
		},
	};
	const { label, className } = map[status.source];
	return (
		<Badge variant="outline" className={`font-normal ${className}`}>
			{label}
		</Badge>
	);
}

function ProviderCard({ status, onSaved }: { status: CredStatus; onSaved: () => Promise<void> }) {
	const [inputs, setInputs] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [encryptionKeyMissing, setEncryptionKeyMissing] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);
	const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

	const filled = Object.values(inputs).filter((v) => v.trim().length > 0);

	const save = async () => {
		setBusy(true);
		setError(null);
		setEncryptionKeyMissing(false);
		setSuccess(null);
		setVerifyResult(null);
		const values = Object.fromEntries(Object.entries(inputs).filter(([, v]) => v.trim().length > 0));
		try {
			await upsertProviderCredentialFn({ data: { provider: status.provider, values } });
			setInputs({});
			await onSaved();
			setSuccess("Credentials stored");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save credentials";
			if (message.includes("ELMO_ENCRYPTION_KEY")) setEncryptionKeyMissing(true);
			setError(message);
		} finally {
			setBusy(false);
		}
	};

	const remove = async () => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		setVerifyResult(null);
		try {
			await deleteProviderCredentialFn({ data: { provider: status.provider } });
			await onSaved();
			setSuccess("Stored credential removed");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove credential");
		} finally {
			setBusy(false);
		}
	};

	const verify = async () => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			setVerifyResult(await verifyProviderCredentialFn({ data: { provider: status.provider } }));
			await onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to verify");
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="font-mono text-base">{status.provider}</CardTitle>
					<SourceBadge status={status} />
				</div>
				<CardDescription>
					<StatusLine status={status} />
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{status.lastVerifiedAt && (
					<p className="text-xs text-muted-foreground">
						Last verified {new Date(status.lastVerifiedAt).toLocaleString()}
						{status.lastVerifyError ? ` — ${status.lastVerifyError}` : ""}
					</p>
				)}

				<div className="space-y-3">
					{status.keys.map((key) => (
						<div key={key} className="space-y-1.5">
							<Label htmlFor={`${status.provider}-${key}`} className="font-mono text-xs">
								{key}
							</Label>
							<Input
								id={`${status.provider}-${key}`}
								type="password"
								autoComplete="off"
								value={inputs[key] ?? ""}
								onChange={(e) => setInputs({ ...inputs, [key]: e.target.value })}
								placeholder={status.hasStoredCredential ? "Leave blank to keep existing" : "Enter value"}
								disabled={busy}
							/>
						</div>
					))}
				</div>

				{encryptionKeyMissing && (
					<p className="text-xs text-muted-foreground">
						Storing credentials in the database requires an <span className="font-mono">ELMO_ENCRYPTION_KEY</span>.
						Until it is set, keep using environment variables for this provider.
					</p>
				)}
				{error && <p className="text-sm text-destructive">{error}</p>}
				{success && <p className="text-sm text-green-600">{success}</p>}
				{verifyResult && (
					<div className="flex items-center gap-2 text-sm">
						{verifyResult.ok ? (
							<>
								<IconCircleCheck className="h-4 w-4 text-emerald-600" />
								<span className="text-emerald-700 dark:text-emerald-400">Verified</span>
							</>
						) : (
							<>
								<IconCircleX className="h-4 w-4 text-destructive" />
								<span className="text-destructive">{verifyResult.error ?? "Not configured"}</span>
							</>
						)}
					</div>
				)}

				<div className="flex flex-wrap gap-2">
					<Button onClick={save} disabled={busy || filled.length === 0} className="cursor-pointer">
						{busy ? "Saving…" : "Save"}
					</Button>
					<Button variant="outline" onClick={verify} disabled={busy} className="cursor-pointer">
						Verify
					</Button>
					{status.hasStoredCredential && (
						<Button
							variant="outline"
							onClick={remove}
							disabled={busy}
							className="cursor-pointer text-destructive hover:text-destructive"
						>
							Remove stored credential
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
