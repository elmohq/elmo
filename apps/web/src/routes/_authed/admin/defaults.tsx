/**
 * /admin/defaults — instance-scope run config (§8).
 *
 * Edits the selector-less instance rows for cadence, replication, and the
 * onboarding target through the generic `setConfigValues` pair. Every field
 * shows provenance (an explicit instance row vs the code default) and offers a
 * Clear-to-default action (delete the row). Demo renders read-only via the
 * global readOnly flag; the server enforces instance-admin regardless.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import type { Provenance } from "@workspace/lib/config/resolve";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { getEffectiveConfigFn, setConfigValuesFn } from "@/server/config-entries";
import { formatCadence, hoursToParts, partsToHours, type TimeParts } from "@/lib/config-ui";

export const Route = createFileRoute("/_authed/admin/defaults")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `Defaults · ${appName}` },
				{ name: "description", content: "Instance-wide run configuration defaults." },
			],
		};
	},
	component: DefaultsPage,
});

type ConfigValues = Record<string, { value: unknown; provenance: Provenance }>;

function ProvenanceBadge({ provenance }: { provenance: Provenance | undefined }) {
	const isSet = provenance !== undefined && provenance !== "default";
	return (
		<Badge variant={isSet ? "secondary" : "outline"} className="font-normal">
			{isSet ? "Instance setting" : "Default"}
		</Badge>
	);
}

function DefaultsPage() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const readOnly = context.clientConfig?.features.readOnly ?? false;

	const [values, setValues] = useState<ConfigValues | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = async () => {
		try {
			const data = await getEffectiveConfigFn({ data: { scope: "instance" } });
			setValues(data.values as ConfigValues);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load defaults");
		}
	};

	useEffect(() => {
		load();
	}, []);

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

	if (!values) {
		return (
			<div className="space-y-6 max-w-3xl">
				<Skeleton className="h-9 w-56" />
				{[0, 1, 2].map((n) => (
					<Skeleton key={n} className="h-40 w-full" />
				))}
			</div>
		);
	}

	return (
		<div className="space-y-6 max-w-3xl">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Defaults</h1>
				<p className="text-muted-foreground">
					Instance-wide run configuration. These apply to every organization and brand unless a more specific override
					is set.
				</p>
			</div>

			<CadenceSection
				value={Number(values.cadenceHours?.value ?? 24)}
				provenance={values.cadenceHours?.provenance}
				readOnly={readOnly}
				onSaved={load}
			/>
			<ReplicationSection
				value={Number(values.replication?.value ?? 5)}
				provenance={values.replication?.provenance}
				readOnly={readOnly}
				onSaved={load}
			/>
			<OnboardingSection
				value={String(values.onboardingTarget?.value ?? "")}
				provenance={values.onboardingTarget?.provenance}
				readOnly={readOnly}
				onSaved={load}
			/>
		</div>
	);
}

/** Shared save/clear state for a single instance-config section. */
function useSection(readOnly: boolean, onSaved: () => Promise<void>) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const run = async (entry: { key: string; value?: unknown }, successMsg: string) => {
		if (readOnly) return;
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			await setConfigValuesFn({ data: { scope: "instance", entries: [entry] } });
			await onSaved();
			setSuccess(successMsg);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setBusy(false);
		}
	};

	return { busy, error, success, run };
}

function SectionFeedback({ error, success }: { error: string | null; success: string | null }) {
	return (
		<>
			{error && <p className="text-sm text-destructive">{error}</p>}
			{success && <p className="text-sm text-green-600">{success}</p>}
		</>
	);
}

