/**
 * /admin/organizations — org entitlements (§8, cloud only, staff-only).
 *
 * Sets an org's planKey + entitlement overrides. There is no org-list server
 * function (org enumeration isn't part of the config round), so this scopes to
 * a load-by-id form: the admin enters an organization id, loads its settings,
 * and edits planKey + overrides. The nav entry is hidden outside cloud; a direct
 * visit in another mode renders a notice. The server is the security boundary.
 */
import { useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { PLANS } from "@workspace/config/plans";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { getOrganizationSettingsFn, setOrganizationSettingsFn } from "@/server/instance-config";

export const Route = createFileRoute("/_authed/admin/organizations")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `Organizations · ${appName}` },
				{ name: "description", content: "Organization plan and entitlement overrides." },
			],
		};
	},
	component: OrganizationsPage,
});

const NO_PLAN = "none";
const PLAN_OPTIONS = [NO_PLAN, ...Object.keys(PLANS)];

type OrgSettings = Awaited<ReturnType<typeof getOrganizationSettingsFn>>;

function OrganizationsPage() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const isCloud = context.clientConfig?.mode === "cloud";
	const readOnly = context.clientConfig?.features.readOnly ?? false;

	const [orgId, setOrgId] = useState("");
	const [loaded, setLoaded] = useState<OrgSettings | null>(null);
	const [planKey, setPlanKey] = useState<string>(NO_PLAN);
	const [overridesText, setOverridesText] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	if (!isCloud) {
		return (
			<div className="space-y-6 max-w-3xl">
				<h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						Organization entitlements only apply in cloud deployments.
					</CardContent>
				</Card>
			</div>
		);
	}

	const load = async () => {
		if (!orgId.trim()) return;
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const data = await getOrganizationSettingsFn({ data: { organizationId: orgId.trim() } });
			setLoaded(data);
			setPlanKey(data.planKey ?? NO_PLAN);
			setOverridesText(data.entitlementOverrides ? JSON.stringify(data.entitlementOverrides, null, 2) : "");
		} catch (err) {
			setLoaded(null);
			setError(err instanceof Error ? err.message : "Failed to load organization");
		} finally {
			setBusy(false);
		}
	};

	const save = async () => {
		if (readOnly || !loaded) return;
		let overrides: Record<string, unknown> | null = null;
		const trimmed = overridesText.trim();
		if (trimmed.length > 0) {
			try {
				const parsed = JSON.parse(trimmed);
				if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
					throw new Error("Overrides must be a JSON object");
				}
				overrides = parsed;
			} catch (err) {
				setError(err instanceof Error ? `Invalid overrides JSON: ${err.message}` : "Invalid overrides JSON");
				return;
			}
		}
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const data = await setOrganizationSettingsFn({
				data: {
					organizationId: loaded.organizationId,
					planKey: planKey === NO_PLAN ? null : planKey,
					entitlementOverrides: overrides,
				},
			});
			setLoaded(data);
			setSuccess("Organization settings saved");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="space-y-6 max-w-3xl">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
				<p className="text-muted-foreground">
					Set an organization&apos;s plan and entitlement overrides. Enter an organization id to load its current
					settings.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Load organization</CardTitle>
					<CardDescription>Entitlements are keyed by organization id.</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex items-end gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							load();
						}}
					>
						<div className="flex-1 space-y-2">
							<Label htmlFor="org-id">Organization id</Label>
							<Input
								id="org-id"
								value={orgId}
								onChange={(e) => setOrgId(e.target.value)}
								placeholder="org_…"
								disabled={busy}
							/>
						</div>
						<Button type="submit" variant="outline" disabled={busy || !orgId.trim()} className="cursor-pointer">
							Load
						</Button>
					</form>
				</CardContent>
			</Card>

			{loaded && (
				<Card>
					<CardHeader>
						<CardTitle className="font-mono text-base">{loaded.organizationId}</CardTitle>
						<CardDescription>Current plan: {loaded.planKey ?? "none (no active plan)"}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2 max-w-xs">
							<Label htmlFor="plan-key">Plan</Label>
							<Select value={planKey} onValueChange={setPlanKey} disabled={busy || readOnly}>
								<SelectTrigger id="plan-key">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PLAN_OPTIONS.map((key) => (
										<SelectItem key={key} value={key}>
											{key}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="overrides">Entitlement overrides (JSON)</Label>
							<Textarea
								id="overrides"
								value={overridesText}
								onChange={(e) => setOverridesText(e.target.value)}
								placeholder={'{\n  "maxPromptsPerOrg": 200\n}'}
								rows={8}
								className="font-mono text-xs"
								disabled={busy || readOnly}
							/>
							<p className="text-xs text-muted-foreground">
								Leave blank for no overrides. Merged onto the plan&apos;s ceilings.
							</p>
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}
						{success && <p className="text-sm text-green-600">{success}</p>}

						<Button onClick={save} disabled={busy || readOnly} className="cursor-pointer">
							{busy ? "Saving…" : "Save"}
						</Button>
					</CardContent>
				</Card>
			)}

			{error && !loaded && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}