function CadenceSection({
	value,
	provenance,
	readOnly,
	onSaved,
}: {
	value: number;
	provenance: Provenance | undefined;
	readOnly: boolean;
	onSaved: () => Promise<void>;
}) {
	const [parts, setParts] = useState<TimeParts>(() => hoursToParts(value));
	const { busy, error, success, run } = useSection(readOnly, onSaved);
	const isSet = provenance !== undefined && provenance !== "default";

	// Re-seed the inputs whenever the resolved value changes (load / clear).
	useEffect(() => {
		setParts(hoursToParts(value));
	}, [value]);

	const update = (unit: keyof TimeParts, raw: string) => {
		const parsed = raw === "" ? 0 : Math.max(0, Number.parseInt(raw, 10) || 0);
		setParts({ ...parts, [unit]: parsed });
	};

	const total = partsToHours(parts);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle>Cadence</CardTitle>
					<ProvenanceBadge provenance={provenance} />
				</div>
				<CardDescription>How often the fleet evaluates each prompt. Currently {formatCadence(value)}.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-3 gap-4 max-w-md">
					{(["weeks", "days", "hours"] as const).map((unit) => (
						<div key={unit} className="space-y-2">
							<Label htmlFor={`cadence-${unit}`} className="text-xs text-muted-foreground capitalize">
								{unit}
							</Label>
							<Input
								id={`cadence-${unit}`}
								type="number"
								min="0"
								value={parts[unit] || ""}
								onChange={(e) => update(unit, e.target.value)}
								disabled={busy || readOnly}
								placeholder="0"
							/>
						</div>
					))}
				</div>
				<p className="text-sm text-muted-foreground">
					Total: <strong>{formatCadence(total)}</strong>
				</p>
				<SectionFeedback error={total < 1 && !readOnly ? "Cadence must be at least 1 hour" : error} success={success} />
				<div className="flex gap-2">
					<Button
						disabled={busy || readOnly || total < 1}
						onClick={() => run({ key: "run.cadence_hours", value: total }, "Cadence saved")}
						className="cursor-pointer"
					>
						{busy ? "Saving…" : "Save"}
					</Button>
					{isSet && (
						<Button
							variant="outline"
							disabled={busy || readOnly}
							onClick={() => run({ key: "run.cadence_hours" }, "Reverted to default")}
							className="cursor-pointer"
						>
							Clear to default
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function ReplicationSection({
	value,
	provenance,
	readOnly,
	onSaved,
}: {
	value: number;
	provenance: Provenance | undefined;
	readOnly: boolean;
	onSaved: () => Promise<void>;
}) {
	const [count, setCount] = useState(String(value));
	const { busy, error, success, run } = useSection(readOnly, onSaved);
	const isSet = provenance !== undefined && provenance !== "default";
	const parsed = Number.parseInt(count, 10);
	const valid = Number.isInteger(parsed) && parsed > 0;

	useEffect(() => {
		setCount(String(value));
	}, [value]);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle>Replication</CardTitle>
					<ProvenanceBadge provenance={provenance} />
				</div>
				<CardDescription>
					Samples taken per firing — repeat runs of the same prompt to average out variance.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2 max-w-32">
					<Label htmlFor="replication">Samples</Label>
					<Input
						id="replication"
						type="number"
						min="1"
						value={count}
						onChange={(e) => setCount(e.target.value)}
						disabled={busy || readOnly}
					/>
				</div>
				<SectionFeedback error={!valid && !readOnly ? "Enter a whole number of at least 1" : error} success={success} />
				<div className="flex gap-2">
					<Button
						disabled={busy || readOnly || !valid}
						onClick={() => run({ key: "run.replication", value: parsed }, "Replication saved")}
						className="cursor-pointer"
					>
						{busy ? "Saving…" : "Save"}
					</Button>
					{isSet && (
						<Button
							variant="outline"
							disabled={busy || readOnly}
							onClick={() => run({ key: "run.replication" }, "Reverted to default")}
							className="cursor-pointer"
						>
							Clear to default
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function OnboardingSection({
	value,
	provenance,
	readOnly,
	onSaved,
}: {
	value: string;
	provenance: Provenance | undefined;
	readOnly: boolean;
	onSaved: () => Promise<void>;
}) {
	const [target, setTarget] = useState(value);
	const { busy, error, success, run } = useSection(readOnly, onSaved);
	const isSet = provenance !== undefined && provenance !== "default";
	const valid = target.trim().length > 0;

	useEffect(() => {
		setTarget(value);
	}, [value]);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle>Onboarding target</CardTitle>
					<ProvenanceBadge provenance={provenance} />
				</div>
				<CardDescription>Direct-API target used for onboarding research.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2 max-w-md">
					<Label htmlFor="onboarding-target">Target</Label>
					<Input
						id="onboarding-target"
						value={target}
						onChange={(e) => setTarget(e.target.value)}
						disabled={busy || readOnly}
						placeholder="chatgpt:openai-api"
					/>
					<p className="text-xs text-muted-foreground font-mono">model:provider[:version][:online]</p>
				</div>
				<SectionFeedback error={!valid && !readOnly ? "Enter a target" : error} success={success} />
				<div className="flex gap-2">
					<Button
						disabled={busy || readOnly || !valid}
						onClick={() => run({ key: "onboarding.target", value: target.trim() }, "Onboarding target saved")}
						className="cursor-pointer"
					>
						{busy ? "Saving…" : "Save"}
					</Button>
					{isSet && (
						<Button
							variant="outline"
							disabled={busy || readOnly}
							onClick={() => run({ key: "onboarding.target" }, "Reverted to default")}
							className="cursor-pointer"
						>
							Clear to default
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
